// 이미지 헤더만 읽어 픽셀 크기를 구한다 — 의존성 없이 JPEG·PNG·WebP 지원
//
// 왜 필요한가: 브라우저가 1600px로 줄여 보내지만 그 경로를 거치지 않은 업로드
// (curl 등)는 용량만 작으면 통과한다. 4000×3000 JPEG q25는 약 700KB라 2MB
// 한도를 통과하면서 브라우저에 48MB 메모리를 쓰게 만든다. 용량(비용)과
// 픽셀(부하)은 막는 대상이 달라 둘 다 검사한다 (§4.2).
//
// 실패 시 null — 알 수 없는 형식은 형식 화이트리스트(PHOTO_TYPES)가 먼저
// 걸러내므로 여기서는 예외를 던지지 않는다.

export type ImageSize = { width: number; height: number };

export function imageSize(buf: Uint8Array): ImageSize | null {
  return png(buf) ?? jpeg(buf) ?? webp(buf);
}

// PNG — 8바이트 시그니처 뒤 IHDR 청크에 폭·높이 (big-endian uint32)
function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47)
    return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

// JPEG — 0xFFD8(SOI) 뒤로 마커를 순회해 SOFn을 찾는다
function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // 마커 정렬이 어긋남 — 다음 바이트부터 다시
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // 0xFF 채움 바이트 — 마커가 아니다
      continue;
    }
    // SOFn(0xC0~0xCF)만 폭·높이를 담는다. DHT(C4)·JPG(C8)·DAC(CC)는 모양이 달라 제외
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: (b[i + 5] << 8) | b[i + 6],
        width: (b[i + 7] << 8) | b[i + 8],
      };
    }
    // SOS(0xDA) 이후는 엔트로피 데이터 — SOF가 없었다면 헤더가 비정상이다
    if (marker === 0xda) return null;
    // 길이 필드가 없는 독립 마커(TEM·RSTn·SOI·EOI) — 2바이트만 건너뛴다
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// WebP — RIFF 컨테이너의 청크 종류에 따라 세 가지 레이아웃
function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46)
    return null; // 'RIFF'
  if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50)
    return null; // 'WEBP'
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourcc === "VP8X") {
    // 확장 포맷(알파·ICC·애니메이션) — 24비트 little-endian, 1-based
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (fourcc === "VP8 ") {
    // 손실 압축 — 14비트 little-endian (상위 2비트는 스케일 힌트)
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }
  if (fourcc === "VP8L") {
    // 무손실 — 14비트가 두 바이트에 걸쳐 쪼개져 있다
    const b0 = b[21],
      b1 = b[22],
      b2 = b[23],
      b3 = b[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}
