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
    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,

        // Mongoose's default is 100. That number is per *process*, and on a
        // serverless host every warm instance is its own process with its own
        // pool — a handful of concurrent instances would then ask Atlas for
        // more connections than the cluster allows (M0 caps at 500), and past
        // the cap every new request fails outright rather than queueing. This
        // app is one pharmacy's counter plus a few buyers; ten sockets per
        // instance is far more than its real concurrency, and capping it is
        // what keeps a traffic spike from turning into a cluster-wide outage.
        maxPoolSize: 10,

        // Keep a couple of sockets warm so a request that arrives after an
        // idle stretch doesn't pay the full TCP + TLS + auth handshake.
        minPoolSize: 2,

        // The default is 30s. During an Atlas failover (primary election,
        // typically 10-15s) a request would otherwise sit holding a worker for
        // half a minute before it either succeeded or gave up. 10s outlasts a
        // normal election — so ordinary failovers still recover transparently
        // — while still bounding how long a genuinely unreachable cluster can
        // pin the server. Note this is *not* a correctness risk for writes:
        // every write path here runs inside a transaction, so a timeout aborts
        // cleanly and can never leave a half-recorded sale.
        serverSelectionTimeoutMS: 10_000,

        // A query that has been running for 45s is not going to finish; fail
        // it rather than let it hold one of the ten pool sockets forever.
        socketTimeoutMS: 45_000,
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
