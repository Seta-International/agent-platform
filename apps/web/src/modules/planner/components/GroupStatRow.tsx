import { cn } from '@seta/shared-ui';

interface Props {
  planCount: number;
  openTaskCount: number;
  memberCount: number;
}

interface Stat {
  label: string;
  value: string;
  sub: string;
}

export function GroupStatRow({ planCount, openTaskCount, memberCount }: Props) {
  const stats: Stat[] = [
    {
      label: 'Plans',
      value: String(planCount),
      sub: planCount === 1 ? '1 plan' : `${planCount} plans`,
    },
    {
      label: 'Open tasks',
      value: String(openTaskCount),
      sub: 'across all plans',
    },
    {
      label: 'Members',
      value: String(memberCount),
      sub: memberCount === 1 ? '1 member' : `${memberCount} members`,
    },
    {
      label: 'Activity (7d)',
      value: '—',
      sub: 'Coming soon',
    },
  ];

  return (
    <div className="grid grid-cols-4 border-y border-hairline-tertiary">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn('px-4 py-3', i < stats.length - 1 && 'border-r border-hairline-tertiary')}
        >
          <div className="text-eyebrow text-ink-subtle uppercase tracking-wide">{s.label}</div>
          <div className="mt-1 text-card-title">{s.value}</div>
          <div className="mt-0.5 text-xs text-ink-subtle">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
