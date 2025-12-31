import { drizzle } from 'drizzle-orm/node-postgres';
import * as tables from "./tables";
import { ServiceUnavailableError } from "@/errors"

const schema = {
  ...tables,
};

export function createDB(database_url: string) {
  if (!database_url) {
    throw new ServiceUnavailableError('Database configuration missing');
  }
  return drizzle(database_url, { schema });
}