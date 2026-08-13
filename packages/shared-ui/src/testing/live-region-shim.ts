import { configure, getConfig } from '@testing-library/react';

const LIVE_REGION_SELECTOR = '[data-astryx-live-region]';

/**
 * Keep Astryx's screen-reader announcements out of text queries.
 *
 * Astryx's `useAnnounce` appends a pair of singleton, visually-hidden live
 * regions to `document.body` and mirrors messages into them — toasts and field
 * validation errors alike. Every announced string therefore exists twice in the
 * DOM, so `getByText('Headcount must be…')` throws "found multiple elements"
 * even though the UI renders it once. The regions are an accessibility channel
 * rather than rendered UI, so exclude them exactly the way Testing Library
 * already excludes `script`/`style`. Idempotent.
 *
 * This covers the queries that honour `ignore` — the `*ByText`/`*ByLabelText`
 * family. `*ByRole` does not take `ignore`, and the assertive region carries
 * `role="alert"`, so assert a toast through its viewport
 * (`getByRole('region', { name: 'Notifications' })`) instead of a bare
 * `getByRole('alert')`.
 */
export function installLiveRegionIsolation(): void {
  const { defaultIgnore } = getConfig();
  if (defaultIgnore.includes(LIVE_REGION_SELECTOR)) return;
  configure({ defaultIgnore: `${defaultIgnore}, ${LIVE_REGION_SELECTOR}` });
}
