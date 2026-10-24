/* The workbench stages. Stage 0 is the TD4 itself (its own instruction set)
 * drawn in the workbench style. Stages 1–9 all execute the FT16
 * architecture: 1–4 and 8 are single-cycle; stage 5 runs the stage-4
 * instruction set on a multi-cycle machine; 6, 7 and 9 are pipelined. */

import { PROFILES } from '../isa/spec.js';
import { buildSingleCycle } from './single-cycle.js';
import { buildMultiCycle } from './multi-cycle.js';
import { buildPipeline5 } from './pipeline.js';
import { buildPipeline3 } from './pipeline3.js';
import { buildTd4 } from './td4.js';

export const stages = [
  {
    id: '0', isa: 'td4', defaultProgram: 'counter', key: 'td4', title: 'TD4 (出発点)', profile: null, family: 'td4',
    features: {},
    summary: 'メインページの TD4 を、この先の段階と同じ描き方で表示します。4 bit・レジスタ A・B・OUT・PC・C、命令12種、ROM 16バイト。ブロックの分け方はメインページの全体図と同じです。命令セットは段階1以降の FT16 とは別物です。',
  },
  {
    id: '1', isa: 'ft16', defaultProgram: 'mul', key: 'core', title: 'レジスタファイルとALU', profile: PROFILES.core, family: 'single',
    features: {},
    summary: '16 bit・16 bit固定長命令・汎用レジスタ8本 (r0 は常に0)・3オペランド。ALU のフラグ Z・C・N・V と、PC相対の条件分岐。命令はメモリ (RAM) に置かれ、PC の番地から取り込みます。',
  },
  {
    id: '2', isa: 'ft16', defaultProgram: 'sort', key: 'mem', title: 'LOAD/STORE (命令とデータが同じメモリ)', profile: PROFILES.mem, family: 'single',
    features: { mem: true },
    summary: '番地計算 (rs1 + 即値) と LD/ST を追加。データは命令と同じメモリに置きます。単一サイクルでは1クロックで命令とデータの両方を読むので、メモリに入口 (ポート) が2つ必要です。',
  },
  {
    id: '3', isa: 'ft16', defaultProgram: 'fact', key: 'call', title: 'サブルーチン呼び出し (JAL/JALR)', profile: PROFILES.call, family: 'single',
    features: { mem: true, call: true },
    summary: 'JAL は戻り番地 (PC+1) をリンクレジスタ r7 に入れて飛び、RET (= JALR r0, r7) で戻ります。JALR はレジスタの番地へ飛ぶ間接呼び出しにも使えます。スタックは SP (r6) と LD/ST で作る「約束」です。',
  },
  {
    id: '4', isa: 'ft16', defaultProgram: 'timer-irq', key: 'system', title: 'メモリマップドI/Oと割り込み', profile: PROFILES.system, family: 'single',
    features: { mem: true, call: true, irq: true },
    summary: 'アドレスデコーダで LED・スイッチ・タイマを番地に割り当て、タイマ割り込みとトラップ機構 (EPC・CAUSE・ESTAT) を追加。',
  },
  {
    id: '5', isa: 'ft16', defaultProgram: 'fact', key: 'multi', gapExtra: 2, title: 'マルチサイクル実装 (同じISA)', profile: PROFILES.system, family: 'multi',
    features: { mem: true, call: true, irq: true },
    summary: '段階4と同じ命令セットを、1命令あたり複数の短いクロックで実行します。命令の取り込みとデータの読み書きを別のクロックで行うので、メモリのポートは1つで済みます。ALUも共用し、状態機械が各クロックの動作を指示します。',
  },
  {
    id: '6a', isa: 'ft16', defaultProgram: 'hazards', key: 'pipe3', title: '3段パイプライン', profile: PROFILES.mmio, family: 'pipe3',
    features: { mem: true, call: true, mmio: true },
    summary: 'IF・DX (解読と実行)・MW (メモリと書き戻し) の3段。MW の結果を同じクロックで DX へ回せるのでロード直後も待たずに済みますが、その経路は長くなります。ポートが1つのメモリでは、MW段のデータアクセスと命令の取り込みがぶつかります (構造ハザード)。',
  },
  {
    id: '6b', isa: 'ft16', defaultProgram: 'hazards', key: 'pipe5', title: '5段パイプライン', profile: PROFILES.mmio, family: 'pipe5',
    features: { mem: true, call: true, mmio: true },
    summary: 'IF・ID・EX・MEM・WB の5段で命令を重ねて実行します。データハザードはストール/フォワーディング、制御ハザードは取り込み停止/フラッシュ/分岐予測 (設定で切り替え)。1ポートのメモリでは MEM段と IF段がメモリを取り合います (構造ハザード)。',
  },
  {
    id: '7', isa: 'ft16', defaultProgram: 'locality', key: 'cache', title: '命令・データキャッシュ', profile: PROFILES.mmio, family: 'pipe5',
    features: { mem: true, call: true, mmio: true, cache: true },
    summary: '構造ハザードの解決策として、メモリの手前に命令キャッシュとデータキャッシュ (各4行) を分けて置きます。奥のメインメモリは1つで、1回の転送に4クロックかかり、2つのキャッシュがバス調停を通して共有します。命令を書き換えたら FENCEI で命令キャッシュを無効にします。',
  },
  {
    id: '8', isa: 'ft16', defaultProgram: 'os', key: 'priv', gapExtra: 2, title: '権限モード・保護・アドレス変換', profile: PROFILES.full, family: 'single',
    features: { mem: true, call: true, irq: true, priv: true },
    summary: 'ユーザー/カーネルモード、命令・データTLB (書き込み可 W・実行可 X の権限つき)、TLBミス・保護違反・不正命令・システムコールの例外。ミニOSがプログラムをメモリへコピーしてから実行します。',
  },
  {
    id: '9', isa: 'ft16', defaultProgram: 'os', key: 'full', gapExtra: 3, title: '統合版', profile: PROFILES.full, family: 'pipe5',
    features: { mem: true, call: true, mmio: true, irq: true, priv: true, cache: true, sys: true },
    summary: '5段パイプライン + キャッシュ + 割り込み・例外 + 権限モード + TLB。例外はMEM段でまとめて判定し、後続の命令を捨てる「正確な例外」として扱います。ミニOSが2つのプロセスを切り替えます。',
  },
];

const builders = { single: buildSingleCycle, multi: buildMultiCycle, pipe5: buildPipeline5, pipe3: buildPipeline3, td4: buildTd4 };
const cache = new Map();

export const isBuilt = id => cache.has(String(id));

export function stageById(id) {
  return stages.find(s => s.id === String(id));
}

export function buildStage(id) {
  id = String(id);
  if (!cache.has(id)) {
    const stage = stageById(id);
    cache.set(id, builders[stage.family]({ id: stage.id, title: stage.title, profile: stage.profile, features: stage.features, ...(stage.gapExtra ? { gapExtra: stage.gapExtra } : {}) }));
  }
  return cache.get(id);
}

export function programFits(stage, program) {
  if ((program.isa ?? 'ft16') !== stage.isa) return false;
  return (program.needs ?? []).every(need => stage.profile[need]);
}
