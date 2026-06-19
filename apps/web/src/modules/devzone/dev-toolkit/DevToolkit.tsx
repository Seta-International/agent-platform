import { BarChart2, LogOut, Terminal, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AriaPreviewTool } from './AriaPreviewTool.tsx';
import { exitImpersonation, getImpersonateStatus } from './api.ts';
import { ImpersonateTool } from './ImpersonateTool.tsx';

type ImpersonateTarget = { user_id: string; email: string; display_name: string };

type TabId = 'impersonate' | 'aria-preview';

const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
  { id: 'impersonate', label: 'Impersonate', icon: Users },
  { id: 'aria-preview', label: 'ARIA', icon: BarChart2 },
];

export function DevToolkit() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('impersonate');
  const [impersonating, setImpersonating] = useState<ImpersonateTarget | null>(null);
  const [exitingImpersonate, setExitingImpersonate] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Check impersonation status on mount
  useEffect(() => {
    getImpersonateStatus().then((s) => {
      if (s.active) setImpersonating(s.target);
    });
  }, []);

  // Push page content below the banner so it isn't obscured
  useEffect(() => {
    document.body.style.paddingTop = impersonating ? '28px' : '';
    return () => {
      document.body.style.paddingTop = '';
    };
  }, [impersonating]);

  // Close panel on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  async function handleExit() {
    setExitingImpersonate(true);
    await exitImpersonation();
    window.location.reload();
  }

  function handleImpersonated() {
    window.location.reload();
  }

  const toolkit = (
    <>
      {/* Impersonation banner — amber top bar */}
      {impersonating && (
        <div
          className="fixed top-0 inset-x-0 h-7 flex items-center justify-center gap-3 text-[11px] font-mono z-[9998]"
          style={{
            background: 'var(--color-semantic-warning-tint)',
            borderBottom:
              '1px solid color-mix(in oklch, var(--color-semantic-warning) 50%, transparent)',
          }}
        >
          <span className="text-ink-muted">
            <span className="text-semantic-warning font-medium">DEV</span>
            {' · Impersonating '}
            <span className="text-ink font-medium">{impersonating.display_name}</span>
            <span className="text-ink-tertiary ml-1">({impersonating.email})</span>
          </span>
          <button
            type="button"
            onClick={() => void handleExit()}
            disabled={exitingImpersonate}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-semantic-warning/40 text-semantic-warning hover:bg-semantic-warning/10 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-2.5 h-2.5" />
            {exitingImpersonate ? 'Exiting…' : 'Exit'}
          </button>
        </div>
      )}

      {/* FAB + Panel container */}
      <div
        className="fixed bottom-5 right-5 flex flex-col items-end gap-2 z-[9999]"
        style={{ pointerEvents: open ? 'auto' : 'none' }}
      >
        {/* Panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Dev toolkit"
          aria-modal="true"
          style={{
            transform: open ? 'translateY(0)' : 'translateY(6px)',
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
            transition: reducedMotion
              ? 'none'
              : 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease',
          }}
          className="w-80 rounded-xl border border-hairline overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        >
          <div style={{ background: 'var(--color-surface-2)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-ink-subtle" />
                <span className="text-[11px] font-mono font-medium text-ink">Dev Toolkit</span>
                {impersonating && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-semantic-warning-tint text-semantic-warning border border-semantic-warning/30">
                    impersonating
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close dev toolkit"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-3 text-ink-tertiary hover:text-ink transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Tab rail */}
            <div className="flex border-b border-hairline px-1 pt-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={[
                    'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono rounded-t transition-colors',
                    activeTab === id
                      ? 'text-ink border-b-2 border-primary -mb-px bg-surface-3/50'
                      : 'text-ink-tertiary hover:text-ink-muted',
                  ].join(' ')}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-3">
              {activeTab === 'impersonate' && (
                <ImpersonateTool onImpersonated={handleImpersonated} />
              )}
              {activeTab === 'aria-preview' && <AriaPreviewTool />}
            </div>
          </div>
        </div>

        {/* FAB — pointer-events: auto keeps it clickable when the container is none */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close dev toolkit' : 'Open dev toolkit'}
          aria-expanded={open}
          style={{ pointerEvents: 'auto' }}
          className={[
            'relative w-10 h-10 rounded-full flex items-center justify-center',
            'border transition-all duration-150',
            open
              ? 'bg-primary/20 border-primary/50 text-primary-ink shadow-[0_0_0_4px_var(--color-primary-tint)]'
              : impersonating
                ? 'bg-semantic-warning-tint border-semantic-warning/50 text-semantic-warning shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-semantic-warning)_12%,transparent)]'
                : 'bg-surface-3 border-hairline text-ink-subtle hover:text-ink hover:border-hairline-strong shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
          ].join(' ')}
        >
          <Terminal className="w-4 h-4" />
          {impersonating && !open && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-canvas"
              style={{ background: 'var(--color-semantic-warning)' }}
            />
          )}
        </button>
      </div>
    </>
  );

  return createPortal(toolkit, document.body);
}
