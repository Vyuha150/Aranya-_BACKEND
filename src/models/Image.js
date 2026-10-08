import mongoose from "mongoose";

// Product photos are kept in the database so they survive redeploys on hosts
// with an ephemeral filesystem. Uploads are capped at 2 MB.
const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);

export const IMAGE_ROUTE = "/api/store/images/";

/** The id of an image we host, or null for external URLs and empty values. */
export const hostedImageId = (url) =>
  typeof url === "string" && url.startsWith(IMAGE_ROUTE) ? url.slice(IMAGE_ROUTE.length) : null;

export const Image = mongoose.model("Image", imageSchema);
