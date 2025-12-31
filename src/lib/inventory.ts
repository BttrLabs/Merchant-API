import { eq, and, gte, sql } from 'drizzle-orm'
import { inventoryTable, reservationsTable } from '@/db/tables'
import type { createDB } from '@/db/client'

type DB = ReturnType<typeof createDB>

type StockItem = {
  variant_id: string
  quantity: number
}

type ReserveResult =
  | { success: true }
  | { success: false; failed_variant_id: string }

/**
 * Reserve stock for a cart by creating reservation records and decrementing stock.
 * When the cart is deleted, reservations cascade delete, and a DB trigger restores stock.
 */
export async function reserveStock(
  db: DB,
  cartId: string,
  items: StockItem[],
  expiresAt: Date
): Promise<ReserveResult> {
  return await db.transaction(async (tx) => {
    for (const item of items) {
      // Decrement stock (with check for availability)
      const result = await tx
        .update(inventoryTable)
        .set({
          stock_quantity: sql`${inventoryTable.stock_quantity} - ${item.quantity}`,
        })
        .where(
          and(
            eq(inventoryTable.variant_id, item.variant_id),
            gte(inventoryTable.stock_quantity, item.quantity)
          )
        )
        .returning()

      if (result.length === 0) {
        tx.rollback()
        return { success: false, failed_variant_id: item.variant_id }
      }

      // Create reservation record
      await tx.insert(reservationsTable).values({
        cart_id: cartId,
        variant_id: item.variant_id,
        quantity: item.quantity,
        expires_at: expiresAt,
      })
    }
    return { success: true }
  })
}

/**
 * Restore stock from reservations (e.g., when checkout expires or fails).
 * This deletes the reservations and restores stock.
 */
export async function restoreStockFromReservations(
  db: DB,
  cartId: string
) {
  // Get reservations for this cart
  const reservations = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.cart_id, cartId))

  if (reservations.length === 0) return

  await db.transaction(async (tx) => {
    for (const reservation of reservations) {
      // Restore stock
      await tx
        .update(inventoryTable)
        .set({
          stock_quantity: sql`${inventoryTable.stock_quantity} + ${reservation.quantity}`,
        })
        .where(eq(inventoryTable.variant_id, reservation.variant_id))
    }

    // Delete reservations
    await tx
      .delete(reservationsTable)
      .where(eq(reservationsTable.cart_id, cartId))
  })
}

/**
 * Clear reservations after successful payment (stock already deducted, just remove reservations).
 */
export async function clearReservations(
  db: DB,
  cartId: string
) {
  await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.cart_id, cartId))
}

/**
 * Get total reserved quantity for a variant across all carts.
 */
export async function getReservedQuantity(
  db: DB,
  variantId: string
): Promise<number> {
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${reservationsTable.quantity}), 0)`
    })
    .from(reservationsTable)
    .where(eq(reservationsTable.variant_id, variantId))

  return result[0]?.total ?? 0
}

/**
 * Get available stock (stock_quantity minus reserved).
 */
export async function getAvailableStock(
  db: DB,
  variantId: string
): Promise<{ stock_quantity: number; reserved_quantity: number; available: number } | null> {
  const [inventory] = await db
    .select()
    .from(inventoryTable)
    .where(eq(inventoryTable.variant_id, variantId))

  if (!inventory) return null

  const reserved = await getReservedQuantity(db, variantId)

  return {
    stock_quantity: inventory.stock_quantity,
    reserved_quantity: reserved,
    available: inventory.stock_quantity - reserved,
  }
}
