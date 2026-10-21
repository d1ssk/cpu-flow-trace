import { createCpu, detailRuntime, settleCpu, switchCpu, type Cpu, type View } from '../../circuits/td4/runtime';
import { defaultPlaybackSpeed, playbackTimeScale } from './playback';

export interface Snapshot {
  revision: number; view: View; loading: boolean; error: string | null;
  mode: 'paused' | 'continuous' | 'instruction'; speed: number;
  time: number; busy: boolean; ready: boolean; cycles: number; pc: number; instructionAddress: number;
  last: { address: number; byte: number } | null;
  input: number; output: number; registers: Record<string, number>;
}
export class CpuSession {
  sim: Cpu | null = null;
  private bytes: number[];
  private listeners = new Set<() => void>();
  private request = 0;
  private frame = 0;
  private active = false;
  private previous: number | undefined;
  private cycleInProgress = false;
  private snapshot: Snapshot;
  constructor(bytes: number[], view: View) {
    this.bytes = [...bytes];
    this.snapshot = { revision: 0, view, loading: true, error: null, mode: 'paused', speed: defaultPlaybackSpeed,
      time: 0, busy: false, ready: false, cycles: 0, pc: 0, instructionAddress: 0, last: null, input: 0, output: 0, registers: {} };
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  getInstructionAddress = () => this.snapshot.instructionAddress;
  private emit(update: Partial<Snapshot> = {}) {
    const s = this.sim;
    this.snapshot = { ...this.snapshot, ...(s ? { time: s.time, busy: s.busy, ready: s.ready, cycles: s.cycles,
      pc: s.value('PC.q'),
      // PC bits arrive independently in detailed circuits. Keep the assembly
      // cursor on the executing instruction until the whole cycle settles.
      instructionAddress: s.ready ? s.value('PC.q') : this.snapshot.instructionAddress,
      last: s.lastExecuted, input: s.value('IN.q'), output: s.value('OUT.data'), registers: s.snapshot() } : {}), ...update };
    this.listeners.forEach(fn => fn());
  }
  start() {
    this.active = true;
    if (!this.sim) void this.initialize();
    const tick = (now: number) => {
      if (!this.active) return;
      const delta = this.previous === undefined ? 0 : Math.min(100, now - this.previous);
      this.previous = document.hidden ? undefined : now;
      const { mode, loading, speed } = this.snapshot;
      if (this.sim && !document.hidden && !loading && mode !== 'paused') {
        if (this.sim.ready) this.cycleInProgress = this.sim.requestCycle();
        if (this.sim.busy) this.act(s => s.advance(delta * speed * playbackTimeScale));
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', this.visibility);
  }
  stop() { this.active = false; ++this.request; cancelAnimationFrame(this.frame); this.previous = undefined; document.removeEventListener('visibilitychange', this.visibility); }
  private visibility = () => { this.previous = undefined; };
  private async initialize() {
    const token = ++this.request;
    this.emit({ loading: true, error: null });
    try {
      await detailRuntime.loadAll(this.snapshot.view);
      if (token !== this.request || !this.active) return;
      this.cycleInProgress = false; this.previous = undefined;
      this.sim = createCpu(this.bytes, this.snapshot.view);
      settleCpu(this.sim); this.sim.time = 0;
      this.emit({ loading: false, revision: this.snapshot.revision + 1 });
    } catch (error) { if (token === this.request) this.fail(error); }
  }
  retry = () => { void this.initialize(); };
  private fail(error: unknown) { this.emit({ error: error instanceof Error ? error.message : String(error), loading: false, mode: 'paused' }); }
  private act(action: (sim: Cpu) => void) {
    if (!this.sim || this.snapshot.loading || this.snapshot.error) return;
    try {
      action(this.sim);
      if (this.cycleInProgress && this.sim.ready) {
        this.cycleInProgress = false;
        this.emit(this.snapshot.mode === 'instruction' ? { mode: 'paused' } : {});
      } else this.emit();
    } catch (error) { this.fail(error); }
  }
  loadProgram(bytes: number[]) {
    this.bytes = [...bytes];
    if (!this.active) return;
    this.previous = undefined;
    this.emit({ mode: 'paused' });
    void this.initialize();
  }
  async changeView(view: View) {
    if (view === this.snapshot.view || this.snapshot.loading || !this.sim) return;
    if (this.snapshot.view.startsWith('mos') && view.startsWith('mos')) {
      this.emit({ view, revision: this.snapshot.revision + 1 });
      return;
    }
    const token = ++this.request;
    const previousView = this.snapshot.view;
    this.emit({ loading: true, error: null });
    try {
      await detailRuntime.loadAll(view);
      if (token !== this.request || !this.active) return;
      if (!(previousView.startsWith('mos') && view.startsWith('mos'))) this.sim = switchCpu(this.sim, view);
      this.previous = undefined;
      this.cycleInProgress = false;
      this.emit({ view, loading: false, mode: this.snapshot.mode === 'instruction' ? 'paused' : this.snapshot.mode, revision: this.snapshot.revision + 1 });
    } catch (error) { if (token === this.request) this.fail(error); }
  }
  pause = () => { this.previous = undefined; this.emit({ mode: 'paused' }); };
  togglePlayback = () => {
    this.previous = undefined;
    this.emit({ mode: this.snapshot.mode === 'paused' ? 'continuous' : 'paused' });
  };
  clock = () => {
    this.previous = undefined;
    this.emit({ mode: 'instruction' });
    // Finish pending input propagation before starting a clock. A paused clock
    // resumes to completion without starting a second instruction.
    this.act(s => { if (s.ready) this.cycleInProgress = s.requestCycle(); });
  };
  next = () => {
    this.pause();
    this.act(s => { if (s.ready) this.cycleInProgress = s.requestCycle(); s.next(); });
  };
  step = () => {
    this.pause();
    this.act(s => { if (s.ready) this.cycleInProgress = s.requestCycle(); s.advance(100); });
  };
  reset = () => this.loadProgram(this.bytes);
  speed = (speed: number) => this.emit({ speed });
  input = (id: string) => this.act(s => { if (!s.clockActive) s.setInput(id, 1 - s.value(id)); });
}
