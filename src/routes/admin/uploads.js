import express, { Router } from "express";
import { Image, IMAGE_ROUTE } from "../../models/Image.js";
import { HttpError } from "../../lib/http.js";

export const uploadsRouter = Router();

// SVG is deliberately excluded: it can carry scripts.
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

// The browser sends the file itself as the request body, with its MIME type
// as the Content-Type.
uploadsRouter.post("/", express.raw({ type: ALLOWED, limit: MAX_BYTES }), async (req, res) => {
  const contentType = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.includes(contentType)) throw new HttpError(415, "Upload a JPG, PNG or WebP image");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "The image file is empty");

  const image = await Image.create({ data: req.body, contentType, size: req.body.length });
  res.status(201).json({ url: `${IMAGE_ROUTE}${image.id}` });
});
