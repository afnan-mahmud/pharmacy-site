/**
 * Fills `searchTokens` on every medicine that predates the field.
 *
 * Medicine search no longer queries `name` and `genericName` with an
 * unanchored case-insensitive regex — that could not use an index, so every
 * keystroke in the picker scanned the collection. It now prefix-matches an
 * indexed array of words derived from the name, generic name and company
 * (see src/lib/searchTokens.ts). A medicine written before that field
 * existed has an empty array and is therefore findable by nothing.
 *
 * DEPLOY ORDER: run this right after deploying the code. Nothing crashes
 * without it — the medicines list, the sale pickers and the buyer portal all
 * still load — but a medicine with no tokens cannot be found by typing its
 * name, which on the sale counter looks exactly like the medicine having
 * been deleted.
 *
 * Safe to re-run: tokens are derived from fields the script only reads, so
 * every run recomputes the same array. Also safe to run on a fresh database
 * seeded by scripts/seed.ts, where it simply finds nothing to do.
 *
 * Usage: npx tsx scripts/backfill-search-tokens.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { searchTokensFor } from "../src/lib/searchTokens";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const medicines = db.collection("medicines");

  // Every medicine, not just the ones missing tokens: a rename made while an
  // older build was live would have left stale words behind, and recomputing
  // from the current name is how those get corrected.
  const cursor = medicines.find(
    {},
    { projection: { name: 1, genericName: 1, company: 1, searchTokens: 1 } },
  );

  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const tokens = searchTokensFor(doc.name, doc.genericName, doc.company);

    const current: string[] = Array.isArray(doc.searchTokens)
      ? doc.searchTokens
      : [];
    const unchanged =
      current.length === tokens.length &&
      current.every((token, i) => token === tokens[i]);
    if (unchanged) continue;

    await medicines.updateOne(
      { _id: doc._id },
      { $set: { searchTokens: tokens } },
    );
    updated += 1;
  }

  console.log(`Scanned ${scanned} medicines, updated ${updated}.`);

  // The multikey index is what makes the prefix query an index scan rather
  // than the collection scan this replaced, so build it here rather than
  // leaving it to whenever Mongoose next decides to sync indexes.
  await medicines.createIndex({ searchTokens: 1 });
  console.log("searchTokens index ready.");

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
