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
 *   - Filename is a freshly-minted UUID; extension derives from the
 *     Content-Type header, never from a user-supplied filename.
 *   - No path traversal is possible — no user input touches the path.
 *
 * @module server/routes/terminal-images
 */

import express, { Router } from "express";
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

function getDropDir(): string {
  const dir = path.join(os.tmpdir(), "agent-studio-drops");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function terminalImagesRoutes(): Router {
  const router = Router();

  // Raw body parser — limited to 10 MB, accepts only the four image types.
  const rawParser = express.raw({
    type: (req) => {
      const ct = (req.headers["content-type"] ?? "").toString().toLowerCase().split(";")[0]?.trim();
      return !!ct && ct in CONTENT_TYPE_TO_EXT;
    },
    limit: MAX_BYTES,
  });

  router.post("/upload", rawParser, (req, res) => {
    try {
      const ct =
        (req.headers["content-type"] ?? "").toString().toLowerCase().split(";")[0]?.trim() ?? "";
      const ext = CONTENT_TYPE_TO_EXT[ct];
      if (!ext) {
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

      const dir = getDropDir();
      const filename = `${crypto.randomUUID()}.${ext}`;
      const abs = path.join(dir, filename);
      fs.writeFileSync(abs, body);

      res.json({ ok: true, path: abs, bytes: body.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
