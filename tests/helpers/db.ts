import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

/**
 * Starts an in-memory MongoDB replica set for the current test file and points
 * Mongoose at it. Replica-set mode (not the simpler standalone) is required
 * because the system uses multi-document transactions.
 */
export function setupTestDb(): void {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    // Server actions under test call `connectDb()` (src/lib/db.ts), which is
    // gated on process.env.MONGODB_URI and throws "MONGODB_URI is not set"
    // if it's absent — which it is here, since we connect Mongoose directly
    // to the in-memory replica set above rather than going through that
    // helper. connectDb() short-circuits and returns immediately whenever
    // `globalThis._mongooseCache.conn` is already set, so seeding that field
    // with our already-open connection makes connectDb() a no-op instead of
    // throwing, letting any test that calls setupTestDb() exercise server
    // actions with no further setup.
    //
    // connectDb() closures over the cache object at import time and only
    // ever mutates its fields in place, so we must set fields on the
    // existing object (creating it if it doesn't exist yet) rather than
    // replacing globalThis._mongooseCache wholesale — a fresh object
    // wouldn't be visible to that closure. (Same constraint documented in
    // tests/lib/db.test.ts's resetMongooseCache, which pokes this same
    // global for the equivalent reason of testing connectDb() directly.)
    const cache = globalWithMongoose._mongooseCache ?? { conn: null, promise: null };
    cache.conn = mongoose;
    cache.promise = Promise.resolve(mongoose);
    globalWithMongoose._mongooseCache = cache;

    // Mongoose normally starts index creation lazily on first write, which
    // races the very next insert in a test — so a "rejects a duplicate"
    // test can pass on timing luck even if the schema's `unique: true` is
    // wrong or missing entirely. Every model that any test file for this
    // suite has imported by now is already registered (imports resolve
    // before this async beforeAll body runs), so awaiting Model.init() for
    // all of them here makes every unique/sparse/partial index actually
    // exist in Mongo before the first test runs.
    await Promise.all(
      mongoose.modelNames().map((name) => mongoose.model(name).init()),
    );
  });

  // Only clears documents, not indexes or the mongoose model registry — those
  // persist for the whole file. That's only safe because Vitest's default
  // per-file isolation (`isolate: true`) gives each test file its own module
  // context, so registry/index state never leaks across files. If isolation
  // is ever turned off, this becomes a landmine: models and indexes would
  // leak between test files that currently assume a clean slate.
  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();

    // Tear the cache back down so no connection state can leak to another
    // test file if per-file isolation is ever relaxed (see the afterEach
    // comment above for the same concern applied to collections/indexes).
    const cache = globalWithMongoose._mongooseCache;
    if (cache) {
      cache.conn = null;
      cache.promise = null;
    }
  });
}
