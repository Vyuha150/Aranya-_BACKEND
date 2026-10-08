import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { Admin } from "../models/Admin.js";
import { Customer } from "../models/Customer.js";
import { HttpError } from "../lib/http.js";

// Every token carries the role it was issued for. A customer token is never
// accepted by the console, and an admin token is never accepted by the shop.
export const signToken = (id, role) =>
  jwt.sign({ sub: String(id), role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

function readToken(req, role) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Sign in required");

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, "Session expired — sign in again");
  }
  if (payload.role !== role) throw new HttpError(401, "Sign in required");
  return payload;
}

export async function requireAdmin(req, _res, next) {
  const payload = readToken(req, "admin");
  const admin = await Admin.findById(payload.sub);
  if (!admin) throw new HttpError(401, "Account no longer exists");
  req.admin = admin;
  next();
}

export async function requireCustomer(req, _res, next) {
  const payload = readToken(req, "customer");
  const customer = await Customer.findById(payload.sub);
  if (!customer) throw new HttpError(401, "Account no longer exists");
  req.customer = customer;
  next();
}
