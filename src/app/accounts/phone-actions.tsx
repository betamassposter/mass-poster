'use client';

import { useState } from 'react';
import { Play, Square, RefreshCw, Smartphone, AlertCircle } from 'lucide-react';

interface Props {
  profileId: string;
  handle: string;
}

type PhoneStatus = 'idle' | 'starting' | 'running' | 'warming' | 'stopping' | 'error';

interface RunResult {
  ok: boolean;
  total_elapsed_ms?: number;
  actions_executed?: Array<{ ok: boolean; error?: string }>;
  error?: string;
}

export function PhoneActions({ profileId, handle }: Props) {
  const [status, setStatus] = useState<PhoneStatus>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const append = (line: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);

  const startPhone = async () => {
    setStatus('starting');
    append(`Starting phone for @${handle}…`);
    try {
      const res = await fetch('/api/multilogin/phone/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? 'phone start failed');
      append('Phone start dispatched (booting ~30-45s)');
      setStatus('running');
    } catch (e) {
      append(`error: ${(e as Error).message}`);
      setStatus('error');
    }
  };

  const stopPhone = async () => {
    setStatus('stopping');
    append('Stopping phone…');
    try {
      const res = await fetch('/api/multilogin/phone/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? 'phone stop failed');
      append('Phone stopped, billing halted.');
      setStatus('idle');
    } catch (e) {
      append(`error: ${(e as Error).message}`);
      setStatus('error');
    }
  };

  const runWarmup = async (day: number) => {
    setStatus('warming');
    append(`Starting warmup IG day ${day} (boot+ADB+scroll/like/save)…`);
    try {
      const res = await fetch('/api/automation/warmup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, platform: 'instagram', day, keep_running: false }),
      });
      const j: RunResult = await res.json();
      setLastResult(j);
      if (!j.ok) throw new Error(j.error ?? 'warmup failed');
      append(`Warmup done in ${Math.round((j.total_elapsed_ms ?? 0) / 60000)}min`);
      const ok = j.actions_executed?.filter((a) => a.ok).length ?? 0;
      const fail = j.actions_executed?.filter((a) => !a.ok).length ?? 0;
      append(`Actions: ${ok} ok, ${fail} skipped/failed`);
      setStatus('idle');
    } catch (e) {
      append(`error: ${(e as Error).message}`);
      setStatus('error');
    }
  };

  const busy = status !== 'idle' && status !== 'error';

  return (
    <div className="flex items-center gap-2">
      {status === 'starting' || status === 'warming' || status === 'stopping' ? (
        <RefreshCw size={12} className="text-text-muted animate-spin" />
      ) : status === 'error' ? (
        <AlertCircle size={12} className="text-[color:var(--status-danger)]" />
      ) : (
        <Smartphone size={12} className="text-text-muted" />
      )}
      <button
        onClick={startPhone}
        disabled={busy}
        title="Start Cloud Phone"
        className="text-[11px] px-2 py-1 rounded border border-border-subtle hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
      >
        <Play size={10} /> Start
      </button>
      <button
        onClick={stopPhone}
        disabled={busy}
        title="Stop Cloud Phone"
        className="text-[11px] px-2 py-1 rounded border border-border-subtle hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
      >
        <Square size={10} /> Stop
      </button>
      <button
        onClick={() => runWarmup(1)}
        disabled={busy}
        title="Run IG warmup day 1 (full pipeline)"
        className="text-[11px] px-2 py-1 rounded bg-[color:var(--accent)]/15 text-[color:var(--accent)] border border-[color:var(--accent)]/30 hover:bg-[color:var(--accent)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
      >
        Warmup D1
      </button>
      {log.length > 0 ? (
        <details className="ml-2">
          <summary className="text-[10px] text-text-muted cursor-pointer hover:text-text-secondary">
            log ({log.length})
          </summary>
          <div className="absolute right-2 z-10 mt-1 max-w-[460px] rounded border border-border-subtle bg-bg-canvas p-2 text-[10px] font-mono shadow-lg">
            {log.slice(-12).map((l, i) => (
              <div key={i} className="whitespace-pre-wrap text-text-muted">
                {l}
              </div>
            ))}
            {lastResult?.actions_executed ? (
              <div className="mt-1 pt-1 border-t border-border-subtle text-text-faint">
                {lastResult.actions_executed.length} actions
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
