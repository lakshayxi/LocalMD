import type { Theme } from '../store';
import { useDocument } from '../store';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

/**
 * Cycles theme rather than opening a menu. Three options do not justify a
 * popover, and a control whose label always states the current value needs no
 * separate indicator.
 */
export function ThemeToggle() {
  const theme = useDocument((s) => s.theme);
  const setTheme = useDocument((s) => s.setTheme);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? 'system';

  return (
    <button
      type="button"
      className="lmd-chip"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
    >
      {LABEL[theme]}
    </button>
  );
}
