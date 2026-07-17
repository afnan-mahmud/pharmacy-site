/**
 * Migrates Sale.invoiceNo_1 from a sparse unique index to a partial unique
 * index scoped to string values only.
 *
 * Why this is needed: a sparse index only excludes documents where the field
 * is *missing*. recordRetailSale (src/actions/sales.ts) writes retail sales
 * with an explicit `invoiceNo: null`, so every retail sale has the field
 * *present* (as null) — the sparse index does not exclude it, and every
 * retail sale after the first collides on the single `{ invoiceNo: null }`
 * index entry with E11000.
 *
 * The fix (see src/models/Sale.ts) is a partial index filtered to
 * `invoiceNo: { $type: "string" }`, which excludes both null and missing
 * values from the uniqueness check while still enforcing uniqueness on every
 * real (wholesale) invoice number.
 *
 * Mongoose will not replace an existing index definition on its own — it
 * only calls createIndexes for indexes it doesn't see already present by
 * name, and `invoiceNo_1` already exists on Atlas with the old (wrong) spec.
 * This script must run once, out of band, to drop the old index and let the
 * new one build.
 *
 * Touches indexes only. No document data is read, written, or deleted.
 *
 * Usage: npx tsx scripts/migrate-invoice-index.ts
 * Safe to re-run: if the index already matches the desired partial-filter
 * spec, the script leaves it alone and exits without changes.
 */
import "dotenv/config";
import mongoose from "mongoose";

const COLLECTION = "sales";
const INDEX_NAME = "invoiceNo_1";
const DESIRED_PARTIAL_FILTER = { invoiceNo: { $type: "string" } };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const db = mongoose.connection.db!;
  const collection = db.collection(COLLECTION);

  console.log(`Connected. Indexes on "${COLLECTION}" before migration:`);
  const before = await collection.indexes();
  console.log(JSON.stringify(before, null, 2));

  const existing = before.find((idx) => idx.name === INDEX_NAME);

  const alreadyCorrect =
    existing?.unique === true &&
    JSON.stringify(existing.partialFilterExpression) ===
      JSON.stringify(DESIRED_PARTIAL_FILTER);

  if (alreadyCorrect) {
    console.log(
      `\n"${INDEX_NAME}" already has the desired partial-filter spec. Nothing to do.`,
    );
  } else {
    if (existing) {
      console.log(`\nDropping existing "${INDEX_NAME}" (sparse unique, no partial filter)...`);
      await collection.dropIndex(INDEX_NAME);
      console.log(`Dropped "${INDEX_NAME}".`);
    } else {
      console.log(`\nNo existing "${INDEX_NAME}" found — nothing to drop.`);
    }

    console.log(`Creating new partial unique index on invoiceNo...`);
    await collection.createIndex(
      { invoiceNo: 1 },
      { unique: true, partialFilterExpression: DESIRED_PARTIAL_FILTER, name: INDEX_NAME },
    );
    console.log(`Created "${INDEX_NAME}".`);
  }

  console.log(`\nIndexes on "${COLLECTION}" after migration:`);
  const after = await collection.indexes();
  console.log(JSON.stringify(after, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
