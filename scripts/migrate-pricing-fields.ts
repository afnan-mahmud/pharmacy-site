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

  // Aggregation-pipeline update (server-side, per-document atomic — MongoDB
  // 4.2+): the transform of `items[]` runs entirely inside the update, so
  // there is no read-into-JS / write-back-whole-array window in which a
  // concurrent write to this document could be silently clobbered. Only
  // array elements that still carry `boxPricePaisa` are touched; the rest
  // pass through via $$item unchanged.
  const result = await collection.updateMany(
    { "items.boxPricePaisa": { $exists: true } },
    [
      {
        $set: {
          items: {
            $map: {
              input: "$items",
              as: "item",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$item.boxPricePaisa" }, "missing"] },
                  "$$item",
                  {
                    $mergeObjects: [
                      {
                        $arrayToObject: {
                          $filter: {
                            input: { $objectToArray: "$$item" },
                            as: "kv",
                            cond: { $ne: ["$$kv.k", "boxPricePaisa"] },
                          },
                        },
                      },
                      {
                        wholesaleBoxPricePaisa: "$$item.boxPricePaisa",
                        wholesalePataPricePaisa: {
                          $ifNull: ["$$item.wholesalePataPricePaisa", 0],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    ],
  );
  console.log(`orders: migrated ${result.modifiedCount} document(s).`);
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
