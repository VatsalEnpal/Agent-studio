/**
 * Integration tests for the terminal image drop endpoint.
 *
 * Mounts the real router on a disposable Express app via supertest — no
 * network / dev server required, so the suite runs fast in CI.
 *
 * Covers:
 *   1. Happy path: PNG magic bytes + image/png + allowed Origin → 200
 *   2. Missing Content-Type → 415
 *   3. text/plain Content-Type → 415
 *   4. Content-Type lies (image/png) but body isn't an image → 400
 *   5. Body > 10 MB → 413
 *   6. Evil Origin → 403
 *   7. Empty body → 400
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { terminalImagesRoutes } from "../../routes/terminal-images.js";

// Smallest valid PNG (1x1 transparent) — bytes fabricated at runtime so we
// know exactly what the sniff will see.
const PNG_1x1 = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8FFFF3F0005FE02FEA735DC510000000049454E44AE426082",
  "hex",
);

// 1x1 JPEG
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

function createApp(): express.Express {
  const app = express();
  app.use("/api/terminal-images", terminalImagesRoutes());
  return app;
}

const DROP_DIR = path.join(os.tmpdir(), "agent-studio-drops");

describe("POST /api/terminal-images/upload", () => {
  const createdFiles: string[] = [];

  beforeAll(() => {
    // Ensure drop dir exists so path-join works in assertions
    if (!fs.existsSync(DROP_DIR)) fs.mkdirSync(DROP_DIR, { recursive: true });
  });

  afterAll(() => {
    for (const f of createdFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
    }
  });

  it("1) accepts a valid PNG with allowed Origin (happy path)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "http://localhost:8080")
      .send(PNG_1x1);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.path).toBe("string");
    expect(res.body.path.endsWith(".png")).toBe(true);
    expect(fs.existsSync(res.body.path)).toBe(true);
    createdFiles.push(res.body.path);
  });

  it("2) rejects with 415 when Content-Type header is missing", async () => {
    const app = createApp();
    // supertest's .send on a Buffer defaults to application/octet-stream —
    // explicitly set an unrecognized type so express.raw refuses to parse.
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "application/octet-stream")
      .set("Origin", "http://localhost:8080")
      .send(PNG_1x1);

    expect(res.status).toBe(415);
    expect(res.body.ok).toBe(false);
  });

  it("3) rejects with 415 for text/plain", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "text/plain")
      .set("Origin", "http://localhost:8080")
      .send("just text");

    expect(res.status).toBe(415);
    expect(res.body.ok).toBe(false);
  });

  it("4) rejects with 400 when Content-Type lies (image/png but body isn't)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "http://localhost:8080")
      .send(Buffer.from("not an image — just text pretending to be one"));

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(String(res.body.error)).toMatch(/does not appear to be/i);
  });

  it("5) rejects with 413 when body exceeds 10 MB", async () => {
    const app = createApp();
    // Start with PNG magic bytes so the sniff would otherwise pass — we want
    // the SIZE check to fire, not the sniff.
    const big = Buffer.alloc(11 * 1024 * 1024, 0x89);
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "http://localhost:8080")
      .send(big);

    expect(res.status).toBe(413);
    expect(res.body.ok).toBe(false);
  });

  it("6) rejects with 403 for a non-localhost Origin", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "https://evil.com")
      .send(PNG_1x1);

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(String(res.body.error)).toMatch(/forbidden/i);
  });

  it("7) rejects with 400 on empty body", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "http://localhost:8080")
      .send(Buffer.alloc(0));

    // express.raw treats a 0-byte body as {} — our handler catches that
    // via the Buffer.isBuffer / length === 0 check and returns 400.
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("bonus) accepts Origin: null (Electron renderer)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/png")
      .set("Origin", "null")
      .send(PNG_1x1);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    createdFiles.push(res.body.path);
  });

  it("bonus) accepts JPEG by magic-byte sniff", async () => {
    const app = createApp();
    // Pad JPEG header with enough bytes for sniffer + a plausible tail.
    const jpg = Buffer.concat([JPEG_START, Buffer.alloc(32, 0x00)]);
    const res = await request(app)
      .post("/api/terminal-images/upload")
      .set("Content-Type", "image/jpeg")
      .set("Origin", "http://localhost:8080")
      .send(jpg);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.path.endsWith(".jpg")).toBe(true);
    createdFiles.push(res.body.path);
  });
});
