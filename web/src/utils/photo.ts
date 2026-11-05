import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_PHOTO_EDGE,
  MAX_THUMB_EDGE,
  MAX_THUMB_UPLOAD_BYTES,
  THUMB_SHORT_EDGE,
} from "../../../shared/photo-limits";

export const PHOTO_OK = ["image/jpeg", "image/png", "image/webp"];

const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.85;
// 썸네일은 작게 보이므로 화질을 조금 더 낮춰도 티가 나지 않는다
const THUMB_WEBP_QUALITY = 0.75;
const THUMB_JPEG_QUALITY = 0.8;

export async function processPhoto(file: File): Promise<File> {
  if (!PHOTO_OK.includes(file.type))
    throw new Error(
      `JPEG/PNG/WebP만 가능합니다 (선택한 형식: ${file.type || "알 수 없음"}). HEIC/HEIF 사진은 JPEG로 변환해주세요`,
    );

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `이미지를 읽을 수 없습니다 (원본 ${(file.size / 1024 / 1024).toFixed(1)}MB). JPEG 사진으로 다시 시도해주세요`,
    );
  }

  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("이미지 처리에 실패했습니다");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  try {
    ctx.drawImage(bitmap, 0, 0, w, h);
  } finally {
    bitmap.close();
  }

  try {
    const webp = await toBlob(canvas, "image/webp", WEBP_QUALITY);
    if (webp && webp.type === "image/webp") {
      return renamed(webp, file.name, "webp");
    }
    const jpg = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
    if (!jpg || jpg.type !== "image/jpeg") throw new Error("이미지 변환에 실패했습니다");
    return renamed(jpg, file.name, "jpg");
  } finally {
    canvas.width = canvas.height = 0;
  }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(blob: Blob, name: string, ext: string): File {
  if (blob.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error(
      `사진을 축소한 뒤에도 2MB를 넘습니다 (${(blob.size / 1024 / 1024).toFixed(1)}MB). 사진 해상도를 낮춰 다시 시도해주세요`,
    );
  }
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

// 카드·썸네일 줄용 썸네일 — 짧은 변을 THUMB_SHORT_EDGE 로 맞추고 긴 변은 MAX_THUMB_EDGE 이하.
// 원본(processPhoto 결과)이나 서버에서 받은 기존 사진을 넣는다. 작은 사진은 키우지 않는다.
export async function makeThumbnail(source: Blob, name: string): Promise<File> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(
    1,
    THUMB_SHORT_EDGE / Math.min(bitmap.width, bitmap.height),
    MAX_THUMB_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("썸네일 처리에 실패했습니다");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  try {
    ctx.drawImage(bitmap, 0, 0, w, h);
  } finally {
    bitmap.close();
  }

  try {
    const base = name.replace(/\.[^.]+$/, "") || "photo";
    const webp = await toBlob(canvas, "image/webp", THUMB_WEBP_QUALITY);
    const blob =
      webp && webp.type === "image/webp"
        ? webp
        : await toBlob(canvas, "image/jpeg", THUMB_JPEG_QUALITY);
    if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg")) {
      throw new Error("썸네일 변환에 실패했습니다");
    }
    if (blob.size > MAX_THUMB_UPLOAD_BYTES) throw new Error("썸네일이 너무 큽니다");
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.thumb.${ext}`, { type: blob.type });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
