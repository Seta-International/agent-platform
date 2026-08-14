import { ToastViewport as AstryxToastViewport, type ToastViewportProps } from '@seta/shared-ui';

/**
 * ToastViewport wrapper in apps/web shell (FUT-830).
 */
export function ToastViewportWrapper(props: ToastViewportProps) {
  return <AstryxToastViewport {...props} />;
}

ToastViewportWrapper.displayName = 'ToastViewportWrapper';
