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

// ---- RSS bridge (optional free API key) ----
// The app works with ZERO signup by default (keyless rss2json).
// Signing up for a free key at https://rss2json.com/sign-up
// (no card, ~10,000 requests/day) unlocks two things this app
// will automatically use once you paste the key below:
//   1. Higher request limits (matters as traffic grows)
//   2. The `count` parameter, so each source returns more items
//      per fetch instead of rss2json's small default batch —
//      this is the real fix for "feed feels thin," but it is
//      confirmed to require a key: rss2json rejects the whole
//      request with an error if `count` is sent without one.
// One key covers every source in the app (BBC, NPR, your
// Blogger feed, all of them) — it's not per-feed.
// Leave this blank to keep running exactly as today, no signup.
export const RSS2JSON_API_KEY = "";

// ---- App identity ----
export const APP = {
  name: "LIYX",
  author: "Liyog Bartoos O.",
  version: "1.1.0",
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

// ---- Share link base ----
// This is the ONLY place the app's public share domain is defined.
// Change this one line when you move from GitHub Pages to your
// own subdomain (e.g. https://news.liyogworld.com.ng/) — nothing
// else in the codebase needs to change. Must end with a slash.
export const SHARE_BASE_URL = "https://news.liyogworld.com.ng/";
