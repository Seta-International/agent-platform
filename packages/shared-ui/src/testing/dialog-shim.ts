/**
 * happy-dom's HTMLDialogElement may not fully toggle `open`/visibility via
 * showModal()/close(). Patch them to set the `open` property so Astryx Dialog's
 * open/close is observable under test. Idempotent.
 */
export function installDialogShim(): void {
  const proto = window.HTMLDialogElement?.prototype;
  if (!proto || (proto as { __setaShim?: boolean }).__setaShim) return;
  (proto as { __setaShim?: boolean }).__setaShim = true;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
