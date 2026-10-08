import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Product } from "../models/Product.js";
import { Image } from "../models/Image.js";
import { Order } from "../models/Order.js";
import { Message } from "../models/Message.js";
import { PageView } from "../models/PageView.js";
import { Settings } from "../models/Settings.js";
import { requireCustomer } from "../middleware/auth.js";
import { PAYMENT_METHODS, TRAFFIC_SOURCES } from "../lib/constants.js";
import { HttpError, notFound } from "../lib/http.js";

// Endpoints used by the storefront. Browsing is public; ordering needs a
// signed-in customer.
export const storeRouter = Router();

const limiter = (limit, windowMs, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

storeRouter.get("/catalog", async (_req, res) => {
  const [products, settings] = await Promise.all([
    // Oldest first, so the original range leads and new arrivals follow.
    Product.find({ published: true }).sort({ createdAt: 1, _id: 1 }).lean(),
    Settings.get(),
  ]);
  res.json({
    products: products.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      type: p.type,
      line: p.line,
      description: p.description,
      benefits: p.benefits ?? [],
      usage: p.usage ?? "",
      ingredients: p.ingredients ?? "",
      tags: p.tags ?? [],
      badge: p.badge || null,
      image: p.image || null,
      price: p.price,
      was: p.was ?? null,
      inStock: p.stock > 0,
    })),
    shipping: { freeThreshold: settings.freeShippingThreshold, fee: settings.shippingFee },
  });
});

storeRouter.get("/images/:id", async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) throw notFound("Image");
  const image = await Image.findById(req.params.id).lean();
  if (!image) throw notFound("Image");
  res.set({
    "Content-Type": image.contentType,
    // An image id never changes content, so browsers may keep it for good.
    "Cache-Control": "public, max-age=31536000, immutable",
    // The storefront is served from a different origin than the API.
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  res.send(Buffer.from(image.data.buffer ?? image.data));
});

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(5).max(20),
  }),
  shipping: z.object({
    address: z.string().trim().min(3).max(300),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    pin: z.string().trim().min(3).max(12),
    country: z.string().trim().min(2).max(60).default("India"),
  }),
  paymentMethod: z.enum(PAYMENT_METHODS),
  items: z
    .array(z.object({ slug: z.string().trim().min(1), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
});

const newOrderId = () => `ARN-${Math.floor(100000 + Math.random() * 900000)}`;

const restock = (lines) =>
  Promise.all(lines.map((l) => Product.updateOne({ slug: l.slug }, { $inc: { stock: l.qty } })));

storeRouter.post(
  "/orders",
  limiter(20, 15 * 60 * 1000, "Too many orders from this address — try again shortly"),
  requireCustomer,
  async (req, res) => {
    const body = orderSchema.parse(req.body);
    const account = req.customer;

    // Collapse repeated slugs so stock is checked against the full quantity.
    const wanted = new Map();
    for (const { slug, qty } of body.items) wanted.set(slug, (wanted.get(slug) || 0) + qty);

    const products = await Product.find({ slug: { $in: [...wanted.keys()] }, published: true }).lean();
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    for (const slug of wanted.keys()) {
      if (!bySlug.has(slug)) throw new HttpError(400, `"${slug}" is no longer available`);
    }

    // Reserve stock one line at a time; the $gte guard makes each step atomic,
    // so two shoppers can never both buy the last unit.
    const reserved = [];
    for (const [slug, qty] of wanted) {
      const hit = await Product.updateOne({ slug, published: true, stock: { $gte: qty } }, { $inc: { stock: -qty } });
      if (hit.modifiedCount === 0) {
        await restock(reserved);
        const left = (await Product.findOne({ slug }).select("stock").lean())?.stock ?? 0;
        throw new HttpError(
          409,
          left > 0
            ? `Only ${left} of ${bySlug.get(slug).name} left in stock`
            : `${bySlug.get(slug).name} is out of stock`,
        );
      }
      reserved.push({ slug, qty });
    }

    // Totals come from the database, never from the browser.
    const items = reserved.map(({ slug, qty }) => {
      const p = bySlug.get(slug);
      return { slug, sku: p.sku, name: p.name, price: p.price, qty };
    });
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const settings = await Settings.get();
    const shippingFee = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee;

    const doc = {
      customerId: account._id,
      // The email is the account's, so an order can't be filed under someone else.
      customer: { name: body.customer.name, email: account.email, phone: body.customer.phone },
      shipping: body.shipping,
      items,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      paymentMethod: body.paymentMethod,
      // No payment gateway is wired up yet: prepaid methods are recorded as
      // paid, cash-on-delivery goes straight to fulfilment.
      status: body.paymentMethod === "cod" ? "Processing" : "Paid",
      channel: "Web",
    };

    let order;
    try {
      for (let attempt = 0; !order; attempt++) {
        try {
          order = await Order.create({ ...doc, orderId: newOrderId() });
        } catch (err) {
          if (err?.code !== 11000 || attempt >= 4) throw err;
        }
      }
    } catch (err) {
      await restock(reserved);
      throw err;
    }

    // Remember the latest contact details for the next checkout.
    account.phone = body.customer.phone;
    account.city = body.shipping.city;
    await account.save();

    res.status(201).json({
      orderId: order.orderId,
      status: order.status,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
    });
  },
);

const messageSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  subject: z.string().trim().max(120).default(""),
  message: z.string().trim().min(5).max(5000),
});

storeRouter.post(
  "/messages",
  limiter(5, 15 * 60 * 1000, "Too many messages — try again in a few minutes"),
  async (req, res) => {
    await Message.create(messageSchema.parse(req.body));
    res.status(201).json({ ok: true });
  },
);

const trackSchema = z.object({
  path: z.string().trim().min(1).max(200).startsWith("/"),
  sessionId: z.string().trim().min(8).max(64),
  source: z.enum(TRAFFIC_SOURCES).default("Direct"),
});

storeRouter.post("/track", limiter(120, 60 * 1000, "Slow down"), async (req, res) => {
  const hit = trackSchema.parse(req.body);
  if (!hit.path.startsWith("/admin")) await PageView.create(hit);
  res.status(204).end();
});
