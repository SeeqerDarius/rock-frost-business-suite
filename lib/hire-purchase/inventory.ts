import "server-only";

import type { Prisma } from "@prisma/client";

export class StaffInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffInventoryError";
  }
}

/** Atomically decrements one unit of stock; throws if the staff member has none left for this product. */
export async function consumeStaffInventory({
  tx,
  organizationId,
  staffId,
  productId,
}: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  staffId: string;
  productId: string;
}) {
  const result = await tx.hirePurchaseStaffInventory.updateMany({
    where: { organizationId, staffId, productId, quantity: { gt: 0 } },
    data: { quantity: { decrement: 1 } },
  });

  if (result.count !== 1) {
    throw new StaffInventoryError("This staff member has no stock left for the selected product.");
  }
}

/** Restores one unit of stock (used on account deletion or product correction). */
export async function restoreStaffInventory({
  tx,
  organizationId,
  staffId,
  productId,
}: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  staffId: string;
  productId: string;
}) {
  await tx.hirePurchaseStaffInventory.upsert({
    where: { staffId_productId: { staffId, productId } },
    update: { quantity: { increment: 1 } },
    create: { organizationId, staffId, productId, quantity: 1 },
  });
}

/** Seeds a default inventory quantity for a newly created/activated product across all active staff. */
export async function assignDefaultInventoryForProduct({
  tx,
  organizationId,
  productId,
  quantity,
}: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  productId: string;
  quantity: number;
}) {
  const staffMembers = await tx.hirePurchaseStaff.findMany({
    where: { organizationId, active: true },
    select: { id: true },
  });

  for (const staff of staffMembers) {
    const existing = await tx.hirePurchaseStaffInventory.findUnique({
      where: { staffId_productId: { staffId: staff.id, productId } },
    });
    if (!existing) {
      await tx.hirePurchaseStaffInventory.create({
        data: { organizationId, staffId: staff.id, productId, quantity },
      });
    }
  }
}

/** Seeds default inventory for a newly created staff member across all active products. */
export async function assignDefaultInventoryForStaff({
  tx,
  organizationId,
  staffId,
  quantity,
}: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  staffId: string;
  quantity: number;
}) {
  const products = await tx.hirePurchaseProduct.findMany({
    where: { organizationId, active: true },
    select: { id: true },
  });

  for (const product of products) {
    await tx.hirePurchaseStaffInventory.create({
      data: { organizationId, staffId, productId: product.id, quantity },
    });
  }
}
