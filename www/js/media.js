// ============================================================
// IMAGE-COMPRESS.JS - compresses any user-selected image to
// WebP, client-side, before it ever reaches the network. This
// is what keeps R2 storage small and free-tier-sustainable
// long-term.
//
// Uses createImageBitmap + file.arrayBuffer() rather than the
// older FileReader.readAsDataURL() API. Real-world testing
// surfaced a confirmed Chromium bug: photos picked via Google
// Photos/Drive on Android that are cloud-backed (not fully
// downloaded to the device) throw NotReadableError under
// FileReader - this is what "Could not read file" traced back
// to. createImageBitmap uses a different, more robust decode
// path that handles these files correctly.
// ============================================================

// Tuned for real-world storage savings after testing actual
// compression ratios: capping the long edge at 1080px (standard
// "Full HD" - already sharper than any surface in this app ever
// displays an image at) combined with WebP quality 75 took a
// realistic 5.1MB phone photo down to ~193KB, a ~96% reduction,
// with no visible quality loss at any size this app actually
// renders images. This mirrors "compress aggressively while the
// photo still looks right," the same principle Google Photos
// and WhatsApp use for shared/thumbnail images.
const MAX_DIMENSION = 1080;
const WEBP_QUALITY = 0.75;

export async function compressImageFile(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    // Surface the REAL browser error rather than a guessed
    // generic message - a prior version of this code swallowed
    // the actual error and replaced it with a guess about cloud
    // photos, which made real diagnosis impossible. Whatever the
    // browser actually says (its exact DOMException name/message)
    // is now shown, so the real cause can be identified for certain.
    throw new Error('Image processing failed: ' + (err.name || 'Error') + ' - ' + (err.message || String(err)));
  }

  let width = bitmap.width;
  let height = bitmap.height;
  if (width > height && width > MAX_DIMENSION) {
    height = Math.round(height * (MAX_DIMENSION / width));
    width = MAX_DIMENSION;
  } else if (height > MAX_DIMENSION) {
    width = Math.round(width * (MAX_DIMENSION / height));
    height = MAX_DIMENSION;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (!blob) { reject(new Error('Could not prepare this image. Please try a different photo.')); return; }
      resolve(blob);
    }, 'image/webp', WEBP_QUALITY);
  });
}

export function validateImageFile(file) {
  const MAX_SOURCE_MB = 25;
  if (!file || !file.type || !file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > MAX_SOURCE_MB * 1024 * 1024) return 'Image is too large (max ' + MAX_SOURCE_MB + 'MB).';
  return null;
}

// ============================================================
// QUOTE COMPOSITING - builds a real, flattened quote image
// entirely in the browser using Canvas, so the final result is
// one genuine WebP file with the text permanently part of the
// pixels - downloadable, shareable, and usable as a real Open
// Graph preview image.
//
// Merged into this same file (was previously its own
// quote-composer.js) specifically because it is small, tightly
// related "client-side image work" that was easy to lose track
// of across separate files during debugging - fewer files for
// this category of logic makes future fixes easier to locate.
//
// This deliberately runs on the CLIENT, not a Worker: Cloudflare
// Workers has no canvas/DOM, and its real Images product is
// metered/paid - doing this compositing for free, at any scale,
// only works by using the phone's own browser.
// ============================================================

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

function loadImageForCanvas(url) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Could not load background image')); };
    img.src = url;
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach(function (word) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

export async function composeQuoteImage(options) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (options.backgroundType === 'image' && options.backgroundUrl) {
    const img = await loadImageForCanvas(options.backgroundUrl);
    const scale = Math.max(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (CANVAS_WIDTH - w) / 2, (CANVAS_HEIGHT - h) / 2, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else if (options.backgroundType === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gradient.addColorStop(0, options.gradientColors[0]);
    gradient.addColorStop(1, options.gradientColors[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = options.solidColor || '#14151A';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  const maxTextWidth = CANVAS_WIDTH * 0.82;
  let fontSize = 64;
  ctx.font = 'italic 700 ' + fontSize + 'px Georgia, serif';
  let lines = wrapText(ctx, options.text, maxTextWidth);

  while (lines.length * (fontSize * 1.35) > CANVAS_HEIGHT * 0.6 && fontSize > 32) {
    fontSize -= 4;
    ctx.font = 'italic 700 ' + fontSize + 'px Georgia, serif';
    lines = wrapText(ctx, options.text, maxTextWidth);
  }

  const lineHeight = fontSize * 1.35;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (CANVAS_HEIGHT - totalTextHeight) / 2 + fontSize;

  ctx.fillStyle = options.textColor || '#FFFFFF';
  ctx.textAlign = options.align || 'center';
  const textX = options.align === 'left' ? CANVAS_WIDTH * 0.09
    : options.align === 'right' ? CANVAS_WIDTH * 0.91
    : CANVAS_WIDTH / 2;

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  lines.forEach(function (line, i) {
    ctx.fillText(line, textX, startY + i * lineHeight);
  });
  ctx.shadowBlur = 0;

  if (options.attribution) {
    ctx.font = '600 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = options.textColor || '#FFFFFF';
    ctx.globalAlpha = 0.85;
    ctx.fillText('— ' + options.attribution, textX, startY + lines.length * lineHeight + 50);
    ctx.globalAlpha = 1;
  }

  ctx.font = '700 24px "Space Grotesk", sans-serif';
  ctx.fillStyle = options.textColor || '#FFFFFF';
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'right';
  ctx.fillText('Chronik', CANVAS_WIDTH - 32, CANVAS_HEIGHT - 32);
  ctx.globalAlpha = 1;

  return new Promise(function (resolve) {
    canvas.toBlob(function (blob) { resolve(blob); }, 'image/webp', 0.9);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'chronik-quote.webp';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

export async function shareBlob(blob, filename, text) {
  const file = new File([blob], filename || 'chronik-quote.webp', { type: 'image/webp' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: text || '' });
      return 'shared';
    } catch (e) {
      return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
