// Rules shared by the customer and admin sides of returns.

export const RETURN_REASONS = [
  "Damaged or defective",
  "Wrong item received",
  "Not as described",
  "No longer needed",
  "Other",
];

// Requested → Approved → Refunded, or Requested → Rejected.
export const RETURN_STATUSES = ["Requested", "Approved", "Rejected", "Refunded"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the order was delivered. Older orders predate the timestamp. */
const deliveredOn = (order) => order.deliveredAt ?? order.updatedAt;

/** Last moment a return can be requested, or null if the order was never delivered. */
export function returnDeadline(order, returnsWindowDays) {
  if (order.status !== "Delivered") return null;
  return new Date(new Date(deliveredOn(order)).getTime() + returnsWindowDays * DAY_MS);
}

/** One return per order, on delivered orders, inside the returns window. */
export function canRequestReturn(order, returnsWindowDays, now = new Date()) {
  const deadline = returnDeadline(order, returnsWindowDays);
  return !order.returnRequest && deadline !== null && now <= deadline;
}

/** What the store actually kept from an order, after cancellations and returns. */
export const netTotal = (order) => order.total - (order.refundedAmount ?? 0);

export const serializeReturn = (r) =>
  r
    ? {
        status: r.status,
        reason: r.reason,
        note: r.note,
        items: r.items,
        amount: r.amount,
        requestedAt: r.requestedAt,
        resolvedAt: r.resolvedAt ?? null,
        adminNote: r.adminNote ?? "",
      }
    : null;
