import { eq } from 'drizzle-orm';

import { productsTable } from "./tables"
import { createDB } from "./client"

export async function checkSlugExists(db: ReturnType<typeof createDB>, slug: string): Promise<boolean> {
  const result = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.slug, slug))
  return result.length > 0;
}