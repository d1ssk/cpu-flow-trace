import { useLocale } from '../i18n';

interface Props {
  playing: boolean; busy: boolean; speed: number; time: number;
  onPlay: () => void; onStep: () => void; onNext: () => void; onReset: () => void;
  onSpeed: (speed: number) => void;
}
export function PlaybackControls(props: Props) {
  const { t } = useLocale();
  return <div className="playback-controls">
    <div className="transport-controls">
      <button className="play-button" onClick={props.onPlay} aria-pressed={props.playing}>
        <span aria-hidden="true">{props.playing ? 'Ⅱ' : '▶'}</span>{props.playing ? t.pause : t.play}
      </button>
      <button onClick={props.onStep}>{t.step}</button>
      <button onClick={props.onNext} disabled={!props.busy}>{t.next} <span aria-hidden="true">→</span></button>
      <span className="clock-placeholder" title={t.clockNote}>
        <button disabled aria-describedby="clock-note">{t.clock}</button>
        <span className="sr-only" id="clock-note">{t.clockNote}</span>
      </span>
      <button className="icon-button reset-button" onClick={props.onReset} title={t.reset} aria-label={t.reset}>↺</button>
    </div>
    <div className="time-controls">
      <label>{t.speed}
        <select aria-label={t.speed} value={props.speed} onChange={event => props.onSpeed(Number(event.target.value))}>
          {[0.25, 0.5, 1, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </label>
      <output aria-label={t.time} className="time-readout">{(props.time / 1000).toFixed(2)} <span>s</span></output>
    </div>
  </div>;
}
