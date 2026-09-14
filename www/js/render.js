// ============================================================
// RENDER — all DOM building lives here. main.js calls these
// functions; nothing else touches innerHTML directly.
// ============================================================

import { formatCount } from './stats.js';

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function storyThumb(item) {
  if (item.image) {
    return `<div class="story-media"><img src="${item.image}" alt="" loading="lazy" onerror="this.parentElement.classList.add('noimg'); this.remove();"></div>`;
  }
  return `<div class="story-media noimg"><span class="mono-mark">${(item.source || 'L')[0]}</span></div>`;
}

function topicChips(topics) {
  if (!topics || !topics.length) return '';
  return `<div class="topic-chips">${topics.map(t => `<span class="chip">${t}</span>`).join('')}</div>`;
}

/** One story, edge-to-edge Facebook/X-style card. */
export function storyCard(item, counts) {
  const c = (counts && counts[item.id]) || { views: 0, shares: 0 };
  return `
    <article class="story ${item.urgent ? 'is-urgent' : ''}" data-id="${item.id}">
      ${item.urgent ? '<div class="urgent-tag">● BREAKING</div>' : ''}
      <header class="story-top">
        <div class="source-badge">${(item.source || '?')[0]}</div>
        <div class="story-src-meta">
          <span class="story-source">${item.source}</span>
          <span class="story-time">${timeAgo(item.pubDate)} ago</span>
        </div>
      </header>
      <h2 class="story-title">${item.title}</h2>
      ${storyThumb(item)}
      <p class="story-insight"><span class="insight-tag">LiyX AI</span> ${item.insight}</p>
      ${topicChips(item.topics)}
      <footer class="story-actions">
        <button class="act-btn read-btn" data-action="open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Read
        </button>
        <span class="act-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>${formatCount(c.views)}</span>
        <button class="act-btn share-btn" data-action="share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
          ${formatCount(c.shares)}
        </button>
      </footer>
    </article>`;
}

/** Native ad card — same shape as a story card, marked Sponsored. */
export function nativeAdCard(ad) {
  if (!ad) {
    return `
      <article class="story ad-card ad-placeholder">
        <div class="sponsored-tag">Sponsored</div>
        <div class="story-media noimg"><span class="mono-mark">Ad</span></div>
        <p class="story-insight">Native ads render here inside the app build.</p>
      </article>`;
  }
  return `
    <article class="story ad-card">
      <div class="sponsored-tag">Sponsored</div>
      <h2 class="story-title">${ad.headline || ''}</h2>
      ${ad.imageUrl ? `<div class="story-media"><img src="${ad.imageUrl}" alt=""></div>` : ''}
      <p class="story-insight">${ad.body || ''}</p>
      <footer class="story-actions">
        <button class="act-btn read-btn" data-action="ad-cta">${ad.callToAction || 'Learn more'}</button>
      </footer>
    </article>`;
}

export function skeletonCard() {
  return `
    <div class="story skeleton-card">
      <div class="sk-box sk-line" style="width:40%;height:12px;margin-bottom:14px;"></div>
      <div class="sk-box sk-line" style="width:90%;height:20px;margin-bottom:6px;"></div>
      <div class="sk-box sk-line" style="width:70%;height:20px;margin-bottom:14px;"></div>
      <div class="sk-box" style="width:100%;height:180px;"></div>
    </div>`;
}

export function stateMessage(title, message, showRetry) {
  return `
    <div class="state-msg">
      <h2>${title}</h2>
      <p>${message}</p>
      ${showRetry ? '<button class="retry-btn" id="retryBtn">Try again</button>' : ''}
    </div>`;
}

/**
 * The bottom sheet content for a single story ("Read").
 * Works for both a fully-cached local story (has a real snippet
 * distinct from the insight) and a Supabase-resolved shared
 * story (snippet === insight, since we don't store full body
 * text in the backend) — the extra paragraph is skipped when
 * there's nothing new to say beyond the insight line.
 */
export function sheetContent(item) {
  const hasDistinctSnippet = item.snippet && item.snippet !== item.insight;
  return `
    ${item.image ? `<img class="sheet-img" src="${item.image}" alt="">` : ''}
    <div class="sheet-kicker"><span>${item.source}</span><span class="dot">·</span><span>${timeAgo(item.pubDate)} ago</span></div>
    <h2 class="sheet-title">${item.title}</h2>
    <p class="sheet-insight"><span class="insight-tag">LiyX AI summary</span> ${item.insight}</p>
    ${hasDistinctSnippet ? `<div class="sheet-text"><p>${item.snippet}${item.snippet.endsWith('.') ? '' : '…'}</p></div>` : ''}
    <div class="sheet-actions">
      <a class="sheet-link" href="${item.link}" target="_blank" rel="noopener noreferrer">Continue to ${item.source} ↗</a>
      <button class="sheet-share" id="sheetShareBtn" aria-label="Share via LIYX">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
      </button>
    </div>`;
}

/**
 * The branded "our URL first" interstitial page, shown when
 * someone opens a liyx.app/#/go/:id link (from a share).
 * If the story isn't cached on this device yet, shows a
 * lightweight fallback that still carries LIYX branding
 * rather than silently failing.
 */
export function goLinkPage(story) {
  if (!story) {
    return `
      <div class="go-page">
        <div class="go-brand">LIY<em>X</em></div>
        <p class="go-fallback">This story link has expired on our feed cache, but you can still catch today's top stories.</p>
        <a class="sheet-link go-cta" href="#/">Open LIYX feed →</a>
      </div>`;
  }
  return `
    <div class="go-page">
      <div class="go-brand">LIY<em>X</em></div>
      <div class="go-ad-slot">${nativeAdCard(null)}</div>
      ${sheetContent(story)}
    </div>`;
}

/** Renders a category pill rail. */
export function categoryRail(categories, activeId) {
  return categories.map(c =>
    `<button class="rail-btn${c.id === activeId ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`
  ).join('');
}

/** Weaves a native ad card into the story list every N items. */
export function weaveAds(storyCardsHtml, adCardHtml, everyN) {
  const out = [];
  storyCardsHtml.forEach((html, i) => {
    out.push(html);
    if ((i + 1) % everyN === 0) out.push(adCardHtml);
  });
  return out.join('');
}

