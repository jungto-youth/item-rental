// Real browser codecs + multipart requests. No OAuth credentials or remote storage needed.
// Run with: deno task test:photos (install browser first: npx playwright install chromium).
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/photo-verification", r => r.fulfill({
    contentType: "text/html", body: "<html><body></body></html>",
  }));
  await page.route("**/api/categories", r => r.fulfill({ json: { categories: [] } }));
  await page.goto(`${server.resolvedUrls.local[0]}photo-verification`);

  const compression = await page.evaluate(async () => {
    const { processPhoto } = await import("/src/utils/photo.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 4000, 3000);
    gradient.addColorStop(0, "#ff1234");
    gradient.addColorStop(1, "#1234ff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 10000; i++) {
      ctx.fillStyle = `hsl(${i % 360} 80% 50%)`;
      ctx.fillRect((i * 113) % 4000, (i * 137) % 3000, 8, 8);
    }
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", .95));
    window.fixture = new File([blob], "camera.jpg", { type: blob.type });
    const output = await processPhoto(window.fixture);
    const bitmap = await createImageBitmap(output);
    const stats = {
      before: blob.size, after: output.size,
      width: bitmap.width, height: bitmap.height, type: output.type,
    };
    bitmap.close();

    // EXIF Orientation=6: a landscape sensor image must become an upright portrait.
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const exif = new Uint8Array([
      0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0,
      73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0,
      1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const portrait = await processPhoto(new File(
      [jpeg.slice(0, 2), exif, jpeg.slice(2)], "portrait.jpg", { type: "image/jpeg" },
    ));
    const rotated = await createImageBitmap(portrait);
    stats.portrait = [rotated.width, rotated.height];
    rotated.close();

    // Simulate a browser without WebP encoding, keeping actual PNG/JPEG codecs.
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    let fallback;
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        return originalToBlob.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
      };
      fallback = await processPhoto(window.fixture);
    } finally {
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }
    stats.fallback = { type: fallback.type, name: fallback.name, size: fallback.size };

    // A detailed 12MP capture exceeds the old 5MB limit before resizing.
    const pixels = ctx.createImageData(4000, 3000);
    let seed = 123456;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const largeBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", .95));
    window.largeFixture = new File([largeBlob], "detailed-camera.jpg", { type: "image/jpeg" });
    const largeOutput = await processPhoto(window.largeFixture);
    const largeBitmap = await createImageBitmap(largeOutput);
    stats.large = { before: largeBlob.size, after: largeOutput.size, width: largeBitmap.width, height: largeBitmap.height };
    largeBitmap.close();
    // A valid JPEG with trailing padding verifies originals beyond both previous caps.
    window.unrestrictedFixture = new File([blob, new Uint8Array(25 * 1024 * 1024)], "large-original.jpg", { type: "image/jpeg" });
    const unrestricted = await processPhoto(window.unrestrictedFixture);
    stats.unrestricted = { before: window.unrestrictedFixture.size, after: unrestricted.size };
    try {
      await processPhoto(new File(["heic"], "camera.heic", { type: "image/heic" }));
    } catch (e) { stats.heicError = e.message; }

    // An oversized result must fail after one encode; quality must not be retried.
    const qualities = [];
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        qualities.push(quality);
        return originalToBlob.call(this, encoded => {
          callback(new Blob([encoded, new Uint8Array(2 * 1024 * 1024)], { type: encoded.type }));
        }, type, quality);
      };
      try {
        await processPhoto(window.fixture);
      } catch (e) { stats.outputSizeError = e.message; }
      stats.qualities = qualities;
    } finally {
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }

    canvas.width = 320;
    canvas.height = 200;
    const png = await new Promise(r => canvas.toBlob(r, "image/png"));
    const small = await processPhoto(new File([png], "small.png", { type: "image/png" }));
    const smallBitmap = await createImageBitmap(small);
    stats.small = [smallBitmap.width, smallBitmap.height];
    smallBitmap.close();
    try {
      await processPhoto(new File(["broken"], "broken.jpg", { type: "image/jpeg" }));
    } catch (e) { stats.corruptError = e.message; }
    try {
      await processPhoto(new File(["gif"], "photo.gif", { type: "image/gif" }));
    } catch (e) { stats.typeError = e.message; }
    return stats;
  });
  assert.deepEqual([compression.width, compression.height], [1600, 1200]);
  assert.ok(compression.after < compression.before);
  assert.ok(compression.after <= 2 * 1024 * 1024);
  assert.equal(compression.type, "image/webp");
  assert.deepEqual(compression.portrait, [1200, 1600]);
  assert.deepEqual(compression.small, [320, 200]);
  assert.equal(compression.fallback.type, "image/jpeg");
  assert.equal(compression.fallback.name, "camera.jpg");
  assert.ok(compression.corruptError && compression.typeError);
  assert.ok(compression.large.before > 5 * 1024 * 1024);
  assert.ok(compression.large.after <= 2 * 1024 * 1024);
  assert.deepEqual([compression.large.width, compression.large.height], [1600, 1200]);
  assert.ok(compression.unrestricted.before > 25 * 1024 * 1024);
  assert.equal(compression.unrestricted.after, compression.after);
  assert.match(compression.heicError, /HEIC\/HEIF/);
  assert.deepEqual(compression.qualities, [0.8]);
  assert.match(compression.outputSizeError, /2MB/);
  console.log("PASS real-image resizing, byte reduction, portrait rotation, no upscaling, JPEG fallback, invalid files:", compression);

  await page.evaluate(async () => {
    await import("/src/components/features/item/photo-uploader.ts");
    const uploader = document.createElement("photo-uploader");
    uploader.multiple = true;
    document.body.append(uploader);
    window.uploadEvents = [];
    uploader.addEventListener("upload", e => {
      window.uploadEvents.push(e.detail.files.length);
      window.lastUpload = e.detail.files;
    });
    window.uploader = uploader;
    await uploader.updateComplete;
    // Exercise the native capture fallback when live camera APIs are unavailable.
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  const chooser = await chooserPromise;
  assert.equal(await chooser.element().getAttribute("capture"), "environment");
  assert.equal(chooser.isMultiple(), false);
  await chooser.setFiles({ name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from("selection event test") });
  assert.deepEqual(await page.evaluate(() => window.uploadEvents), [1]);

  const galleryPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 선택", exact: false }).click();
  const gallery = await galleryPromise;
  assert.equal(await gallery.element().getAttribute("capture"), null);
  assert.equal(gallery.isMultiple(), true);
  await gallery.setFiles([]);
  assert.deepEqual(await page.evaluate(() => window.uploadEvents), [1]);
  await page.evaluate(async () => {
    window.uploader.disabled = true;
    await window.uploader.updateComplete;
  });
  assert.equal(await page.getByRole("button", { name: "사진 촬영", exact: false }).isDisabled(), true);
  await page.evaluate(async () => {
    window.uploader.entries = Array.from({ length: 3 }, (_, key) => ({ key, url: "" }));
    await window.uploader.updateComplete;
  });
  assert.equal(await page.getByRole("button", { name: "사진 촬영", exact: false }).count(), 0);
  console.log("PASS native capture fallback, multiple gallery selection, cancellation, busy and maximum-photo controls");

  await page.evaluate(async () => {
    delete navigator.mediaDevices;
    window.uploader.disabled = false;
    window.uploader.entries = [];
    await window.uploader.updateComplete;
  });
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  await page.locator("camera-capture-dialog video").waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector("camera-capture-dialog")?.shadowRoot?.querySelector("video");
    return video?.videoWidth > 0 && video?.readyState >= 2;
  });
  await page.evaluate(() => {
    window.captureStream = document.querySelector("camera-capture-dialog").shadowRoot.querySelector("video").srcObject;
  });
  await page.getByRole("button", { name: "촬영", exact: true }).click();
  await page.locator("camera-capture-dialog").waitFor({ state: "detached" });
  const liveCapture = await page.evaluate(async () => {
    const file = window.lastUpload[0];
    const image = await createImageBitmap(file);
    const { processPhoto } = await import("/src/utils/photo.ts");
    const processed = await processPhoto(file);
    const result = {
      events: window.uploadEvents, type: file.type,
      width: image.width, height: image.height,
      outputType: processed.type, outputBytes: processed.size,
      tracksStopped: window.captureStream.getTracks().every(track => track.readyState === "ended"),
    };
    image.close();
    return result;
  });
  assert.deepEqual(liveCapture.events, [1, 1]);
  assert.equal(liveCapture.type, "image/png");
  assert.ok(liveCapture.width > 0 && liveCapture.width <= 1600 && liveCapture.height > 0 && liveCapture.height <= 1600);
  assert.equal(liveCapture.outputType, "image/webp");
  assert.ok(liveCapture.outputBytes <= 2 * 1024 * 1024);
  assert.equal(liveCapture.tracksStopped, true);
  console.log("PASS live webcam preview and capture use the shared photo pipeline and stop the camera:", liveCapture);

  // Closing the item modal must also close the separate camera modal and release tracks.
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  await page.waitForFunction(() => !!document.querySelector("camera-capture-dialog")?.shadowRoot?.querySelector("video")?.srcObject);
  await page.evaluate(async () => {
    window.cancelStream = document.querySelector("camera-capture-dialog").shadowRoot.querySelector("video").srcObject;
    window.uploader.active = false;
    await window.uploader.updateComplete;
  });
  assert.equal(await page.locator("camera-capture-dialog").count(), 0);
  assert.equal(await page.evaluate(() => window.cancelStream.getTracks().every(track => track.readyState === "ended")), true);
  await page.evaluate(async () => { window.uploader.active = true; await window.uploader.updateComplete; });

  // Permission failures and missing cameras produce actionable messages without uploading.
  await page.evaluate(() => {
    window.originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); };
  });
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  await page.getByRole("alert").filter({ hasText: "카메라 사용 권한" }).waitFor();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("missing", "NotFoundError"); };
  });
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "사용할 수 있는 카메라가 없어요" }).waitFor();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.originalGetUserMedia; });
  assert.deepEqual(await page.evaluate(() => window.uploadEvents), [1, 1]);

  // A permission request resolving after cancellation must not leave a camera running.
  await page.evaluate(async () => {
    window.lateStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => window.resolvePermission = resolve);
  });
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  await page.waitForFunction(() => !!window.resolvePermission);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.evaluate(() => {
    window.resolvePermission(window.lateStream);
    navigator.mediaDevices.getUserMedia = window.originalGetUserMedia;
  });
  await page.waitForFunction(() => window.lateStream.getTracks().every(track => track.readyState === "ended"));
  assert.equal(await page.locator("camera-capture-dialog").count(), 0);
  assert.deepEqual(await page.evaluate(() => window.uploadEvents), [1, 1]);

  // Removing the uploader during a live preview must stop the stream as well.
  await page.getByRole("button", { name: "사진 촬영", exact: false }).click();
  await page.waitForFunction(() => !!document.querySelector("camera-capture-dialog")?.shadowRoot?.querySelector("video")?.srcObject);
  await page.evaluate(() => {
    window.disconnectStream = document.querySelector("camera-capture-dialog").shadowRoot.querySelector("video").srcObject;
    window.uploader.remove();
  });
  assert.equal(await page.evaluate(() => window.disconnectStream.getTracks().every(track => track.readyState === "ended")), true);
  assert.equal(await page.locator("camera-capture-dialog").count(), 0);
  console.log("PASS item close, permission denial, missing camera, late permission cancellation, and component removal release streams without uploads");

  // Observe actual multipart payloads; API responses are stubbed to avoid remote writes.
  const uploads = [];
  await page.route("**/api/admin/items", r => r.fulfill({ status: 201, json: { id: 99 } }));
  await page.route("**/api/admin/items/99/photos", async r => {
    const req = r.request();
    const form = await new Request(req.url(), {
      method: "POST", headers: { "content-type": req.headers()["content-type"] }, body: req.postDataBuffer(),
    }).formData();
    const file = form.get("file");
    uploads.push({ size: file.size, type: file.type, name: file.name });
    await r.fulfill({ status: 201, json: { id: uploads.length, url: "/api/photos/test.webp" } });
  });
  await page.route("**/api/admin/items/99", r => r.fulfill({
    json: { item: { id: 99, name: "Photo Test", total_qty: 1, categories: [] } },
  }));
  await page.route("**/api/items/99", r => r.fulfill({
    json: { item: { id: 99, photos: [{ id: 1, url: "/api/photos/test.webp" }] } },
  }));
  await page.evaluate(async () => {
    window.uploader.remove();
    await import("/src/components/features/item/item-create-dialog.ts");
    const dialog = document.createElement("item-create-dialog");
    dialog.open = true;
    document.body.append(dialog);
    await dialog.updateComplete;
    dialog.form = { ...dialog.form, name: "Photo Test" };
    // Hold the real decoder to reproduce saving while a camera photo is processing.
    const originalDecode = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      await new Promise(r => window.releaseDecode = r);
      return originalDecode(...args);
    };
    const processing = dialog.pickStaged([window.unrestrictedFixture]);
    await dialog.updateComplete;
    window.blockedSave = dialog.shadowRoot.querySelector('x-button[type="submit"]').disabled;
    window.releaseDecode();
    window.createImageBitmap = originalDecode;
    await processing;
    await dialog.updateComplete;
    await dialog.handleSave(new Event("submit", { cancelable: true }));
    dialog.remove();
  });
  assert.equal(await page.evaluate(() => window.blockedSave), true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].type, "image/webp");
  assert.equal(uploads[0].size, compression.unrestricted.after);
  await page.evaluate(async () => {
    await import("/src/components/features/item/item-edit-dialog.ts");
    const dialog = document.createElement("item-edit-dialog");
    dialog.item = { id: 99, name: "Photo Test", total_qty: 1, photos: [] };
    dialog.open = true;
    document.body.append(dialog);
    await dialog.updateComplete;
    await dialog.onPhotoUpload(new CustomEvent("upload", { detail: { files: [window.unrestrictedFixture] } }));
    if (dialog.photos.length !== 1) throw new Error("Edited photo list did not refresh");
    dialog.remove();
  });
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].size, compression.unrestricted.after);
  console.log("PASS registration/editing multipart payloads contain compressed images; save waits for processing:", uploads);
} finally {
  await browser?.close();
  await server.close();
}
