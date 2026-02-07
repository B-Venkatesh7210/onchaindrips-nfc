/**
 * Extract dominant color from an image URL and return a soft accent color for backgrounds.
 * Uses canvas to sample pixels, skips very light/dark, and lightens for a cohesive vibe.
 */

const SAMPLE_SIZE = 40;
const MAX_IMAGE_DIM = 150;

/** Convert RGB to a soft pastel hex suitable for backgrounds. */
function toAccentHex(r: number, g: number, b: number): string {
  // Lighten and slightly desaturate for a pleasant background
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const factor = luminance < 0.5 ? 0.85 : 0.92;
  const r2 = Math.round(r + (255 - r) * factor);
  const g2 = Math.round(g + (255 - g) * factor);
  const b2 = Math.round(b + (255 - b) * factor);
  return `#${r2.toString(16).padStart(2, "0")}${g2.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
}

/** Check if pixel is too light (likely background) or too dark (likely shadow). */
function isRelevantPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.15 && luminance < 0.95;
}

/**
 * Extract dominant color from image URL. Returns a soft hex accent for backgrounds.
 * Falls back to neutral gray on error.
 */
export function getDominantAccent(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(MAX_IMAGE_DIM / img.width, MAX_IMAGE_DIM / img.height, 1);
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("#f5f5f5");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = data.data;
        const step = Math.max(1, Math.floor((pixels.length / 4) / (SAMPLE_SIZE * SAMPLE_SIZE)));
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < pixels.length; i += step * 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          if (isRelevantPixel(r, g, b, a)) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count === 0) {
          resolve("#f5f5f5");
          return;
        }
        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);
        resolve(toAccentHex(r, g, b));
      } catch {
        resolve("#f5f5f5");
      }
    };

    img.onerror = () => resolve("#f5f5f5");
    img.src = imageUrl;
  });
}
