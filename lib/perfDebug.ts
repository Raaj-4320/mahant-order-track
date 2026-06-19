type PerfMeta = Record<string, unknown> | undefined;

type PerfEntry = {
  category: string;
  label: string;
  durationMs: number;
  meta?: PerfMeta;
  at: number;
};

type PerfAction = {
  id: number;
  name: string;
  startedAt: number;
  meta?: PerfMeta;
  entries: PerfEntry[];
  duplicateCounts: Record<string, number>;
};

type PerfState = {
  nextActionId: number;
  actionStack: PerfAction[];
};

declare global {
  // eslint-disable-next-line no-var
  var __TRADEFLOW_PERF_DEBUG__: PerfState | undefined;
}

const perfEnabled = process.env.NEXT_PUBLIC_PERF_DEBUG === "true";

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function getState(): PerfState {
  if (!globalThis.__TRADEFLOW_PERF_DEBUG__) {
    globalThis.__TRADEFLOW_PERF_DEBUG__ = {
      nextActionId: 1,
      actionStack: [],
    };
  }
  return globalThis.__TRADEFLOW_PERF_DEBUG__;
}

function currentAction() {
  const state = getState();
  return state.actionStack[state.actionStack.length - 1] ?? null;
}

function summarizeEntries(entries: PerfEntry[]) {
  const summary = {
    reads: 0,
    writes: 0,
    skippedNoOpWrites: 0,
    reloads: 0,
    syncFunctions: 0,
    calculations: 0,
    resolutions: 0,
  };
  for (const entry of entries) {
    if (entry.category === "firestore-read") summary.reads += 1;
    if (entry.category === "firestore-write") summary.writes += 1;
    if (entry.category === "firestore-noop") summary.skippedNoOpWrites += 1;
    if (entry.category === "reload") summary.reloads += 1;
    if (entry.category === "sync") summary.syncFunctions += 1;
    if (entry.category === "calc") summary.calculations += 1;
    if (entry.category === "resolve") summary.resolutions += 1;
  }
  return summary;
}

function recordEntry(category: string, label: string, durationMs: number, meta?: PerfMeta) {
  if (!perfEnabled) return;
  const entry: PerfEntry = { category, label, durationMs, meta, at: Date.now() };
  const action = currentAction();
  if (action) {
    action.entries.push(entry);
    const duplicateKey = `${category}:${label}:${JSON.stringify(meta ?? {})}`;
    action.duplicateCounts[duplicateKey] = (action.duplicateCounts[duplicateKey] ?? 0) + 1;
    if (action.duplicateCounts[duplicateKey] > 1) {
      console.debug("[perf][duplicate]", {
        action: action.name,
        category,
        label,
        duplicateCount: action.duplicateCounts[duplicateKey],
        meta,
      });
    }
  }
  console.debug(`[perf][${category}] ${label}`, {
    durationMs: Number(durationMs.toFixed(2)),
    meta,
    action: action?.name ?? null,
  });
}

export function isPerfDebugEnabled() {
  return perfEnabled;
}

export function recordPerfEvent(category: string, label: string, meta?: PerfMeta) {
  if (!perfEnabled) return;
  recordEntry(category, label, 0, meta);
}

export function recordPerfNoopWrite(label: string, meta?: PerfMeta) {
  if (!perfEnabled) return;
  recordEntry("firestore-noop", label, 0, meta);
}

export async function measurePerfAsync<T>(
  category: string,
  label: string,
  meta: PerfMeta,
  fn: () => Promise<T>,
): Promise<T> {
  if (!perfEnabled) return fn();
  const startedAt = nowMs();
  try {
    const result = await fn();
    recordEntry(category, label, nowMs() - startedAt, meta);
    return result;
  } catch (error) {
    recordEntry(category, `${label}:error`, nowMs() - startedAt, {
      ...(meta ?? {}),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function measurePerfSync<T>(
  category: string,
  label: string,
  meta: PerfMeta,
  fn: () => T,
): T {
  if (!perfEnabled) return fn();
  const startedAt = nowMs();
  const result = fn();
  recordEntry(category, label, nowMs() - startedAt, meta);
  return result;
}

export async function runPerfAction<T>(
  name: string,
  meta: PerfMeta,
  fn: () => Promise<T>,
): Promise<T> {
  if (!perfEnabled) return fn();
  const state = getState();
  const action: PerfAction = {
    id: state.nextActionId++,
    name,
    startedAt: nowMs(),
    meta,
    entries: [],
    duplicateCounts: {},
  };
  state.actionStack.push(action);
  console.groupCollapsed(`[perf][action:start] ${name}`);
  console.debug({ meta });
  try {
    return await fn();
  } finally {
    state.actionStack.pop();
    const totalDuration = nowMs() - action.startedAt;
    const summary = summarizeEntries(action.entries);
    const slowest = [...action.entries].sort((left, right) => right.durationMs - left.durationMs)[0] ?? null;
    console.debug("[perf][action:summary]", {
      action: name,
      totalDurationMs: Number(totalDuration.toFixed(2)),
      ...summary,
      slowestFunction: slowest ? `${slowest.category}:${slowest.label}` : null,
      slowestDurationMs: slowest ? Number(slowest.durationMs.toFixed(2)) : 0,
      entryCount: action.entries.length,
    });
    console.groupEnd();
  }
}
