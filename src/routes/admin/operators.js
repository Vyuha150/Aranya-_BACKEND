import { Router } from "express";
import { z } from "zod";
import { Admin } from "../../models/Admin.js";
import { Customer } from "../../models/Customer.js";
import { HttpError, notFound } from "../../lib/http.js";

// Who has access to the admin panel. There is no admin sign-up: an existing
// admin promotes a customer account, and can demote it again.
export const operatorsRouter = Router();

operatorsRouter.get("/", async (_req, res) => {
  const admins = await Admin.find().sort({ createdAt: 1 });
  res.json({ operators: admins.map((a) => a.toPublic()) });
});

// Promote: the person keeps their email and password and signs in to the
// admin panel from now on. Their customer record is kept, so their order
// history is still there if they are ever demoted.
operatorsRouter.post("/", async (req, res) => {
  const { customerId } = z.object({ customerId: z.string().regex(/^[a-f0-9]{24}$/) }).parse(req.body);
  const customer = await Customer.findById(customerId).select("+passwordHash");
  if (!customer) throw notFound("Customer");
  if (!customer.passwordHash) throw new HttpError(409, "This customer has no login yet, so they can't be made an admin");
  if (await Admin.exists({ email: customer.email })) throw new HttpError(409, `${customer.name} is already an admin`);

  const admin = await Admin.create({
    name: customer.name,
    email: customer.email,
    passwordHash: customer.passwordHash,
    role: "Editor",
  });
  res.status(201).json({ operator: admin.toPublic() });
});

// Demote: back to an ordinary customer account, same email and password.
operatorsRouter.delete("/:id", async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw notFound("Admin");
  if (admin.id === req.admin.id) throw new HttpError(409, "You can't remove your own admin access");
  if ((await Admin.countDocuments()) <= 1) throw new HttpError(409, "The store needs at least one admin");

  // Carry the current password over, in case it was changed while an admin.
  await Customer.updateOne(
    { email: admin.email },
    { $set: { passwordHash: admin.passwordHash }, $setOnInsert: { name: admin.name, email: admin.email } },
    { upsert: true },
  );
  await admin.deleteOne();
  res.status(204).end();
});
