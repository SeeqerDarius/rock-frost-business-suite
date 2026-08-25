import "server-only";

import { db } from "@/lib/db";

export async function listCompletedTourKeys(userId: string): Promise<string[]> {
  const rows = await db.userTourProgress.findMany({
    where: { userId },
    select: { tourKey: true },
  });
  return rows.map((row) => row.tourKey);
}

export async function markTourCompleted(userId: string, tourKey: string): Promise<void> {
  await db.userTourProgress.upsert({
    where: { userId_tourKey: { userId, tourKey } },
    update: {},
    create: { userId, tourKey },
  });
}
