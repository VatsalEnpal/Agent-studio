/**
 * Terminal image drop endpoint.
 *
 * Accepts raw image uploads from the UI (drag-and-drop on a terminal pane),
 * stores them under `<os.tmpdir()>/agent-studio-drops/<uuid>.<ext>`, and
 * returns the absolute path so the UI can inject `@<path>` into the PTY —
 * mirroring the native Claude Code CLI paste-image behavior.
 *
 * Body format (chosen): **raw binary**.
 *   - `Content-Type` MUST be one of image/png, image/jpeg, image/gif, image/webp.
 *   - Request body is the raw file bytes (NOT multipart/form-data).
 *   - Max 10 MB enforced via `express.raw({ limit: "10mb" })`.
 *
 * Security:
 *   - Save dir is scoped to a single subdirectory under os.tmpdir().
 *   - Filename is a freshly-minted UUID; extension derives from a
 *     **magic-byte sniff** of the actual body bytes, never from the
 *     Content-Type header or a user-supplied filename.
 *   - Origin/Referer header must be localhost-like (or `null` for Electron).
 *   - No path traversal is possible — no user input touches the path.
 *   - Startup sweep deletes drops older than 24 hours.
 *
 * @module server/routes/terminal-images
 */

import express, { type Request, type Response, Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

type SniffedType = "png" | "jpeg" | "gif" | "webp";

const SNIFF_TO_EXT: Record<SniffedType, string> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
};

/** Magic-byte sniff. Returns null when bytes don't match a supported format. */
function sniffImageType(buf: Buffer): SniffedType | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  // WebP: RIFF ... WEBP (52 49 46 46 __ __ __ __ 57 45 42 50)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

function getDropDir(): string {
  const dir = path.join(os.tmpdir(), "agent-studio-drops");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Async, non-blocking sweep of drops older than 24 hours.
 * Swallows all per-file and directory errors — purely best-effort.
 */
export function sweepOldDrops(): void {
  const dir = path.join(os.tmpdir(), "agent-studio-drops");
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  fs.promises
    .readdir(dir)
    .then((names) =>
      Promise.all(
        names.map(async (name) => {
          const full = path.join(dir, name);
          try {
            const stat = await fs.promises.stat(full);
            if (stat.mtimeMs < cutoff) await fs.promises.unlink(full);
          } catch {
            /* ignore per-file errors */
          }
        }),
      ),
    )
    .catch(() => {
      /* swallow directory errors */
    });
}

/**
 * CSRF mitigation: accept Origin/Referer only from localhost-like sources.
 *
 * Allowed:
 *   - Origin = http://localhost:8080 / http://127.0.0.1:8080
 *   - Origin = "null"  (Electron / file:// renderer)
 *   - Origin missing AND Referer pointing at an allowed host
 *
 * Rejected when both Origin and Referer are missing — a legitimate same-origin
 * browser fetch always attaches at least Referer in our UI context, so the
 * no-header case implies a direct curl-style request.
 */
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedHosts = ["http://localhost:8080", "http://127.0.0.1:8080"];

  if (typeof origin === "string") {
    if (origin === "null") return true;
    return allowedHosts.includes(origin);
  }
  if (typeof referer === "string") {
    try {
      const u = new URL(referer);
      return allowedHosts.includes(`${u.protocol}//${u.host}`);
    } catch {
      return false;
    }
  }
  return false;
}

export function terminalImagesRoutes(): Router {
  const router = Router();

  // Raw body parser — limited to 10 MB. We keep the Content-Type check as a
  // fast pre-filter (so non-image uploads don't even allocate a Buffer) but
  // the MAGIC-BYTE sniff below is authoritative.
  const rawParser = express.raw({
    type: (req) => {
      const ct = (req.headers["content-type"] ?? "").toString().toLowerCase().split(";")[0]?.trim();
      return !!ct && ct in CONTENT_TYPE_TO_EXT;
    },
    limit: MAX_BYTES,
  });

  router.post("/upload", (req: Request, res: Response, next) => {
    // Origin/CSRF check first — cheapest possible rejection.
    if (!isAllowedOrigin(req)) {
      res.status(403).json({ ok: false, error: "Forbidden origin" });
      return;
    }

    // Parse raw body, then validate.
    rawParser(req, res, (err) => {
      if (err) {
        // express.raw emits { type: "entity.too.large", status: 413 } etc.
        const e = err as { status?: number; type?: string; message?: string };
        if (e?.status === 413 || e?.type === "entity.too.large") {
          res.status(413).json({ ok: false, error: "Payload too large (max 10 MB)" });
          return;
        }
        res.status(400).json({ ok: false, error: e?.message ?? "Bad request" });
        return;
      }
      void handleUpload(req, res).catch(next);
    });
  });

  async function handleUpload(req: Request, res: Response): Promise<void> {
    const ct =
      (req.headers["content-type"] ?? "").toString().toLowerCase().split(";")[0]?.trim() ?? "";
    if (!ct || !(ct in CONTENT_TYPE_TO_EXT)) {
      res.status(415).json({
        ok: false,
        error: "Unsupported content type. Allowed: image/png, image/jpeg, image/gif, image/webp",
      });
      return;
    }

    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ ok: false, error: "Empty request body" });
      return;
    }

    if (body.length > MAX_BYTES) {
      res.status(413).json({ ok: false, error: "Payload too large (max 10 MB)" });
      return;
    }

    // Authoritative format check: sniff the first 12 bytes. The Content-Type
    // header cannot be trusted — a malicious client could lie to smuggle a
    // non-image payload into disk.
    const sniffed = sniffImageType(body);
    if (!sniffed) {
      res.status(400).json({
        ok: false,
        error: "Body does not appear to be a PNG/JPEG/GIF/WebP image",
      });
      return;
    }

    const ext = SNIFF_TO_EXT[sniffed];
    const dir = getDropDir();
    const filename = `${crypto.randomUUID()}.${ext}`;
    const abs = path.join(dir, filename);
    await fs.promises.writeFile(abs, body);

    res.json({ ok: true, path: abs, bytes: body.length });
  }

  return router;
}

// Fire a sweep when this module is imported — cheap, async, fire-and-forget.
sweepOldDrops();
