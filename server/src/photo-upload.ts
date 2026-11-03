// 사진 업로드 검증 — 물품 사진과 반납 사진이 같은 규칙을 쓰도록 한 곳에 둔다.
// 라우트는 multipart 파싱만 하고, 형식·용량·픽셀 판정은 이 함수가 맡는다.
import {
  MAX_PHOTO_EDGE,
  MAX_PHOTO_UPLOAD_BYTES,
} from "../../shared/photo-limits";
import { imageInfo } from "./image-size";

// 업로드 허용 형식 — 파일의 MIME 과 실제 바이트가 모두 일치해야 한다.
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoFileCheck =
  | { ok: true; ext: string }
  | { ok: false; status: 400; error: string };

// 바이트(비용)와 픽셀(브라우저 부하)은 막는 대상이 다르다 — 둘 다 검사한다.
// 클라이언트가 1600px·q80 WebP로 줄여 보내므로 정상 업로드는 150KB 안쪽이다.
// 2MB는 그 경로를 거치지 않은 업로드를 거르는 상한이고, MAX_PHOTO_EDGE는
// 용량이 작아도 픽셀이 큰 경우(예: 4000×3000 JPEG q25 ≈ 700KB)를 잡는다.
export async function validatePhotoFile(file: File): Promise<PhotoFileCheck> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, status: 400, error: "지원 형식: JPEG/PNG/WebP" };
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `사진은 최대 ${MAX_PHOTO_UPLOAD_BYTES / 1024 / 1024}MB`,
    };
  }
  const dim = imageInfo(new Uint8Array(await file.arrayBuffer()));
  if (!dim) {
    return { ok: false, status: 400, error: "이미지 크기를 읽을 수 없습니다" };
  }
  if (dim.type !== file.type) {
    return {
      ok: false,
      status: 400,
      error: "이미지 형식과 파일 내용이 일치하지 않습니다",
    };
  }
  if (dim.width > MAX_PHOTO_EDGE || dim.height > MAX_PHOTO_EDGE) {
    return {
      ok: false,
      status: 400,
      error:
        `사진은 가로·세로 ${MAX_PHOTO_EDGE}px 이하여야 합니다 ` +
        `(현재 ${dim.width}×${dim.height})`,
    };
  }
  return { ok: true, ext };
}
