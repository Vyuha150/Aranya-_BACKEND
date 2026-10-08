import mongoose from "mongoose";

// Order totals, tier and last-order date are computed from the orders
// collection on read, so only contact details and the login live here.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    // Absent for records that predate customer accounts. Never returned by default.
    passwordHash: { type: String, select: false },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

customerSchema.methods.toPublic = function () {
  return { id: this.id, name: this.name, email: this.email, phone: this.phone, city: this.city };
};

export const Customer = mongoose.model("Customer", customerSchema);
