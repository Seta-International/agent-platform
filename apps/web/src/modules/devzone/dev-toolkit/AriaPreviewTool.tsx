import { useNavigate, useRouterState } from '@tanstack/react-router';
import { BarChart2, LayoutDashboard, TrendingUp } from 'lucide-react';

const ROLE_VIEWS = [
  {
    label: 'Employee',
    icon: LayoutDashboard,
    to: '/aria/overview' as const,
    desc: 'My overview — own scores & feedback',
    permission: 'performance.dashboard.read',
  },
  {
    label: 'Manager',
    icon: TrendingUp,
    to: '/aria/team' as const,
    desc: 'Team dashboard — talent-risk, dept scores',
    permission: 'performance.dashboard.team.read',
  },
  {
    label: 'BOD',
    icon: BarChart2,
    to: '/aria/executive' as const,
    desc: 'Executive view — org-wide KPIs, accounts',
    permission: 'performance.dashboard.executive.read',
  },
] as const;

export function AriaPreviewTool() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isOnAria = pathname.startsWith('/aria');

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-mono text-ink-tertiary mb-2">
        Simulates dashboard visibility per role. Session permissions unchanged.
      </p>
      {ROLE_VIEWS.map((v) => {
        const Icon = v.icon;
        const active = pathname.startsWith(v.to);
        return (
          <button
            key={v.label}
            type="button"
            onClick={() => void navigate({ to: v.to })}
            className={[
              'w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
              active
                ? 'bg-primary/15 border border-primary/30'
                : 'border border-transparent hover:bg-surface-3',
            ].join(' ')}
          >
            <div
              className={[
                'mt-0.5 shrink-0 size-5 rounded flex items-center justify-center',
                active ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-ink-subtle',
              ].join(' ')}
            >
              <Icon className="size-3" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[11px] font-mono font-medium ${active ? 'text-primary-ink' : 'text-ink'}`}
                >
                  {v.label}
                </span>
                {active && (
                  <span className="text-[9px] font-mono px-1 py-px rounded-full bg-primary/20 text-primary">
                    active
                  </span>
                )}
              </div>
              <p className="text-[10px] text-ink-tertiary mt-0.5 leading-snug">{v.desc}</p>
            </div>
          </button>
        );
      })}
      {!isOnAria && (
        <p className="text-[10px] font-mono text-ink-tertiary mt-2 pt-2 border-t border-hairline">
          Navigate to /aria/* to activate role preview
        </p>
      )}
    </div>
  );
}
