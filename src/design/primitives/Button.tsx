import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'quiet' | 'bordered' | 'primary';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  variant?: ButtonVariant;
  /** Set this only for toggle buttons. Omit it for ordinary actions. */
  selected?: boolean;
}

function classes(base: string, className: string | undefined): string {
  return className ? `${base} ${className}` : base;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'quiet', selected, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes('lmd-desktop-button', className)}
      data-variant={variant}
      aria-pressed={selected}
    />
  );
});

export interface IconButtonProps
  extends Omit<ButtonProps, 'aria-label' | 'children' | 'title'> {
  /** A concise action label for assistive technology. */
  label: string;
  icon: ReactNode;
  title?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, title, className, ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      className={classes('lmd-desktop-icon-button', className)}
      aria-label={label}
      title={title}
    >
      <span className="lmd-desktop-icon-button-glyph" aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
});
