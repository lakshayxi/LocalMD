import { useRef, type KeyboardEvent } from 'react';

export interface SegmentOption<Value extends string> {
  value: Value;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string> {
  ariaLabel: string;
  value: Value;
  options: readonly SegmentOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedControlProps<Value>) {
  const buttons = useRef(new Map<Value, HTMLButtonElement>());
  const available = options.filter((option) => !disabled && !option.disabled);
  const selectedIsAvailable = available.some((option) => option.value === value);
  const firstTabStop = selectedIsAvailable ? value : available[0]?.value;

  function move(event: KeyboardEvent<HTMLButtonElement>, current: Value): void {
    if (available.length === 0) return;

    const currentIndex = Math.max(
      0,
      available.findIndex((option) => option.value === current),
    );
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % available.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + available.length) % available.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = available.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();

    const next = available[nextIndex];
    if (!next) return;

    onChange(next.value);
    queueMicrotask(() => buttons.current.get(next.value)?.focus());
  }

  const rootClass = className
    ? `lmd-desktop-segmented-control ${className}`
    : 'lmd-desktop-segmented-control';

  return (
    <div className={rootClass} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const optionDisabled = disabled || option.disabled === true;

        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) buttons.current.set(option.value, node);
              else buttons.current.delete(option.value);
            }}
            type="button"
            className="lmd-desktop-segment"
            disabled={optionDisabled}
            aria-label={option.ariaLabel}
            aria-pressed={option.value === value}
            tabIndex={!optionDisabled && option.value === firstTabStop ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
