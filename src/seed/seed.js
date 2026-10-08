// Idempotent: creates whatever is missing and never overwrites existing
// documents, so it is safe to re-run after editing data in the console.
import bcrypt from "bcryptjs";
import { connectDb, disconnectDb } from "../db.js";
import { Admin } from "../models/Admin.js";
import { Product } from "../models/Product.js";
import { Settings } from "../models/Settings.js";
import { products } from "./data.js";

const insertMissing = async (Model, docs, key) => {
  const result = await Model.bulkWrite(
    docs.map((doc) => ({
      updateOne: { filter: { [key]: doc[key] }, update: { $setOnInsert: doc }, upsert: true },
    })),
  );
  return result.upsertedCount;
};

await connectDb();

console.log(`Products added: ${await insertMissing(Product, products, "slug")} of ${products.length}`);
await Settings.get();
console.log("Store settings: ready");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (!email || !password) {
  console.log("Admin account:  skipped — set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
} else if (await Admin.exists({ email })) {
  console.log(`Admin account:  ${email} already exists (password unchanged)`);
} else {
  await Admin.create({
    name: process.env.ADMIN_NAME || "Admin",
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "Owner",
  });
  console.log(`Admin account:  created ${email} (password is ADMIN_PASSWORD in .env)`);
}

await disconnectDb();
