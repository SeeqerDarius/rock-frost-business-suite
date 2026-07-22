import "server-only";

/**
 * Retries a create operation a few times when it collides with a unique
 * constraint (Prisma error P2002) — the shared fix for every
 * count()-then-format document number in this codebase (invoice/expense/
 * employee/sale/request/order/project numbers): two concurrent calls can
 * read the same count and compute the identical number. The unique
 * constraint on the number column prevents an actual duplicate row from
 * ever being created; this retry is what prevents the second caller from
 * crashing with an unhandled P2002 instead of getting a real row back.
 *
 * `operation` must recompute the candidate value on every attempt (not
 * just retry the same insert) — pass a closure that regenerates the
 * number and creates the row together, so a retry re-reads a fresh count.
 */
export async function createWithUniqueRetry<T>(operation: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isUniqueViolation = error instanceof Error && "code" in error && error.code === "P2002";
      if (isUniqueViolation && attempt < maxAttempts) continue;
      throw error;
    }
  }
  throw new Error("Could not complete the operation after multiple attempts due to repeated unique-constraint conflicts.");
}
