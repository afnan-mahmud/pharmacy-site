/**
 * Migrates the `medicines` and `orders` collections from the old two-field
 * pricing model (boxPricePaisa/pataPricePaisa) to the five-field model:
 * purchasePricePaisa, wholesaleBoxPricePaisa, wholesalePataPricePaisa,
 * retailBoxPricePaisa, retailPataPricePaisa.
 *
 * medicines: boxPricePaisa -> wholesaleBoxPricePaisa (rename, same value)
 *            pataPricePaisa -> retailPataPricePaisa (rename, same value)
 *            wholesalePataPricePaisa = round(boxPricePaisa / patasPerBox)
 *            retailBoxPricePaisa = pataPricePaisa * patasPerBox
 *            purchasePricePaisa = 0 (no historical cost data exists)
 *
 * orders (every status, every line in items[]):
 *            items[].boxPricePaisa -> items[].wholesaleBoxPricePaisa (rename)
 *            items[].wholesalePataPricePaisa = 0 (no such rate existed when
 *              these orders were placed — see the design spec's Problem #5:
 *              any patas already on these lines were being billed as free,
 *              so 0 does not retroactively invent a charge for them)
 *
 * Safe to re-run: a document with no boxPricePaisa field (already migrated,
 * or created after this code shipped) is left untouched.
 *
 * Usage: npx tsx scripts/migrate-pricing-fields.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function migrateMedicines(db: mongoose.mongo.Db) {
  const collection = db.collection("medicines");
  const cursor = collection.find({ boxPricePaisa: { $exists: true } });

  let count = 0;
  for await (const doc of cursor) {
    const boxPricePaisa = doc.boxPricePaisa as number;
    const pataPricePaisa = doc.pataPricePaisa as number;
    const patasPerBox = doc.patasPerBox as number;

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          wholesaleBoxPricePaisa: boxPricePaisa,
          retailPataPricePaisa: pataPricePaisa,
          wholesalePataPricePaisa: Math.round(boxPricePaisa / patasPerBox),
          retailBoxPricePaisa: pataPricePaisa * patasPerBox,
          purchasePricePaisa: doc.purchasePricePaisa ?? 0,
        },
        $unset: { boxPricePaisa: "", pataPricePaisa: "" },
      },
    );
    count++;
  }
  console.log(`medicines: migrated ${count} document(s).`);
}

async function migrateOrders(db: mongoose.mongo.Db) {
  const collection = db.collection("orders");
  const cursor = collection.find({ "items.boxPricePaisa": { $exists: true } });

  let count = 0;
  for await (const doc of cursor) {
    const items = (doc.items as Record<string, unknown>[]).map((item) => {
      if (!("boxPricePaisa" in item)) return item;
      const { boxPricePaisa, ...rest } = item;
      return {
        ...rest,
        wholesaleBoxPricePaisa: boxPricePaisa,
        wholesalePataPricePaisa: (item.wholesalePataPricePaisa as number | undefined) ?? 0,
      };
    });
    await collection.updateOne({ _id: doc._id }, { $set: { items } });
    count++;
  }
  console.log(`orders: migrated ${count} document(s).`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  await migrateMedicines(db);
  await migrateOrders(db);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
