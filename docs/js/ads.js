// ============================================================
// ADS — bridges to the native AdMob plugin when running inside
// the Capacitor-wrapped app. When running in a plain mobile
// browser (no native bridge present), every function becomes a
// safe no-op so the site still works fine as a website too.
//
// Requires (added via npm once you run `npx cap sync`, see
// docs/02-ADMOB-SETUP.md):
//   @capacitor-community/admob
//
// This file is intentionally the ONLY place that talks to the
// AdMob plugin — swapping ad networks later means editing here.
// ============================================================

import { ADMOB, FEATURES, APP } from './config.js';

function nativeAvailable() {
  return typeof window !== 'undefined'
    && window.Capacitor
    && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform();
}

let AdMobPlugin = null;
async function getPlugin() {
  if (!nativeAvailable()) return null;
  if (AdMobPlugin) return AdMobPlugin;
  try {
    const mod = await import('@capacitor-community/admob');
    AdMobPlugin = mod.AdMob;
    await AdMobPlugin.initialize({
      requestTrackingAuthorization: true,
      testingDevices: [],
      initializeForTesting: false,
    });
    return AdMobPlugin;
  } catch (e) {
    console.warn('[ads] AdMob plugin not available:', e);
    return null;
  }
}

/** Call once at app boot. No-ops instantly on plain web. */
export async function initAds() {
  if (!FEATURES.adsEnabled) return;
  await getPlugin();
}

/** Bottom banner — call once, stays docked. */
export async function showBanner() {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.showBanner({
    adId: ADMOB.banner,
    adSize: 'ADAPTIVE_BANNER',
    position: 'BOTTOM_CENTER',
    margin: 0,
  });
}

export async function hideBanner() {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.hideBanner();
}

/** Interstitial — show sparingly (e.g. every ~5 story opens, never on first launch). */
let interstitialLoaded = false;
export async function prepareInterstitial() {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.prepareInterstitial({ adId: ADMOB.interstitial });
  interstitialLoaded = true;
}

export async function showInterstitial() {
  const plugin = await getPlugin();
  if (!plugin || !interstitialLoaded) return;
  await plugin.showInterstitial();
  interstitialLoaded = false;
  prepareInterstitial(); // pre-load the next one
}

/** App-open ad — show on cold start / foreground resume, not every single time. */
export async function showAppOpenAd() {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.prepareAppOpenAd?.({ adId: ADMOB.appOpen });
    await plugin.showAppOpenAd?.();
  } catch (e) { /* plugin version may not support app-open yet — safe to skip */ }
}

/**
 * Native feed ad — returns a plain data object (not a rendered ad)
 * that render.js turns into a card matching the story card layout.
 * Actual native-ad-rendering plugins vary; this returns metadata
 * your renderer uses to build a visually-native "Sponsored" card.
 * Swap the plugin call here if you pick a different native ad SDK.
 */
export async function getNativeAdSlot() {
  const plugin = await getPlugin();
  if (!plugin) return null;
  try {
    const ad = await plugin.loadNativeAd?.({ adId: ADMOB.nativeAdvanced });
    return ad || null;
  } catch (e) {
    return null;
  }
}

/** Simple counter-based gate: call after each story open, returns
 *  true when it's time to show an interstitial. Keeps ad frequency
 *  sane without hand-tracking counts all over main.js. */
let opensSinceLastInterstitial = 0;
export function shouldShowInterstitial() {
  opensSinceLastInterstitial++;
  if (opensSinceLastInterstitial >= 5) {
    opensSinceLastInterstitial = 0;
    return true;
  }
  return false;
}

export { nativeAvailable };
