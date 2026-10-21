import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CpuSession } from './session';
import { parseView } from '../../circuits/td4/runtime';
import { programs } from '../../td4/programs';
import { encode } from '../../td4/instructions';

const Context = createContext<CpuSession | null>(null);
export function CpuProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const [session] = useState(() => new CpuSession(programs[0].lines.map(encode), parseView(params.get('view'))));
  useEffect(() => { session.start(); return () => session.stop(); }, [session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useCpu() { const session = useContext(Context); if (!session) throw Error('CPU provider missing'); return session; }
export function useCpuSnapshot() { const session = useCpu(); return useSyncExternalStore(session.subscribe, session.getSnapshot); }
