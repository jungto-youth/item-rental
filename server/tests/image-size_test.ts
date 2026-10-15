import { test, assert } from "vitest";
const assertEquals = assert.deepEqual;
import { imageInfo } from "../src/image-size.ts";
import { PNG } from "./_http.fixture.ts";

test("image headers: full PNG signature and IHDR are required and dimensions must be positive", () => {
  assertEquals(imageInfo(PNG), { width: 1, height: 1, type: "image/png" });
  for (const index of [4, 12, 15, 19, 23]) {
    const bad = PNG.slice(); bad[index] = 0;
    assertEquals(imageInfo(bad), null);
  }
  assertEquals(imageInfo(PNG.subarray(0, 24)), null);
});

test("image headers: JPEG rejects truncated/invalid SOF segments", () => {
  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xc0,0,11,8,0,1,0,1,1,1,0x11,0]);
  assertEquals(imageInfo(jpeg), { width: 1, height: 1, type: "image/jpeg" });
  assertEquals(imageInfo(jpeg.subarray(0, 12)), null);
  const bad = jpeg.slice(); bad[5] = 2;
  assertEquals(imageInfo(bad), null);
});

test("image headers: WebP compares canvas metadata with bitstream dimensions and rejects malformed containers", () => {
  const webp = new Uint8Array(48);
  webp.set(new TextEncoder().encode("RIFF"), 0);
  const dv = new DataView(webp.buffer); dv.setUint32(4, 40, true);
  webp.set(new TextEncoder().encode("WEBPVP8X"), 8); dv.setUint32(16, 10, true);
  webp.set(new TextEncoder().encode("VP8 "), 30); dv.setUint32(34, 10, true);
  webp.set([0x9d,1,0x2a], 41); dv.setUint16(44, 1, true); dv.setUint16(46, 1, true);
  assertEquals(imageInfo(webp), { width: 1, height: 1, type: "image/webp" });
  const mismatch = webp.slice(); new DataView(mismatch.buffer).setUint16(44, 4000, true);
  assertEquals(imageInfo(mismatch), null);
  const animated = webp.slice(); animated[20] = 2;
  assertEquals(imageInfo(animated), null);
  assertEquals(imageInfo(webp.subarray(0, 47)), null);
});
