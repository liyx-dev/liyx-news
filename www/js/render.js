// ============================================================
// RENDER — all DOM building lives here. main.js calls these
// functions; nothing else touches innerHTML directly.
//
// Card anatomy (per feedback): source -> headline (serif,
// primary) -> image -> AI insight strip (secondary, BELOW the
// image, never duplicating the headline) -> topic chips -> actions.
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

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================================
// Premium SVG fallback — used whenever a story has no image.
// Deterministic per source name, so the same outlet always gets
// the same generated look (not random noise on every render).
// A soft duotone gradient field + fine orbital linework + a
// large serif initial, meant to look intentional, not like a
// missing-image placeholder.
// ============================================================
const GRADIENT_PAIRS = [
  ['#FDEDE9', '#F3D9CF'], ['#EAF1F8', '#D6E4F0'], ['#F1EEF9', '#DED6EF'],
  ['#EAF6EF', '#D3EBDD'], ['#FBF0DD', '#F2DDB3'], ['#F0EEEA', '#DAD6CC'],
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function svgFallback(sourceName, category) {
  const seed = hashStr(sourceName || category || 'liyx');
  const pair = GRADIENT_PAIRS[seed % GRADIENT_PAIRS.length];
  const c1 = pair[0], c2 = pair[1];
  const initial = (sourceName || 'L')[0].toUpperCase();
  const rot = (seed % 40) - 20;
  const cx = 30 + (seed % 40);
  const cy = 30 + ((seed >> 3) % 40);

  return `
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill="url(#g${seed})"/>
      <g opacity="0.35" transform="rotate(${rot} ${cx*4} ${cy*2})">
        <circle cx="${cx*4}" cy="${cy*2}" r="70" fill="none" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="${cx*4}" cy="${cy*2}" r="100" fill="none" stroke="#ffffff" stroke-width="1"/>
      </g>
      <text x="24" y="185" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="88" fill="#ffffff" fill-opacity="0.85">${initial}</text>
    </svg>`;
}

function storyThumb(item) {
  const playOverlay = item.isVideo
    ? '<div class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>'
    : '';
  if (item.image) {
    const safeSrc = escapeHtml(item.image);
    const encodedSource = btoa(unescape(encodeURIComponent(item.source || '')));
    const encodedCategory = btoa(unescape(encodeURIComponent(item.category || '')));
    return `<div class="story-media${item.isVideo ? ' is-video' : ''}"><img src="${safeSrc}" alt="" loading="lazy" onerror="this.parentElement.outerHTML = window.__liyxFallback('${encodedSource}','${encodedCategory}');">${playOverlay}</div>`;
  }
  return `<div class="story-media svg-fallback${item.isVideo ? ' is-video' : ''}">${svgFallback(item.source, item.category)}${playOverlay}</div>`;
}

// Exposed once globally so the inline onerror handler above (which
// runs outside module scope) can still call back into our SVG
// generator. Takes base64-encoded strings (see storyThumb above)
// since that's safe to embed in an HTML attribute regardless of
// what characters the original source name contains.
if (typeof window !== 'undefined') {
  window.__liyxFallback = (b64Source, b64Category) => {
    const source = decodeURIComponent(escape(atob(b64Source || '')));
    const category = decodeURIComponent(escape(atob(b64Category || '')));
    return `<div class="story-media svg-fallback">${svgFallback(source, category)}</div>`;
  };
}

function topicChips(topics) {
  if (!topics || !topics.length) return '';
  return `<div class="topic-chips">${topics.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>`;
}

const INSIGHT_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M17 7l1.4-1.4M5.6 18.4L7 17"/><circle cx="12" cy="12" r="3.2"/></svg>';

function insightStrip(item) {
  if (!item.insight) return '';
  return `
    <div class="story-insight">
      <span class="insight-glyph">${INSIGHT_GLYPH}</span>
      <span><span class="insight-label">LiyX Insight</span>${escapeHtml(item.insight)}</span>
    </div>`;
}

/** One story card — image leads, insight sits below it as a
 *  clearly secondary strip, never touching the title text. */
export function storyCard(item, counts) {
  const c = (counts && counts[item.id]) || { views: 0, shares: 0 };
  return `
    <article class="story" data-id="${item.id}">
      ${item.urgent ? '<div class="urgent-tag">BREAKING</div>' : ''}
      <header class="story-top">
        <div class="source-badge">${escapeHtml((item.source || '?')[0])}</div>
        <div class="story-src-meta">
          <span class="story-source">${escapeHtml(item.source)}</span>
          <span class="story-time">${timeAgo(item.pubDate)} ago</span>
        </div>
      </header>
      <h2 class="story-title">${escapeHtml(item.title)}</h2>
      ${storyThumb(item)}
      ${insightStrip(item)}
      ${topicChips(item.topics)}
      <footer class="story-actions">
        <button class="act-btn read-btn" data-action="open">
          ${item.isVideo
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 5v14l11-7z"/></svg>Watch'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>Read'}
        </button>
        <span class="act-stat${c.views > 0 ? ' is-live' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>${formatCount(c.views)}</span>
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
        <div class="story-media svg-fallback">${svgFallback('Ad', 'ad')}</div>
        <p class="story-insight">Native ads render here inside the app build.</p>
      </article>`;
  }
  return `
    <article class="story ad-card">
      <div class="sponsored-tag">Sponsored</div>
      <h2 class="story-title">${escapeHtml(ad.headline || '')}</h2>
      ${ad.imageUrl ? `<div class="story-media"><img src="${ad.imageUrl}" alt=""></div>` : ''}
      <p class="story-insight">${escapeHtml(ad.body || '')}</p>
      <footer class="story-actions">
        <button class="act-btn read-btn" data-action="ad-cta">${escapeHtml(ad.callToAction || 'Learn more')}</button>
      </footer>
    </article>`;
}

export function skeletonCard() {
  return `
    <div class="story skeleton-card">
      <div class="sk-box" style="width:40%;height:12px;margin-bottom:16px;border-radius:6px;"></div>
      <div class="sk-box" style="width:90%;height:22px;margin-bottom:8px;border-radius:6px;"></div>
      <div class="sk-box" style="width:70%;height:22px;margin-bottom:16px;border-radius:6px;"></div>
      <div class="sk-box" style="width:100%;height:190px;border-radius:14px;"></div>
    </div>`;
}

export function stateMessage(title, message, showRetry) {
  return `
    <div class="state-msg">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${showRetry ? '<button class="retry-btn" id="retryBtn">Try again</button>' : ''}
    </div>`;
}

// Extracts an 11-char YouTube video ID from either a watch URL
// or a youtu.be short link, so we can build an embed iframe.
function youtubeIdFrom(url) {
  const m = (url || '').match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * The bottom sheet content for a single story ("Read"/"Watch").
 */
export function sheetContent(item) {
  const hasDistinctSnippet = item.snippet && item.snippet !== item.insight;

  if (item.isVideo) {
    const vid = youtubeIdFrom(item.link);
    const media = vid
      ? `<div class="sheet-video"><iframe src="https://www.youtube.com/embed/${vid}" title="${escapeHtml(item.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : (item.image ? `<img class="sheet-img" src="${item.image}" alt="">` : '');
    return `
      ${media}
      <div class="sheet-kicker"><span>${escapeHtml(item.source)}</span><span class="dot">·</span><span>${timeAgo(item.pubDate)} ago</span></div>
      <h2 class="sheet-title">${escapeHtml(item.title)}</h2>
      ${item.snippet ? `<div class="sheet-text"><p>${escapeHtml(item.snippet)}</p></div>` : ''}
      <div class="sheet-actions">
        <a class="sheet-link" href="${item.link}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
        <button class="sheet-share" id="sheetShareBtn" aria-label="Share via LIYX">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
        </button>
      </div>`;
  }

  const media = item.image
    ? `<img class="sheet-img" src="${item.image}" alt="">`
    : `<div class="sheet-img svg-fallback">${svgFallback(item.source, item.category)}</div>`;
  return `
    ${media}
    <div class="sheet-kicker"><span>${escapeHtml(item.source)}</span><span class="dot">·</span><span>${timeAgo(item.pubDate)} ago</span></div>
    <h2 class="sheet-title">${escapeHtml(item.title)}</h2>
    ${item.insight ? `<p class="sheet-insight"><span class="insight-tag">LiyX Insight</span> ${escapeHtml(item.insight)}</p>` : ''}
    ${hasDistinctSnippet ? `<div class="sheet-text"><p>${escapeHtml(item.snippet)}${item.snippet.endsWith('.') ? '' : '…'}</p></div>` : ''}
    <div class="sheet-actions">
      <a class="sheet-link" href="${item.link}" target="_blank" rel="noopener noreferrer">Continue to ${escapeHtml(item.source)} ↗</a>
      <button class="sheet-share" id="sheetShareBtn" aria-label="Share via LIYX">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
      </button>
    </div>`;
}

/**
 * The branded "our URL first" interstitial page, shown when
 * someone opens a shared liyx link. If the story isn't cached
 * or resolvable, shows a lightweight LIYX-branded fallback.
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

const GLOBE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/></svg>';

/** Renders a category pill rail — the Global tab gets a distinct
 *  outlined treatment so it visually reads as "step outside your
 *  country," per the smart-filter requirement. */
export function categoryRail(categories, activeId) {
  return categories.map(c => {
    const isGlobal = c.id === 'global';
    return `<button class="rail-btn${c.id === activeId ? ' active' : ''}${isGlobal ? ' is-global' : ''}" data-cat="${c.id}">${isGlobal ? GLOBE_ICON : ''}${escapeHtml(c.label)}</button>`;
  }).join('');
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
