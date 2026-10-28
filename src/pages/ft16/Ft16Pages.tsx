import { useCallback, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { stages, stageById } from '../../ft16/stages/index.js';
import { experiments } from '../../ft16/experiments.js';
import { NotFoundPage } from '../NotFoundPage';
import { Workspace, type WorkspaceHandle } from './Workspace';
import { lessons } from './lessons';
import { createTranslator, localizeData } from '../../ft16/i18n/index.js';
import './ft16.css';

export function FtNavigation() {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  return <nav className="ft-nav" aria-label={t("FT16 学習の順序")}>
    <NavLink to={`/${locale}/ft16/`} end>{t("学習ガイド")}</NavLink>
    <NavLink to={`/${locale}/ft16/isa/`}>{t("ISA 解説")}</NavLink>
    <span className="ft-nav-divider" />
    {stages.map(s => <NavLink key={s.id} to={`/${locale}/ft16/${s.id}/`} title={t(s.title)} aria-label={t("段階 {0}: {1}", s.id, t(s.title))}>{s.id}</NavLink>)}
  </nav>;
}
export function Ft16IndexPage() {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  return <div className="ft-page" lang={locale}><FtNavigation />
    <header className="ft-index-heading">
      <h1>FT16</h1>
      <p>{t("TD4 は、CPU の基本動作を理解するために構成を大幅に単純化した CPU です。このコーナーでは、TD4 を出発点に、メモリアクセス、パイプライン、キャッシュ、割り込み、メモリ保護などを段階的に取り入れ、現代的な CPU アーキテクチャに少しずつ近づけていきます。各要素が必要な理由と回路上での動作を確認しながら、複雑な現代の CPU がどのように動くのかを学びます。")}</p>
      <p>{t("FT16（Flow Trace 16）は、この学習のために設計した16 bit の CPU と命令セットです。8本のレジスタを持ち、命令とデータを同じメモリに置きます。段階1〜9では共通の命令セットを使い、対応する機能や回路の実装を変えて比較します。")}</p>
      <div className="ft-intro-links"><Link className="ft-start" to={`/${locale}/ft16/0/`}>{t("段階0：TD4 の回路表示")}</Link><Link to={`/${locale}/ft16/isa/`}>{t("FT16 の命令セット解説")}</Link></div>
    </header>
    <div className="ft-roadmap-intro"><h2>{t("学習内容")}</h2><p>{t("段階0では TD4 を使って回路図の見方と操作を確認します。段階6は3段・5段パイプラインを比較する2ページに分かれています。各ページの上部に回路の可視化、その下に解説と実験があります。")}</p></div>
    <ol className="ft-roadmap">{stages.map(s => <li key={s.id}><Link to={`/${locale}/ft16/${s.id}/`}><span className="ft-stage-number">{s.id}</span><div><h2>{t(s.title)}</h2><p>{t(lessons[s.id].summary)}</p></div></Link></li>)}</ol>
    <section className="ft-reading-note"><h2>{t("シミュレーションの範囲")}</h2><p>{t("すべて接続されたモジュールと配線の上で実行します。配線に沿って変化が届き、入力の到着が次の計算を起こします。モジュール内部の遅延は0、クロックは安定後に同時に届くモデルです。物理的な電圧や電気の速さを再現するものではありません。")}</p><p>{t("段階5〜7は実装の違いを学ぶ区間です。6・7は割り込みなしの構成、8は保護を見やすくする単一サイクル、9で機能を統合します。どの段階でも全命令が使えるわけではありません。")}<Link to={`/${locale}/ft16/isa/#isa-3`}>{t("ISA の対応表")}</Link>{t("で確認できます。")}</p></section>
  </div>;
}
export function Ft16StagePage() {
  const { stageId } = useParams();
  const stage = stageById(stageId);
  if (!stage) return <NotFoundPage />;
  return <Stage key={stage.id} stageId={stage.id} />;
}
function Stage({ stageId }: { stageId: string }) {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  const stage = stageById(stageId)!;
  const lesson = localizeData(lessons[stageId], locale);
  const position = stages.indexOf(stage);
  const workspace = useRef<WorkspaceHandle>(null);
  const [selectedProgram, setSelectedProgram] = useState('');
  const navigate = useNavigate();
  const selectProgram = useCallback((id: string) => {
    setSelectedProgram(id);
    const params = new URLSearchParams(window.location.search);
    params.delete('stage');
    params.set('program', id);
    if (`?${params}` !== window.location.search) navigate({ search: params.toString() }, { replace: true, preventScrollReset: true });
  }, [navigate]);
  const minis = localizeData(experiments.filter(e => e.stage === stageId), locale);
  const showCircuit = () => { document.getElementById('ft-visualization')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const load = (id: string) => { workspace.current?.loadExperiment(id); showCircuit(); };
  return <div className="ft-page ft-stage-page" lang={locale}><FtNavigation />
    <header className="ft-stage-heading"><h1><span>{stage.id}</span>{t(stage.title)}</h1><p>{lesson.summary}</p><div className="ft-section-links"><a href="#ft-lesson">{t("解説")}</a><a href="#ft-experiments">{t("機能を確認する実験")}</a><Link to={`/${locale}/ft16/isa/`}>{stageId === '0' ? t("次の段階の ISA") : t("共通 ISA を確認")}</Link></div></header>
    <Workspace stageId={stageId} onProgramChange={selectProgram} ref={workspace} />
    <article className="ft-article" id="ft-lesson">
      <h2>{t("この段階で変わること")}</h2><p className="ft-added">{lesson.added}</p>
      <section className="ft-flow" aria-labelledby="ft-flow-title"><h2 id="ft-flow-title">{lesson.flowTitle}</h2><p>{lesson.flowContext}</p><ol>{lesson.flow.map((step, i) => <li key={i}>{step}</li>)}</ol></section>
      <nav className="ft-toc" aria-label={t("このページの目次")}>{lesson.sections.map((s, i) => <a key={t(s.title)} href={`#ft-section-${i}`}>{t(s.title)}</a>)}<a href="#ft-modules">{t("注目するモジュール")}</a><a href="#ft-experiments">{t("機能を確認する実験")}</a></nav>
      {lesson.sections.map((s, i) => <section key={t(s.title)} id={`ft-section-${i}`}><h2>{t(s.title)}</h2>{s.paragraphs.map(p => <p key={p}>{p}</p>)}</section>)}
      <section id="ft-modules"><h2>{t("注目するモジュール")}</h2><p>{t("名前を押すと上の回路で拡大し、現在の入力と判断を表示します。")}</p><dl className="ft-module-list">{lesson.modules.map(m => <div key={m.id}><dt><button onClick={() => { workspace.current?.focusModule(m.id); showCircuit(); }}>{m.name}</button></dt><dd>{m.role}</dd></div>)}</dl></section>
      <section id="ft-experiments"><h2>{t("機能を確認する実験")}</h2><p>{t("準備のための長い命令列を省き、説明に適した CPU 状態から始めます。初期状態を読み、結果を予想してから「1クロック」「次の変化」で確かめてください。実験のリセットは、この初期状態に戻ります。")}</p>
        {minis.map(e => <section className="ft-experiment" key={e.id} aria-labelledby={`title-${e.id}`}><div className="ft-experiment-heading"><h3 id={`title-${e.id}`}>{e.title}</h3><button onClick={() => load(e.id)} aria-pressed={selectedProgram === e.id}>{selectedProgram === e.id ? t("最初から試す") : t("この実験を読み込む")}</button></div><p>{e.description}</p><div className="ft-fixture"><strong>{t("開始時の状態")}</strong><p>{e.initialDescription}</p><small>{t("記載のない状態は標準リセット。初期値を回路へ反映し、そこから配線の伝播を観察します。")}</small></div><pre><code>{e.source}</code></pre><h4>{t("観察する順序と結果")}</h4><ol>{e.observe.map(o => <li key={o}>{o}</li>)}</ol></section>)}
      </section>
      <section><h2>{t("サンプルプログラム")}</h2><p>{lesson.sample}</p><button className="ft-text-button" onClick={() => load(stage.defaultProgram)}>{t("この段階のサンプルに戻す")}</button></section>
      <nav className="article-pagination" aria-label={t("前後の段階")}>{position > 0 && <Link to={`/${locale}/ft16/${stages[position - 1].id}/`}>{stages[position - 1].id} · {t(stages[position - 1].title)}</Link>}{position < stages.length - 1 ? <Link className="next-article" to={`/${locale}/ft16/${stages[position + 1].id}/`}>{stages[position + 1].id} · {t(stages[position + 1].title)}</Link> : <Link className="next-article" to={`/${locale}/ft16/`}>{t("学習ガイドに戻る")}</Link>}</nav>
    </article>
  </div>;
}
