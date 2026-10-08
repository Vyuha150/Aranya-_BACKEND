import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    // Orders at or above this subtotal ship free; below it, shippingFee applies.
    freeShippingThreshold: { type: Number, default: 1500, min: 0 },
    shippingFee: { type: Number, default: 99, min: 0 },
    // Published products below this many units are flagged as low on stock.
    lowStockThreshold: { type: Number, default: 50, min: 0 },
    // How long after delivery a customer may request a return.
    returnsWindowDays: { type: Number, default: 14, min: 0 },
  },
  { timestamps: true },
);

// There is exactly one settings document; create it with defaults on first read.
settingsSchema.statics.get = function () {
  return this.findOneAndUpdate(
    { key: "store" },
    {},
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

export const Settings = mongoose.model("Settings", settingsSchema);
