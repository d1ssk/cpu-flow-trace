export function PlaybackIcon({ kind }: { kind: 'play' | 'pause' | 'instruction' | 'reset' }) {
  return <svg className="td4-playback-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    {kind === 'play' && <path fill="currentColor" d="M5 3 17 10 5 17Z" />}
    {kind === 'pause' && <g fill="currentColor"><rect x="4" y="3" width="4" height="14" rx=".5" /><rect x="12" y="3" width="4" height="14" rx=".5" /></g>}
    {kind === 'instruction' && <g fill="currentColor"><path d="M3 3 13 10 3 17Z" /><rect x="15" y="3" width="2" height="14" /></g>}
    {kind === 'reset' && <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7a7 7 0 1 1-1 6M4 2v5h5" /></g>}
  </svg>;
}
