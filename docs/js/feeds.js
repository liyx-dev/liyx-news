// ============================================================
// FEEDS — fetch RSS via the bridge, normalize into our story
// shape, de-dupe, and run each story through the local AI
// insight engine once (cached with the story, not recomputed).
// ============================================================

import { RSS_BRIDGE, sourcesFor } from './sources.js';
import { Store } from './store.js';
import { analyzeStory } from './insight.js';
import { APP, RSS2JSON_API_KEY } from './config.js';

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

function firstImageFrom(item) {
  if (item.thumbnail) return item.thumbnail;
  if (item.enclosure && item.enclosure.link) return item.enclosure.link;
  const match = (item.content || item.description || '').match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match ? match[1] : null;
}

/** Short, stable id derived from the canonical link — used for
 *  Supabase stats keys and the /go/:id redirect, so it's the
 *  same id every time the same story is fetched again. */
function storyId(link) {
  let hash = 0;
  for (let i = 0; i < link.length; i++) {
    hash = (hash * 31 + link.charCodeAt(i)) | 0;
  }
  return 'l' + Math.abs(hash).toString(36);
}

function normalize(rawItem, sourceName, categoryId, countryCode) {
  const title = stripHtml(rawItem.title);
  const snippet = stripHtml(rawItem.description || rawItem.content || '').slice(0, 280);
  const link = rawItem.link;

  const story = {
    id: storyId(link),
    title,
    snippet,
    link,
    image: firstImageFrom(rawItem),
    source: sourceName,
    category: categoryId,
    country: countryCode,
    pubDate: rawItem.pubDate ? new Date(rawItem.pubDate).getTime() : Date.now(),
    // Video cards render a play affordance + open straight to
    // YouTube instead of the "Read" bottom sheet flow, since a
    // video has nothing to summarize into an extractive insight.
    isVideo: categoryId === 'video',
  };

  if (story.isVideo) {
    // YouTube RSS snippets are often empty or just repeat the
    // title, so skip the insight engine entirely for videos —
    // an "insight" on a video is meaningless and would just be
    // more headline-echo, exactly what we fixed for articles.
    story.insight = '';
    story.topics = [];
    story.urgent = false;
    return story;
  }

  const ai = analyzeStory(story);
  story.insight = ai.insight;
  story.topics = ai.topics;
  story.urgent = ai.urgent;

  return story;
}

async function fetchSource(source, categoryId, countryCode) {
  // count/api_key are ONLY appended when a real key is configured
  // in config.js — confirmed that rss2json rejects the whole
  // request with status:"error" if count is sent without a key,
  // so this must never fire in the keyless default configuration.
  let url = RSS_BRIDGE + encodeURIComponent(source.url);
  if (RSS2JSON_API_KEY) {
    url += `&api_key=${encodeURIComponent(RSS2JSON_API_KEY)}&count=50`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('bridge fetch failed: ' + source.name);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('bad feed: ' + source.name);
  return data.items.map(it => normalize(it, source.name, categoryId, countryCode));
}

/**
 * Wraps fetchSource with one retry on failure (network blip or a
 * transient bridge hiccup), so a single dropped request doesn't
 * silently shrink the feed — part of the "robust and smart" bar.
 * Still resolves to [] rather than throwing, so Promise.allSettled
 * in fetchCategory always treats a fully-failed source as "empty,"
 * never as a crash that could take other sources down with it.
 */
async function fetchSourceWithRetry(source, categoryId, countryCode) {
  try {
    return await fetchSource(source, categoryId, countryCode);
  } catch (firstErr) {
    try {
      await new Promise(r => setTimeout(r, 600)); // brief backoff
      return await fetchSource(source, categoryId, countryCode);
    } catch (secondErr) {
      console.warn(`[feeds] source unreachable after retry: ${source.name}`);
      return [];
    }
  }
}

/**
 * Fetch + cache a single category for the given country/region.
 * Cache key includes country so switching location never shows
 * stale cross-country data — except for 'global' and 'faith',
 * which are deliberately the same for every user everywhere, so
 * they share one cache entry regardless of detected country.
 */
export async function fetchCategory(categoryId, countryCode, region) {
  const isCountryAgnostic = categoryId === 'global' || categoryId === 'faith' || categoryId === 'video';
  const cacheKey = isCountryAgnostic ? `cat:ALL:${categoryId}` : `cat:${countryCode}:${categoryId}`;
  const cached = Store.get(cacheKey, APP.localCacheTtlMs);
  if (cached) return { items: cached, fromCache: true };

  const sources = sourcesFor(categoryId, countryCode, region);
  const results = await Promise.allSettled(
    sources.map(s => fetchSourceWithRetry(s, categoryId, countryCode))
  );

  let items = [];
  results.forEach(r => { if (r.status === 'fulfilled') items = items.concat(r.value); });

  const seen = new Set();
  items = items
    .filter(it => {
      const key = it.link || it.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.pubDate - a.pubDate);

  if (items.length) {
    Store.set(cacheKey, items);
    return { items, fromCache: false };
  }

  const stale = Store.getStale(cacheKey);
  if (stale && stale.length) return { items: stale, fromCache: true, stale: true };

  throw new Error('No stories available for ' + categoryId);
}

/** Look up a single cached story by id — used by the redirect page,
 *  so /go/:id doesn't need a fresh network fetch to know what to show. */
export function findCachedStoryById(id) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('liyx:cat:')) continue;
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (!parsed || !parsed.v) continue;
    const found = parsed.v.find(story => story.id === id);
    if (found) return found;
  }
  return null;
}
