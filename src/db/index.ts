import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

const MISSING_DATABASE_URL = "DATABASE_URL is required";

/**
 * Builds the connection pool on first use.
 *
 * `next build` imports route modules to collect their configuration, so any
 * import-time validation of DATABASE_URL would break the build in environments
 * where the variable is only provided at runtime. Instead, when DATABASE_URL
 * is absent we create a pool whose `connect`/`query` fail with the friendly
 * error above — the failure then surfaces on the first real query (surfaced
 * cleanly by /api/health) rather than at module load.
 */
function resolvePool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    const databaseUrl = process.env.DATABASE_URL;
    const pool = new Pool(
      databaseUrl
        ? { connectionString: databaseUrl }
        : { connectionString: "postgres://rahyar@127.0.0.1:5/unused" },
    );
    if (!databaseUrl) {
      const fail = () => {
        throw new Error(MISSING_DATABASE_URL);
      };
      pool.connect = fail as unknown as Pool["connect"];
      pool.query = fail as unknown as Pool["query"];
    }
    // Cache on globalThis so dev-server HMR reuses a single connection pool.
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

/**
 * Wraps the pool so `drizzle(pool)` can be constructed at module load while
 * the real Pool (and DATABASE_URL validation) is only created on first use.
 */
const lazyPool = new Proxy(new Pool({ connectionString: "postgres://rahyar@127.0.0.1:5/unused" }), {
  get(target, property) {
    const pool = resolvePool();
    const value = Reflect.get(pool, property, target);
    return typeof value === "function" ? value.bind(pool) : value;
  },
  set(_target, property, value) {
    return Reflect.set(resolvePool(), property, value);
  },
  has(_target, property) {
    return Reflect.has(resolvePool(), property);
  },
});

export const pool = lazyPool;

export const db = drizzle(pool);
