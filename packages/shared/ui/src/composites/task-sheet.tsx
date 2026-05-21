import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

export interface TaskSheetProps {
  title: string;
  subtitle?: string;
  description?: ReactNode;
  properties?: ReactNode;
  checklist?: ReactNode;
  activity?: ReactNode;
  footer?: ReactNode;
  /** Optional overflow menu / extra controls rendered in the header. */
  headerActions?: ReactNode;
  onClose: () => void;
  /** When set, replaces the body with the concurrent-delete state. */
  deletedBy?: string;
  saving?: boolean;
}

export function TaskSheet({
  title,
  subtitle,
  description,
  properties,
  checklist,
  activity,
  footer,
  headerActions,
  onClose,
  deletedBy,
  saving,
}: TaskSheetProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="task-sheet" role="dialog" aria-modal="false" aria-label={title}>
      <header className="task-sheet__header">
        <div className="task-sheet__title-block">
          <h2 className="task-sheet__title">{title}</h2>
          {subtitle && <div className="task-sheet__subtitle">{subtitle}</div>}
        </div>
        {headerActions}
        <button type="button" className="task-sheet__close" aria-label="Close" onClick={onClose}>
          <X className="size-3.5" aria-hidden />
        </button>
        {saving && (
          <span aria-hidden="true" className="task-sheet__saving-dot" data-testid="sheet-saving" />
        )}
      </header>

      {deletedBy ? (
        <div className="task-sheet__deleted" role="alert">
          <p>This task was deleted by {deletedBy}.</p>
          <a href="/planner/trash">Open trash</a>
        </div>
      ) : (
        <>
          {description && <section className="task-sheet__section">{description}</section>}
          {properties && <section className="task-sheet__section">{properties}</section>}
          {checklist && <section className="task-sheet__section">{checklist}</section>}
          {activity && <section className="task-sheet__section">{activity}</section>}
        </>
      )}

      {footer && <footer className="task-sheet__footer">{footer}</footer>}
    </div>
  );
}
