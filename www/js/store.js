// ============================================================
// STORE — the ONLY module that touches localStorage.
// Same pattern as before: everything expires, nothing is
// treated as permanent. This is our "storage" — no database
// needed on-device.
// ============================================================

const NS = 'liyx:';

function safeParse(raw) {
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export const Store = {
  /** Cache a value with its own TTL (ms). */
  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* storage full/blocked — app still works, just not cached */ }
  },

  /** Get a value only if still within maxAgeMs, else null. */
  get(key, maxAgeMs) {
    const parsed = safeParse(localStorage.getItem(NS + key));
    if (!parsed) return null;
    if (Date.now() - parsed.t > maxAgeMs) return null;
    return parsed.v;
  },

  /** Get a value regardless of age — used for offline fallback. */
  getStale(key) {
    const parsed = safeParse(localStorage.getItem(NS + key));
    return parsed ? parsed.v : null;
  },

  remove(key) {
    try { localStorage.removeItem(NS + key); } catch (e) {}
  },

  /** Small persistent preferences (theme, country, streak, etc). */
  setPref(key, value) {
    try { localStorage.setItem(NS + 'pref:' + key, JSON.stringify(value)); } catch (e) {}
  },
  getPref(key, fallback) {
    const raw = localStorage.getItem(NS + 'pref:' + key);
    if (raw === null) return fallback;
    const parsed = safeParse(raw);
    return parsed === null ? fallback : parsed;
  },

  /**
   * Sweep pass: deletes any liyx: cache entry older than 48h.
   * Called once at boot so localStorage never silently grows
   * forever, matching the "nothing stays past 48h" rule —
   * kept in sync with the Supabase story_stats expiry window.
   */
  sweepExpired(maxAgeMs = 48 * 60 * 60 * 1000) {
    const now = Date.now();
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(NS) || key.startsWith(NS + 'pref:')) continue;
      const parsed = safeParse(localStorage.getItem(key));
      if (!parsed || now - parsed.t > maxAgeMs) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  },
};
