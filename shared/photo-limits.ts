// 사진 업로드 규칙 — 브라우저(리사이즈·장수)·서버(검증)·화면 문구가 함께 쓴다.
// 원본은 브라우저에서 축소되고, 업로드되는 것은 변환본뿐이다.
export const MAX_PHOTO_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_EDGE = 1600;
export const MAX_PHOTOS = 3;
// 물품 사진 썸네일 — 카드(약 221×165, 4:3 크롭)를 레티나에서도 선명하게 채우는 크기.
// 짧은 변을 THUMB_SHORT_EDGE 로 맞추고 긴 변은 MAX_THUMB_EDGE 를 넘지 않는다.
export const THUMB_SHORT_EDGE = 400;
export const MAX_THUMB_EDGE = 800;
export const MAX_THUMB_UPLOAD_BYTES = 200 * 1024;
// 반납 상태 증빙 — 물품 카탈로그 사진과 목적이 달라 한도를 따로 둔다.
export const MAX_RETURN_PHOTOS = 3;
