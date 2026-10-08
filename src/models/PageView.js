import mongoose from "mongoose";
import { TRAFFIC_SOURCES } from "../lib/constants.js";

const pageViewSchema = new mongoose.Schema({
  path: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  source: { type: String, enum: TRAFFIC_SOURCES, default: "Direct" },
  // Raw hits are only needed for recent reporting; drop them after 120 days.
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 120 },
});

export const PageView = mongoose.model("PageView", pageViewSchema);
