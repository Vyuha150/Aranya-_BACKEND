import { Router } from "express";
import { z } from "zod";
import { Settings } from "../../models/Settings.js";

export const settingsRouter = Router();

// Every setting here changes how the store behaves; nothing is decorative.
const settingsSchema = z.object({
  freeShippingThreshold: z.number().min(0).max(10_000_000),
  shippingFee: z.number().min(0).max(100_000),
  lowStockThreshold: z.number().int().min(0).max(100_000),
  returnsWindowDays: z.number().int().min(0).max(365),
});

const serialize = (s) => ({
  freeShippingThreshold: s.freeShippingThreshold,
  shippingFee: s.shippingFee,
  lowStockThreshold: s.lowStockThreshold,
  returnsWindowDays: s.returnsWindowDays,
  updatedAt: s.updatedAt,
});

settingsRouter.get("/", async (_req, res) => {
  res.json({ settings: serialize(await Settings.get()) });
});

settingsRouter.put("/", async (req, res) => {
  const data = settingsSchema.parse(req.body);
  const settings = await Settings.findOneAndUpdate({ key: "store" }, data, {
    upsert: true,
    returnDocument: "after",
    runValidators: true,
  });
  res.json({ settings: serialize(settings) });
});
