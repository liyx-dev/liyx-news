// ============================================================
// ADMIN.JS - the admin panel: Today in History, Daily Quote
// mode, background gallery uploads, Hero creation. Reachable
// only if the signed-in profile has is_admin = 1 - re-checked
// server-side on every admin route; the client check here is
// convenience only, never the real security boundary.
// ============================================================

import { CHRONIK_API_BASE } from './sources.js';
import { authHeaders, getCurrentProfile } from './auth.js';
import { compressImageFile, validateImageFile } from './image-compress.js';

async function apiGet(path) {
  const res = await fetch(CHRONIK_API_BASE + path, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function apiPost(path, body) {
  const res = await fetch(CHRONIK_API_BASE + path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function uploadImage(blob, purpose) {
  const formData = new FormData();
  formData.append('file', blob, 'upload.webp');
  formData.append('purpose', purpose);
  const res = await fetch(CHRONIK_API_BASE + '/upload', { method: 'POST', headers: authHeaders(), body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

export function isCurrentUserAdmin() {
  const profile = getCurrentProfile();
  return !!(profile && profile.is_admin);
}

const SECTIONS = ['history', 'daily-quote', 'backgrounds', 'heroes'];
const SECTION_LABELS = { 'history': 'Today in History', 'daily-quote': 'Daily Quote', 'backgrounds': 'Backgrounds', 'heroes': 'Heroes' };

export function renderAdminPanel(container) {
  container.innerHTML =
    '<div class="admin-panel">' +
    '<h1 class="admin-title">Admin</h1>' +
    '<div class="admin-tabs">' +
    SECTIONS.map(function (s) { return '<button class="admin-tab-btn' + (s === 'history' ? ' active' : '') + '" data-section="' + s + '">' + SECTION_LABELS[s] + '</button>'; }).join('') +
    '</div>' +
    '<div id="adminSectionBody" class="admin-section-body"></div>' +
    '</div>';

  const tabBtns = container.querySelectorAll('.admin-tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderSection(btn.dataset.section);
    });
  });

  function renderSection(section) {
    const body = container.querySelector('#adminSectionBody');
    body.innerHTML = '<p class="admin-loading">Loading…</p>';
    if (section === 'history') renderHistorySection(body);
    else if (section === 'daily-quote') renderDailyQuoteSection(body);
    else if (section === 'backgrounds') renderBackgroundsSection(body);
    else if (section === 'heroes') renderHeroesSection(body);
  }
  renderSection('history');
}

async function renderHistorySection(body) {
  let events = [];
  try {
    const data = await apiGet('/admin/history-events');
    events = data.events;
  } catch (e) {
    body.innerHTML = '<p class="admin-error">Could not load history events.</p>';
    return;
  }

  body.innerHTML =
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">Feature an existing event</h2>' +
    '<input type="text" id="historySearch" class="admin-input" placeholder="Search events…">' +
    '<div id="historyList" class="admin-list"></div>' +
    '</div>' +
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">Add a new event</h2>' +
    '<input type="text" id="newHistTitle" class="admin-input" placeholder="Title">' +
    '<div class="admin-input-row">' +
    '<input type="number" id="newHistMonth" class="admin-input admin-input-small" placeholder="Month (1-12)" min="1" max="12">' +
    '<input type="number" id="newHistDay" class="admin-input admin-input-small" placeholder="Day (1-31)" min="1" max="31">' +
    '<input type="number" id="newHistYear" class="admin-input admin-input-small" placeholder="Year">' +
    '</div>' +
    '<textarea id="newHistSummary" class="admin-input admin-textarea" placeholder="Summary" rows="3"></textarea>' +
    '<input type="text" id="newHistImage" class="admin-input" placeholder="Image URL (optional)">' +
    '<label class="admin-checkbox-row"><input type="checkbox" id="newHistFeatured"> Feature this for today immediately</label>' +
    '<button class="admin-submit" id="newHistSubmit">Add Event</button>' +
    '<p class="admin-status" id="historyStatus"></p>' +
    '</div>';

  function renderList(filtered) {
    const list = body.querySelector('#historyList');
    if (!filtered.length) { list.innerHTML = '<p class="admin-empty">No events found.</p>'; return; }
    list.innerHTML = filtered.map(function (ev) {
      return '<div class="admin-list-item">' +
        '<div class="admin-list-item-info">' +
        '<strong>' + ev.title + '</strong>' +
        '<span>' + ev.month + '/' + ev.day + (ev.year ? '/' + ev.year : '') + (ev.is_featured_today ? ' · Featured today' : '') + '</span>' +
        '</div>' +
        '<button class="admin-feature-btn" data-event-id="' + ev.id + '"' + (ev.is_featured_today ? ' disabled' : '') + '>' + (ev.is_featured_today ? 'Featured' : 'Feature') + '</button>' +
        '</div>';
    }).join('');

    list.querySelectorAll('.admin-feature-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = 'Setting…';
        try {
          await apiPost('/admin/featured-history', { history_event_id: btn.dataset.eventId });
          renderHistorySection(body);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Feature';
          alert('Could not feature this event: ' + e.message);
        }
      });
    });
  }
  renderList(events);

  body.querySelector('#historySearch').addEventListener('input', function (e) {
    const q = e.target.value.toLowerCase();
    renderList(events.filter(function (ev) { return ev.title.toLowerCase().includes(q); }));
  });

  body.querySelector('#newHistSubmit').addEventListener('click', async function () {
    const statusEl = body.querySelector('#historyStatus');
    const title = body.querySelector('#newHistTitle').value.trim();
    const month = parseInt(body.querySelector('#newHistMonth').value, 10);
    const day = parseInt(body.querySelector('#newHistDay').value, 10);
    const year = parseInt(body.querySelector('#newHistYear').value, 10) || null;
    const summary = body.querySelector('#newHistSummary').value.trim();
    const imageUrl = body.querySelector('#newHistImage').value.trim();
    const featured = body.querySelector('#newHistFeatured').checked;

    if (!title || !month || !day) { statusEl.textContent = 'Title, month, and day are required.'; return; }

    statusEl.textContent = 'Saving…';
    try {
      await apiPost('/admin/history-event', {
        title: title, month: month, day: day, year: year,
        summary: summary || null, image_url: imageUrl || null,
        is_featured_today: featured,
      });
      statusEl.textContent = 'Added!';
      setTimeout(function () { renderHistorySection(body); }, 600);
    } catch (e) {
      statusEl.textContent = 'Could not add event: ' + e.message;
    }
  });
}

function renderDailyQuoteSection(body) {
  body.innerHTML =
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">How today\'s quote is chosen</h2>' +
    '<div class="admin-mode-grid">' +
    '<button class="admin-mode-btn" data-mode="auto_engagement"><strong>Automatic</strong><span>Best-performing quote from the last 48 hours</span></button>' +
    '<button class="admin-mode-btn" data-mode="manual"><strong>Pick a quote</strong><span>Choose a specific existing quote by ID</span></button>' +
    '<button class="admin-mode-btn" data-mode="admin_original"><strong>Write your own</strong><span>A fresh quote, credited to Chronik</span></button>' +
    '<button class="admin-mode-btn" data-mode="ai_generated"><strong>LiyX AI draft</strong><span>AI-drafted, shown as written by LiyX</span></button>' +
    '</div>' +
    '<div id="dailyQuoteModeBody"></div>' +
    '</div>';

  const modeBtns = body.querySelectorAll('.admin-mode-btn');
  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderModeForm(btn.dataset.mode);
    });
  });

  function renderModeForm(mode) {
    const modeBody = body.querySelector('#dailyQuoteModeBody');
    if (mode === 'manual') {
      modeBody.innerHTML =
        '<input type="text" id="manualQuoteId" class="admin-input" placeholder="Quote ID (find it via the moderation log or the quote itself)">' +
        '<button class="admin-submit" id="dailyQuoteSubmit">Save</button><p class="admin-status" id="dailyQuoteStatus"></p>';
    } else if (mode === 'admin_original' || mode === 'ai_generated') {
      modeBody.innerHTML =
        '<textarea id="manualQuoteText" class="admin-input admin-textarea" placeholder="Quote text" rows="3"></textarea>' +
        '<input type="text" id="manualAuthorLabel" class="admin-input" placeholder="Attribution label (e.g. Chronik, or LiyX AI)">' +
        '<button class="admin-submit" id="dailyQuoteSubmit">Save</button><p class="admin-status" id="dailyQuoteStatus"></p>';
    } else {
      modeBody.innerHTML = '<p class="admin-note">The system will automatically pick the highest-scoring quote (views + likes + shares) from the last 48 hours. No further input needed.</p><button class="admin-submit" id="dailyQuoteSubmit">Save</button><p class="admin-status" id="dailyQuoteStatus"></p>';
    }

    modeBody.querySelector('#dailyQuoteSubmit').addEventListener('click', async function () {
      const statusEl = modeBody.querySelector('#dailyQuoteStatus');
      statusEl.textContent = 'Saving…';
      try {
        const payload = { mode: mode };
        if (mode === 'manual') payload.manual_quote_id = modeBody.querySelector('#manualQuoteId').value.trim();
        if (mode === 'admin_original' || mode === 'ai_generated') {
          payload.manual_text = modeBody.querySelector('#manualQuoteText').value.trim();
          payload.manual_author_label = modeBody.querySelector('#manualAuthorLabel').value.trim() || 'Chronik';
        }
        await apiPost('/admin/daily-quote', payload);
        statusEl.textContent = 'Saved! This is now live on Home.';
      } catch (e) {
        statusEl.textContent = 'Could not save: ' + e.message;
      }
    });
  }
  renderModeForm('auto_engagement');
  body.querySelector('[data-mode="auto_engagement"]').classList.add('active');
}

function renderBackgroundsSection(body) {
  body.innerHTML =
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">Add a background</h2>' +
    '<p class="admin-note">Upload a photo to add to the curated quote-background gallery. It will appear immediately for everyone composing a quote.</p>' +
    '<input type="file" id="bgUploadInput" accept="image/*" class="admin-file-input">' +
    '<input type="text" id="bgCategory" class="admin-input" placeholder="Category (e.g. Nature, Minimal, Faith)">' +
    '<button class="admin-submit" id="bgSubmit">Upload Background</button>' +
    '<p class="admin-status" id="bgStatus"></p>' +
    '</div>';

  let selectedFile = null;
  body.querySelector('#bgUploadInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    const err = validateImageFile(file);
    if (err) { body.querySelector('#bgStatus').textContent = err; return; }
    selectedFile = file;
  });

  body.querySelector('#bgSubmit').addEventListener('click', async function () {
    const statusEl = body.querySelector('#bgStatus');
    if (!selectedFile) { statusEl.textContent = 'Choose a photo first.'; return; }

    statusEl.textContent = 'Preparing image…';
    try {
      const compressed = await compressImageFile(selectedFile);
      statusEl.textContent = 'Uploading…';
      const url = await uploadImage(compressed, 'quote_background');
      statusEl.textContent = 'Saving to gallery…';
      await apiPost('/admin/quote-background', { image_url: url, category: body.querySelector('#bgCategory').value.trim() || null });
      statusEl.textContent = 'Added to the gallery!';
      selectedFile = null;
      body.querySelector('#bgUploadInput').value = '';
    } catch (e) {
      statusEl.textContent = 'Could not add background: ' + e.message;
    }
  });
}

async function renderHeroesSection(body) {
  let heroes = [];
  try {
    const data = await apiGet('/admin/profiles?kind=hero');
    heroes = data.profiles;
  } catch (e) { /* non-fatal, the create form still works */ }

  body.innerHTML =
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">Existing Heroes</h2>' +
    '<div class="admin-list">' +
    (heroes.length
      ? heroes.map(function (h) { return '<div class="admin-list-item"><div class="admin-list-item-info"><strong>' + h.display_name + '</strong><span>' + (h.era || '') + '</span></div></div>'; }).join('')
      : '<p class="admin-empty">No heroes yet.</p>') +
    '</div>' +
    '</div>' +
    '<div class="admin-block">' +
    '<h2 class="admin-block-title">Add a new Hero</h2>' +
    '<input type="text" id="heroName" class="admin-input" placeholder="Full name">' +
    '<div class="admin-input-row">' +
    '<input type="text" id="heroEra" class="admin-input" placeholder="Era (e.g. 1929-1968)">' +
    '<input type="text" id="heroCategory" class="admin-input" placeholder="Category">' +
    '</div>' +
    '<input type="text" id="heroTagline" class="admin-input" placeholder="One-line tagline">' +
    '<textarea id="heroBioShort" class="admin-input admin-textarea" placeholder="Short bio (for cards)" rows="2"></textarea>' +
    '<textarea id="heroBioFull" class="admin-input admin-textarea" placeholder="Full biography" rows="5"></textarea>' +
    '<input type="file" id="heroAvatarInput" accept="image/*" class="admin-file-input">' +
    '<label class="admin-file-label">Avatar photo</label>' +
    '<input type="file" id="heroCoverInput" accept="image/*" class="admin-file-input">' +
    '<label class="admin-file-label">Cover photo</label>' +
    '<button class="admin-submit" id="heroSubmit">Create Hero</button>' +
    '<p class="admin-status" id="heroStatus"></p>' +
    '</div>';

  let avatarFile = null, coverFile = null;
  body.querySelector('#heroAvatarInput').addEventListener('change', function (e) { avatarFile = e.target.files[0] || null; });
  body.querySelector('#heroCoverInput').addEventListener('change', function (e) { coverFile = e.target.files[0] || null; });

  body.querySelector('#heroSubmit').addEventListener('click', async function () {
    const statusEl = body.querySelector('#heroStatus');
    const name = body.querySelector('#heroName').value.trim();
    if (!name) { statusEl.textContent = 'Name is required.'; return; }

    statusEl.textContent = 'Saving…';
    try {
      let avatarUrl = null, coverUrl = null;
      if (avatarFile) {
        statusEl.textContent = 'Preparing avatar…';
        avatarUrl = await uploadImage(await compressImageFile(avatarFile), 'post');
      }
      if (coverFile) {
        statusEl.textContent = 'Preparing cover photo…';
        coverUrl = await uploadImage(await compressImageFile(coverFile), 'post');
      }

      statusEl.textContent = 'Creating profile…';
      await apiPost('/admin/hero', {
        display_name: name,
        era: body.querySelector('#heroEra').value.trim() || null,
        category: body.querySelector('#heroCategory').value.trim() || null,
        tagline: body.querySelector('#heroTagline').value.trim() || null,
        bio_short: body.querySelector('#heroBioShort').value.trim() || null,
        bio_full: body.querySelector('#heroBioFull').value.trim() || null,
        avatar_image_url: avatarUrl,
        cover_image_url: coverUrl,
      });
      statusEl.textContent = 'Hero created!';
      setTimeout(function () { renderHeroesSection(body); }, 600);
    } catch (e) {
      statusEl.textContent = 'Could not create Hero: ' + e.message;
    }
  });
}
