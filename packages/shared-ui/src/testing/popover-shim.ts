/**
 * happy-dom doesn't implement the native Popover API's UA stylesheet
 * ([popover]:not(:popover-open) { display: none }), so [popover] elements render
 * visible pre-interaction. Astryx's useLayer falls back to inline `style.display`
 * toggling when `showPopover`/`hidePopover` are absent (its documented
 * old-Safari/old-Firefox path); this supplies the missing initial-hidden state so
 * that fallback starts consistent. A narrow, low-specificity `[popover]` rule keeps
 * Astryx's own inline `style.display` toggle on open winning and never re-clobbered.
 *
 * Idempotent: safe to call from multiple test setups in the same environment.
 */
export function installPopoverShim(): void {
  if (document.getElementById('astryx-popover-shim')) return;
  const style = document.createElement('style');
  style.id = 'astryx-popover-shim';
  style.textContent = '[popover] { display: none; }';
  document.head.appendChild(style);
}
