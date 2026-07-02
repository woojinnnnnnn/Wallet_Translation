import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);

  const favicon = document.getElementById('favicon-link') as HTMLLinkElement | null;
  if (favicon) {
    favicon.href = `/favicon-${next}.png`;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    // View Transitions API — smooth cross-fade while DOM updates
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => void })
      .startViewTransition;
    if (vt) {
      vt.call(document, () => {
        applyTheme(next);
        setTheme(next);
      });
    } else {
      setTheme(next);
    }
  };

  return { theme, toggleTheme };
}
