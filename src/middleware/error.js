import { ZodError } from "zod";
import { HttpError } from "../lib/http.js";

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.path}`));
}

// Express identifies error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    const first = details[0];
    return res.status(400).json({
      error: first ? `${first.field || "Request"}: ${first.message}` : "Invalid request",
      details,
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "value";
    return res.status(409).json({ error: `That ${field} is already in use` });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ error: "Invalid identifier" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "That file is too large — the limit is 2 MB" });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end" });
}
