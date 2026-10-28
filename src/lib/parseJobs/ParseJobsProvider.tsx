'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ParseJobKind = 'banks' | 'leads' | 'application';

export type ParseJob = {
  id: string;
  kind: ParseJobKind;
  label: string;
  leadId?: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
};

type StartArgs = {
  kind: ParseJobKind;
  label: string;
  leadId?: string;
  run: () => Promise<string | void>;
};

type ParseJobsContextValue = {
  jobs: ParseJob[];
  start: (args: StartArgs) => string;
  dismiss: (id: string) => void;
};

const ParseJobsContext = createContext<ParseJobsContextValue | null>(null);

function kindLabel(kind: ParseJobKind) {
  if (kind === 'banks') return 'Bank statements';
  if (kind === 'leads') return 'Lead sheet';
  return 'Application';
}

/** Tiny spinner for inbox — same 18px height as the lead-list status pill. */
export function ParseJobsSpinner({ leadId }: { leadId?: string }) {
  const { jobs } = useParseJobs();
  const running = jobs.find(j =>
    j.status === 'running' && (!leadId || j.leadId === leadId),
  );
  if (!running) return null;
  return (
    <span
      className="inline-flex h-[18px] w-[18px] items-center justify-center shrink-0"
      title={`Reading ${kindLabel(running.kind).toLowerCase()} for ${running.label}`}
    >
      <svg className="h-[11px] w-[11px] animate-spin text-[#9b9b9b]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </span>
  );
}

export function ParseJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ParseJob[]>([]);

  const dismiss = useCallback((id: string) => {
    setJobs(js => js.filter(j => j.id !== id));
  }, []);

  const start = useCallback((args: StartArgs) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `parse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setJobs(js => [...js, { id, kind: args.kind, label: args.label, leadId: args.leadId, status: 'running' }]);
    void (async () => {
      try {
        const detail = (await args.run()) || `Finished ${args.label}`;
        setJobs(js => js.map(j => (j.id === id ? { ...j, status: 'done', detail } : j)));
        window.setTimeout(() => {
          setJobs(js => js.filter(j => j.id !== id || j.status === 'running'));
        }, 14_000);
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Parse failed';
        setJobs(js => js.map(j => (j.id === id ? { ...j, status: 'error', detail } : j)));
      }
    })();
    return id;
  }, []);

  const value = useMemo(() => ({ jobs, start, dismiss }), [jobs, start, dismiss]);

  return (
    <ParseJobsContext.Provider value={value}>
      {children}
    </ParseJobsContext.Provider>
  );
}

export function useParseJobs(): ParseJobsContextValue {
  const ctx = useContext(ParseJobsContext);
  if (ctx) return ctx;
  return {
    jobs: [],
    start: (args: StartArgs) => {
      void args.run();
      return 'local';
    },
    dismiss: () => {},
  };
}
