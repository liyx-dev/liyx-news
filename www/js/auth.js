// ============================================================
// AUTH.JS - Google Sign-In on the client, session management.
// Mirrors chronik.js's fetch/cache pattern. The actual Google
// Sign-In button/prompt is rendered by Google's own script
// (loaded in index.html), which calls handleGoogleCredential()
// below once someone signs in - this file never talks to
// Google's servers directly except to load that one script.
// ============================================================

import { Store } from './store.js';
import { CHRONIK_API_BASE } from './sources.js';

const SESSION_KEY = 'chronik:session-token';

let currentProfile = null;

export function getSessionToken() {
  return Store.getPref(SESSION_KEY, null);
}

function setSessionToken(token) {
  Store.setPref(SESSION_KEY, token);
}

export function getCurrentProfile() {
  return currentProfile;
}

export function isSignedIn() {
  return !!currentProfile;
}

export async function handleGoogleCredential(response) {
  const idToken = response.credential;
  const res = await fetch(CHRONIK_API_BASE + '/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body.error || ''; } catch (e) { /* non-JSON error body */ }
    throw new Error('Sign-in failed (' + res.status + '): ' + (detail || 'unknown reason'));
  }
  const data = await res.json();
  setSessionToken(data.session_token);
  currentProfile = data.profile;
  return currentProfile;
}

export async function restoreSession() {
  const token = getSessionToken();
  if (!token) return null;

  try {
    const res = await fetch(CHRONIK_API_BASE + '/auth/me', {
      headers: { 'x-chronik-session': token },
    });
    const data = await res.json();
    if (data.signed_in) {
      currentProfile = data.profile;
      return currentProfile;
    }
  } catch (e) { /* offline - stay signed out locally until reachable */ }

  setSessionToken(null);
  currentProfile = null;
  return null;
}

export async function signOut() {
  const token = getSessionToken();
  try {
    await fetch(CHRONIK_API_BASE + '/auth/signout', {
      method: 'POST',
      headers: { 'x-chronik-session': token || '' },
    });
  } catch (e) { /* best effort - clear locally regardless */ }
  setSessionToken(null);
  currentProfile = null;
}

export function authHeaders() {
  const token = getSessionToken();
  return token ? { 'x-chronik-session': token } : {};
}
