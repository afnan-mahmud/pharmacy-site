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

export const STANDALONE_MONGO_ERROR =
  "Ei database e transaction cholbe na — MongoDB standalone mode e ache, " +
  "replica set ba sharded cluster lagbe. Atlas emnitei replica set; " +
  "nijer server e MongoDB chalale replica set kore chalate hobe.";

/**
 * Refuses a MongoDB that cannot run transactions.
 *
 * Every write in this app — a sale, a cancellation, an edit, a stock-in, a
 * payment — runs inside session.withTransaction, because each of them
 * changes more than one document and none of them may half-happen. That is
 * a hard requirement, not a preference, so it is not something to relax; a
 * standalone mongod simply cannot serve this app.
 *
 * What it can do is say so. Without this check a standalone connects
 * happily, every page renders, and then the first sale at the counter fails
 * with a driver error about "Transaction numbers are only allowed on a
 * replica set member or mongos" — at the till, in front of a customer, long
 * after the deploy that caused it. Failing at connect turns a silent
 * mis-provisioning into an error on the first page load, with the fix in the
 * message.
 *
 * `hello` is the one command that answers this: a replica set member reports
 * `setName`, a mongos reports `msg: "isdbgrid"`, and a standalone reports
 * neither. It needs no special privilege and runs once per process, since
 * connectDb caches the connection.
 */
async function assertTransactionsSupported(
  connected: typeof mongoose,
): Promise<typeof mongoose> {
  const info = await connected.connection.db!.admin().command({ hello: 1 });
  const isReplicaSet = typeof info.setName === "string";
  const isSharded = info.msg === "isdbgrid";
  if (!isReplicaSet && !isSharded) {
    throw new Error(STANDALONE_MONGO_ERROR);
  }
  return connected;
}

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
      .then(assertTransactionsSupported)
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
