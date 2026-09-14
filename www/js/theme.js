// ============================================================
// THEME — light is the default now, dark still available.
// ============================================================

import { Store } from './store.js';

const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>';

export function initTheme(iconEl) {
  const saved = Store.getPref('theme', 'light'); // light default
  apply(saved, iconEl);
  return saved;
}

export function apply(mode, iconEl) {
  document.body.setAttribute('data-theme', mode);
  if (iconEl) iconEl.innerHTML = mode === 'dark' ? SUN : MOON;
  Store.setPref('theme', mode);
}

export function toggle(iconEl) {
  const current = document.body.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  apply(next, iconEl);
  return next;
}

