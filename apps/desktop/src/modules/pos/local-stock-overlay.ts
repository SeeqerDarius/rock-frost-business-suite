/**
 * Non-authoritative, in-memory view of how much stock offline sales rung up
 * on this device have already consumed, layered on top of the last-synced
 * `inventory.stock` cached rows for the Sell screen's low-stock hint only.
 * Nothing here is enforced (no offline sale is ever blocked by it) and
 * nothing here is sent to the server. The real safety net is unchanged:
 * createSale's own stock check runs server-side at sync time, and
 * insufficient stock surfaces as an ordinary sync conflict, exactly as it
 * does for an online sale. See docs/OFFLINE_DESKTOP.md's POS section.
 */
export class LocalStockOverlay {
  private readonly consumed = new Map<string, number>();

  recordSaleLines(lines: { itemId?: string | null; quantity: number }[]): void {
    for (const line of lines) {
      if (!line.itemId) continue;
      this.consumed.set(line.itemId, (this.consumed.get(line.itemId) ?? 0) + line.quantity);
    }
  }

  /** Call after every successful pull: a fresh snapshot already reflects a more current authoritative number than anything tracked here. */
  reset(): void {
    this.consumed.clear();
  }

  /** Cached quantity minus whatever this device has rung up offline since the last pull, floored at 0. Never negative, never authoritative. */
  projectedQuantity(itemId: string, cachedQuantity: number): number {
    return Math.max(0, cachedQuantity - (this.consumed.get(itemId) ?? 0));
  }
}
