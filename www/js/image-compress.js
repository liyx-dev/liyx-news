// ============================================================
// IMAGE-COMPRESS.JS - compresses any user-selected image to
// WebP, client-side, before it ever reaches the network. This
// is what keeps R2 storage small and free-tier-sustainable
// long-term, per the project's cost constraints.
// ============================================================

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.82;

export function compressImageFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = function (e) {
      img.onload = function () {
        let width = img.width;
        let height = img.height;
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
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(blob);
        }, 'image/webp', WEBP_QUALITY);
      };
      img.onerror = function () { reject(new Error('Could not read image')); };
      img.src = e.target.result;
    };
    reader.onerror = function () { reject(new Error('Could not read file')); };
    reader.readAsDataURL(file);
  });
}

export function validateImageFile(file) {
  const MAX_SOURCE_MB = 25;
  if (!file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > MAX_SOURCE_MB * 1024 * 1024) return 'Image is too large (max ' + MAX_SOURCE_MB + 'MB).';
  return null;
}
