import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { LogPanel } from '../components/LogPanel';
import { ProfileConfigCard } from '../components/ProfileConfigCard';
import { ProfileConfigForm } from '../components/ProfileConfigForm';
import { SessionPicker } from '../components/SessionPicker';
import { StatsPanel } from '../components/StatsPanel';
import { fetchRawLog, listSessions, readSession } from '../api/sessions';
import { HttpError } from '../api/http';
import { isNoisy } from '../noise';
import { sseClient } from '../sse/client';
import { useProfilesStore } from '../stores/profiles';
import { useServerStore } from '../stores/server';
import type {
  ApiError,
  CacheState,
  LogLineEvent,
  MetricsCacheEvent,
  MetricsErrorEvent,
  MetricsRequestEvent,
  MetricsSnapshotEvent,
  MetricsStartupEvent,
  NewProfile,
  Profile,
  SessionMetrics,
  SessionSummary,
} from '../types';

const REQUESTS_RING = 100;
const LOG_LINE_CAP = 5000;

interface SessionView {
  summary: SessionSummary;
  metrics: SessionMetrics;
  lines: LogLineEvent[];
}

function toNewProfile(p: Profile): NewProfile {
  const out: NewProfile = {
    name: p.name,
    modelSource: p.modelSource,
    argsLine: p.argsLine,
  };
  if (p.modelFile !== undefined) out.modelFile = p.modelFile;
  if (p.modelRepo !== undefined) out.modelRepo = p.modelRepo;
  if (p.description !== undefined) out.description = p.description;
  if (p.clonedFromTemplateId !== undefined) out.clonedFromTemplateId = p.clonedFromTemplateId;
  return out;
}

function rawLogToLines(sessionId: string, text: string): LogLineEvent[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line, i) => ({
    sessionId,
    at: '',
    lineId: i + 1,
    stream: 'stdout' as const,
    noise: isNoisy(line),
    text: line,
  }));
}

export function ProfileDetailScreen(): React.ReactElement {
  const { id, sessionId: urlSessionId } = useParams<{ id: string; sessionId?: string }>();
  const navigate = useNavigate();
  const { profiles, load, update, remove } = useProfilesStore();
  const runningProfileId = useServerStore((s) => s.status.profileId);
  const runningSessionId = useServerStore((s) => s.status.sessionId);
  const [editing, setEditing] = useState(false);

  const [sessionsList, setSessionsList] = useState<SessionSummary[]>([]);
  const [view, setView] = useState<SessionView | null>(null);
  const [effectiveSessionId, setEffectiveSessionId] = useState<string | null>(null);
  const [hideNoise, setHideNoise] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const viewSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (profiles.length === 0) void load();
  }, [load, profiles.length]);

  const profile = useMemo(() => profiles.find((p) => p.id === id) ?? null, [profiles, id]);

  // Refresh the session list whenever the profile changes or a new session
  // begins/ends on this profile.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listSessions(id)
      .then((sessions) => {
        if (!cancelled) setSessionsList(sessions);
      })
      .catch(() => {
        // best-effort; empty list is handled by the UI
      });
    return () => {
      cancelled = true;
    };
  }, [id, runningSessionId]);

  // Resolve which session to display: URL override, else newest available.
  useEffect(() => {
    if (urlSessionId) {
      setEffectiveSessionId(urlSessionId);
      return;
    }
    // No URL pin: follow the newest session. Includes the running one since
    // sessions are created at start time.
    const newest = sessionsList[0]?.sessionId ?? runningSessionId ?? null;
    setEffectiveSessionId(newest);
  }, [urlSessionId, sessionsList, runningSessionId]);

  // Fetch the selected session's summary + metrics + raw.log whenever the
  // effective session changes.
  useEffect(() => {
    if (!id || !effectiveSessionId) {
      setView(null);
      viewSessionIdRef.current = null;
      return;
    }
    // Point the ref at the new session immediately so live SSE deltas that
    // arrive while the fetch is in flight aren't dropped as "wrong session".
    viewSessionIdRef.current = effectiveSessionId;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([readSession(id, effectiveSessionId), fetchRawLog(id, effectiveSessionId).catch(() => '')])
      .then(([res, rawText]) => {
        if (cancelled) return;
        setView((prev) => {
          // Merge: take the fetched baseline, but preserve any live deltas
          // that already landed into the store while we were fetching.
          const fetched: SessionView = {
            summary: res.summary,
            metrics: res.metrics,
            lines: rawLogToLines(effectiveSessionId, rawText),
          };
          if (!prev || prev.summary.sessionId !== effectiveSessionId) return fetched;
          // Same session; keep whichever totals/requests are more advanced.
          const mergedRequestIds = new Set(fetched.metrics.requests.map((r) => r.taskId));
          const extraLiveRequests = prev.metrics.requests.filter((r) => !mergedRequestIds.has(r.taskId));
          const mergedLineIds = new Set(fetched.lines.map((l) => l.lineId));
          const extraLiveLines = prev.lines.filter((l) => !mergedLineIds.has(l.lineId));
          return {
            summary: fetched.summary,
            metrics: {
              ...fetched.metrics,
              requests: [...fetched.metrics.requests, ...extraLiveRequests].slice(-REQUESTS_RING),
              totals:
                prev.metrics.totals.requests > fetched.metrics.totals.requests
                  ? prev.metrics.totals
                  : fetched.metrics.totals,
              cache: prev.metrics.cache ?? fetched.metrics.cache,
            },
            lines: [...fetched.lines, ...extraLiveLines].slice(-LOG_LINE_CAP),
          };
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof HttpError) setLoadError(err.apiError);
        else setLoadError({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, effectiveSessionId]);

  // If the viewed session IS the running session, subscribe to live deltas.
  const isLiveView =
    effectiveSessionId !== null &&
    runningSessionId !== null &&
    effectiveSessionId === runningSessionId &&
    profile !== null &&
    runningProfileId === profile.id;

  useEffect(() => {
    if (!isLiveView || !effectiveSessionId) return;

    const matchSession = (eventSessionId: string): boolean =>
      eventSessionId === viewSessionIdRef.current;

    const offLine = sseClient.on<LogLineEvent>('log.line', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) => {
        if (!prev) return prev;
        // Drop duplicates if the fetch seed already included this lineId.
        if (prev.lines.some((l) => l.lineId === evt.lineId)) return prev;
        const next = [...prev.lines, evt];
        if (next.length > LOG_LINE_CAP) next.splice(0, next.length - LOG_LINE_CAP);
        return { ...prev, lines: next };
      });
    });

    const offStartup = sseClient.on<MetricsStartupEvent>('metrics.startup', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) => (prev ? { ...prev, metrics: { ...prev.metrics, startup: evt.startup } } : prev));
    });

    const offRequest = sseClient.on<MetricsRequestEvent>('metrics.request', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) => {
        if (!prev) return prev;
        const requests = [...prev.metrics.requests, evt.request];
        if (requests.length > REQUESTS_RING) requests.splice(0, requests.length - REQUESTS_RING);
        return { ...prev, metrics: { ...prev.metrics, requests, totals: evt.totals } };
      });
    });

    const offCache = sseClient.on<MetricsCacheEvent>('metrics.cache', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) =>
        prev ? { ...prev, metrics: { ...prev.metrics, cache: evt.cache as CacheState } } : prev,
      );
    });

    const offError = sseClient.on<MetricsErrorEvent>('metrics.error', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) =>
        prev
          ? {
              ...prev,
              metrics: {
                ...prev.metrics,
                errors: [...prev.metrics.errors, evt.entry],
                totals: { ...prev.metrics.totals, errors: prev.metrics.totals.errors + 1 },
              },
            }
          : prev,
      );
    });

    const offSnapshot = sseClient.on<MetricsSnapshotEvent>('metrics.snapshot', (evt) => {
      if (!matchSession(evt.sessionId)) return;
      setView((prev) => (prev ? { ...prev, metrics: evt.metrics } : prev));
    });

    return () => {
      offLine();
      offStartup();
      offRequest();
      offCache();
      offError();
      offSnapshot();
    };
  }, [isLiveView, effectiveSessionId]);

  if (!profile) {
    return (
      <div className="p-6 text-sm opacity-70">
        {profiles.length === 0 ? 'Loading…' : 'Profile not found.'}
      </div>
    );
  }

  const headerLabel = view
    ? isLiveView
      ? `Live · ${view.summary.sessionId}`
      : `Session · ${view.summary.sessionId}`
    : 'No sessions yet';

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <ErrorBoundary label="Profile config">
          {editing ? (
            <>
              <header className="border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
                <h1 className="text-lg font-medium">Editing {profile.name}</h1>
              </header>
              <ProfileConfigForm
                initial={toNewProfile(profile)}
                submitLabel="Save changes"
                onSubmit={async (body) => {
                  await update(profile.id, body);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </>
          ) : (
            <ProfileConfigCard
              profile={profile}
              onEdit={() => setEditing(true)}
              onDelete={async () => {
                if (!window.confirm(`Delete profile "${profile.name}"? Session history will be removed too.`)) return;
                await remove(profile.id);
                navigate('/');
              }}
            />
          )}
        </ErrorBoundary>
      </div>

      <SessionPicker
        profileId={profile.id}
        sessions={sessionsList}
        runningSessionId={runningProfileId === profile.id ? runningSessionId : null}
        effectiveSessionId={effectiveSessionId}
      />

      {loadError && (
        <div className="m-4 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          Failed to load session: {loadError.message}
        </div>
      )}

      {view && (
        <>
          <div className="shrink-0">
            <ErrorBoundary label="Stats panel">
              <StatsPanel metrics={view.metrics} />
            </ErrorBoundary>
          </div>
          <div className="flex flex-1 min-h-0 flex-col">
            <ErrorBoundary label="Log panel">
              <LogPanel
                lines={view.lines}
                hideNoise={hideNoise}
                onHideNoiseChange={setHideNoise}
                title={headerLabel}
              />
            </ErrorBoundary>
          </div>
        </>
      )}

      {!view && !loadError && (
        <div className="p-6 text-sm opacity-60">
          {loading ? 'Loading session…' : 'No sessions yet. Start this profile to create one.'}
        </div>
      )}
    </div>
  );
}
