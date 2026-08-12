import { forwardRef, type ReactNode } from 'react';

export interface SidebarItemProps {
  label: string;
  meta?: string;
  icon?: ReactNode;
  selected?: boolean;
  dirty?: boolean;
  missing?: boolean;
  disabled?: boolean;
  /** Override the generated label when visible text does not describe the action. */
  ariaLabel?: string;
  title?: string;
  className?: string;
  onActivate?: () => void;
}

export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  {
    label,
    meta,
    icon,
    selected = false,
    dirty = false,
    missing = false,
    disabled = false,
    ariaLabel,
    title,
    className,
    onActivate,
  },
  ref,
) {
  const unavailable = disabled || missing;
  const states = [dirty ? 'unsaved changes' : null, missing ? 'unavailable' : null].filter(Boolean);
  const generatedLabel = states.length > 0 ? `${label}, ${states.join(', ')}` : label;
  const rootClass = className ? `lmd-desktop-sidebar-item ${className}` : 'lmd-desktop-sidebar-item';

  return (
    <button
      ref={ref}
      type="button"
      className={rootClass}
      disabled={unavailable}
      aria-current={selected ? 'page' : undefined}
      aria-label={ariaLabel ?? generatedLabel}
      title={title ?? label}
      data-dirty={dirty || undefined}
      data-missing={missing || undefined}
      onClick={onActivate}
    >
      {icon && (
        <span className="lmd-desktop-sidebar-icon" aria-hidden="true">
          {icon}
        </span>
      )}

      <span className="lmd-desktop-sidebar-copy">
        <span className="lmd-desktop-sidebar-label">{label}</span>
        {meta && <span className="lmd-desktop-sidebar-meta">{meta}</span>}
      </span>

      {dirty && <span className="lmd-desktop-sidebar-dirty" aria-hidden="true" />}
      {missing && (
        <span className="lmd-desktop-sidebar-status" aria-hidden="true">
          Unavailable
        </span>
      )}
    </button>
  );
});
