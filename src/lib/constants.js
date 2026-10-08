export const PRODUCT_CATEGORIES = ["Powders", "Premixes", "Tonics", "Tablets", "Snacks", "Gummies", "Pastes"];
export const ORDER_STATUSES = ["Paid", "Processing", "Shipped", "Delivered", "Refunded"];
// Forward-only fulfilment flow. "Refunded" is reachable from any state.
export const ORDER_FLOW = ["Paid", "Processing", "Shipped", "Delivered"];
export const PAYMENT_METHODS = ["card", "upi", "cod"];
export const TRAFFIC_SOURCES = ["Direct", "Organic", "Social", "Email", "Referral"];
