import mongoose from "mongoose";
import { PRODUCT_CATEGORIES } from "../lib/constants.js";

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: PRODUCT_CATEGORIES, required: true },
    type: { type: String, default: "", trim: true },
    line: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    benefits: { type: [String], default: [] },
    usage: { type: String, default: "", trim: true },
    ingredients: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
    badge: { type: String, default: "", trim: true },
    // Path of an uploaded photo (/api/store/images/<id>). Empty for the
    // original catalogue, whose photography is bundled with the storefront.
    image: { type: String, default: "", trim: true },
    price: { type: Number, required: true, min: 0 },
    was: { type: Number, min: 0, default: null },
    cost: { type: Number, min: 0, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
    published: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Display status is derived from stock so the two can never disagree.
export function productStatus(product, lowStockThreshold) {
  if (!product.published) return "Draft";
  if (product.stock <= 0) return "Out of stock";
  if (product.stock < lowStockThreshold) return "Low stock";
  return "Live";
}

export const Product = mongoose.model("Product", productSchema);
