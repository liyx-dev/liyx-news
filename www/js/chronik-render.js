// ============================================================
// CHRONIK-RENDER.JS - DOM building for Chronik's three surfaces:
//   1. Quote cards (feed + Home)
//   2. The living-archive profile page (quote grid + timeline)
//   3. Today in History card (Home)
// Mirrors render.js's structure and escaping discipline exactly.
// ============================================================

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

// ------------------------------------------------------------
// Quote card - image-forward, breathing room, matches the news
// card's visual language (same border/shadow/radius tokens) so
// the two systems feel like one product, not two skins bolted
// together.
// ------------------------------------------------------------
export function quoteCard(quote) {
  const authorBadge = quote.author_is_admin
    ? '<span class="chronik-badge">Chronik</span>'
    : '';
  return `
    <article class="story quote-card" data-quote-id="${quote.id}">
      <header class="story-top">
        <div class="source-badge author-avatar">
          ${quote.author_avatar ? '<img src="' + escapeHtml(quote.author_avatar) + '" alt="">' : escapeHtml((quote.author_name || '?')[0])}
        </div>
        <div class="story-src-meta">
          <span class="story-source">${escapeHtml(quote.author_name)} ${authorBadge}</span>
          <span class="story-time">${timeAgo(quote.created_at)} ago</span>
        </div>
      </header>
      <div class="quote-visual" style="background-image:url('${escapeHtml(quote.background_image_url || '')}')">
        <p class="quote-text">&ldquo;${escapeHtml(quote.text)}&rdquo;</p>
      </div>
      ${quote.category ? ('<div class="topic-chips"><span class="chip">' + escapeHtml(quote.category) + '</span></div>') : ''}
      <footer class="story-actions">
        <button class="act-btn like-btn" data-action="like" aria-label="Like this quote">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          ${quote.like_count || 0}
        </button>
        <button class="act-btn comment-btn" data-action="comment" aria-label="Comment on this quote">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>
          ${quote.comment_count || 0}
        </button>
        <span class="act-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>${quote.view_count || 0}</span>
        <button class="act-btn share-btn" data-action="share" aria-label="Share this quote">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
          ${quote.share_count || 0}
        </button>
      </footer>
    </article>`;
}

// ------------------------------------------------------------
// Today in History - a single, composed Home-tab card. Tapping
// it opens the full day's list (see historyDayList below).
// ------------------------------------------------------------
export function todayHistoryCard(data) {
  if (!data || !data.featured) return '';
  const ev = data.featured;
  const linkedName = data.linkedProfile ? escapeHtml(data.linkedProfile.display_name) : null;

  return `
    <article class="story history-card" data-history-id="${ev.id}">
      <header class="history-kicker">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        TODAY IN HISTORY &middot; ${ev.year}
      </header>
      ${ev.image_url ? ('<div class="story-media"><img src="' + escapeHtml(ev.image_url) + '" alt=""></div>') : ''}
      <h2 class="story-title">${escapeHtml(ev.title)}</h2>
      <p class="story-insight">${escapeHtml(ev.summary || '')}</p>
      ${linkedName ? ('<button class="history-linked-profile" data-open-profile="' + data.linkedProfile.id + '">Read more about ' + linkedName + ' &rarr;</button>') : ''}
      <footer class="story-actions">
        <button class="act-btn like-btn" data-action="history-like"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>${ev.like_count || 0}</button>
        <span class="act-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>${ev.view_count || 0}</span>
        <button class="act-btn share-btn" data-action="history-share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>${ev.share_count || 0}</button>
      </footer>
    </article>`;
}

// ------------------------------------------------------------
// The living archive - a Hero's (or, later, a user's) full
// profile: encyclopedic header, then quote grid interleaved
// with timeline markers by date.
// ------------------------------------------------------------
export function livingArchiveHeader(profile) {
  return `
    <div class="archive-cover" style="background-image:url('${escapeHtml(profile.cover_image_url || '')}')">
      <div class="archive-avatar">
        ${profile.avatar_image_url ? ('<img src="' + escapeHtml(profile.avatar_image_url) + '" alt="">') : escapeHtml((profile.display_name || '?')[0])}
      </div>
    </div>
    <div class="archive-header-body">
      <h1 class="archive-name">${escapeHtml(profile.display_name)}</h1>
      <p class="archive-era">${escapeHtml(profile.era || '')} &middot; ${escapeHtml(profile.category || '')}</p>
      <p class="archive-tagline">${escapeHtml(profile.tagline || '')}</p>
      <p class="archive-bio">${escapeHtml(profile.bio_full || profile.bio_short || '')}</p>
      <div class="archive-meta-row">
        <span>${profile.view_count || 0} views</span>
        ${profile.is_admin ? '<span class="chronik-badge">Chronik Archive</span>' : ''}
      </div>
    </div>`;
}

/** Weaves quotes and timeline events into one profile view -
 *  this interleaving is the literal implementation of "quotes
 *  and history woven into one profile," not just two lists that
 *  happen to share a page. */
export function livingArchiveBody(quotes, timeline) {
  const timelineHtml = timeline.map(function (ev) {
    return '<div class="archive-timeline-item" data-history-id="' + ev.id + '">' +
      '<div class="archive-timeline-year">' + (ev.year || '') + '</div>' +
      '<div class="archive-timeline-content"><h3>' + escapeHtml(ev.title) + '</h3><p>' + escapeHtml(ev.summary || '') + '</p></div>' +
      '</div>';
  }).join('');

  const gridHtml = quotes.map(function (q) {
    const shortText = q.text.length > 90 ? q.text.slice(0, 87) + '…' : q.text;
    return '<div class="archive-grid-item" data-quote-id="' + q.id + '" style="background-image:url(\'' + escapeHtml(q.background_image_url || '') + '\')">' +
      '<p>&ldquo;' + escapeHtml(shortText) + '&rdquo;</p></div>';
  }).join('');

  return (timeline.length ? ('<section class="archive-section"><h2 class="archive-section-title">Timeline</h2><div class="archive-timeline">' + timelineHtml + '</div></section>') : '') +
    '<section class="archive-section"><h2 class="archive-section-title">Quotes</h2><div class="archive-grid">' +
    (gridHtml || '<p class="archive-empty">No quotes yet.</p>') + '</div></section>';
}

export function commentItem(comment) {
  return '<div class="comment-item">' +
    '<span class="comment-author">' + escapeHtml(comment.author_name) + '</span>' +
    '<p class="comment-text">' + escapeHtml(comment.text) + '</p>' +
    '<span class="comment-time">' + timeAgo(comment.created_at) + ' ago</span>' +
    '</div>';
}
