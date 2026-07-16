import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const adminUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export type AdminUserDoc = InferSchemaType<typeof adminUserSchema>;

export const AdminUserModel: Model<AdminUserDoc> =
  (mongoose.models.AdminUser as Model<AdminUserDoc>) ??
  mongoose.model<AdminUserDoc>("AdminUser", adminUserSchema);
