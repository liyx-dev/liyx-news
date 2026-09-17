// ============================================================
// COMPOSE.JS - the "+" button experience: choose Quote or Post,
// compose it, submit. Deliberately X.com-simple on the surface
// even though real functionality sits behind it - background
// picking, alignment, color, compression, moderation.
// ============================================================

import { Store } from './store.js';
import { CHRONIK_API_BASE } from './sources.js';
import { authHeaders, isSignedIn, getCurrentProfile } from './auth.js';
import { compressImageFile, validateImageFile } from './image-compress.js';
import { composeQuoteImage, downloadBlob, shareBlob } from './quote-composer.js';

let cachedBackgrounds = null;

async function fetchBackgrounds() {
  if (cachedBackgrounds) return cachedBackgrounds;
  const res = await fetch(CHRONIK_API_BASE + '/quote-backgrounds');
  const data = await res.json();
  cachedBackgrounds = data.backgrounds || [];
  return cachedBackgrounds;
}

const GRADIENT_PRESETS = [
  ['#E8442C', '#C6371F'], ['#1a2a6c', '#b21f1f'], ['#0f2027', '#2c5364'],
  ['#134E5E', '#71B280'], ['#8E2DE2', '#4A00E0'], ['#F7971E', '#FFD200'],
];
const SOLID_PRESETS = ['#14151A', '#E8442C', '#1F5C3F', '#2A3B8F', '#7A1FA2'];

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
    const previewImg = document.getElementById('postImagePreviewImg');
    previewImg.src = URL.createObjectURL(file);
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
        setStatus('Compressing image…');
        const compressed = await compressImageFile(selectedFile);
        setStatus('Uploading…');
        imageUrl = await uploadImage(compressed, 'post');
      }

      setStatus('Checking content…');
      const res = await fetch(CHRONIK_API_BASE + '/posts', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ text: text || null, image_url: imageUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Could not post. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
        return;
      }

      setStatus('Posted!');
      setTimeout(function () { onDone && onDone(); }, 500);
    } catch (err) {
      setStatus('Something went wrong: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  });
}

function renderQuoteComposer(body, onDone) {
  body.innerHTML = '<div class="compose-quote"><p class="compose-loading">Loading backgrounds…</p></div>';

  fetchBackgrounds().then(function (backgrounds) {
    let selectedBg = { type: 'gradient', value: GRADIENT_PRESETS[0] };
    let align = 'center';
    let textColor = '#FFFFFF';
    let customFile = null;

    const bgTilesHtml = backgrounds.map(function (bg, i) {
      return '<button class="compose-bg-tile" data-bg-index="' + i + '" style="background-image:url(\'' + bg.image_url + '\')"></button>';
    }).join('');

    const gradientTilesHtml = GRADIENT_PRESETS.map(function (g, i) {
      return '<button class="compose-bg-tile" data-gradient-index="' + i + '" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')"></button>';
    }).join('');

    const solidTilesHtml = SOLID_PRESETS.map(function (c, i) {
      return '<button class="compose-bg-tile" data-solid-index="' + i + '" style="background:' + c + '"></button>';
    }).join('');

    body.innerHTML =
      '<div class="compose-quote">' +
      '<textarea id="quoteText" class="compose-textarea compose-textarea-quote" placeholder="Write your quote…" maxlength="280" rows="3"></textarea>' +
      '<div class="compose-align-row">' +
      '<button class="compose-align-btn" data-align="left">Left</button>' +
      '<button class="compose-align-btn active" data-align="center">Center</button>' +
      '<button class="compose-align-btn" data-align="right">Right</button>' +
      '</div>' +
      '<canvas id="quotePreviewCanvas" class="compose-preview-canvas"></canvas>' +
      '<p class="compose-section-label">Your own photo</p>' +
      '<label class="compose-upload-bg" for="quoteBgUpload">Upload a background photo</label>' +
      '<input type="file" id="quoteBgUpload" accept="image/*" style="display:none;">' +
      '<p class="compose-section-label">Backgrounds</p>' +
      '<div class="compose-bg-grid">' + bgTilesHtml + '</div>' +
      '<p class="compose-section-label">Gradients</p>' +
      '<div class="compose-bg-grid">' + gradientTilesHtml + '</div>' +
      '<p class="compose-section-label">Solid colors</p>' +
      '<div class="compose-bg-grid">' + solidTilesHtml + '</div>' +
      '<button class="compose-submit compose-submit-full" id="quoteSubmit">Share Quote</button>' +
      '<p class="compose-status" id="quoteStatus"></p>' +
      '</div>';

    const canvas = document.getElementById('quotePreviewCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 320;
    canvas.height = 400;

    async function redrawPreview() {
      const text = document.getElementById('quoteText').value || 'Your quote appears here';
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (selectedBg.type === 'gradient') {
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, selectedBg.value[0]);
        g.addColorStop(1, selectedBg.value[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (selectedBg.type === 'solid') {
        ctx.fillStyle = selectedBg.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (selectedBg.type === 'image') {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = reject; img.src = selectedBg.value; });
          const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch (e) { ctx.fillStyle = '#14151A'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      }

      ctx.font = 'italic 700 20px Georgia, serif';
      ctx.fillStyle = textColor;
      ctx.textAlign = align;
      const x = align === 'left' ? 20 : align === 'right' ? canvas.width - 20 : canvas.width / 2;
      wrapAndDraw(ctx, text, x, canvas.height / 2, canvas.width - 40, 26);
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

    body.querySelectorAll('[data-bg-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.dataset.bgIndex, 10);
        selectedBg = { type: 'image', value: backgrounds[idx].image_url, backgroundId: backgrounds[idx].id };
        redrawPreview();
      });
    });
    body.querySelectorAll('[data-gradient-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedBg = { type: 'gradient', value: GRADIENT_PRESETS[parseInt(btn.dataset.gradientIndex, 10)] };
        redrawPreview();
      });
    });
    body.querySelectorAll('[data-solid-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedBg = { type: 'solid', value: SOLID_PRESETS[parseInt(btn.dataset.solidIndex, 10)] };
        redrawPreview();
      });
    });

    document.getElementById('quoteBgUpload').addEventListener('change', async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const err = validateImageFile(file);
      if (err) { document.getElementById('quoteStatus').textContent = err; return; }
      customFile = file;
      selectedBg = { type: 'image', value: URL.createObjectURL(file) };
      redrawPreview();
    });

    redrawPreview();

    document.getElementById('quoteSubmit').addEventListener('click', async function () {
      const submitBtn = document.getElementById('quoteSubmit');
      const statusEl = document.getElementById('quoteStatus');
      const text = document.getElementById('quoteText').value.trim();
      if (!text) { statusEl.textContent = 'Write your quote first.'; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sharing…';

      try {
        let backgroundImageUrl = selectedBg.type === 'image' && !customFile ? selectedBg.value : null;
        let backgroundId = selectedBg.backgroundId || null;

        if (customFile) {
          statusEl.textContent = 'Compressing your photo…';
          const compressed = await compressImageFile(customFile);
          statusEl.textContent = 'Uploading…';
          backgroundImageUrl = await uploadImage(compressed, 'post');
        }

        statusEl.textContent = 'Checking content…';
        const profile = getCurrentProfile();
        const composedBlob = await composeQuoteImage({
          backgroundType: selectedBg.type,
          backgroundUrl: backgroundImageUrl,
          solidColor: selectedBg.type === 'solid' ? selectedBg.value : null,
          gradientColors: selectedBg.type === 'gradient' ? selectedBg.value : null,
          text: text, align: align, textColor: textColor,
          attribution: profile.display_name,
        });

        const res = await fetch(CHRONIK_API_BASE + '/quotes/create', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            text: text, category: null, background_id: backgroundId,
            background_image_url: backgroundImageUrl, align: align, text_color: textColor,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          statusEl.textContent = data.error || 'Could not share quote.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Share Quote';
          return;
        }

        statusEl.textContent = 'Shared! Downloading your image…';
        downloadBlob(composedBlob, 'chronik-quote.webp');
        setTimeout(function () { onDone && onDone(); }, 800);
      } catch (err) {
        statusEl.textContent = 'Something went wrong: ' + err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Share Quote';
      }
    });
  });
}

async function uploadImage(blob, purpose) {
  const formData = new FormData();
  formData.append('file', blob, 'upload.webp');
  formData.append('purpose', purpose);
  const res = await fetch(CHRONIK_API_BASE + '/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}
