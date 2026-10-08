import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Admin } from "../models/Admin.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { requireCustomer, signToken } from "../middleware/auth.js";
import { Settings } from "../models/Settings.js";
import { HttpError } from "../lib/http.js";
import { newPassword } from "../lib/passwords.js";
import { RETURN_REASONS, canRequestReturn, returnDeadline, serializeReturn } from "../lib/returns.js";

// Customer accounts for the storefront. Sign-in is shared with the console
// (POST /api/auth/login); operator accounts can only be created by the seed
// script — there is no admin sign-up.
export const accountRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — try again in a few minutes" },
});

const email = z.string().trim().toLowerCase().pipe(z.email());

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password: newPassword,
});

const session = (customer) => ({
  role: "customer",
  token: signToken(customer.id, "customer"),
  customer: customer.toPublic(),
});

accountRouter.post("/register", limiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  // An email is either a customer or an operator, never both, so sign-in can
  // tell the two apart.
  if (await Admin.exists({ email: data.email })) throw new HttpError(409, "An account with this email already exists — sign in instead");
  const passwordHash = await bcrypt.hash(data.password, 12);

  let customer = await Customer.findOne({ email: data.email }).select("+passwordHash");
  if (customer?.passwordHash) throw new HttpError(409, "An account with this email already exists — sign in instead");

  if (customer) {
    // A record left by an order placed before accounts existed. Its old orders
    // stay unlinked: nobody has proven they own this address.
    customer.name = data.name;
    customer.passwordHash = passwordHash;
    await customer.save();
  } else {
    customer = await Customer.create({ name: data.name, email: data.email, passwordHash });
  }
  res.status(201).json(session(customer));
});

accountRouter.get("/me", requireCustomer, (req, res) => {
  res.json({ customer: req.customer.toPublic() });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).default(""),
  city: z.string().trim().max(80).default(""),
});

accountRouter.put("/me", requireCustomer, async (req, res) => {
  Object.assign(req.customer, profileSchema.parse(req.body));
  await req.customer.save();
  res.json({ customer: req.customer.toPublic() });
});

accountRouter.post("/password", limiter, requireCustomer, async (req, res) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword }).parse(req.body);
  const customer = await Customer.findById(req.customer._id).select("+passwordHash");
  const ok = customer?.passwordHash && (await bcrypt.compare(body.currentPassword, customer.passwordHash));
  if (!ok) throw new HttpError(400, "Current password is incorrect");
  customer.passwordHash = await bcrypt.hash(body.newPassword, 12);
  await customer.save();
  res.json({ ok: true });
});

const serializeMyOrder = (o, returnsWindowDays) => ({
  id: o.orderId,
  date: o.createdAt,
  status: o.status,
  lines: o.items,
  items: o.itemCount,
  subtotal: o.subtotal,
  shippingFee: o.shippingFee,
  total: o.total,
  paymentMethod: o.paymentMethod,
  shipping: o.shipping,
  canReturn: canRequestReturn(o, returnsWindowDays),
  returnBy: returnDeadline(o, returnsWindowDays),
  return: serializeReturn(o.returnRequest),
});

accountRouter.get("/orders", requireCustomer, async (req, res) => {
  const [orders, settings] = await Promise.all([
    Order.find({ customerId: req.customer._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Settings.get(),
  ]);
  res.json({
    orders: orders.map((o) => serializeMyOrder(o, settings.returnsWindowDays)),
    returnReasons: RETURN_REASONS,
    returnsWindowDays: settings.returnsWindowDays,
  });
});

const returnSchema = z.object({
  items: z
    .array(z.object({ slug: z.string().trim().min(1), qty: z.number().int().min(1).max(99) }))
    .min(1, "Choose at least one item to return")
    .max(50),
  reason: z.enum(RETURN_REASONS),
  note: z.string().trim().max(500).default(""),
});

accountRouter.post("/orders/:orderId/return", requireCustomer, async (req, res) => {
  const body = returnSchema.parse(req.body);
  // Scoped to the signed-in customer, so nobody can return someone else's order.
  const order = await Order.findOne({ orderId: req.params.orderId, customerId: req.customer._id });
  if (!order) throw new HttpError(404, "Order not found");

  const settings = await Settings.get();
  if (order.returnRequest) throw new HttpError(409, "A return has already been requested for this order");
  if (order.status !== "Delivered") throw new HttpError(409, "Only delivered orders can be returned");
  if (!canRequestReturn(order, settings.returnsWindowDays)) {
    throw new HttpError(409, `The ${settings.returnsWindowDays}-day return window for this order has closed`);
  }

  const ordered = new Map(order.items.map((i) => [i.slug, i]));
  const seen = new Set();
  const items = body.items.map(({ slug, qty }) => {
    const line = ordered.get(slug);
    if (!line || seen.has(slug)) throw new HttpError(400, "That item isn't part of this order");
    if (qty > line.qty) throw new HttpError(400, `You ordered ${line.qty} of ${line.name}`);
    seen.add(slug);
    // Refund at the price actually paid, taken from the order itself.
    return { slug, name: line.name, price: line.price, qty };
  });

  order.returnRequest = {
    status: "Requested",
    reason: body.reason,
    note: body.note,
    items,
    amount: items.reduce((sum, i) => sum + i.price * i.qty, 0),
    requestedAt: new Date(),
  };
  await order.save();
  res.status(201).json({ order: serializeMyOrder(order.toObject(), settings.returnsWindowDays) });
});
