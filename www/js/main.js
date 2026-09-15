// ============================================================
// MAIN — the conductor. Imports every module and wires DOM
// events to them. No business logic lives here beyond state
// and event glue — see the individual modules for "how."
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

// ---- DOM refs ----
const feedEl = document.getElementById('feed');
const railEl = document.getElementById('rail');
const locationStrip = document.getElementById('locationStrip');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const scrim = document.getElementById('scrim');
const sheet = document.getElementById('sheet');
const sheetScroll = document.getElementById('sheetScroll');
const sheetClose = document.getElementById('sheetClose');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const refreshBtn = document.getElementById('refreshBtn');
const toastEl = document.getElementById('toast');
const goOverlay = document.getElementById('goOverlay');

// ---- state ----
const PAGE_SIZE = 8;
let activeCategory = 'top';
let currentItems = [];
let visibleCount = PAGE_SIZE;
let userCountry = 'GLOBAL';
let userRegion = 'global';

// ============================================================
// Toast
// ============================================================
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// ============================================================
// Feed rendering
// ============================================================
function renderSkeleton() {
  feedEl.innerHTML = Array.from({ length: 5 }, Render.skeletonCard).join('');
  loadMoreWrap.style.display = 'none';
}

function renderState(title, msg, retry) {
  feedEl.innerHTML = Render.stateMessage(title, msg, retry);
  loadMoreWrap.style.display = 'none';
  const btn = document.getElementById('retryBtn');
  if (btn) btn.addEventListener('click', () => loadCategory(activeCategory, true));
}

async function renderFeed() {
  const slice = currentItems.slice(0, visibleCount);
  const counts = FEATURES.supabaseStatsEnabled
    ? await fetchCounts(slice.map(s => s.id))
    : {};

  const cardsHtml = slice.map(item => Render.storyCard(item, counts));
  const adCard = Ads.nativeAvailable() ? Render.nativeAdCard(await Ads.getNativeAdSlot()) : null;
  feedEl.innerHTML = adCard
    ? Render.weaveAds(cardsHtml, adCard, APP.nativeAdEveryN)
    : cardsHtml.join('');

  wireStoryCardEvents();
  loadMoreWrap.style.display = currentItems.length > visibleCount ? 'flex' : 'none';
}

function wireStoryCardEvents() {
  feedEl.querySelectorAll('.story[data-id]').forEach(card => {
    const id = card.getAttribute('data-id');
    const item = currentItems.find(s => s.id === id);
    if (!item) return;

    card.querySelector('[data-action="open"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSheet(item);
    });
    card.querySelector('[data-action="share"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await shareStory(item);
      if (result === 'copied') showToast('LIYX link copied');
    });
    card.addEventListener('click', () => openSheet(item));
  });
}

loadMoreBtn.addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  renderFeed();
});

// ============================================================
// Bottom sheet
// ============================================================
function openSheet(item) {
  sheetScroll.innerHTML = Render.sheetContent(item);
  document.getElementById('sheetShareBtn')?.addEventListener('click', async () => {
    const result = await shareStory(item);
    if (result === 'copied') showToast('LIYX link copied');
  });
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  import('./stats.js').then(m => m.pingView(item));

  if (Ads.shouldShowInterstitial()) {
    setTimeout(() => Ads.showInterstitial(), 400);
  }
}
function closeSheet() {
  scrim.classList.remove('open');
  sheet.classList.remove('open');
  document.body.style.overflow = '';
  setActiveTab('feed');
}
scrim.addEventListener('click', closeSheet);
sheetClose.addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ============================================================
// Category rail + loading
// ============================================================
function renderRail() {
  railEl.innerHTML = Render.categoryRail(CATEGORIES, activeCategory);
  railEl.querySelectorAll('.rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.cat === activeCategory) return;
      activeCategory = btn.dataset.cat;
      renderRail();
      loadCategory(activeCategory);
    });
  });
}

async function loadCategory(categoryId, forceRefresh = false) {
  visibleCount = PAGE_SIZE;
  const cat = CATEGORIES.find(c => c.id === categoryId);
  document.title = cat ? `${cat.label} · LIYX` : 'LIYX';
  renderSkeleton();

  if (forceRefresh) Store.remove(`cat:${userCountry}:${categoryId}`);

  try {
    const { items, stale } = await fetchCategory(categoryId, userCountry, userRegion);
    currentItems = items;
    await renderFeed();
    if (stale) showToast('Showing saved stories — reconnecting…');
  } catch (err) {
    renderState('The feed is quiet', 'Couldn\u2019t reach live sources right now. Check your connection and try again.', true);
  }
}

refreshBtn.addEventListener('click', () => {
  loadCategory(activeCategory, true);
  showToast('Refreshing…');
});

setInterval(() => {
  if (document.visibilityState === 'visible') loadCategory(activeCategory, true);
}, APP.pollIntervalMs);

// ============================================================
// Bottom tab bar — real navigation, not decorative.
// Feed: scrolls to top of the current feed (default view).
// Search: focuses an in-page search box that filters currentItems.
// Categories: opens the category rail as a full picker sheet
//             (useful once more than ~5 categories exist and
//             the horizontal rail can't show them all at once).
// You: opens a lightweight settings sheet (theme, location, about).
// ============================================================
const tabButtons = document.querySelectorAll('.tab-btn');
function setActiveTab(name) {
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    setActiveTab(tab);
    if (tab === 'feed') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'search') {
      openSearchSheet();
    } else if (tab === 'categories') {
      openCategoriesSheet();
    } else if (tab === 'you') {
      openYouSheet();
    }
  });
});

function openSearchSheet() {
  sheetScroll.innerHTML = `
    <div class="util-sheet">
      <h2 class="sheet-title" style="font-size:20px;">Search headlines</h2>
      <input type="search" id="searchInput" class="search-input" placeholder="Try “inflation”, “Lagos”, “elections”…" autofocus>
      <div id="searchResults" class="search-results"></div>
    </div>`;
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = currentItems.filter(s =>
      s.title.toLowerCase().includes(q) || (s.insight || '').toLowerCase().includes(q)
    ).slice(0, 12);
    results.innerHTML = matches.length
      ? matches.map(s => `<button class="search-hit" data-id="${s.id}">${s.title}</button>`).join('')
      : `<p class="search-empty">No matches in the current feed — try another tab or refresh.</p>`;
    results.querySelectorAll('.search-hit').forEach(hit => {
      hit.addEventListener('click', () => {
        const story = currentItems.find(s => s.id === hit.dataset.id);
        if (story) openSheet(story);
      });
    });
  });
}

function openCategoriesSheet() {
  sheetScroll.innerHTML = `
    <div class="util-sheet">
      <h2 class="sheet-title" style="font-size:20px;">Browse categories</h2>
      <div class="cat-grid">
        ${CATEGORIES.map(c => `<button class="cat-tile${c.id === activeCategory ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')}
      </div>
    </div>`;
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  sheetScroll.querySelectorAll('.cat-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      activeCategory = tile.dataset.cat;
      renderRail();
      loadCategory(activeCategory);
      closeSheet();
      setActiveTab('feed');
    });
  });
}

function openYouSheet() {
  const theme = document.body.getAttribute('data-theme');
  sheetScroll.innerHTML = `
    <div class="util-sheet">
      <h2 class="sheet-title" style="font-size:20px;">You</h2>
      <div class="you-row">
        <span>Reading location</span>
        <button class="you-action" id="youChangeLoc">${countryLabel(userCountry)} · change</button>
      </div>
      <div class="you-row">
        <span>Appearance</span>
        <button class="you-action" id="youToggleTheme">${theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</button>
      </div>
      <div class="you-row">
        <span>Refresh feed</span>
        <button class="you-action" id="youRefresh">Refresh now</button>
      </div>
      <p class="you-about">LIYX is an independent live news reader built by Liyog Bartoos O. Stories link back to their original publishers.</p>
    </div>`;
  scrim.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('youChangeLoc').addEventListener('click', () => {
    closeSheet();
    document.getElementById('changeLocBtn')?.click();
  });
  document.getElementById('youToggleTheme').addEventListener('click', () => {
    Theme.toggle(themeIcon);
    closeSheet();
  });
  document.getElementById('youRefresh').addEventListener('click', () => {
    closeSheet();
    loadCategory(activeCategory, true);
    showToast('Refreshing…');
  });
}

// ============================================================
// Theme
// ============================================================
Theme.initTheme(themeIcon);
themeBtn.addEventListener('click', () => Theme.toggle(themeIcon));

// ============================================================
// Location strip
// ============================================================
function renderLocationStrip() {
  locationStrip.innerHTML = `Showing news for <strong>${countryLabel(userCountry)}</strong> · <button id="changeLocBtn">change</button>`;
  document.getElementById('changeLocBtn').addEventListener('click', () => {
    const codes = Object.keys(SUPPORTED_COUNTRIES);
    const list = codes.map(c => `${c} — ${SUPPORTED_COUNTRIES[c]}`).join('\n');
    const pick = prompt(`Type a country code:\n${list}`, userCountry);
    if (pick && SUPPORTED_COUNTRIES[pick.toUpperCase()]) {
      userCountry = pick.toUpperCase();
      userRegion = regionFor(userCountry);
      setCountryOverride(userCountry);
      renderLocationStrip();
      loadCategory(activeCategory, true);
    }
  });
}

// ============================================================
// Go-link (share redirect) handling — checked BEFORE the
// normal feed boots, so shared links show LIYX branding first.
//
// Resolution order lives in redirect.js (local cache -> Supabase
// -> not found). If the story truly can't be resolved anywhere
// (expired past 48h, or was never shared), we don't show a dead
// end at all — we just clear the route and let the normal feed
// boot underneath, per the "always land the user somewhere
// useful" rule.
// ============================================================
async function handleGoLinkIfPresent() {
  const incoming = await parseIncomingGoLink();
  if (!incoming) return false; // not a /go/ link — normal boot

  if (!incoming.story) {
    // Nothing found locally or in Supabase — skip the
    // interstitial entirely and drop the user into the live feed.
    clearGoRoute();
    return false;
  }

  goOverlay.innerHTML = Render.goLinkPage(incoming.story);
  goOverlay.style.display = 'block';
  goOverlay.querySelectorAll('a[href="#/"]').forEach(a =>
    a.addEventListener('click', () => {
      goOverlay.style.display = 'none';
      clearGoRoute();
    })
  );
  return true;
}

// ============================================================
// Boot sequence
// ============================================================
async function boot() {
  Store.sweepExpired(); // enforce the local cache expiry rule at every launch

  const cameFromShare = await handleGoLinkIfPresent();

  userCountry = await detectCountry();
  userRegion = regionFor(userCountry);
  renderLocationStrip();
  renderRail();

  await Ads.initAds();
  Ads.showBanner();
  Ads.prepareInterstitial();
  if (!cameFromShare) Ads.showAppOpenAd();

  loadCategory(activeCategory);
}

boot();
