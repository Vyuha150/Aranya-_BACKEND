import mongoose from "mongoose";
import { ORDER_STATUSES, PAYMENT_METHODS } from "../lib/constants.js";
import { RETURN_STATUSES } from "../lib/returns.js";

// A customer's request to send items back. One per order.
const returnRequestSchema = new mongoose.Schema(
  {
    status: { type: String, enum: RETURN_STATUSES, default: "Requested" },
    reason: { type: String, required: true },
    note: { type: String, default: "" },
    items: [{ _id: false, slug: String, name: String, price: Number, qty: Number }],
    // Value of the returned items. Shipping is not refunded.
    amount: { type: Number, required: true },
    requestedAt: { type: Date, default: Date.now },
    resolvedAt: Date,
    // Shown to the customer, e.g. why a return was declined.
    adminNote: { type: String, default: "" },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    // The account that placed the order. Absent on orders from before accounts existed.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true, index: true },
      phone: { type: String, default: "", trim: true },
    },
    shipping: {
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pin: { type: String, default: "" },
      country: { type: String, default: "India" },
    },
    // Prices are snapshotted at purchase time so later edits don't rewrite history.
    items: [
      {
        _id: false,
        slug: String,
        sku: String,
        name: String,
        price: Number,
        qty: Number,
      },
    ],
    itemCount: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, required: true },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: "Paid", index: true },
    deliveredAt: Date,
    // Money given back, through a cancellation (the full total) or a return.
    refundedAmount: { type: Number, default: 0 },
    returnRequest: { type: returnRequestSchema, default: undefined },
    channel: { type: String, enum: ["Web", "Mobile", "Wholesale"], default: "Web" },
    // Set only by `npm run seed:demo`, so sample data can be removed cleanly.
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
