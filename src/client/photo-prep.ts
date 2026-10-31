export type Prepared = { photo: Blob; thumb: Blob };

const PHOTO_EDGE = 1600;
const PHOTO_MAX_BYTES = 400_000;
const PHOTO_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];
const THUMB_EDGE = 400;
const THUMB_QUALITY = 0.75;

// An <img> applies EXIF orientation and decodes HEIC on iOS Safari, where createImageBitmap does neither reliably.
async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(img: HTMLImageElement, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const jpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );

async function underBudget(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob: Blob | null = null;
  for (const quality of PHOTO_QUALITIES) {
    blob = await jpeg(canvas, quality);
    if (blob.size <= PHOTO_MAX_BYTES) break;
  }
  return blob!;
}

/** Shrinks a picked image to a ~300 KB JPEG and a small thumbnail. Re-encoding through a canvas drops EXIF, GPS included. */
export async function prepare(file: Blob): Promise<Prepared> {
  const img = await decode(file);
  const [photo, thumb] = await Promise.all([underBudget(draw(img, PHOTO_EDGE)), jpeg(draw(img, THUMB_EDGE), THUMB_QUALITY)]);
  return { photo, thumb };
}
