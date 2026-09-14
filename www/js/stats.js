// ============================================================
// STATS — thin client for the two Supabase RPC calls we use.
// No SDK needed: Supabase's REST/RPC endpoints are plain HTTP,
// so this is a handful of fetch() calls, kept in one place.
//
// Fails silently and never blocks the UI — counts are a nice-
// to-have, not a dependency. If Supabase is unreachable or not
// configured yet, the app works exactly the same minus the
// shared counters.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, FEATURES } from './config.js';
import { Store } from './store.js';

function configured() {
  return FEATURES.supabaseStatsEnabled
    && SUPABASE_URL
    && !SUPABASE_URL.includes('YOUR-PROJECT-REF')
    && SUPABASE_ANON_KEY
    && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
}

async function rpc(fnName, payload) {
  if (!configured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('rpc failed: ' + fnName);
    return true;
  } catch (e) {
    return null; // offline or misconfigured — silently ignore
  }
}

// De-dupes view pings so refreshing/re-opening the same story in
// the same session doesn't inflate counts. Resets naturally since
// it's just an in-memory Set for this page load.
const viewedThisSession = new Set();

export async function pingView(story) {
  if (viewedThisSession.has(story.id)) return;
  viewedThisSession.add(story.id);
  await rpc('increment_view', {
    p_story_id: story.id,
    p_category: story.category,
    p_country: story.country,
  });
}

/**
 * Bumps share_count AND — only stored once per story, on first
 * share — attaches the minimal content snapshot (title, image,
 * source link, LiyX AI insight) so that anyone opening the
 * resulting liyx.app/#/go/:id link can see the real story, even
 * on a device that never fetched it themselves. See resolveSharedStory().
 */
export async function pingShare(story) {
  await rpc('increment_share', {
    p_story_id: story.id,
    p_category: story.category,
    p_country: story.country,
    p_title: story.title,
    p_image_url: story.image || null,
    p_source_name: story.source,
    p_source_link: story.link,
    p_insight: story.insight || null,
  });
}

/**
 * Resolves a story by id from Supabase — used ONLY as the
 * fallback when a /go/:id link is opened on a device whose
 * local cache doesn't have that story (e.g. a brand new visitor
 * who followed a shared link). Returns null if not configured,
 * unreachable, expired, or the story was never shared (view-only
 * rows never carry content, by design — see schema.sql).
 */
export async function resolveSharedStory(storyId) {
  if (!configured()) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/story_stats?story_id=eq.${encodeURIComponent(storyId)}&select=story_id,title,image_url,source_name,source_link,insight,category,country`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = rows[0];
    if (!row || !row.title) return null; // no content ever attached — was view-only

    // reshape into the same story object shape the rest of the
    // app already knows how to render
    return {
      id: row.story_id,
      title: row.title,
      snippet: row.insight || '',
      insight: row.insight || '',
      image: row.image_url,
      source: row.source_name,
      link: row.source_link,
      category: row.category,
      country: row.country,
      pubDate: Date.now(),
      topics: [],
      urgent: false,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch current counts for a batch of story ids in one request.
 * Used to show "1.2k views" on cards without one request per card.
 * Results are cached locally for a couple minutes to stay light
 * on the free tier.
 */
export async function fetchCounts(storyIds) {
  if (!configured() || !storyIds.length) return {};

  const cacheKey = 'counts:' + storyIds.slice(0, 5).join(',');
  const cached = Store.get(cacheKey, 2 * 60 * 1000);
  if (cached) return cached;

  try {
    const idList = storyIds.map(id => `"${id}"`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/story_stats?story_id=in.(${idList})&select=story_id,view_count,share_count`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error('fetch counts failed');
    const rows = await res.json();
    const map = {};
    rows.forEach(r => { map[r.story_id] = { views: r.view_count, shares: r.share_count }; });
    Store.set(cacheKey, map);
    return map;
  } catch (e) {
    return {};
  }
}

/** Formats 1234 -> "1.2k" for compact display on cards. */
export function formatCount(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
}

