import { Router } from "express";
import { z } from "zod";
import { Order } from "../../models/Order.js";
import { Product } from "../../models/Product.js";
import { ORDER_FLOW } from "../../lib/constants.js";
import { HttpError, notFound } from "../../lib/http.js";
import { netTotal, serializeReturn } from "../../lib/returns.js";

export const ordersRouter = Router();

export const serializeOrder = (o) => ({
  id: o.orderId,
  customer: o.customer.name,
  email: o.customer.email,
  phone: o.customer.phone,
  city: o.shipping?.city || "",
  shipping: o.shipping,
  lines: o.items,
  items: o.itemCount,
  subtotal: o.subtotal,
  shippingFee: o.shippingFee,
  total: o.total,
  refundedAmount: o.refundedAmount ?? 0,
  net: netTotal(o),
  paymentMethod: o.paymentMethod,
  status: o.status,
  channel: o.channel,
  date: o.createdAt,
  deliveredAt: o.deliveredAt ?? null,
  return: serializeReturn(o.returnRequest),
});

ordersRouter.get("/", async (_req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ orders: orders.map(serializeOrder) });
});

const actionSchema = z.object({ action: z.enum(["advance", "cancel"]) });

ordersRouter.patch("/:orderId/status", async (req, res) => {
  const { action } = actionSchema.parse(req.body);
  const order = await Order.findOne({ orderId: req.params.orderId });
  if (!order) throw notFound("Order");

  if (action === "cancel") {
    // Only orders that haven't left the building can be cancelled. Once a
    // parcel has shipped, money goes back through a customer return instead.
    if (order.status !== "Paid" && order.status !== "Processing") {
      throw new HttpError(409, `A ${order.status.toLowerCase()} order can't be cancelled — refunds after dispatch go through a return`);
    }
    order.status = "Refunded";
    order.refundedAmount = order.total;
    await order.save();
    // The goods never left, so they go back on the shelf.
    await Promise.all(order.items.map((i) => Product.updateOne({ slug: i.slug }, { $inc: { stock: i.qty } })));
  } else {
    const i = ORDER_FLOW.indexOf(order.status);
    if (i === -1) throw new HttpError(409, "This order has been cancelled or refunded");
    if (i === ORDER_FLOW.length - 1) throw new HttpError(409, "This order has already been delivered");
    order.status = ORDER_FLOW[i + 1];
    // Starts the clock on the returns window.
    if (order.status === "Delivered") order.deliveredAt = new Date();
    await order.save();
  }

  res.json({ order: serializeOrder(order.toObject()) });
});

const returnActionSchema = z.object({
  action: z.enum(["approve", "reject", "refund"]),
  note: z.string().trim().max(500).default(""),
});

ordersRouter.patch("/:orderId/return", async (req, res) => {
  const { action, note } = returnActionSchema.parse(req.body);
  const order = await Order.findOne({ orderId: req.params.orderId });
  if (!order) throw notFound("Order");
  const request = order.returnRequest;
  if (!request) throw new HttpError(409, "This order has no return request");

  if (action === "refund") {
    // The refund is the last step: the request must have been approved first.
    if (request.status !== "Approved") throw new HttpError(409, "Approve the return before refunding it");
    request.status = "Refunded";
    order.refundedAmount = request.amount;
    // Everything came back: the order as a whole is refunded.
    const returnedUnits = request.items.reduce((sum, i) => sum + i.qty, 0);
    if (returnedUnits >= order.itemCount) order.status = "Refunded";
  } else {
    if (request.status !== "Requested") throw new HttpError(409, `This return has already been ${request.status.toLowerCase()}`);
    if (action === "reject" && !note) throw new HttpError(400, "Tell the customer why the return was declined");
    request.status = action === "approve" ? "Approved" : "Rejected";
  }
  if (note) request.adminNote = note;
  if (request.status !== "Approved") request.resolvedAt = new Date();

  await order.save();
  res.json({ order: serializeOrder(order.toObject()) });
});
