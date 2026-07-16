import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDb } from "@/lib/db";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

let replSet: MongoMemoryReplSet | undefined;

async function getReplSetUri(): Promise<string> {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  }
  return replSet.getUri();
}

// db.ts reads globalThis._mongooseCache once at module-import time and keeps
// a closured reference to that same object thereafter, mutating its fields
// in place. Because Vitest only imports the module once per test file,
// deleting/replacing the globalThis property between tests would NOT reach
// that closured reference — we must mutate the existing object's fields
// instead so the reset is actually visible to connectDb().
function resetMongooseCache() {
  const cache = globalWithMongoose._mongooseCache;
  if (cache) {
    cache.conn = null;
    cache.promise = null;
  }
}

// connectDb caches on globalThis, and mongoose itself is a process-wide
// singleton connection. Both must be reset between tests so one test's
// connection state can't leak into the next.
beforeEach(() => {
  resetMongooseCache();
  delete process.env.MONGODB_URI;
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  resetMongooseCache();
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
  }
  resetMongooseCache();
});

describe("connectDb", () => {
  it("throws when MONGODB_URI is unset", async () => {
    delete process.env.MONGODB_URI;
    await expect(connectDb()).rejects.toThrow("MONGODB_URI is not set");
  });

  it("returns a connection and caches it: two sequential calls do not open two connections", async () => {
    process.env.MONGODB_URI = await getReplSetUri();
    const connectSpy = vi.spyOn(mongoose, "connect");

    const first = await connectDb();
    const second = await connectDb();

    expect(first).toBe(second);
    expect(mongoose.connection.readyState).toBe(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one connection attempt across concurrent calls", async () => {
    process.env.MONGODB_URI = await getReplSetUri();
    const connectSpy = vi.spyOn(mongoose, "connect");

    const [first, second] = await Promise.all([connectDb(), connectDb()]);

    expect(first).toBe(second);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("does not poison the cache after a failed connect (regression)", async () => {
    process.env.MONGODB_URI = "mongodb://this-uri-is-irrelevant/db";
    const connectSpy = vi
      .spyOn(mongoose, "connect")
      .mockImplementationOnce(() => Promise.reject(new Error("connect failed")));

    await expect(connectDb()).rejects.toThrow("connect failed");

    // A working URI on the next call must succeed rather than re-awaiting
    // the same rejected, cached promise.
    process.env.MONGODB_URI = await getReplSetUri();
    connectSpy.mockRestore();

    const conn = await connectDb();
    expect(conn.connection.readyState).toBe(1);
  });
});
