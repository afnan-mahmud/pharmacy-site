/**
 * Creates the initial admin account and settings document.
 * Run once against a fresh database: npx tsx scripts/seed.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { AdminUserModel } from "../src/models/AdminUser";
import { SettingsModel } from "../src/models/Settings";
import { hashPassword } from "../src/lib/auth";

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const existing = await AdminUserModel.findOne({ username: "owner" });
  if (existing) {
    console.log("Admin user already exists, skipping.");
  } else {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        "SEED_ADMIN_PASSWORD is not set. Choose a password and set it before seeding.",
      );
    }
    await AdminUserModel.create({
      username: "owner",
      passwordHash: await hashPassword(password),
      name: "Owner",
    });
    console.log("Created admin user 'owner'.");
  }

  await SettingsModel.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log("Settings ready.");

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
