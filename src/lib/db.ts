import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { serverEnv } from "@/config/serverEnv";

declare global {
  var __aceTradeDbPool: Pool | undefined;
}

const createPool = () =>
  new Pool({
    host: serverEnv.db.host,
    port: serverEnv.db.port,
    database: serverEnv.db.name,
    user: serverEnv.db.user,
    password: serverEnv.db.password,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

const pool = global.__aceTradeDbPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.__aceTradeDbPool = pool;
}

export const getDbPool = () => pool;

export const withTransaction = async <T>(handler: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  return pool.query<T>(text, params);
};
