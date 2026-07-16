import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

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
  });
}
