import { Router } from "express";
import { z } from "zod";
import { Product, productStatus } from "../../models/Product.js";
import { Image, IMAGE_ROUTE, hostedImageId } from "../../models/Image.js";
import { Order } from "../../models/Order.js";
import { Settings } from "../../models/Settings.js";
import { PRODUCT_CATEGORIES } from "../../lib/constants.js";
import { notFound } from "../../lib/http.js";
import { daysAgo } from "../../lib/dates.js";

export const productsRouter = Router();

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
    .max(80)
    .optional(),
  sku: z.string().trim().min(3).max(40),
  category: z.enum(PRODUCT_CATEGORIES),
  description: z.string().trim().max(1000).default(""),
  benefits: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  usage: z.string().trim().max(600).default(""),
  ingredients: z.string().trim().max(600).default(""),
  // Only photos uploaded through the console are accepted.
  image: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[a-f0-9]{24}$/.test(hostedImageId(v) ?? ""), "Upload the image again")
    .default(""),
  price: z.number().min(0).max(10_000_000),
  was: z.number().min(0).max(10_000_000).nullable().default(null),
  cost: z.number().min(0).max(10_000_000).default(0),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  published: z.boolean().default(false),
});

const serialize = (p, sold30d, lowStockThreshold) => ({
  id: String(p._id),
  slug: p.slug,
  sku: p.sku,
  name: p.name,
  category: p.category,
  description: p.description,
  benefits: p.benefits ?? [],
  usage: p.usage ?? "",
  ingredients: p.ingredients ?? "",
  image: p.image ?? "",
  price: p.price,
  was: p.was ?? null,
  cost: p.cost,
  stock: p.stock,
  published: p.published,
  status: productStatus(p, lowStockThreshold),
  sold30d,
  createdAt: p.createdAt,
});

async function unitsSold30d() {
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: daysAgo(30) }, status: { $ne: "Refunded" } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.slug", units: { $sum: "$items.qty" } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.units]));
}

/** Delete a photo nothing points at any more. */
async function dropImage(url) {
  const id = hostedImageId(url);
  if (id && !(await Product.exists({ image: `${IMAGE_ROUTE}${id}` }))) await Image.deleteOne({ _id: id });
}

productsRouter.get("/", async (_req, res) => {
  const [products, sold, settings] = await Promise.all([
    Product.find().sort({ createdAt: -1 }).lean(),
    unitsSold30d(),
    Settings.get(),
  ]);
  res.json({
    products: products.map((p) => serialize(p, sold.get(p.slug) || 0, settings.lowStockThreshold)),
    lowStockThreshold: settings.lowStockThreshold,
  });
});

productsRouter.post("/", async (req, res) => {
  const data = productSchema.parse(req.body);
  const product = await Product.create({ ...data, slug: data.slug || slugify(data.name) });
  const settings = await Settings.get();
  res.status(201).json({ product: serialize(product.toObject(), 0, settings.lowStockThreshold) });
});

productsRouter.put("/:id", async (req, res) => {
  // The slug is the product's public URL and the key orders reference, so it
  // is fixed once created.
  const { slug: _ignored, ...data } = productSchema.parse(req.body);
  const before = await Product.findByIdAndUpdate(req.params.id, data, { runValidators: true }).lean();
  if (!before) throw notFound("Product");
  if (before.image !== data.image) await dropImage(before.image);

  const [product, sold, settings] = await Promise.all([
    Product.findById(req.params.id).lean(),
    unitsSold30d(),
    Settings.get(),
  ]);
  res.json({ product: serialize(product, sold.get(product.slug) || 0, settings.lowStockThreshold) });
});

productsRouter.delete("/:id", async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw notFound("Product");
  await dropImage(product.image);
  res.status(204).end();
});
