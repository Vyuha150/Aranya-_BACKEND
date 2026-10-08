import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { Admin } from "../models/Admin.js";
import { Customer } from "../models/Customer.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { requireAdmin, signToken } from "../middleware/auth.js";
import { HttpError } from "../lib/http.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { newPassword } from "../lib/passwords.js";

export const authRouter = Router();

const limiter = (limit, message) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

const loginLimiter = limiter(10, "Too many sign-in attempts — try again in a few minutes");
// Separate budgets, so asking for a link never uses up the attempts to redeem it.
const forgotLimiter = limiter(5, "Too many reset requests — try again in a few minutes");
const resetLimiter = limiter(10, "Too many attempts — try again in a few minutes");

const email = z.string().trim().toLowerCase().pipe(z.email());

const loginSchema = z.object({ email, password: z.string().min(1) });

// The single sign-in for the whole site. The caller never chooses a role: the
// account the email belongs to does, and the token is issued for that role only.
authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const denied = new HttpError(401, "Incorrect email or password");

  const admin = await Admin.findOne({ email });
  if (admin) {
    if (!(await bcrypt.compare(password, admin.passwordHash))) throw denied;
    return res.json({ role: "admin", token: signToken(admin.id, "admin"), admin: admin.toPublic() });
  }

  const customer = await Customer.findOne({ email }).select("+passwordHash");
  if (!customer?.passwordHash || !(await bcrypt.compare(password, customer.passwordHash))) throw denied;
  res.json({ role: "customer", token: signToken(customer.id, "customer"), customer: customer.toPublic() });
});

authRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin.toPublic() });
});

const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword });

authRouter.post("/password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const ok = await bcrypt.compare(currentPassword, req.admin.passwordHash);
  if (!ok) throw new HttpError(400, "Current password is incorrect");
  req.admin.passwordHash = await bcrypt.hash(newPassword, 12);
  await req.admin.save();
  res.json({ ok: true });
});

/* ── forgot password (customers and admins alike) ── */

const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

authRouter.post("/forgot", forgotLimiter, async (req, res) => {
  const { email: address } = z.object({ email }).parse(req.body);

  const admin = await Admin.findOne({ email: address });
  const customer = admin ? null : await Customer.findOne({ email: address }).select("+passwordHash");
  const role = admin ? "admin" : customer?.passwordHash ? "customer" : null;

  if (role) {
    const token = crypto.randomBytes(32).toString("hex");
    // A new request replaces any earlier link for this address.
    await PasswordReset.deleteMany({ email: address });
    await PasswordReset.create({
      email: address,
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await sendPasswordResetEmail(address, `${config.appUrl}/reset-password?token=${token}`);
  }

  // The same answer whether or not the address has an account, so this can't
  // be used to find out who is registered.
  res.json({ ok: true });
});

authRouter.post("/reset", resetLimiter, async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20).max(200), password: newPassword }).parse(req.body);
  const invalid = new HttpError(400, "This reset link is invalid or has expired — request a new one");

  // Deleting the record as it is read makes each link single-use.
  const reset = await PasswordReset.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!reset) throw invalid;

  const passwordHash = await bcrypt.hash(password, 12);
  const Model = reset.role === "admin" ? Admin : Customer;
  const updated = await Model.updateOne({ email: reset.email }, { $set: { passwordHash } });
  if (updated.matchedCount === 0) throw invalid;
  res.json({ ok: true });
});
