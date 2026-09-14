// ============================================================
// LIYX CONFIG
// This is the only file with credentials or environment
// toggles. Fill these in before you ship.
// ============================================================

// ---- Supabase (see docs/01-SUPABASE-SETUP.md) ----
export const SUPABASE_URL = "https://pzkchjmvomqtqvqfolpi.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6a2Noam12b21xdHF2cWZvbHBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTk2OTYsImV4cCI6MjEwNDk5NTY5Nn0.DdAG02MActkjEnepE40P4MY5dcy6WOkB7NWeOo8_Zls";

// ---- Feature flags ----
export const FEATURES = {
  // Set false to run fully offline-first with zero backend calls
  // (view/share counts just won't sync across devices).
  supabaseStatsEnabled: true,

  // Ads are only meaningful inside the Capacitor-wrapped app.
  // In a plain mobile browser this stays false automatically
  // (see ads.js — it detects the native bridge).
  adsEnabled: true,

  // Turns the on-device LiyX AI summary strip on/off per feed.
  insightEnabled: true,
};

// ---- AdMob unit IDs ----
// Use Google's official TEST ids while developing — swap to your
// real ad unit ids only right before Play Store submission.
// https://developers.google.com/admob/android/test-ads
export const ADMOB = {
  appId: "ca-app-pub-3940256099942544~3347511713",        // TEST app id
  banner: "ca-app-pub-3940256099942544/6300978111",        // TEST banner
  interstitial: "ca-app-pub-3940256099942544/1033173712",  // TEST interstitial
  nativeAdvanced: "ca-app-pub-3940256099942544/2247696110",// TEST native
  appOpen: "ca-app-pub-3940256099942544/9257395921",       // TEST app open
};

// ---- App identity ----
export const APP = {
  name: "LIYX",
  author: "Liyog Bartoos O.",
  version: "1.0.0",
  // How often we re-poll each category feed, in ms.
  pollIntervalMs: 5 * 60 * 1000,
  // Local cache freshness window — how long a fetched category
  // is considered "fresh enough" before we hit the network again.
  localCacheTtlMs: 6 * 60 * 1000,
  // How long BOTH local cache entries and Supabase story_stats
  // rows are allowed to live before auto-expiring. Keep these in
  // sync: store.js's sweepExpired() and supabase/schema.sql's
  // expires_at default both use this same 48h window.
  backendStatsTtlHours: 48,
  // How many real stories between one native ad card in the feed.
  nativeAdEveryN: 6,
};

