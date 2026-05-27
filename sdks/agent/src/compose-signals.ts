/**
 * Compose multiple AbortSignals into a single signal that fires when any input
 * signal aborts. The composed signal carries the reason of whichever input
 * fired first. Listeners on remaining inputs are removed when any fires, so
 * there is no leak even for long-lived inputs (e.g. a caller-supplied signal
 * whose lifetime spans many tool calls).
 *
 * Undefined entries are ignored so callers can pass `[ctx.abortSignal, mine]`
 * without first checking presence.
 */
export function anySignal(signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  const sources = signals.filter((s): s is AbortSignal => s !== undefined);
  const controller = new AbortController();

  if (sources.length === 0) return controller.signal;

  const alreadyAborted = sources.find((s) => s.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
    return controller.signal;
  }

  const onAbort = (event: Event): void => {
    if (controller.signal.aborted) return;
    const source = event.target as AbortSignal;
    controller.abort(source.reason);
    for (const s of sources) {
      s.removeEventListener('abort', onAbort);
    }
  };

  for (const s of sources) {
    s.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}
