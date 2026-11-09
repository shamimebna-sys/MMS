export const WORKER_DRAIN_MS = 15_000;

export type WorkerShutdown = {
  signal: AbortSignal;
  bind(loop: Promise<void>): void;
  requestShutdown(): Promise<void>;
};

type SignalTarget = {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
};

/**
 * One shutdown for a worker process.
 * The first request stops new claims. In-flight work is given `drainMs`, then `close` runs once.
 */
export function createWorkerShutdown(close: () => Promise<void>, drainMs = WORKER_DRAIN_MS): WorkerShutdown {
  const controller = new AbortController();
  let loop: Promise<void> | undefined;
  let resolveBound: (() => void) | undefined;
  const bound = new Promise<void>((resolve) => {
    resolveBound = resolve;
  });
  let task: Promise<void> | undefined;

  return {
    signal: controller.signal,
    bind(next) {
      loop = next;
      resolveBound?.();
      resolveBound = undefined;
    },
    requestShutdown() {
      if (task) return task;
      let resolveTask: (() => void) | undefined;
      let rejectTask: ((error: unknown) => void) | undefined;
      task = new Promise<void>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });
      controller.abort();
      drainAndClose(bound, () => loop ?? Promise.resolve(), close, drainMs).then(resolveTask, rejectTask);
      return task;
    },
  };
}

export function bindWorkerSignals(
  target: SignalTarget,
  shutdown: () => Promise<void>,
  exit: (code: number) => void,
  log: (message: string) => void = (message) => console.error(message),
): void {
  let started = false;
  const onSignal = () => {
    if (started) return;
    started = true;
    shutdown().then(
      () => exit(0),
      (error: unknown) => {
        log(error instanceof Error ? error.message : "worker shutdown failed");
        exit(1);
      },
    );
  };
  target.on("SIGINT", onSignal);
  target.on("SIGTERM", onSignal);
}

/** Binds the loop, waits for it, then shuts down. A loop failure is reported ahead of a shutdown failure. */
export async function runGuardedWorker(
  loop: Promise<void>,
  shutdown: WorkerShutdown,
  log: (message: string) => void = (message) => console.error(message),
): Promise<void> {
  shutdown.bind(loop);
  let failure: unknown;
  try {
    await loop;
  } catch (error) {
    failure = error;
  }
  try {
    await shutdown.requestShutdown();
  } catch (error) {
    if (failure === undefined) failure = error;
    else if (error !== failure) log(error instanceof Error ? error.message : "worker shutdown failed");
  }
  if (failure !== undefined) throw failure;
}

async function drainAndClose(
  bound: Promise<void>,
  loop: () => Promise<void>,
  close: () => Promise<void>,
  drainMs: number,
): Promise<void> {
  let drainError: unknown;
  try {
    await bound;
    await withDeadline(loop(), drainMs, "Worker drain");
  } catch (error) {
    drainError = error;
  }

  let closeError: unknown;
  try {
    await close();
  } catch (error) {
    closeError = error;
  }

  if (drainError) {
    if (closeError instanceof Error && drainError instanceof Error && drainError.cause == null) {
      drainError.cause = closeError;
    }
    throw drainError;
  }
  if (closeError) throw closeError;
}

class ShutdownTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "ShutdownTimeoutError";
  }
}

function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ShutdownTimeoutError(label, ms));
    }, ms);
    timer.unref?.();
  });
  work.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
