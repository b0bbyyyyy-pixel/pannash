'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type ParseJobKind = 'banks' | 'leads' | 'application';

export type ParseJob = {
  id: string;
  kind: ParseJobKind;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
};

type StartArgs = {
  kind: ParseJobKind;
  label: string;
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

function ParseJobsChip({
  jobs,
  dismiss,
}: {
  jobs: ParseJob[];
  dismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !jobs.length) return null;
  return createPortal(
    <div className="fixed bottom-2 right-3 z-[400] flex flex-col gap-2 w-[min(18.5rem,calc(100vw-1.5rem))] pointer-events-none">
      {jobs.map(job => (
        <div
          key={job.id}
          className="pointer-events-auto bg-white border border-[#e5e5e5] shadow-xl rounded-2xl px-4 py-3 flex items-start gap-3"
        >
          {job.status === 'running' ? (
            <svg className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-[#1a1a1a]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : job.status === 'done' ? (
            <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
          ) : (
            <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">!</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#1a1a1a]">
              {job.status === 'running'
                ? `Reading ${kindLabel(job.kind).toLowerCase()}…`
                : job.status === 'done'
                  ? `${kindLabel(job.kind)} ready`
                  : `${kindLabel(job.kind)} failed`}
            </p>
            <p className="text-[11px] text-[#6b6b6b] mt-0.5 truncate">
              {job.detail || job.label}
            </p>
            {job.status === 'running' && (
              <p className="text-[10px] text-[#9b9b9b] mt-1">Keep using the CRM. We’ll ping you when this is done.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(job.id)}
            className="text-[#9b9b9b] hover:text-[#1a1a1a] text-sm leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
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
    setJobs(js => [...js, { id, kind: args.kind, label: args.label, status: 'running' }]);
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
      <ParseJobsChip jobs={jobs} dismiss={dismiss} />
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
