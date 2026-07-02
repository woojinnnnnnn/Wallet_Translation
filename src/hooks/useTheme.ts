import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// The inline bootstrap script in index.html already computes the theme
// (storage -> prefers-color-scheme fallback) and sets it on <html> before
// this module ever loads, precisely so there's no flash on first paint.
// Reading it back here — instead of re-deriving it from localStorage/
// matchMedia a second time — means that rule only has to live in one place.
function getInitialTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;

  // Fallback in case the bootstrap script didn't run for some reason.
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
