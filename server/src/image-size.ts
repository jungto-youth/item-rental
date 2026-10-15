// 이미지 헤더만 읽어 픽셀 크기를 구한다 — 의존성 없이 JPEG·PNG·WebP 지원
//
// 왜 필요한가: 브라우저가 1600px로 줄여 보내지만 그 경로를 거치지 않은 업로드
// (curl 등)는 용량만 작으면 통과한다. 4000×3000 JPEG q25는 약 700KB라 2MB
// 한도를 통과하면서 브라우저에 48MB 메모리를 쓰게 만든다. 용량(비용)과
// 픽셀(부하)은 막는 대상이 달라 둘 다 검사한다 ().
//
// 실패 시 null — 알 수 없는 형식은 형식 화이트리스트(PHOTO_TYPES)가 먼저
// 걸러내므로 여기서는 예외를 던지지 않는다.

export type ImageSize = { width: number; height: number };
export type ImageInfo = ImageSize & { type: "image/png" | "image/jpeg" | "image/webp" };

// Header validation is not a full image decoder. MIME must match detected bytes.
export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const p = png(buf);
  if (p) return { ...p, type: "image/png" };
  const j = jpeg(buf);
  if (j) return { ...j, type: "image/jpeg" };
  const w = webp(buf);
  return w ? { ...w, type: "image/webp" } : null;
}

export function imageSize(buf: Uint8Array): ImageSize | null {
  const info = imageInfo(buf);
  return info ? { width: info.width, height: info.height } : null;
}

// PNG — 8바이트 시그니처 뒤 IHDR 청크에 폭·높이 (big-endian uint32)
function png(b: Uint8Array): ImageSize | null {
  if (b.length < 33) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((value, i) => b[i] !== value)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(8) !== 13 || String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return null;
  const width = dv.getUint32(16), height = dv.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// JPEG — 0xFFD8(SOI) 뒤로 마커를 순회해 SOFn을 찾는다
function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  for (let steps = 0; i + 1 < b.length && steps < 512; steps++) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // 0xFF 채움 바이트 — 마커가 아니다
      continue;
    }
    if (marker === 0xda || marker === 0xd9 || marker === 0xd8 || marker === 0x00) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (i + 3 >= b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    // SOFn(0xC0~0xCF)만 폭·높이를 담는다. DHT(C4)·JPG(C8)·DAC(CC)는 모양이 달라 제외
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (len < 11 || i + 9 >= b.length) return null;
      const components = b[i + 9];
      if (components < 1 || components > 4 || len !== 8 + 3 * components) return null;
      const height = (b[i + 5] << 8) | b[i + 6], width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

// WebP — RIFF 컨테이너의 청크 종류에 따라 세 가지 레이아웃
function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 25) return null;
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46)
    return null; // 'RIFF'
  if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50)
    return null; // 'WEBP'
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(4, true) + 8 !== b.length) return null;
  let canvas: ImageSize | null = null;
  let pixels: ImageSize | null = null;
  let offset = 12, chunks = 0;
  while (offset + 8 <= b.length && chunks++ < 64) {
    const name = String.fromCharCode(...b.subarray(offset, offset + 4));
    const size = dv.getUint32(offset + 4, true);
    const start = offset + 8, end = start + size;
    if (end > b.length) return null;
    if (name === "ANIM" || name === "ANMF") return null; // uploads are static photos
    if (name === "VP8X") {
      if (canvas || offset !== 12 || size !== 10 || (b[start] & 0xc3) !== 0) return null;
      canvas = {
        width: 1 + (b[start + 4] | (b[start + 5] << 8) | (b[start + 6] << 16)),
        height: 1 + (b[start + 7] | (b[start + 8] << 8) | (b[start + 9] << 16)),
      };
    } else if (name === "VP8 ") {
      if (pixels || size < 10 || (b[start] & 1) || b[start + 3] !== 0x9d || b[start + 4] !== 0x01 || b[start + 5] !== 0x2a) return null;
      pixels = { width: dv.getUint16(start + 6, true) & 0x3fff, height: dv.getUint16(start + 8, true) & 0x3fff };
    } else if (name === "VP8L") {
      if (pixels || size < 5 || b[start] !== 0x2f || (b[start + 4] & 0xe0)) return null;
      const bits = dv.getUint32(start + 1, true);
      pixels = { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    offset = end + (size % 2);
  }
  if (offset !== b.length || !pixels || pixels.width < 1 || pixels.height < 1) return null;
  if (canvas && (canvas.width !== pixels.width || canvas.height !== pixels.height)) return null;
  return pixels;
}
