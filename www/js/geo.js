// ============================================================
// GEO — detect the user's country, no login, no permission
// prompt required. Falls back gracefully at every step.
//
// Strategy (cheapest/most private first):
//   1. Cached country from a previous visit (localStorage)
//   2. Free, keyless IP-geolocation lookup (ipapi.co)
//   3. Browser locale/timezone guess (works fully offline)
//   4. Hard fallback: "GLOBAL"
// ============================================================

import { Store } from './store.js';

// Countries we specifically curate feeds for. Anything else
// still works — it just gets the GLOBAL + region-nearest feed.
export const SUPPORTED_COUNTRIES = {
  NG: 'Nigeria',
  ZA: 'South Africa',
  GB: 'United Kingdom',
  KE: 'Kenya',
  GH: 'Ghana',
  EG: 'Egypt',
  US: 'United States',
  DE: 'Germany',
  FR: 'France',
};

// Rough region grouping — used when a country has no dedicated
// source list yet, so it still gets something locally relevant.
const REGION_BY_COUNTRY = {
  NG: 'africa', ZA: 'africa', KE: 'africa', GH: 'africa', EG: 'africa',
  GB: 'europe', DE: 'europe', FR: 'europe', IE: 'europe', ES: 'europe', IT: 'europe',
  US: 'americas', CA: 'americas',
};

function timezoneGuess() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('Africa/Lagos')) return 'NG';
    if (tz.startsWith('Africa/Johannesburg')) return 'ZA';
    if (tz.startsWith('Africa/Nairobi')) return 'KE';
    if (tz.startsWith('Africa/Accra')) return 'GH';
    if (tz.startsWith('Africa/Cairo')) return 'EG';
    if (tz.startsWith('Europe/London')) return 'GB';
    if (tz.startsWith('Europe/Berlin')) return 'DE';
    if (tz.startsWith('Europe/Paris')) return 'FR';
    if (tz.startsWith('America/')) return 'US';
  } catch (e) { /* Intl not available — ignore */ }
  return null;
}

async function ipLookup() {
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!res.ok) throw new Error('ip lookup failed');
    const data = await res.json();
    if (data && data.country_code) return data.country_code.toUpperCase();
  } catch (e) { /* offline, blocked, or rate-limited — fall through */ }
  return null;
}

export async function detectCountry() {
  const cached = Store.getPref('country', null);
  if (cached) return cached;

  let country = await ipLookup();
  if (!country) country = timezoneGuess();
  if (!country) country = 'GLOBAL';

  Store.setPref('country', country);
  return country;
}

export function regionFor(countryCode) {
  return REGION_BY_COUNTRY[countryCode] || 'global';
}

export function countryLabel(code) {
  return SUPPORTED_COUNTRIES[code] || 'Global';
}

// Lets the user manually override detected location from Settings —
// respects their choice over IP guessing from then on.
export function setCountryOverride(code) {
  Store.setPref('country', code);
}

