import { Router } from "express";
import { Customer } from "../../models/Customer.js";
import { Admin } from "../../models/Admin.js";
import { Order } from "../../models/Order.js";
import { notFound } from "../../lib/http.js";
import { serializeOrder } from "./orders.js";

export const customersRouter = Router();

// Tiers are derived from buying history rather than set by hand.
const tierFor = (orders, ltv) => (orders >= 5 || ltv >= 25000 ? "VIP" : orders >= 2 ? "Returning" : "New");

customersRouter.get("/", async (_req, res) => {
  const [customers, admins, stats] = await Promise.all([
    Customer.find().select("+passwordHash").sort({ createdAt: -1 }).lean(),
    Admin.find().select("email").lean(),
    Order.aggregate([
      {
        $group: {
          _id: "$customer.email",
          orders: { $sum: 1 },
          // Net of cancellations and returns.
          ltv: { $sum: { $subtract: ["$total", { $ifNull: ["$refundedAmount", 0] }] } },
          lastOrder: { $max: "$createdAt" },
        },
      },
    ]),
  ]);
  const byEmail = new Map(stats.map((s) => [s._id, s]));
  const adminEmails = new Set(admins.map((a) => a.email));

  res.json({
    customers: customers.map((c) => {
      const s = byEmail.get(c.email) || { orders: 0, ltv: 0, lastOrder: null };
      return {
        id: String(c._id),
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        // Guests are records left by orders placed before accounts existed.
        hasAccount: !!c.passwordHash,
        isAdmin: adminEmails.has(c.email),
        tier: tierFor(s.orders, s.ltv),
        orders: s.orders,
        ltv: s.ltv,
        lastOrder: s.lastOrder,
        createdAt: c.createdAt,
      };
    }),
  });
});

customersRouter.get("/:id/orders", async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw notFound("Customer");
  const orders = await Order.find({ "customer.email": customer.email }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({ orders: orders.map(serializeOrder) });
});

// Removes the customer record and with it their login. Their orders stay,
// since they are the store's financial history.
customersRouter.delete("/:id", async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) throw notFound("Customer");
  res.status(204).end();
});
