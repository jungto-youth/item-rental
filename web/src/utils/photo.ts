// 업로드 전 클라이언트 이미지 리사이즈 (§4.2)
// — 본문 최대 폭 640px @2x retina 여유인 최장 변 1600px, WebP q80으로 재인코딩.
// R2 10GB 스토리지 절감 + 페이지 로딩 단축 + EXIF(위치정보 포함) 자동 제거.
// 원본은 보관하지 않고 변환본만 업로드. Safari 등 WebP 인코딩 미지원 브라우저는 JPEG 폴백.
export const PHOTO_OK = ["image/jpeg", "image/png", "image/webp"];
// 원본 선택 한도(5MB) — 사용자가 고르는 원본 크기 기준이다.
// 서버 한도(2MB, server/src/routes/admin/items.ts)와 값이 다른 게 정상:
// 여기서는 변환 전 원본을, 서버는 1600px·WebP로 줄인 결과물을 검사한다 (§4.2).
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.85;

export async function processPhoto(file: File): Promise<File> {
  if (!PHOTO_OK.includes(file.type))
    throw new Error("JPEG/PNG/WebP만 가능해요");

  let bitmap: ImageBitmap;
  try {
    // EXIF 방향을 반영해 디코드 — 회전 사진도 정방향으로 저장됨
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("이미지를 읽을 수 없어요");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("이미지 처리에 실패했어요");
  }
  ctx.fillStyle = "#ffffff"; // 투명 배경 플랫화 — PNG·JPEG 폴백 모두 흰 바탕으로 통일
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp", WEBP_QUALITY);
  if (webp && webp.type === "image/webp") {
    canvas.width = canvas.height = 0;
    return renamed(webp, file.name, "webp");
  }
  // toBlob이 미지원 형식에서 PNG로 폴백하는 브라우저(Safari) → JPEG로 재시도
  const jpg = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
  canvas.width = canvas.height = 0;
  if (!jpg) throw new Error("이미지 변환에 실패했어요");
  return renamed(jpg, file.name, "jpg");
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(blob: Blob, name: string, ext: string): File {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
