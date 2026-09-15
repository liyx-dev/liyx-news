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
