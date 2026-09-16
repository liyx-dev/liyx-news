// ============================================================
// CHRONIK.JS - the client's connection to the Cloudflare Worker.
// Mirrors feeds.js's pattern exactly (fetch -> normalize ->
// cache) so anyone maintaining the news side already understands
// this file. One addition unique to Chronik: batched engagement,
// which exists specifically to respect D1's free-tier write
// limits at scale (see cloudflare/worker/index.js for the other
// half of this mechanism).
// ============================================================

import { Store } from './store.js';
import { CHRONIK_API_BASE } from './sources.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // matches the news feed's rhythm

async function apiGet(path) {
  const cacheKey = "chronik:" + path;
  const cached = Store.get(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  const res = await fetch(CHRONIK_API_BASE + path);
  if (!res.ok) throw new Error('Chronik API error: ' + path);
  const data = await res.json();
  Store.set(cacheKey, data);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(CHRONIK_API_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Chronik API error: ' + path);
  return res.json();
}

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------
export async function listQuotes(category) {
  const qs = category ? ('?category=' + encodeURIComponent(category)) : '';
  const data = await apiGet('/quotes' + qs);
  return data.quotes || [];
}

export async function listProfiles(category) {
  const qs = category ? ('?category=' + encodeURIComponent(category)) : '';
  const data = await apiGet('/profiles' + qs);
  return data.profiles || [];
}

export async function getProfile(id) {
  return apiGet('/profiles/' + id); // { profile, quotes, timeline }
}

export async function getTodayHistory() {
  return apiGet('/history/today'); // { featured, linkedProfile, month, day }
}

export async function getHistoryForDay(month, day) {
  return apiGet('/history/' + month + '/' + day);
}

export async function listComments(targetType, targetId) {
  const data = await apiGet('/comments?target_type=' + targetType + '&target_id=' + targetId);
  return data.comments || [];
}

export async function postComment(targetType, targetId, text, authorName) {
  return apiPost('/comments', { target_type: targetType, target_id: targetId, text, author_name: authorName });
}

// ------------------------------------------------------------
// Batched engagement - the write-optimization layer.
// Views/likes/shares are queued in memory + localStorage and
// flushed as ONE request every FLUSH_INTERVAL_MS, or on page
// unload. A burst of 50 quote views from one visitor becomes 1
// network request instead of 50, and on the server side,
// drainEngagementQueue() folds everyone's queued events into
// the same global counters - so User A and User B still
// converge on the identical final count, just a few minutes
// later rather than instantly (an explicit, agreed tradeoff).
// ------------------------------------------------------------
const FLUSH_INTERVAL_MS = 90 * 1000; // 90 seconds
const QUEUE_KEY = 'chronik:engagement-queue';

function loadQueue() {
  return Store.getStale(QUEUE_KEY) || [];
}
function saveQueue(queue) {
  Store.set(QUEUE_KEY, queue);
}

/** Call this instead of hitting the network directly for any
 *  view/like/share - it's the ONLY entry point for engagement. */
export function queueEngagement(targetType, targetId, eventType, delta) {
  const queue = loadQueue();
  queue.push({ target_type: targetType, target_id: targetId, event_type: eventType, delta: delta || 1 });
  saveQueue(queue);
}

async function flushEngagementQueue() {
  const queue = loadQueue();
  if (!queue.length) return;

  // Clear locally FIRST (optimistic), so a slow/failed request
  // doesn't cause duplicate re-sends of the same events next tick.
  saveQueue([]);

  try {
    await apiPost('/engage', { events: queue });
  } catch (e) {
    // Network hiccup - put the events back for the next flush
    // rather than losing them silently.
    const stillQueued = loadQueue();
    saveQueue(queue.concat(stillQueued));
  }
}

let flushTimer = null;
export function startEngagementFlushLoop() {
  if (flushTimer) return; // already running, avoid double intervals
  flushTimer = setInterval(flushEngagementQueue, FLUSH_INTERVAL_MS);
  // Best-effort flush on page hide/unload so short visits aren't lost.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEngagementQueue();
  });
}

// Convenience wrappers matching the news side's stats.js naming,
// so the two systems feel consistent to maintain.
export function pingQuoteView(quoteId) { queueEngagement('quote', quoteId, 'view'); }
export function pingQuoteLike(quoteId) { queueEngagement('quote', quoteId, 'like'); }
export function pingQuoteShare(quoteId) { queueEngagement('quote', quoteId, 'share'); }
export function pingHistoryView(eventId) { queueEngagement('history_event', eventId, 'view'); }
export function pingProfileView(profileId) { queueEngagement('profile', profileId, 'view'); }
