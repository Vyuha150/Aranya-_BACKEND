import mongoose from "mongoose";

// A pending "forgot password" link. Only a hash of the token is stored, so a
// database leak can't be used to take over accounts.
const passwordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  role: { type: String, enum: ["admin", "customer"], required: true },
  tokenHash: { type: String, required: true, unique: true },
  // MongoDB deletes the document once this moment passes.
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);
