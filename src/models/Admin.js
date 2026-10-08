import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["Owner", "Editor"], default: "Owner" },
  },
  { timestamps: true },
);

adminSchema.methods.toPublic = function () {
  return { id: this.id, name: this.name, email: this.email, role: this.role, createdAt: this.createdAt };
};

export const Admin = mongoose.model("Admin", adminSchema);
