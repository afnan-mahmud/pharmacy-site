/**
 * Backfills the `retailcustomers` collection from existing `retail` Sale
 * history, so the phone-number autocomplete and the Khuchra Baki due ledger
 * are not blind to customers who bought before RetailCustomer existed.
 *
 * For each distinct non-empty buyerPhone on a retail sale, upserts a
 * RetailCustomer with the name from that phone's most recent sale — the
 * same "one phone, one remembered name" rule the retail counter itself
 * uses.
 *
 * DEPLOY ORDER: should run before this branch's code goes live, but unlike
 * migrate-pricing-fields.ts the app does not fail without it — a customer
 * who hasn't bought again since this shipped simply won't appear in the
 * autocomplete or due ledger yet, not crash anything. Safe to re-run: every
 * run recomputes the same latest-name-per-phone result from Sale history
 * and upserts it.
 *
 * Usage: npx tsx scripts/backfill-retail-customers.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const sales = db.collection("sales");
  const retailCustomers = db.collection("retailcustomers");

  const rows = await sales
    .aggregate<{ _id: string; name: string }>([
      { $match: { type: "retail", buyerPhone: { $gt: "" } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$buyerPhone", name: { $first: "$buyerName" } } },
    ])
    .toArray();

  let count = 0;
  for (const row of rows) {
    await retailCustomers.updateOne(
      { phone: row._id },
      { $set: { phone: row._id, name: row.name } },
      { upsert: true },
    );
    count++;
  }
  console.log(`retailcustomers: upserted ${count} document(s) from retail sale history.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
