import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { programs } from '../../td4/programs';
import { encode, formatInstruction } from '../../td4/instructions';
import { useCpu } from '../../visualization/td4/context';
import { cpuMessages } from '../../visualization/td4/messages';
import { assemble, type AssemblyError } from '../../td4/assembler';

const storageKey = 'cpu-flow-trace.custom-assembly';
function savedSource() {
  try { return localStorage.getItem(storageKey) ?? ''; } catch { return ''; }
}

export function ProgramPanel() {
  const { locale, t } = useLocale();
  const [params, setParams] = useSearchParams();
  const requestedProgram = params.get('program');
  const program = programs.find(item => item.id === (requestedProgram === 'ramen-timer' ? 'kitchen-timer' : requestedProgram)) ?? programs[0];
  const [customSource, setCustomSource] = useState(savedSource);
  const customResult = assemble(customSource);
  const custom = params.get('program') === 'custom' && customResult.ok;
  const session = useCpu();
  const instructionAddress = useSyncExternalStore(session.subscribe, session.getInstructionAddress);
  const [applyRevision, setApplyRevision] = useState(0);
  const lines = custom ? customResult.ok ? customResult.lines : [] : program.lines;
  const bytesKey = lines.map(encode).join(',');
  useEffect(() => { session.loadProgram(bytesKey.split(',').map(Number)); }, [session, bytesKey, applyRevision, program.id, custom]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<AssemblyError[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [view, setView] = useState<'asm' | 'c'>('asm');
  const activeView = custom ? 'asm' : view;
  function selectProgram(id: string) {
    const next = new URLSearchParams(params); next.set('program', id); setParams(next, { replace: true });
    setEditing(false); setErrors([]); setAssembled(false);
  }
  function edit(blank = false) {
    setDraft(blank ? '' : custom ? customSource : program.lines.map(formatInstruction).join('\n'));
    setErrors([]); setAssembled(false); setEditing(true); setView('asm');
  }
  function compile() {
    const result = assemble(draft);
    if (!result.ok) { setErrors(result.errors); return; }
    setCustomSource(draft);
    try { localStorage.setItem(storageKey, draft); } catch { /* Editing remains available without storage. */ }
    selectProgram('custom'); setView('asm'); setAssembled(true); setApplyRevision(value => value + 1);
  }
  function chooseView(value: 'asm' | 'c', focus = false) {
    setView(value);
    if (focus) document.getElementById(`tab-${value}`)?.focus();
  }
  return <aside className="program-panel" aria-labelledby="program-heading">
    <h2 id="program-heading" className="sr-only">{t.programs}</h2>
    <label className="sr-only" htmlFor="program-select">{t.selectProgram}</label>
    <select id="program-select" className="program-select" value={custom ? 'custom' : program.id} onChange={event => selectProgram(event.target.value)}>
      {programs.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
      <option value="custom" disabled={!customResult.ok}>{t.customProgram}</option>
    </select>
    <details className="program-description" open>
      <summary>{locale === 'ja' ? 'プログラムの説明' : 'Program description'}</summary>
      {(custom ? t.customDescription : program.description[locale]).split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </details>
    <div className="program-actions">
      <button onClick={() => edit()}>{t.editAssembly}</button>
      <button onClick={() => edit(true)}>{t.newProgram}</button>
    </div>
    <div className="code-tabs" role="tablist" aria-label={t.programs}>
      {(custom || editing ? ['asm'] as const : ['asm', 'c'] as const).map(tab => <button id={`tab-${tab}`} key={tab} role="tab"
        aria-selected={activeView === tab} aria-controls={`panel-${tab}`} tabIndex={activeView === tab ? 0 : -1}
        onClick={() => chooseView(tab)} onKeyDown={event => {
          if (!custom && !editing && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            chooseView(event.key === 'Home' ? 'asm' : event.key === 'End' ? 'c' : view === 'asm' ? 'c' : 'asm', true);
          }
        }}>{tab === 'asm' ? t.assembly : t.cLike}</button>)}
    </div>
    <div className="code-panel" id={`panel-${activeView}`} role="tabpanel" aria-labelledby={`tab-${activeView}`} tabIndex={0}>
      {editing ? <form className="assembly-editor" onSubmit={event => { event.preventDefault(); compile(); }}>
        <label htmlFor="assembly-source">{t.assemblySource}</label>
        <textarea id="assembly-source" value={draft} onChange={event => { setDraft(event.target.value); setErrors([]); }}
          rows={16} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoFocus
          aria-invalid={errors.length > 0} aria-describedby={`editor-hint${errors.length ? ' assembly-errors' : ''}`} />
        <p id="editor-hint">{t.editorHint}</p>
        {errors.length > 0 && <ul id="assembly-errors" role="alert">{errors.map(error => <li key={error.line}>
          {t.errorLine} {error.line}: {t[error.code]}
        </li>)}</ul>}
        <div className="program-actions">
          <button type="submit" className="assemble-button">{t.assemble}</button>
          <button type="button" onClick={() => setEditing(false)}>{t.cancelEdit}</button>
        </div>
      </form> : activeView === 'asm' ? <>
      {assembled && <p className="assembly-status" role="status">{t.assemblySuccess}</p>}
      <table className="assembly-table">
        <thead><tr><th>{t.address}</th><th>{t.instruction}</th><th>{t.machineCode}</th></tr></thead>
        <tbody>{lines.map((line, i) => {
          const binary = encode(line).toString(2).padStart(8, '0');
          const [mnemonic, ...args] = formatInstruction(line).split(' ');
          return <tr key={`${program.id}-${i}`} className={instructionAddress === i ? 'current' : undefined} aria-current={instructionAddress === i ? 'true' : undefined}><td>{i.toString(16).toUpperCase().padStart(2, '0')}</td>
            <td><span className="mnemonic">{mnemonic}</span> {args.join(' ')}</td>
            <td>{binary.slice(0, 4)} <span>{binary.slice(4)}</span></td></tr>;
        })}</tbody>
      </table>
      <p className="program-length">{lines.length} {t.words}</p>
      </> : <>
        <pre className="c-code"><code>{program.pseudocode}</code></pre>
        <p className="pseudocode-note">{t.pseudocodeNote}</p>
      </>}
    </div>
    <p className="program-footnote">{t.programNote}</p>
    <p className="program-footnote">{cpuMessages(locale).pcNote}</p>
  </aside>;
}
