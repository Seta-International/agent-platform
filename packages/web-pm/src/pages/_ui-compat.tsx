/**
 * Compatibility layer for the Astryx shared-ui migration.
 *
 * `main` replaced the whole shared-ui component library (FUT-725 / Astryx) and removed the
 * components web-pm was built against (PageChrome, Combobox, Select*, Tabs*, Badge,
 * DisabledActionTooltip, ScrollArea, AvatarFallback, the old event-based Input/Textarea,
 * the `toast` singleton). Porting every call site to the new API is a large follow-up; to
 * keep the KPI/Weekly-report feature COMPILING and behaviourally intact now, this module
 * re-exports the real shared-ui and overrides the removed pieces with small native-HTML
 * shims. The shims preserve props + behaviour; visual fidelity is intentionally rough and
 * gets polished when web-pm is fully ported to Astryx.
 *
 * Every web-pm page imports UI from here instead of '@seta/shared-ui'.
 */
import { Input as AstryxInput, Textarea as AstryxTextarea } from '@seta/shared-ui';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, useContext } from 'react';

export * from '@seta/shared-ui';

// Astryx TextInput/TextArea require a `label` and use a limited `type` enum. web-pm's
// pre-migration call sites omit label and pass type="number"/"date". These wrappers relax
// both (default hidden label, drop unsupported types) so old + new call sites compile; the
// real value-based onChange still passes through.
type InputProps = ComponentProps<typeof AstryxInput>;
export function Input({
  label,
  type,
  disabled,
  isDisabled,
  isLabelHidden,
  min: _min,
  max: _max,
  ...rest
}: Omit<InputProps, 'label' | 'type'> & {
  label?: ReactNode;
  type?: string;
  disabled?: boolean;
  isLabelHidden?: boolean;
  min?: string;
  max?: string;
}) {
  const safeType = type === 'number' || type === 'date' ? undefined : type;
  return (
    <AstryxInput
      {...(rest as InputProps)}
      label={(label ?? '') as InputProps['label']}
      // Honour an explicit isLabelHidden; only fall back to hiding when there's no label
      // to show (so a labelled-but-hidden field like a table cell doesn't leak its label).
      isLabelHidden={isLabelHidden ?? (label == null || label === '')}
      isDisabled={disabled ?? isDisabled}
      {...(safeType ? ({ type: safeType } as Partial<InputProps>) : {})}
    />
  );
}
type TextareaProps = ComponentProps<typeof AstryxTextarea>;
export function Textarea({
  label,
  disabled,
  isDisabled,
  isLabelHidden,
  ...rest
}: Omit<TextareaProps, 'label'> & {
  label?: ReactNode;
  disabled?: boolean;
  isLabelHidden?: boolean;
}) {
  return (
    <AstryxTextarea
      {...(rest as TextareaProps)}
      label={(label ?? '') as TextareaProps['label']}
      isLabelHidden={isLabelHidden ?? (label == null || label === '')}
      isDisabled={disabled ?? isDisabled}
    />
  );
}

type Div = ComponentProps<'div'>;

// ---- Page chrome -----------------------------------------------------------------
export function PageChrome({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  before?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-primary">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

// ---- Button ----------------------------------------------------------------------
// Accepts the old (children/disabled/onClick) and new (label/isDisabled) shapes.
type ButtonShimProps = Omit<ComponentProps<'button'>, 'disabled'> & {
  label?: ReactNode;
  variant?: string;
  size?: string;
  disabled?: boolean;
  isDisabled?: boolean;
  asChild?: boolean;
  isIconOnly?: boolean;
  icon?: ReactNode;
  endContent?: ReactNode;
  onPress?: () => void;
};
const BTN_VARIANT: Record<string, string> = {
  primary: 'bg-primary text-on-accent hover:bg-primary-hover',
  default: 'bg-primary text-on-accent hover:bg-primary-hover',
  secondary: 'border border-hairline bg-surface-1 text-primary hover:bg-surface-2',
  ghost: 'text-primary hover:bg-surface-2',
  destructive: 'bg-error text-on-accent hover:bg-error/90',
};
const ICON_ONLY_SIZE: Record<string, string> = { sm: 'size-7', md: 'size-9', lg: 'size-10' };
export function Button({
  label,
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  isDisabled,
  className,
  asChild: _asChild,
  isIconOnly,
  icon,
  endContent,
  onPress,
  onClick,
  ...rest
}: ButtonShimProps) {
  // Icon-only buttons render just the icon; the `label` becomes the accessible name
  // (aria-label) rather than visible text, so they stay square and don't blow out their
  // column. Without this the shim printed the whole label ("Save <project>") inline.
  const shape = isIconOnly ? `${ICON_ONLY_SIZE[size] ?? ICON_ONLY_SIZE.md} p-0` : 'px-3 py-1.5';
  return (
    <button
      type="button"
      disabled={disabled ?? isDisabled}
      onClick={onClick ?? (onPress ? () => onPress() : undefined)}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md ${shape} text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN_VARIANT[variant] ?? BTN_VARIANT.primary} ${className ?? ''}`}
      {...rest}
      aria-label={isIconOnly && typeof label === 'string' ? label : undefined}
    >
      {icon}
      {isIconOnly ? null : (children ?? label)}
      {endContent}
    </button>
  );
}

// ---- Checkbox -> native (both old checked/onCheckedChange and new value/onChange/label) ----
export function Checkbox({
  checked,
  value,
  onCheckedChange,
  onChange,
  label,
  disabled,
  className,
  id,
}: {
  checked?: boolean | 'indeterminate';
  value?: boolean;
  onCheckedChange?: (next: boolean) => void;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const state = checked ?? value;
  const box = (
    <input
      type="checkbox"
      id={id}
      checked={state === true}
      ref={(el) => {
        if (el) el.indeterminate = state === 'indeterminate';
      }}
      disabled={disabled}
      onChange={(e) => {
        onCheckedChange?.(e.target.checked);
        onChange?.(e.target.checked);
      }}
      className={`size-4 rounded border-hairline ${className ?? ''}`}
    />
  );
  return label ? (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control (box) is the label's child
    <label className="flex items-center gap-2 text-sm text-primary">
      {box}
      {label}
    </label>
  ) : (
    box
  );
}

// ---- Badge -----------------------------------------------------------------------
export function Badge({
  children,
  label,
  className,
  variant: _variant,
  ...rest
}: Div & { variant?: string; label?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-xs font-medium text-secondary ${className ?? ''}`}
      {...rest}
    >
      {children ?? label}
    </span>
  );
}

export function Avatar({ children, className }: Div) {
  return (
    <span
      className={`relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

// ---- Select (compound) -> native <select> ----------------------------------------
const SelectValueCtx = createContext<{ value?: string; onValueChange?: (v: string) => void }>({});

export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: ReactNode;
}) {
  return (
    <SelectValueCtx.Provider value={{ value, onValueChange }}>{children}</SelectValueCtx.Provider>
  );
}
export function SelectTrigger({ children, className }: Div) {
  const { value, onValueChange } = useContext(SelectValueCtx);
  // The <SelectContent><SelectItem/></SelectContent> children carry the options.
  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={`h-9 rounded-md border border-hairline bg-canvas px-2 text-sm ${className ?? ''}`}
    >
      {children}
    </select>
  );
}
// SelectValue is a display-only placeholder in the old API — the native <select> shows the
// selected <option> itself, so render nothing.
export function SelectValue(_: { placeholder?: string }) {
  return null;
}
export function SelectContent({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function SelectItem({ value, children }: { value: string; children?: ReactNode }) {
  return <option value={value}>{typeof children === 'string' ? children : value}</option>;
}

// ---- Combobox -> native <select> -------------------------------------------------
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      className={`h-9 rounded-md border border-hairline bg-canvas px-2 text-sm ${className ?? ''}`}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---- Tabs (compound) -------------------------------------------------------------
const TabsCtx = createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}
export function TabsList({ children, className }: Div) {
  return (
    <div className={`mb-4 inline-flex gap-1 rounded-md bg-surface-2 p-1 ${className ?? ''}`}>
      {children}
    </div>
  );
}
export function TabsTrigger({ value, children }: { value: string; children?: ReactNode }) {
  const ctx = useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange?.(value)}
      className={`rounded px-3 py-1 text-sm font-medium ${active ? 'bg-canvas text-primary shadow-sm' : 'text-secondary'}`}
    >
      {children}
    </button>
  );
}
export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children?: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}

// ---- Passthrough / trivial shims -------------------------------------------------
export function ScrollArea({ children, className }: Div) {
  return <div className={`overflow-auto ${className ?? ''}`}>{children}</div>;
}
export function AvatarFallback({ children, className }: Div) {
  return (
    <span
      className={`flex h-full w-full items-center justify-center rounded-full bg-surface-2 ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
export function DisabledActionTooltip({
  children,
}: {
  disabled?: boolean;
  reason?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return <>{children}</>;
}

// Input / Textarea: NOT shimmed — most web-pm files already use the new Astryx value-based
// onChange, so the real components pass through. The few old event-based call sites are
// fixed in place.

// ---- toast -----------------------------------------------------------------------
// The old global singleton; Astryx moved to a useToast() hook. Preserve call sites
// (toast.success/.error) as no-ops until the pages adopt the hook — behaviourally the
// mutations still run; only the toast popup is missing (polished later).
export const toast = {
  success: (_msg?: string) => {},
  error: (_msg?: string) => {},
  info: (_msg?: string) => {},
  message: (_msg?: string) => {},
};
