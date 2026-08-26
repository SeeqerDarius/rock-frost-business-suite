"use server";

import { getServerAuthSession } from "@/lib/auth/session";
import * as tours from "@/lib/tours/service";

/**
 * Called directly from TourRunner (a client component) on mount - returns
 * whichever of the given tour keys this user has not completed yet, in the
 * same order they were passed, so the caller controls sequencing (general
 * tour before a module's own tour).
 */
export async function getPendingTourKeys(candidateKeys: string[]): Promise<string[]> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return [];
  const completed = new Set(await tours.listCompletedTourKeys(session.user.id));
  return candidateKeys.filter((key) => !completed.has(key));
}

export async function completeTour(tourKey: string): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return;
  await tours.markTourCompleted(session.user.id, tourKey);
}
