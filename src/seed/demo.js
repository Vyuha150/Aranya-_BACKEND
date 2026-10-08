// Optional sample data so the console's charts have something to draw before
// real orders arrive. Everything created here is flagged `demo: true`.
//
//   npm run seed:demo          add ~60 days of sample orders and customers
//   npm run seed:demo:clear    remove them again
import { connectDb, disconnectDb } from "../db.js";
import { Order } from "../models/Order.js";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";

const people = [
  ["Aanya Mehta", "Mumbai", "Maharashtra"],
  ["Rohan Pillai", "Bengaluru", "Karnataka"],
  ["Ishita Sharma", "Pune", "Maharashtra"],
  ["Kabir Nair", "Kochi", "Kerala"],
  ["Meera Iyer", "Chennai", "Tamil Nadu"],
  ["Arjun Sethi", "Delhi", "Delhi"],
  ["Tara Krishnan", "Hyderabad", "Telangana"],
  ["Dev Bhatt", "Ahmedabad", "Gujarat"],
  ["Nisha Rao", "Vijayawada", "Andhra Pradesh"],
  ["Sameer Khan", "Lucknow", "Uttar Pradesh"],
  ["Lakshmi Reddy", "Visakhapatnam", "Andhra Pradesh"],
  ["Farah Ali", "Jaipur", "Rajasthan"],
].map(([name, city, state]) => ({
  name,
  city,
  state,
  // example.com is reserved for documentation, so these can never reach a real inbox.
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
}));

const pick = (list) => list[Math.floor(Math.random() * list.length)];

await connectDb();

if (process.argv.includes("--clear")) {
  const orders = await Order.deleteMany({ demo: true });
  const customers = await Customer.deleteMany({ demo: true });
  console.log(`Removed ${orders.deletedCount} demo orders and ${customers.deletedCount} demo customers`);
} else if (await Order.exists({ demo: true })) {
  console.log("Demo data already present — run `npm run seed:demo:clear` first to regenerate it");
} else {
  const products = await Product.find({ published: true }).lean();
  if (products.length === 0) throw new Error("No products found — run `npm run seed` first");

  const now = Date.now();
  const orders = [];
  for (let i = 0; i < 90; i++) {
    const person = pick(people);
    const ageMs = Math.random() ** 1.6 * 60 * 24 * 60 * 60 * 1000;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const lines = new Map();
    for (let n = 1 + Math.floor(Math.random() * 3); n > 0; n--) {
      const p = pick(products);
      lines.set(p.slug, { slug: p.slug, sku: p.sku, name: p.name, price: p.price, qty: 1 + Math.floor(Math.random() * 2) });
    }
    const items = [...lines.values()];
    const subtotal = items.reduce((sum, l) => sum + l.price * l.qty, 0);
    const shippingFee = subtotal >= 1500 ? 0 : 99;
    const paymentMethod = pick(["card", "upi", "upi", "cod"]);
    const status =
      Math.random() < 0.05
        ? "Refunded"
        : ageDays > 7
          ? "Delivered"
          : ageDays > 3
            ? "Shipped"
            : ageDays > 1 || paymentMethod === "cod"
              ? "Processing"
              : "Paid";
    const createdAt = new Date(now - ageMs);

    orders.push({
      orderId: `ARN-D${String(10000 + i)}`,
      customer: { name: person.name, email: person.email, phone: "" },
      shipping: { address: "", city: person.city, state: person.state, pin: "", country: "India" },
      items,
      itemCount: items.reduce((sum, l) => sum + l.qty, 0),
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      refundedAmount: status === "Refunded" ? subtotal + shippingFee : 0,
      deliveredAt: status === "Delivered" ? new Date(now - ageMs + 3 * 24 * 60 * 60 * 1000) : undefined,
      paymentMethod,
      status,
      channel: "Web",
      demo: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  // `timestamps: false` keeps the back-dated createdAt values.
  await Order.insertMany(orders, { timestamps: false });
  await Customer.bulkWrite(
    people.map((p) => ({
      updateOne: {
        filter: { email: p.email },
        update: { $setOnInsert: { name: p.name, email: p.email, city: p.city, demo: true } },
        upsert: true,
      },
    })),
  );
  console.log(`Added ${orders.length} demo orders across ${people.length} demo customers`);
}

await disconnectDb();
