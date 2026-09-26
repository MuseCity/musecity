import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export class Database {
  readonly orm;
  constructor(readonly client: pg.Client) {
    this.orm = drizzle(client, { schema });
  }
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    return (await this.client.query<T>(text, values)).rows;
  }
  async one<T extends pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T | undefined> {
    return (await this.query<T>(text, values))[0];
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.client.query("BEGIN");
    try {
      const value = await fn();
      await this.client.query("COMMIT");
      return value;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}
export async function withDatabase<T>(
  connectionString: string,
  fn: (db: Database) => Promise<T>,
) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8000,
    query_timeout: 15000,
    application_name: "musecity",
  });
  await client.connect();
  try {
    return await fn(new Database(client));
  } finally {
    await client.end();
  }
}
