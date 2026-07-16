import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Next.js hot reload re-evaluates modules; without this cache each reload would
// open a fresh connection and exhaust the Atlas connection pool.
const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache = globalWithMongoose._mongooseCache ?? {
  conn: null,
  promise: null,
};
globalWithMongoose._mongooseCache = cache;

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    // If the connection attempt fails, clear the cached promise so the next
    // connectDb() call retries instead of re-awaiting a dead, rejected
    // promise forever. Concurrent callers already awaiting this same promise
    // still see the rejection, which is correct.
    cache.promise = mongoose.connect(uri, { bufferCommands: false }).catch((err) => {
      cache.promise = null;
      throw err;
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
