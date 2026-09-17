// ============================================================
// MAIN - the conductor. Imports every module and wires DOM
// events to them. No business logic lives here beyond state,
// routing, and event glue - see the individual modules for "how."
//
// ROUTING MODEL: one index.html shell, four <main> "screens"
// (home / news / chronik / profile), toggled by showScreen().
// This avoids a full page reload between tabs (state like theme,
// location, and in-memory caches survive switching) while still
// giving each screen its own accessibility landmark region, per
// docs/06-ACCESSIBILITY.md.
// ============================================================

import { APP, FEATURES } from './config.js';
import { CATEGORIES } from './sources.js';
import { Store } from './store.js';
import { detectCountry, regionFor, countryLabel, setCountryOverride, SUPPORTED_COUNTRIES } from './geo.js';
import { fetchCategory } from './feeds.js';
import { fetchCounts } from './stats.js';
import { shareStory, parseIncomingGoLink, clearGoRoute } from './redirect.js';
import * as Render from './render.js';
import * as Theme from './theme.js';
import * as Ads from './ads.js';
import * as Chronik from './chronik.js';
import * as ChronikRender from './chronik-render.js';
import * as Auth from './auth.js';

const scrim = document.getElementById('scrim');
const sheet = document.getElementById('sheet');
const sheetScroll = document.getElementById('sheetScroll');
const sheetClose = document.getElementById('sheetClose');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const refreshBtn = document.getElementById('refreshBtn');
const toastEl = document.getElementById('toast');
const goOverlay = document.getElementById('goOverlay');
const screenLabel = document.getElementById('screenLabel');

const feedEl = document.getElementById('feed');
const railEl = document.getElementById('rail');
const locationStrip = document.getElementById('locationStrip');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn = document.getElementById('loadMoreBtn');

const homeFeedEl = document.getElementById('homeFeed');
const chronikFeedEl = document.getElementById('chronikFeed');
const chronikRailEl = document.getElementById('chronikRail');
const profileContentEl = document.getElementById('profileContent');

const PAGE_SIZE = 8;
let activeCategory = 'top';
let currentItems = [];
let visibleCount = PAGE_SIZE;
let userCountry = 'GLOBAL';
let userRegion = 'global';
let activeScreen = 'home';
let activeChronikCategory = null;
let currentQuotes = [];

const CHRONIK_CATEGORIES = ['Courage', 'Leadership', 'Faith', 'Curiosity', 'Mental Health'];

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// TEMPORARY diagnostic overlay - stacks messages and stays on
// screen (unlike the auto-hiding toast) so a sequence of debug
// steps can actually be read on a phone, one after another,
// without racing against a timeout. Remove once auth is confirmed
// fully working end-to-end.
window.__chronikDebugToast = function (msg) {
  let box = document.getElementById('chronikDebugBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'chronikDebugBox';
    box.style.cssText = 'position:fixed;bottom:100px;left:10px;right:10px;background:#111;color:#0f0;font-family:monospace;font-size:11px;padding:10px;border-radius:8px;z-index:9999;max-height:200px;overflow-y:auto;white-space:pre-wrap;';
    document.body.appendChild(box);
  }
  box.textContent += msg + '\n';
};

const SCREENS = {
  home:    { el: document.getElementById('screen-home'),    label: 'Home' },
  news:    { el: document.getElementById('screen-news'),    label: 'News' },
  chronik: { el: document.getElementById('screen-chronik'), label: 'Chronik' },
  profile: { el: document.getElementById('screen-profile'), label: 'Archive' },
};

function showScreen(name) {
  Object.keys(SCREENS).forEach(function (key) {
    SCREENS[key].el.style.display = key === name ? '' : 'none';
  });
  activeScreen = name;
  screenLabel.textContent = SCREENS[name].label;

  railEl.style.display = name === 'news' ? '' : 'none';
  locationStrip.style.display = name === 'news' ? '' : 'none';
  chronikRailEl.style.display = name === 'chronik' ? '' : 'none';

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    const tabForScreen = name === 'profile' ? 'chronik' : name;
    btn.classList.toggle('active', btn.dataset.tab === tabForScreen);
  });

  window.scrollTo(0, 0);
}

function renderSkeleton() {
  feedEl.innerHTML = Array.from({ length: 5 }, Render.skeletonCard).join('');
  loadMoreWrap.style.display = 'none';
}

function renderState(title, msg, retry) {
  feedEl.innerHTML = Render.stateMessage(title, msg, retry);
  loadMoreWrap.style.display = 'none';
  const btn = document.getElementById('retryBtn');
  if (btn) btn.addEventListener('click', function () { loadCategory(activeCategory, true); });
}

async function renderFeed() {
  const slice = currentItems.slice(0, visibleCount);
  const counts = FEATURES.supabaseStatsEnabled
    ? await fetchCounts(slice.map(function (s) { return s.id; }))
    : {};

  const cardsHtml = slice.map(function (item) { return Render.storyCard(item, counts); });
  const adCard = Ads.nativeAvailable() ? Render.nativeAdCard(await Ads.getNativeAdSlot()) : null;
  feedEl.innerHTML = adCard
    ? Render.weaveAds(cardsHtml, adCard, APP.nativeAdEveryN)
    : cardsHtml.join('');

  wireStoryCardEvents(feedEl);
  loadMoreWrap.style.display = currentItems.length > visibleCount ? 'flex' : 'none';
}

function wireStoryCardEvents(container) {
  container.querySelectorAll('.story[data-id]').forEach(function (card) {
    const id = card.getAttribute('data-id');
    const item = currentItems.find(function (s) { return s.id === id; });
    if (!item) return;

    const openBtn = card.querySelector('[data-action="open"]');
    if (openBtn) openBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openSheet(item);
    });
    const shareBtn = card.querySelector('[data-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', async function (e) {
      e.stopPropagation();
      const result = await shareStory(item);
      if (result === 'copied') showToast('Link copied');
      if (result === 'native' || result === 'copied') {
        // Bump the on-screen count immediately rather than waiting
        // up to 2 minutes for fetchCounts' cache to expire - the
        // real total in Supabase is already correct either way,
        // this just keeps what's on screen from feeling stale.
        const statEl = shareBtn;
        const current = parseInt(statEl.textContent, 10) || 0;
        const iconHtml = statEl.querySelector('svg').outerHTML;
        statEl.innerHTML = iconHtml + ' ' + (current + 1);
      }
    });
    card.addEventListener('click', function () { openSheet(item); });
  });
}

loadMoreBtn.addEventListener('click', function () {
  visibleCount += PAGE_SIZE;
  renderFeed();
});

function renderRail() {
  railEl.innerHTML = Render.categoryRail(CATEGORIES, activeCategory);
  railEl.querySelectorAll('.rail-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.cat === activeCategory) return;
      activeCategory = btn.dataset.cat;
      renderRail();
      loadCategory(activeCategory);
    });
  });
}

async function loadCategory(categoryId, forceRefresh) {
  visibleCount = PAGE_SIZE;
  renderSkeleton();

  if (forceRefresh) Store.remove('cat:' + userCountry + ':' + categoryId);

  try {
    const result = await fetchCategory(categoryId, userCountry, userRegion);
    currentItems = result.items;
    await renderFeed();
    if (result.stale) showToast('Showing saved stories — reconnecting…');
  } catch (err) {
    renderState('The feed is quiet', 'Couldn\u2019t reach live sources right now. Check your connection and try again.', true);
  }
}

function renderLocationStrip() {
  locationStrip.innerHTML = 'Showing news for <strong>' + countryLabel(userCountry) + '</strong> &middot; <button id="changeLocBtn">change</button>';
  document.getElementById('changeLocBtn').addEventListener('click', function () {
    const codes = Object.keys(SUPPORTED_COUNTRIES);
    const list = codes.map(function (c) { return c + ' — ' + SUPPORTED_COUNTRIES[c]; }).join('\n');
    const pick = prompt('Type a country code:\n' + list, userCountry);
    if (pick && SUPPORTED_COUNTRIES[pick.toUpperCase()]) {
      userCountry = pick.toUpperCase();
      userRegion = regionFor(userCountry);
      setCountryOverride(userCountry);
      renderLocationStrip();
      loadCategory(activeCategory, true);
    }
  });
}

function renderChronikRail() {
  const chips = ['All'].concat(CHRONIK_CATEGORIES);
  chronikRailEl.innerHTML = chips.map(function (c) {
    const id = c === 'All' ? null : c;
    const isActive = activeChronikCategory === id;
    return '<button class="rail-btn' + (isActive ? ' active' : '') + '" data-chronik-cat="' + c + '">' + c + '</button>';
  }).join('');
  chronikRailEl.querySelectorAll('.rail-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const cat = btn.dataset.chronikCat;
      activeChronikCategory = cat === 'All' ? null : cat;
      renderChronikRail();
      loadChronikFeed();
    });
  });
}

async function loadChronikFeed() {
  chronikFeedEl.innerHTML = Array.from({ length: 4 }, Render.skeletonCard).join('');
  try {
    const quotes = await Chronik.listQuotes(activeChronikCategory);
    currentQuotes = quotes;
    if (!quotes.length) {
      chronikFeedEl.innerHTML = Render.stateMessage(
        'Nothing here yet',
        'No quotes in this category yet — check back soon or try another filter.',
        false
      );
      return;
    }
    chronikFeedEl.innerHTML = quotes.map(ChronikRender.quoteCard).join('');
    wireQuoteCardEvents(chronikFeedEl);
  } catch (err) {
    chronikFeedEl.innerHTML = Render.stateMessage(
      'Chronik is quiet',
      'Couldn\u2019t reach the Chronik archive right now. Check your connection and try again.',
      true
    );
    const btn = document.getElementById('retryBtn');
    if (btn) btn.addEventListener('click', loadChronikFeed);
  }
}

function wireQuoteCardEvents(container) {
  container.querySelectorAll('.quote-card[data-quote-id]').forEach(function (card) {
    const id = card.getAttribute('data-quote-id');
    const quote = currentQuotes.find(function (q) { return q.id === id; }) || container.__singleQuote;
    if (!quote) return;

    Chronik.pingQuoteView(id);

    // Tapping the author's avatar or name opens their living
    // archive profile — this was the missing link: profiles were
    // only reachable from a Today-in-History card before, never
    // from the quote feed itself where people actually browse.
    const authorArea = card.querySelector('.story-top');
    if (authorArea && quote.profile_id) {
      authorArea.style.cursor = 'pointer';
      authorArea.addEventListener('click', function (e) {
        e.stopPropagation();
        showToast('DEBUG: tapped, opening ' + quote.profile_id); // TEMPORARY - remove after diagnosis
        openProfile(quote.profile_id);
      });
    } else {
      // TEMPORARY diagnostic - tells us WHY the click wasn't wired,
      // shown once per card render so it's impossible to miss.
      console.warn('Profile tap NOT wired for quote', id, 'authorArea found:', !!authorArea, 'profile_id:', quote.profile_id);
    }

    const likeBtn = card.querySelector('[data-action="like"]');
    if (likeBtn) {
      const likeIconHtml = likeBtn.querySelector('svg').outerHTML;
      likeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (likeBtn.classList.contains('is-liked')) return;
        likeBtn.classList.add('is-liked');
        const newCount = (parseInt(likeBtn.textContent, 10) || 0) + 1;
        likeBtn.innerHTML = likeIconHtml + ' ' + newCount; // preserve the heart icon, don't overwrite it
        Chronik.pingQuoteLike(id);
      });
    }

    const shareBtn = card.querySelector('[data-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const shareText = '"' + quote.text + '" — ' + quote.author_name + ', via Chronik';

      // navigator.share() MUST be the first thing called in this
      // handler, synchronously, with nothing awaited before it —
      // Chrome/WebView silently rejects it (NotAllowedError, no
      // visible error) if the "user gesture" context has expired
      // by the time it's called. Everything else (the engagement
      // ping) happens AFTER, never before.
      if (navigator.share) {
        navigator.share({ text: shareText })
          .then(function () { Chronik.pingQuoteShare(id); })
          .catch(function () { /* user cancelled — not an error, don't ping */ });
      } else {
        navigator.clipboard?.writeText(shareText).then(function () {
          showToast('Quote copied');
          Chronik.pingQuoteShare(id);
        });
      }
    });

    const commentBtn = card.querySelector('[data-action="comment"]');
    if (commentBtn) commentBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openCommentsSheet('quote', id);
    });
  });
}

/**
 * Full-quote bottom sheet — the fix for "tapping a quote in the
 * grid only shows a comment box." This shows the actual quote,
 * large, with its own like/share/comment actions all present.
 * Comments are ONE option here, not the automatic destination.
 */
function openQuoteSheet(quote) {
  sheetScroll.innerHTML =
    '<div class="quote-sheet">' + ChronikRender.quoteCard(quote) + '</div>';
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  sheetScroll.__singleQuote = quote; // lets wireQuoteCardEvents find this quote even though it's not in currentQuotes
  wireQuoteCardEvents(sheetScroll); // this also pings the view once, internally

  // wireQuoteCardEvents wires a profile-tap on .story-top, but
  // we're already ON that profile — remove it here so tapping
  // the author inside their own quote sheet doesn't try to
  // "navigate" to the page already open underneath.
  const authorArea = sheetScroll.querySelector('.story-top');
  if (authorArea) authorArea.style.cursor = 'default';
}

async function openCommentsSheet(targetType, targetId) {
  sheetScroll.innerHTML =
    '<div class="util-sheet">' +
    '<h2 class="sheet-title" style="font-size:20px;">Comments</h2>' +
    '<div id="commentsList"></div>' +
    '<div class="comment-input-row">' +
    '<input type="text" id="commentInput" class="comment-input" placeholder="Add a comment…" maxlength="500">' +
    '<button class="comment-send" id="commentSend">Post</button>' +
    '</div></div>';
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  const list = document.getElementById('commentsList');
  async function refresh() {
    const comments = await Chronik.listComments(targetType, targetId);
    list.innerHTML = comments.length
      ? comments.map(ChronikRender.commentItem).join('')
      : '<p class="search-empty">Be the first to comment.</p>';
  }
  await refresh();

  document.getElementById('commentSend').addEventListener('click', async function () {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await Chronik.postComment(targetType, targetId, text, 'You');
    await refresh();
  });
}

async function openProfile(profileId) {
  showScreen('profile');
  profileContentEl.innerHTML = Array.from({ length: 2 }, Render.skeletonCard).join('');
  Chronik.pingProfileView(profileId);

  try {
    const data = await Chronik.getProfile(profileId);
    profileContentEl.innerHTML =
      ChronikRender.livingArchiveHeader(data.profile) +
      ChronikRender.livingArchiveBody(data.quotes, data.timeline);

    // Tapping a grid quote opens the FULL quote (like/share/comment
    // all available) rather than jumping straight into comments -
    // comments are one option inside that view, not the default action.
    profileContentEl.querySelectorAll('.archive-grid-item[data-quote-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        const quote = data.quotes.find(function (q) { return q.id === el.dataset.quoteId; });
        if (quote) openQuoteSheet(Object.assign({}, quote, {
          author_name: data.profile.display_name,
          author_avatar: data.profile.avatar_image_url,
          author_is_admin: data.profile.is_admin,
        }));
      });
    });
  } catch (err) {
    profileContentEl.innerHTML = Render.stateMessage(
      'Archive unavailable',
      'Couldn\u2019t load this profile right now. Check your connection and try again.',
      false
    );
  }
}

async function loadHomeFeed() {
  homeFeedEl.innerHTML = '<div class="home-greeting-skel sk-box"></div>' + Array.from({ length: 3 }, Render.skeletonCard).join('');

  const blocks = [];
  let historyBlock = null;

  try {
    const history = await Chronik.getTodayHistory();
    const historyHtml = ChronikRender.todayHistoryCard(history);
    if (historyHtml) historyBlock = { html: historyHtml, kind: 'history', data: history };
  } catch (e) { /* Chronik unreachable — Home still works with just news */ }

  try {
    const result = await fetchCategory('top', userCountry, userRegion);
    const topItems = result.items.slice(0, 4);
    const counts = FEATURES.supabaseStatsEnabled
      ? await fetchCounts(topItems.map(function (s) { return s.id; }))
      : {};
    topItems.forEach(function (item) {
      blocks.push({ html: Render.storyCard(item, counts), kind: 'news', data: item });
    });
  } catch (e) { /* news unreachable — Home still shows whatever else loaded */ }

  let quoteBlocks = [];
  try {
    const quotes = await Chronik.listQuotes(null);
    quoteBlocks = quotes.slice(0, 2).map(function (q) {
      return { html: ChronikRender.quoteCard(q), kind: 'quote', data: q };
    });
  } catch (e) { /* Chronik unreachable */ }

  if (!historyBlock && !blocks.length && !quoteBlocks.length) {
    homeFeedEl.innerHTML = Render.stateMessage(
      'Quiet for now',
      'Couldn\u2019t reach any sources right now. Check your connection and try again.',
      true
    );
    const btn = document.getElementById('retryBtn');
    if (btn) btn.addEventListener('click', loadHomeFeed);
    return;
  }

  // Real hierarchy instead of one flat stack: a greeting, then
  // History gets its own "hero" slot at the top (it's the one
  // thing unique to today), then clearly labeled sections for
  // News and Chronik rather than an undifferentiated mix.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  let html = '<div class="home-greeting"><h1>' + greeting + '</h1><p>Here\u2019s what\u2019s worth your time today.</p></div>';

  if (historyBlock) {
    html += '<div class="home-section-label">On this day</div>' + historyBlock.html;
  }
  if (blocks.length) {
    html += '<div class="home-section-label">Top stories</div>' + blocks.map(function (b) { return b.html; }).join('');
  }
  if (quoteBlocks.length) {
    html += '<div class="home-section-label">From Chronik</div>' + quoteBlocks.map(function (b) { return b.html; }).join('');
  }

  homeFeedEl.innerHTML = html;
  wireHomeEvents(blocks.concat(quoteBlocks).concat(historyBlock ? [historyBlock] : []));
}

function wireHomeEvents(blocks) {
  homeFeedEl.querySelectorAll('.story[data-id]').forEach(function (card) {
    const id = card.getAttribute('data-id');
    const block = blocks.find(function (b) { return b.kind === 'news' && b.data.id === id; });
    if (!block) return;
    card.addEventListener('click', function () { openSheet(block.data); });
    const openBtn = card.querySelector('[data-action="open"]');
    if (openBtn) openBtn.addEventListener('click', function (e) { e.stopPropagation(); openSheet(block.data); });
    const shareBtn = card.querySelector('[data-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', async function (e) {
      e.stopPropagation();
      const result = await shareStory(block.data);
      if (result === 'copied') showToast('Link copied');
      if (result === 'native' || result === 'copied') {
        const current = parseInt(shareBtn.textContent, 10) || 0;
        const iconHtml = shareBtn.querySelector('svg').outerHTML;
        shareBtn.innerHTML = iconHtml + ' ' + (current + 1);
      }
    });
  });

  homeFeedEl.querySelectorAll('.quote-card[data-quote-id]').forEach(function (card) {
    const id = card.getAttribute('data-quote-id');
    const block = blocks.find(function (b) { return b.kind === 'quote' && b.data.id === id; });
    if (!block) return;
    const quote = block.data;
    Chronik.pingQuoteView(id);

    // Same profile-tap behavior as the Chronik tab's quote cards -
    // this was simply never wired for Home, a real gap, now fixed.
    const authorArea = card.querySelector('.story-top');
    if (authorArea && quote.profile_id) {
      authorArea.style.cursor = 'pointer';
      authorArea.addEventListener('click', function (e) {
        e.stopPropagation();
        openProfile(quote.profile_id);
      });
    }

    const likeBtn = card.querySelector('[data-action="like"]');
    if (likeBtn) {
      const likeIconHtml = likeBtn.querySelector('svg').outerHTML;
      likeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (likeBtn.classList.contains('is-liked')) return;
        likeBtn.classList.add('is-liked');
        const newCount = (parseInt(likeBtn.textContent, 10) || 0) + 1;
        likeBtn.innerHTML = likeIconHtml + ' ' + newCount;
        Chronik.pingQuoteLike(id);
      });
    }

    const commentBtn = card.querySelector('[data-action="comment"]');
    if (commentBtn) commentBtn.addEventListener('click', function (e) { e.stopPropagation(); openCommentsSheet('quote', id); });

    // Share was entirely missing on Home's quote cards - fixed to
    // match the Chronik tab's behavior exactly (navigator.share
    // called first/synchronously, per the earlier gesture-timing fix).
    const shareBtn = card.querySelector('[data-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const shareText = '"' + quote.text + '" — ' + quote.author_name + ', via Chronik';
      if (navigator.share) {
        navigator.share({ text: shareText })
          .then(function () { Chronik.pingQuoteShare(id); })
          .catch(function () { /* cancelled */ });
      } else {
        navigator.clipboard?.writeText(shareText).then(function () {
          showToast('Quote copied');
          Chronik.pingQuoteShare(id);
        });
      }
    });
  });

  homeFeedEl.querySelectorAll('.history-card[data-history-id]').forEach(function (card) {
    const linkBtn = card.querySelector('[data-open-profile]');
    if (linkBtn) linkBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openProfile(e.currentTarget.dataset.openProfile);
    });
  });
}


function openSheet(item) {
  sheetScroll.innerHTML = Render.sheetContent(item);
  const shareBtn = document.getElementById('sheetShareBtn');
  if (shareBtn) shareBtn.addEventListener('click', async function () {
    const result = await shareStory(item);
    if (result === 'copied') showToast('Link copied');
  });
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  import('./stats.js').then(function (m) { m.pingView(item); });

  if (Ads.shouldShowInterstitial()) {
    setTimeout(function () { Ads.showInterstitial(); }, 400);
  }
}
function closeSheet() {
  scrim.classList.remove('open');
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}
scrim.addEventListener('click', closeSheet);
sheetClose.addEventListener('click', closeSheet);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const tab = btn.dataset.tab;
    if (tab === 'home') showScreen('home');
    else if (tab === 'news') showScreen('news');
    else if (tab === 'chronik') showScreen('chronik');
    else if (tab === 'you') openYouSheet();
  });
});

document.getElementById('profileBackBtn').addEventListener('click', function () {
  showScreen('chronik');
});

function updateYouTabIcon() {
  const iconSlot = document.querySelector('#youTabBtn .you-tab-icon');
  window.__chronikDebugToast && window.__chronikDebugToast('DEBUG: updateYouTabIcon called, iconSlot found = ' + !!iconSlot);
  if (!iconSlot) return;
  const profile = Auth.getCurrentProfile();
  window.__chronikDebugToast && window.__chronikDebugToast('DEBUG: profile = ' + (profile ? profile.display_name : 'null'));
  if (profile) {
    iconSlot.innerHTML = profile.avatar_image_url
      ? '<img src="' + profile.avatar_image_url + '" alt="" class="you-tab-avatar">'
      : '<span class="you-tab-avatar you-tab-avatar-initial">' + (profile.display_name || '?')[0] + '</span>';
  } else {
    iconSlot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>';
  }
}

function openYouSheet() {
  const theme = document.body.getAttribute('data-theme');
  const signedIn = Auth.isSignedIn();
  const profile = Auth.getCurrentProfile();

  // A real identity card - avatar, name, email - not just a
  // generic "Signed in" line. This is what actually answers
  // "which of my accounts is active in Chronik right now,"
  // independent of whatever Google account Chrome happens to
  // have selected for its OWN account picker prompt.
  const accountSection = signedIn
    ? '<div class="you-identity">' +
        '<div class="you-identity-avatar">' +
          (profile.avatar_image_url ? '<img src="' + profile.avatar_image_url + '" alt="">' : (profile.display_name || '?')[0]) +
        '</div>' +
        '<div class="you-identity-info">' +
          '<span class="you-identity-name">' + (profile.display_name || 'You') + '</span>' +
          '<span class="you-identity-email">' + (profile.email || '') + '</span>' +
        '</div>' +
        '<button class="you-action" id="youSignOut">Sign out</button>' +
      '</div>'
    : '<div class="you-signin"><p>Sign in to like, comment, and post as yourself across Chronik.</p><div id="googleSignInBtn"></div></div>';

  sheetScroll.innerHTML =
    '<div class="util-sheet">' +
    '<h2 class="sheet-title" style="font-size:20px;">You</h2>' +
    accountSection +
    '<div class="you-row"><span>Reading location</span><button class="you-action" id="youChangeLoc">' + countryLabel(userCountry) + ' &middot; change</button></div>' +
    '<div class="you-row"><span>Appearance</span><button class="you-action" id="youToggleTheme">' + (theme === 'dark' ? 'Switch to Light' : 'Switch to Dark') + '</button></div>' +
    '<div class="you-row"><span>Refresh everything</span><button class="you-action" id="youRefresh">Refresh now</button></div>' +
    '<p class="you-about">Chronik is an independent live news, heroes, and history reader by Liyog Bartoos O. Stories link back to their original publishers. LiyX Intelligence powers on-device summaries — no external AI calls, no data sent anywhere for that.</p>' +
    '</div>';
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (!signedIn && window.google && window.google.accounts) {
    window.google.accounts.id.renderButton(
      document.getElementById('googleSignInBtn'),
      { theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', width: 260 }
    );
  }

  const signOutBtn = document.getElementById('youSignOut');
  if (signOutBtn) signOutBtn.addEventListener('click', async function () {
    await Auth.signOut();
    updateYouTabIcon();
    showToast('Signed out');
    openYouSheet(); // refresh the sheet to show the sign-in button again
  });

  document.getElementById('youChangeLoc').addEventListener('click', function () {
    closeSheet();
    showScreen('news');
    const btn = document.getElementById('changeLocBtn');
    if (btn) btn.click();
  });
  document.getElementById('youToggleTheme').addEventListener('click', function () {
    Theme.toggle(themeIcon);
    closeSheet();
  });
  document.getElementById('youRefresh').addEventListener('click', function () {
    closeSheet();
    refreshActiveScreen();
    showToast('Refreshing…');
  });
}

function refreshActiveScreen() {
  if (activeScreen === 'home') loadHomeFeed();
  else if (activeScreen === 'news') loadCategory(activeCategory, true);
  else if (activeScreen === 'chronik') loadChronikFeed();
}

refreshBtn.addEventListener('click', function () {
  refreshActiveScreen();
  showToast('Refreshing…');
});

setInterval(function () {
  if (document.visibilityState === 'visible') refreshActiveScreen();
}, APP.pollIntervalMs);

Theme.initTheme(themeIcon);
themeBtn.addEventListener('click', function () { Theme.toggle(themeIcon); });

async function handleGoLinkIfPresent() {
  const incoming = await parseIncomingGoLink();
  if (!incoming) return false;

  if (!incoming.story) {
    clearGoRoute();
    return false;
  }

  goOverlay.innerHTML = Render.goLinkPage(incoming.story);
  goOverlay.style.display = 'block';
  goOverlay.querySelectorAll('a[href="#/"]').forEach(function (a) {
    a.addEventListener('click', function () {
      goOverlay.style.display = 'none';
      clearGoRoute();
    });
  });
  return true;
}

async function boot() {
  Store.sweepExpired();

  const cameFromShare = await handleGoLinkIfPresent();

  userCountry = await detectCountry();
  userRegion = regionFor(userCountry);
  renderLocationStrip();
  renderRail();
  renderChronikRail();

  Chronik.startEngagementFlushLoop();
  await Auth.restoreSession();
  updateYouTabIcon();

  await Ads.initAds();
  Ads.showBanner();
  Ads.prepareInterstitial();
  if (!cameFromShare) Ads.showAppOpenAd();

  showScreen('home');
  loadHomeFeed();
  loadCategory(activeCategory);
}

boot();
