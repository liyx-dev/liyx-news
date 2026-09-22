// ============================================================
// COMPOSE.JS - the "+" button experience: choose Quote or Post.
// Quotes now use ONLY curated backgrounds + solid colors (no
// custom photo upload for quotes, per decision). Posts still
// accept any single photo, moderated but never styled.
// ============================================================

import { CHRONIK_API_BASE } from './sources.js';
import { authHeaders, isSignedIn, getCurrentProfile } from './auth.js';
import { compressImageFile, validateImageFile, downloadBlob } from './media.js';

let cachedBackgrounds = null;

async function fetchBackgrounds() {
  if (cachedBackgrounds) return cachedBackgrounds;
  try {
    const res = await fetch(CHRONIK_API_BASE + '/quote-backgrounds');
    const data = await res.json();
    cachedBackgrounds = data.backgrounds || [];
    return cachedBackgrounds;
  } catch (err) {
    console.error('Failed to load quote backgrounds:', err);
    return [];
  }
}

const QUOTE_CATEGORIES = ['Motivation', 'Faith', 'Leadership', 'Love', 'Resilience', 'Wisdom', 'Success', 'Gratitude'];

const SOLID_PRESETS = [
  { name: 'Ink', color: '#14151A' },
  { name: 'Signal', color: '#E8442C' },
  { name: 'Forest', color: '#1F5C3F' },
  { name: 'Ocean', color: '#1B3A6B' },
  { name: 'Plum', color: '#5B2A7A' },
  { name: 'White', color: '#FFFFFF' },
];

const FONT_OPTIONS = [
  { name: 'Classic', family: 'Georgia, serif', style: 'italic 700' },
  { name: 'Bold', family: '"Space Grotesk", sans-serif', style: '700' },
  { name: 'Elegant', family: '"Fraunces", Georgia, serif', style: '600' },
];

export function renderComposeSheet(container, onDone) {
  if (!isSignedIn()) {
    container.innerHTML = '<div class="util-sheet"><h2 class="sheet-title" style="font-size:20px;">Sign in to post</h2><p class="you-signin-note">Head to the You tab to sign in with Google first.</p></div>';
    return;
  }

  container.innerHTML =
    '<div class="compose-sheet">' +
    '<div class="compose-toggle">' +
    '<button class="compose-toggle-btn active" data-mode="post">Post</button>' +
    '<button class="compose-toggle-btn" data-mode="quote">Quote</button>' +
    '</div>' +
    '<div id="composeBody"></div>' +
    '</div>';

  let mode = 'post';
  const toggleBtns = container.querySelectorAll('.compose-toggle-btn');
  toggleBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      mode = btn.dataset.mode;
      renderBody();
    });
  });

  function renderBody() {
    const body = container.querySelector('#composeBody');
    if (mode === 'post') renderPostComposer(body, onDone);
    else renderQuoteComposer(body, onDone);
  }
  renderBody();
}

function renderPostComposer(body, onDone) {
  const profile = getCurrentProfile();
  body.innerHTML =
    '<div class="compose-post">' +
    '<div class="compose-author">' +
    '<div class="compose-avatar">' + (profile.avatar_image_url ? '<img src="' + profile.avatar_image_url + '" alt="">' : (profile.display_name || '?')[0]) + '</div>' +
    '<textarea id="postText" class="compose-textarea" placeholder="What\'s on your mind?" maxlength="500" rows="4"></textarea>' +
    '</div>' +
    '<div id="postImagePreview" class="compose-image-preview" style="display:none;"><img id="postImagePreviewImg" alt=""><button id="postImageRemove" class="compose-image-remove">&times;</button></div>' +
    '<div class="compose-actions-row">' +
    '<label class="compose-icon-btn" for="postImageInput">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
    '</label>' +
    '<input type="file" id="postImageInput" accept="image/*" style="display:none;">' +
    '<button class="compose-submit" id="postSubmit">Post</button>' +
    '</div>' +
    '<p class="compose-status" id="postStatus"></p>' +
    '</div>';

  let selectedFile = null;

  document.getElementById('postImageInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setStatus(err); return; }
    selectedFile = file;
    const preview = document.getElementById('postImagePreview');
    document.getElementById('postImagePreviewImg').src = URL.createObjectURL(file);
    preview.style.display = 'block';
  });

  document.getElementById('postImageRemove').addEventListener('click', function () {
    selectedFile = null;
    document.getElementById('postImagePreview').style.display = 'none';
    document.getElementById('postImageInput').value = '';
  });

  function setStatus(msg) {
    document.getElementById('postStatus').textContent = msg;
  }

  document.getElementById('postSubmit').addEventListener('click', async function () {
    const submitBtn = document.getElementById('postSubmit');
    const text = document.getElementById('postText').value.trim();
    if (!text && !selectedFile) { setStatus('Write something or add a photo.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

    try {
      let imageUrl = null;
      if (selectedFile) {
        setStatus('Preparing your photo…');
        const compressed = await compressImageFile(selectedFile);
        setStatus('Uploading…');
        imageUrl = await uploadImage(compressed, 'post');
      }

      setStatus('Publishing…');
      const res = await fetch(CHRONIK_API_BASE + '/posts', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ text: text || null, image_url: imageUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(friendlyError(data.error));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
        return;
      }

      setStatus('Posted!');
      setTimeout(function () { onDone && onDone(); }, 500);
    } catch (err) {
      console.error('Post Submit Error:', err);
      setStatus(err.message || 'Something went wrong. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  });
}

function renderQuoteComposer(body, onDone) {
  body.innerHTML = '<div class="compose-quote"><p class="compose-loading">Loading backgrounds…</p></div>';

  fetchBackgrounds().then(function (backgrounds) {
    let selectedBg = backgrounds.length
      ? { type: 'image', value: backgrounds[0].image_url, backgroundId: backgrounds[0].id }
      : { type: 'solid', value: SOLID_PRESETS[0].color };
    let align = 'center';
    let textColor = '#FFFFFF';
    let fontIndex = 0;
    let category = QUOTE_CATEGORIES[0];

    const bgTilesHtml = backgrounds.map(function (bg, i) {
      return '<button class="compose-bg-tile' + (i === 0 ? ' active' : '') + '" data-bg-index="' + i + '" style="background-image:url(\'' + bg.image_url + '\')"></button>';
    }).join('');

    const solidTilesHtml = SOLID_PRESETS.map(function (c, i) {
      const borderStyle = c.color === '#FFFFFF' ? 'border:1px solid var(--hair-strong);' : '';
      return '<button class="compose-bg-tile" data-solid-index="' + i + '" style="background:' + c.color + ';' + borderStyle + '" title="' + c.name + '"></button>';
    }).join('');

    const fontTilesHtml = FONT_OPTIONS.map(function (f, i) {
      return '<button class="compose-font-btn' + (i === 0 ? ' active' : '') + '" data-font-index="' + i + '" style="font-family:' + f.family + '">' + f.name + '</button>';
    }).join('');

    const categoryTilesHtml = QUOTE_CATEGORIES.map(function (c) {
      return '<button class="compose-category-btn' + (c === category ? ' active' : '') + '" data-category="' + c + '">' + c + '</button>';
    }).join('');

    const colorDotsHtml = ['#FFFFFF', '#14151A', '#E8442C', '#FFD700'].map(function (c) {
      return '<button class="compose-color-dot' + (c === textColor ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join('');

    body.innerHTML =
      '<div class="compose-quote">' +
      '<canvas id="quotePreviewCanvas" class="compose-preview-canvas"></canvas>' +
      '<textarea id="quoteText" class="compose-textarea compose-textarea-quote" placeholder="Write your quote…" maxlength="280" rows="3"></textarea>' +
      '<p class="compose-section-label">Category</p>' +
      '<div class="compose-category-row">' + categoryTilesHtml + '</div>' +
      '<p class="compose-section-label">Style</p>' +
      '<div class="compose-font-row">' + fontTilesHtml + '</div>' +
      '<p class="compose-section-label">Alignment</p>' +
      '<div class="compose-align-row">' +
      '<button class="compose-align-btn" data-align="left">Left</button>' +
      '<button class="compose-align-btn active" data-align="center">Center</button>' +
      '<button class="compose-align-btn" data-align="right">Right</button>' +
      '</div>' +
      '<p class="compose-section-label">Text color</p>' +
      '<div class="compose-color-row">' + colorDotsHtml + '</div>' +
      '<p class="compose-section-label">Backgrounds</p>' +
      '<div class="compose-bg-grid">' + bgTilesHtml + '</div>' +
      '<p class="compose-section-label">Solid colors</p>' +
      '<div class="compose-bg-grid">' + solidTilesHtml + '</div>' +
      '<button class="compose-submit compose-submit-full" id="quoteSubmit">Share Quote</button>' +
      '<p class="compose-status" id="quoteStatus"></p>' +
      '</div>';

    const canvas = document.getElementById('quotePreviewCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 320;
    canvas.height = 400;

    let bgImageCache = null;
    let bgImageCacheUrl = null;

    async function redrawPreview() {
      const text = document.getElementById('quoteText').value || 'Your quote appears here';
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (selectedBg.type === 'solid') {
        ctx.fillStyle = selectedBg.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (selectedBg.type === 'image') {
        try {
          if (bgImageCacheUrl !== selectedBg.value) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = reject; img.src = selectedBg.value; });
            bgImageCache = img;
            bgImageCacheUrl = selectedBg.value;
          }
          const img = bgImageCache;
          const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch (e) {
          ctx.fillStyle = '#14151A';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      const font = FONT_OPTIONS[fontIndex];
      ctx.font = font.style + ' 22px ' + font.family;
      ctx.fillStyle = textColor;
      ctx.textAlign = align;
      const x = align === 'left' ? 24 : align === 'right' ? canvas.width - 24 : canvas.width / 2;
      wrapAndDraw(ctx, text, x, canvas.height / 2, canvas.width - 48, 30);
    }

    function wrapAndDraw(ctx2, text, x, centerY, maxWidth, lineHeight) {
      const words = text.split(' ');
      const lines = [];
      let current = '';
      words.forEach(function (w) {
        const test = current ? current + ' ' + w : w;
        if (ctx2.measureText(test).width > maxWidth && current) { lines.push(current); current = w; }
        else current = test;
      });
      if (current) lines.push(current);
      const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach(function (line, i) { ctx2.fillText(line, x, startY + i * lineHeight); });
    }

    document.getElementById('quoteText').addEventListener('input', redrawPreview);

    body.querySelectorAll('.compose-align-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-align-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        align = btn.dataset.align;
        redrawPreview();
      });
    });

    body.querySelectorAll('.compose-font-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-font-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        fontIndex = parseInt(btn.dataset.fontIndex, 10);
        redrawPreview();
      });
    });

    body.querySelectorAll('.compose-category-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-category-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        category = btn.dataset.category;
      });
    });

    body.querySelectorAll('.compose-color-dot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-color-dot').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        textColor = btn.dataset.color;
        redrawPreview();
      });
    });

    body.querySelectorAll('[data-bg-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-bg-tile').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const idx = parseInt(btn.dataset.bgIndex, 10);
        selectedBg = { type: 'image', value: backgrounds[idx].image_url, backgroundId: backgrounds[idx].id };
        redrawPreview();
      });
    });
    body.querySelectorAll('[data-solid-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        body.querySelectorAll('.compose-bg-tile').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedBg = { type: 'solid', value: SOLID_PRESETS[parseInt(btn.dataset.solidIndex, 10)].color, backgroundId: null };
        redrawPreview();
      });
    });

    redrawPreview();

    document.getElementById('quoteSubmit').addEventListener('click', async function () {
      const submitBtn = document.getElementById('quoteSubmit');
      const statusEl = document.getElementById('quoteStatus');
      const text = document.getElementById('quoteText').value.trim();
      if (!text) { statusEl.textContent = 'Write your quote first.'; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sharing…';
      statusEl.textContent = 'Checking your quote…';

      try {
        const res = await fetch(CHRONIK_API_BASE + '/quotes/create', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            text: text,
            category: category,
            background_id: selectedBg.backgroundId || null,
            background_image_url: selectedBg.type === 'image' ? selectedBg.value : null,
            solid_color: selectedBg.type === 'solid' ? selectedBg.value : null,
            align: align,
            text_color: textColor,
            font: FONT_OPTIONS[fontIndex].name,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          statusEl.textContent = friendlyError(data.error);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Share Quote';
          return;
        }

        const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/webp', 0.92); });
        submitBtn.style.display = 'none';
        statusEl.innerHTML = 'Shared to Chronik! <button class="compose-save-link" id="quoteSaveBtn">Save image to my device</button>';
        const saveBtn = document.getElementById('quoteSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', function () {
          downloadBlob(blob, 'chronik-quote.webp');
          saveBtn.textContent = 'Saved!';
        });
        onDone && onDone(true);
      } catch (err) {
        console.error('Quote Submit Error:', err);
        statusEl.textContent = 'Something went wrong. Please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Share Quote';
      }
    });
  });
}

function friendlyError(rawError) {
  if (!rawError) return 'Something went wrong. Please try again.';
  const lower = rawError.toLowerCase();
  if (lower.includes('moderation') || lower.includes('adult') || lower.includes('safety')) {
    return 'This content couldn\u2019t be shared. Please keep posts appropriate for everyone.';
  }
  if (lower.includes('sign in')) return 'Please sign in to continue.';
  return rawError || 'Something went wrong. Please try again.';
}

async function uploadImage(blob, purpose) {
  const formData = new FormData();
  formData.append('file', blob, 'upload.webp');
  formData.append('purpose', purpose);

  // FIX: Strip Content-Type header so browser sets multipart boundary automatically
  const headers = Object.assign({}, authHeaders());
  delete headers['content-type'];
  delete headers['Content-Type'];

  const res = await fetch(CHRONIK_API_BASE + '/upload', {
    method: 'POST',
    headers: headers,
    body: formData,
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(friendlyError(data.error));
  return data.url;
}
