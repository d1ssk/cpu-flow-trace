import { message } from '../i18n/message.js';
/* Memory hierarchy for stages 7 and 9: separate instruction and data caches
 * (direct-mapped, 4 lines × 2 words) in front of one slow main memory that
 * holds both instructions and data, shared through a bus arbiter.
 *
 *   address = tag[15:3] index[2:1] offset[0]
 *   The D-cache is write-through without allocation on a write miss; I/O
 *   addresses bypass it. The I-cache does not see stores: after changing
 *   code, FENCEI invalidates it. */

import { disassemble } from '../isa/disassembler.js';
import { PROFILES, RAM_WORDS, hex } from '../isa/spec.js';
import { formatValue } from './format.js';
import { T, lines } from './metrics.js';
import { memoryRows, memorySize } from './modules.js';

const P = (name, dir, width, side) => ({ name, dir, width, side: side ?? (dir === 'in' ? 'left' : 'right') });
const v = formatValue;
export const GEOMETRY = { lines: 4, perLine: 2, offsetBits: 1, tagBits: 13 };
const split = addr => ({ offset: addr & 1, index: (addr >> 1) & 3, tag: addr >> 3 });
const wordOf = (line, offset) => Math.floor(line / 2 ** (16 * offset)) % 65536;

export const ASPLIT = {
  delay: 0,
  title: '番地の分割',
  ports: () => [P('addr', 'in', 16), P('tag', 'out', 13), P('index', 'out', 2), P('offset', 'out', 1)],
  comb: m => { const s = split(m.in.addr); m.emit('tag', s.tag); m.emit('index', s.index); m.emit('offset', s.offset); },
  view: () => [],
  size: () => [],
  explain: (m, t = message) => [
    t("番地を3つに分けます: 上位 13 bit がタグ、次の2 bitが行番号 (インデックス)、最下位 1 bit が行内の位置 (オフセット)。配線を分けるだけです。"),
    t("{0} → タグ {1}, 行 {2}, オフセット {3}", v(m.in.addr, 16), hex(m.out.tag), m.out.index, m.out.offset),
  ],
};

export const CARRAY = {
  delay: 6,
  title: 'キャッシュ',
  ports: p => [
    P('index', 'in', 2), P('offset', 'in', 1),
    P('fill', 'in', 1, 'bottom'), P('ftag', 'in', 13, 'bottom'), P('fline', 'in', 32, 'bottom'),
    ...(p.kind === 'D' ? [P('upd', 'in', 1, 'bottom'), P('wd', 'in', 16, 'bottom')] : [P('inval', 'in', 1, 'bottom')]),
    P('valid', 'out', 1), P('tag', 'out', 13), P('data', 'out', 16),
  ],
  init: () => ({ lines: Array.from({ length: 4 }, () => ({ valid: 0, tag: 0, data: 0 })) }),
  comb: m => {
    const line = m.state.lines[m.in.index];
    m.emit('valid', line.valid);
    m.emit('tag', line.tag);
    m.emit('data', wordOf(line.data, m.in.offset));
  },
  edge: m => {
    const { fill, upd, inval, index, offset, ftag, fline, wd } = m.in;
    if (inval) return m.state.lines.some(l => l.valid) ? { lines: m.state.lines.map(l => ({ ...l, valid: 0 })) } : undefined;
    if (!fill && !upd) return undefined;
    const next = m.state.lines.map(l => ({ ...l }));
    if (fill) next[index] = { valid: 1, tag: ftag, data: fline };
    else {
      const words = [0, 1].map(i => wordOf(next[index].data, i));
      words[offset] = wd;
      next[index].data = words[0] + words[1] * 65536;
    }
    return { lines: next };
  },
  view: m => m.state.lines.map((l, i) => ({
    text: `${i} ${l.valid ? 'V' : '-'} ${hex(l.tag << 3, 3)} ${hex(wordOf(l.data, 0))} ${hex(wordOf(l.data, 1))}`,
    cls: i === m.in.index ? 'on' : 'off',
  })),
  size: () => lines(4, 18),
  explain: (m, t = message) => {
    const line = m.state.lines[m.in.index];
    const kind = m.params.kind === 'I' ? t("命令") : t("データ");
    const out = [
      t("{0}キャッシュ: 4行 × 2語のダイレクトマップ。行番号で1行を選び、その行の有効ビット・タグ・データを同時に読み出します。表示のタグは行の先頭番地です。", kind),
      t("行 {0}: {1}", m.in.index, line.valid ? t("有効、先頭番地 {0}", hex(line.tag << 3)) : t("無効 (まだ何も入っていない)")),
    ];
    if (m.in.fill) out.push(t("次のクロックで、メモリから届いた1行分をこの行に書き込みます (ライン・フィル)。"));
    if (m.in.upd) out.push(t("書き込みがキャッシュに当たったので、次のクロックでこの行の語も更新します (ライトスルー)。"));
    if (m.in.inval) out.push(t("FENCEI: 次のクロックですべての行を無効にします。ストアで書き換えた命令を、メモリから読み直させるためです。"));
    if (m.params.kind === 'I') out.push(t("命令キャッシュはストアを見ていません。プログラムが命令を書き換えたら FENCEI が必要です。"));
    if (m.params.kind === 'I' && line.valid) out.push(t("読み出し: {0}", disassemble(m.out.data, m.params.profile ?? PROFILES.full)));
    return out;
  },
};

export const CHIT = {
  delay: 3,
  title: 'タグ比較',
  ports: () => [P('tag', 'in', 13), P('ctag', 'in', 13), P('valid', 'in', 1), P('hit', 'out', 1)],
  comb: m => m.emit('hit', m.in.valid && m.in.tag === m.in.ctag ? 1 : 0),
  view: m => [{ text: m.out.hit ? 'hit' : 'miss', cls: m.out.hit ? 'on big' : 'big' }],
  size: () => [T(4, 'big')],
  explain: (m, t = message) => [
    t("番地のタグと、選んだ行に記録されたタグを比べます。一致して有効ならヒット (キャッシュの値を使える)、そうでなければミス。"),
    t("番地のタグ {0} / 行のタグ {1} / 有効 {2} → {3}", hex(m.in.tag), hex(m.in.ctag), m.in.valid ? 'H' : 'L', m.out.hit ? t("ヒット") : t("ミス")),
  ],
};

/* Cache controller: combinational. A read miss requests the whole line and
 * fills it when memory is ready; the access then hits on the next cycle.
 * A write (D only) always goes to memory and completes on ready. */
export const CCTRL = {
  delay: 2,
  title: 'キャッシュ制御',
  ports: p => [
    P('req', 'in', 1), ...(p.kind === 'D' ? [P('write', 'in', 1)] : []), P('hit', 'in', 1), P('ready', 'in', 1),
    P('memReq', 'out', 1), ...(p.kind === 'D' ? [P('memWe', 'out', 1), P('upd', 'out', 1)] : []), P('fill', 'out', 1), P('wait', 'out', 1),
  ],
  init: () => ({ hits: 0, misses: 0, lastMiss: false }),
  comb: m => {
    const r = cacheControl(m.in, m.params.kind);
    for (const [k, x] of Object.entries(r)) if (k !== 'why' && k !== 'label') m.emit(k, x);
  },
  edge: m => {
    const { req, hit, write } = m.in;
    if (!req) return m.state.lastMiss ? { ...m.state, lastMiss: false } : undefined;
    // Count each access once: a miss is counted when its fill starts waiting.
    if (write) return m.in.ready ? { ...m.state, hits: m.state.hits + (hit ? 1 : 0), misses: m.state.misses + (hit ? 0 : 1) } : undefined;
    if (hit) return m.state.lastMiss ? { ...m.state, lastMiss: false } : { ...m.state, hits: m.state.hits + 1 };
    return m.state.lastMiss ? undefined : { ...m.state, misses: m.state.misses + 1, lastMiss: true };
  },
  view: m => {
    const r = cacheControl(m.in, m.params.kind);
    return [{ text: r.label, cls: r.wait ? 'on big' : 'big' }, { text: `hit ${m.state.hits} / miss ${m.state.misses}`, cls: 'small' }];
  },
  size: () => [T(11, 'big'), T(18, 'small')],
  explain: (m, t = message) => {
    const r = cacheControl(m.in, m.params.kind);
    return [
      m.params.kind === 'I'
        ? t("命令の取り込みがミスしたら、メモリへ1行を要求し、届くまで IF 段を止めます。届いた行をキャッシュに書いた次のクロックでヒットします。")
        : t("読み出しがミスしたら1行を要求して待ちます。書き込みはライトスルー: いつもメモリへ書き、ヒットしていればキャッシュも更新します (ミスしても行は持ってこない)。完了まで MEM 段を止めます。"),
      r.why,
      t("これまで: ヒット {0} 回、ミス {1} 回", m.state.hits, m.state.misses),
    ];
  },
};
export function cacheControl({ req, write, hit, ready }, kind) {
  const out = { memReq: 0, fill: 0, wait: 0 };
  if (kind === 'D') Object.assign(out, { memWe: 0, upd: 0 });
  if (!req) return { ...out, why: 'アクセスはありません。', label: 'idle' };
  if (kind === 'D' && write) {
    Object.assign(out, { memReq: 1, memWe: 1, wait: ready ? 0 : 1, upd: ready && hit ? 1 : 0 });
    return { ...out, why: ready ? '書き込みが完了します。' : 'メモリへの書き込み完了を待っています。', label: ready ? 'write done' : 'writing' };
  }
  if (hit) return { ...out, why: 'ヒット: キャッシュの値をそのまま使います。待ちはありません。', label: 'hit' };
  Object.assign(out, { memReq: 1, wait: 1, fill: ready ? 1 : 0 });
  return { ...out, why: ready ? 'メモリから行が届きました。この行をキャッシュへ書き込みます (次のクロックでヒット)。' : 'ミス: メモリから行が届くのを待っています。', label: ready ? 'line fill' : 'miss: wait' };
}

export const ARB = {
  delay: 2,
  title: 'バス調停',
  ports: () => [
    P('iReq', 'in', 1), P('iAddr', 'in', 16), P('dReq', 'in', 1), P('dAddr', 'in', 16), P('dWe', 'in', 1), P('dWd', 'in', 16), P('ready', 'in', 1),
    P('req', 'out', 1), P('addr', 'out', 16), P('we', 'out', 1), P('wd', 'out', 16), P('iReady', 'out', 1), P('dReady', 'out', 1),
  ],
  init: () => ({ owner: 0 }), // 0 none, 1 instruction cache, 2 data cache
  comb: m => {
    const owner = grant(m.state.owner, m.in);
    m.emit('req', owner ? 1 : 0);
    m.emit('addr', owner === 1 ? m.in.iAddr : m.in.dAddr);
    m.emit('we', owner === 2 ? m.in.dWe : 0);
    m.emit('wd', m.in.dWd);
    m.emit('iReady', owner === 1 ? m.in.ready : 0);
    m.emit('dReady', owner === 2 ? m.in.ready : 0);
  },
  edge: m => {
    const owner = grant(m.state.owner, m.in);
    const next = owner && m.in.ready ? 0 : owner;
    return next !== m.state.owner ? { owner: next } : undefined;
  },
  view: m => [{ text: ['idle', 'I-cache', 'D-cache'][grant(m.state.owner, m.in)], cls: 'big' }],
  size: () => [T(7, 'big')],
  explain: (m, t = message) => [
    t("メインメモリへの道 (バス) は1本なので、命令キャッシュとデータキャッシュの要求を1つずつ通します。データ側 (より古い命令) を優先し、一度渡したら転送が終わるまで続けます。"),
    t("いま: {0}{1}", [t("空き"), t("命令キャッシュ"), t("データキャッシュ")][grant(m.state.owner, m.in)], m.in.iReq && m.in.dReq ? t(" (両方が要求中)") : ''),
  ],
};
const grant = (owner, i) => (owner === 1 && i.iReq ? 1 : owner === 2 && i.dReq ? 2 : i.dReq ? 2 : i.iReq ? 1 : 0);

export const MAINMEM = {
  delay: 4,
  title: 'メインメモリ',
  ports: () => [P('req', 'in', 1), P('addr', 'in', 16), P('we', 'in', 1), P('wd', 'in', 16), P('ready', 'out', 1), P('line', 'out', 32)],
  init: (p, ctx) => ({
    words: [...(ctx.program?.mem ?? new Array(RAM_WORDS).fill(0))],
    count: 0, key: -1, latency: ctx.options?.mainLatency ?? p.latency ?? 4, lastWrite: -1,
  }),
  comb: m => {
    const ready = mainReady(m) ? 1 : 0;
    m.emit('ready', ready);
    m.emit('line', ready && !m.in.we ? readLine(m.state, m.in.addr) : 0);
  },
  edge: m => {
    const ready = mainReady(m), key = requestKey(m.in);
    const count = m.in.req && !ready ? elapsed(m) + 1 : 0;
    const next = { ...m.state, count, key: m.in.req && !ready ? key : -1, lastWrite: -1 };
    if (ready && m.in.we && m.in.addr < RAM_WORDS) {
      next.words = [...m.state.words]; next.words[m.in.addr] = m.in.wd; next.lastWrite = m.in.addr;
    }
    return next.count === m.state.count && next.key === m.state.key && next.lastWrite === m.state.lastWrite ? undefined : next;
  },
  view: m => [
    { text: m.in.req ? `${m.in.we ? 'write' : 'line'} ${hex(m.in.addr, 3)} ${m.out.ready ? 'done' : `${elapsed(m) + 1}/${m.state.latency}`}` : 'idle', cls: m.in.req ? 'small on' : 'small off' },
    ...memoryRows(m.state.words, { data: m.in.req ? m.in.addr : undefined, write: m.in.req && m.in.we ? m.in.addr : -1, last: m.state.lastWrite, dataRows: 2 }),
  ],
  size: () => [T(16, 'small'), ...memorySize({ code: false, dataRows: 2 })],
  explain: (m, t = message) => [
    t("命令とデータを収めた主記憶 (512語)。1回の転送に {0} クロックかかります。読み出しは2語を1行としてまとめて返し、命令キャッシュとデータキャッシュの両方が同じメモリから行を受け取ります。", m.state.latency),
    m.in.req ? `${m.in.we ? t("書き込み [{0}] ← {1}", v(m.in.addr, 16), v(m.in.wd, 16)) : t("行 {0} の読み出し", v(m.in.addr & ~1, 16))}: ${m.out.ready ? t("今回で完了") : t("{0}/{1} クロック目", elapsed(m) + 1, m.state.latency)}` : t("要求はありません。"),
  ],
};
// A request restarts its latency when its address changes (e.g. a redirect).
const requestKey = i => i.we * 65536 + i.addr;
const elapsed = m => (m.state.key === requestKey(m.in) ? m.state.count : 0);
const mainReady = m => m.in.req && elapsed(m) >= m.state.latency - 1;
function readLine(state, addr) {
  const base = addr & ~1;
  return (state.words[base] ?? 0) + (state.words[base + 1] ?? 0) * 65536;
}

export const cacheLibrary = { ASPLIT, CARRAY, CHIT, CCTRL, ARB, MAINMEM };
