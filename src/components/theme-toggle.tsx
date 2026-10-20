'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: 'Match system', light: 'Light', dark: 'Dark' };

function readCookie(): Theme {
  const m = /(?:^|;\s*)vb_theme=(system|light|dark)/.exec(document.cookie);
  return (m?.[1] as Theme) ?? 'system';
}

/**
 * Writes a cookie so the server can render the right palette on the next
 * request, and flips the attribute immediately so this one does not flash.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => setTheme(readCookie()), []);

  function apply(next: Theme) {
    setTheme(next);
    document.cookie = `vb_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    const el = document.documentElement;
    if (next === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', next);
  }

  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      title={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}.`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}.`}
      className="inline-flex min-h-[2.25rem] items-center gap-2 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
    >
      <Icon size={15} aria-hidden />
      {compact ? null : <span>{LABEL[theme]}</span>}
    </button>
  );
}
