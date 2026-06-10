import { createHash } from 'node:crypto';

// Fixed namespace UUID for billing budget-alert notification dedup ids. Constant
// by design: it makes budgetAlertNotificationId() a pure function of its inputs.
const BUDGET_ALERT_NAMESPACE = 'b9d5a1e2-7c34-4f6a-9e21-0c8f5d3a4b6e';

/** RFC 4122 v5 (SHA-1, namespaced) UUID — deterministic for a given (namespace, name). */
function uuidv5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(nsBytes).update(name, 'utf8').digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Stable UUID identifying one budget-threshold crossing for a tenant/period.
 *
 * `notifications.source_event_id` is a uuid column, so the synthetic
 * `budget:<tenant>:<periodType>:<periodKey>:<threshold>` dedup key must be
 * expressed as a UUID. Deriving it via UUIDv5 keeps the id period-stable — the
 * notifier still dedups one in-app alert per tenant/period/threshold — while
 * satisfying the column type. Distinct thresholds/periods yield distinct ids.
 */
export function budgetAlertNotificationId(
  tenantId: string,
  periodType: 'day' | 'month',
  periodKey: string,
  threshold: number,
): string {
  return uuidv5(
    `budget:${tenantId}:${periodType}:${periodKey}:${threshold}`,
    BUDGET_ALERT_NAMESPACE,
  );
}
