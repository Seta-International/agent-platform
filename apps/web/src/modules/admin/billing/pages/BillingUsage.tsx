import { Alert, AlertDescription, Card, PageChrome, Skeleton } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import {
  getModelPricing,
  getTenantUsage,
  type ModelPriceRow,
  type TenantUsage,
} from '../api/billing-client.ts';

const usageKey = ['admin', 'billing-usage'] as const;
const pricingKey = ['admin', 'billing-pricing'] as const;

function pct(spend: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, Math.round((spend / limit) * 100));
}

/** Prices are stored per-token; show them per 1M tokens (the industry convention). */
function per1M(perToken: number): string {
  return Number((perToken * 1_000_000).toFixed(4)).toString();
}

function PeriodCard({
  title,
  spend,
  limit,
  currency,
}: {
  title: string;
  spend: number;
  limit: number | null;
  currency: string;
}) {
  const p = pct(spend, limit);
  const over = p != null && p >= 100;
  const warn = p != null && p >= 80 && p < 100;
  return (
    <Card className="p-5">
      <div className="font-medium text-ink">{title}</div>
      <div className="mt-1 text-body-sm text-ink-muted">
        {currency} {spend.toFixed(4)} {limit != null ? `/ ${limit.toFixed(2)}` : '/ unlimited'}
      </div>
      {p != null && (
        <div className="mt-3 h-2 w-full rounded-full bg-surface-3">
          <div
            className={`h-2 rounded-full ${over ? 'bg-destructive' : warn ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${p}%` }}
          />
        </div>
      )}
    </Card>
  );
}

export function BillingUsage() {
  const { data, isLoading, error } = useQuery<TenantUsage>({
    queryKey: usageKey,
    queryFn: () => getTenantUsage(),
  });

  const pricing = useQuery<ModelPriceRow[]>({
    queryKey: pricingKey,
    queryFn: () => getModelPricing(),
  });

  return (
    <PageChrome breadcrumb={['Admin']} title="AI Usage & Budget">
      <div className="page-container space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <PeriodCard
                title="Today"
                spend={data.day.spend}
                limit={data.day.limit}
                currency={data.currency}
              />
              <PeriodCard
                title="This month"
                spend={data.month.spend}
                limit={data.month.limit}
                currency={data.currency}
              />
            </div>
            <Card className="p-5">
              <div className="font-medium text-ink">This month by feature &amp; model</div>
              <table className="mt-3 w-full text-body-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="py-1">Feature</th>
                    <th className="py-1">Model</th>
                    <th className="py-1 text-right">Cost ({data.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((r) => (
                    <tr key={`${r.feature}:${r.modelKey}`} className="border-t border-hairline">
                      <td className="py-1">{r.feature}</td>
                      <td className="py-1">{r.modelKey}</td>
                      <td className="py-1 text-right">{r.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                  {data.breakdown.length === 0 && (
                    <tr>
                      <td className="py-2 text-ink-muted" colSpan={3}>
                        No usage yet this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
            <Card className="p-5">
              <div className="font-medium text-ink">Model pricing (platform)</div>
              <div className="mt-1 text-body-sm text-ink-muted">
                Global prices used to compute cost, shown per 1M tokens. Operator-managed.
              </div>
              <table className="mt-3 w-full text-body-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="py-1">Model</th>
                    <th className="py-1 text-right">Input / 1M tokens</th>
                    <th className="py-1 text-right">Output / 1M tokens</th>
                    <th className="py-1 text-right">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {(pricing.data ?? []).map((r) => (
                    <tr key={r.modelKey} className="border-t border-hairline">
                      <td className="py-1">{r.modelKey}</td>
                      <td className="py-1 text-right">{per1M(r.in)}</td>
                      <td className="py-1 text-right">{per1M(r.out)}</td>
                      <td className="py-1 text-right">{r.currency}</td>
                    </tr>
                  ))}
                  {(pricing.data?.length ?? 0) === 0 && (
                    <tr>
                      <td className="py-2 text-ink-muted" colSpan={4}>
                        No model prices configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </PageChrome>
  );
}
