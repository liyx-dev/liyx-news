// ============================================================
// REDIRECT — implements "our URL first, then the source."
//
// When a user taps Share, we don't hand out the original
// publisher's link directly. We generate a LIYX link that:
//   1. Opens LIYX's own page (branded, counts a view, shows
//      the headline/insight + LIYX chrome + an interstitial ad
//      slot) — this is what pulls new people into the app.
//   2. Then lets them continue to the original source.
//
// Resolution order for liyx.app/#/go/<story_id>:
//   1. This device's own localStorage cache (instant, free)
//   2. Supabase story_stats row (only exists if THIS story was
//      shared before — see stats.js pingShare/resolveSharedStory)
//   3. If neither has it (link is very old, past the 48h window,
//      or was never actually shared), we don't show a dead end —
//      we just send the person straight into the live LIYX feed.
// ============================================================

import { findCachedStoryById } from './feeds.js';
import { pingShare, resolveSharedStory } from './stats.js';
import { SHARE_BASE_URL } from './config.js';

// Built from config.js's SHARE_BASE_URL so moving domains later
// (e.g. to a liyogworld.com.ng subdomain) is a one-line change,
// never a find-and-replace across the codebase.
const SHARE_BASE = SHARE_BASE_URL.replace(/\/?$/, '/') + '#/go/';

/** Builds the shareable LIYX link for a story (not the raw source link). */
export function buildShareLink(story) {
  return SHARE_BASE + story.id;
}

/** Triggers the native/web share sheet with our own link, and pings the counter.
 *  navigator.share() is called FIRST and synchronously relative to the
 *  click that triggered this — Chrome/WebView silently reject the call
 *  (NotAllowedError, no visible error) if anything else runs first and
 *  the "trusted user gesture" window has expired by the time it fires. */
export function shareStory(story) {
  const url = buildShareLink(story);
  const shareData = {
    title: story.title,
    text: `${story.title} — via LIYX`,
    url,
  };

  if (navigator.share) {
    return navigator.share(shareData)
      .then(() => { pingShare(story); return 'native'; })
      .catch(() => 'cancelled'); // user cancelled — not an error, don't ping
  }

  return navigator.clipboard?.writeText(url).then(() => {
    pingShare(story);
    return 'copied';
  }) ?? Promise.resolve('unsupported');
}

/**
 * Checks if the current URL is a /go/:id deep link, and if so,
 * resolves the story to render on the branded interstitial —
 * checking local cache first, then Supabase. Called once at
 * boot, before the normal feed renders.
 *
 * Returns:
 *   null                     — not a /go/ link at all, boot normally
 *   { id, story: {...} }     — found (locally or via Supabase), show it
 *   { id, story: null }      — genuinely not found anywhere; caller
 *                              should skip the interstitial and just
 *                              open the normal live feed instead
 */
export async function parseIncomingGoLink() {
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/go\/([a-z0-9]+)$/i);
  if (!match) return null;

  const id = match[1];

  const localStory = findCachedStoryById(id);
  if (localStory) return { id, story: localStory };

  const remoteStory = await resolveSharedStory(id);
  if (remoteStory) return { id, story: remoteStory };

  return { id, story: null }; // not found anywhere — go straight to the feed
}

/** Clears the /go/:id route from the URL once the user continues past it. */
export function clearGoRoute() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
