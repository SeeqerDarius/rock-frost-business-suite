/**
 * Repairs historical platform-owner/tenant membership contamination.
 *
 * A platform identity must have exactly one active membership: its system
 * Super Admin membership in the internal platform anchor. Any other
 * memberships are marked REMOVED, pending invitations are revoked, and the
 * user's sessions are invalidated.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const platformUsers = await db.user.findMany({
    where: {
      organizationMemberships: {
        some: {
          status: "ACTIVE",
          role: { name: "Super Admin", isSystem: true, organizationId: null },
        },
      },
    },
    select: {
      id: true,
      email: true,
      organizationMemberships: {
        select: {
          id: true,
          organizationId: true,
          status: true,
          role: { select: { name: true, isSystem: true, organizationId: true } },
        },
      },
    },
  });

  const results = [];
  for (const user of platformUsers) {
    const platformMembershipIds = new Set(
      user.organizationMemberships
        .filter((membership) =>
          membership.status === "ACTIVE" &&
          membership.role?.name === "Super Admin" &&
          membership.role.isSystem &&
          membership.role.organizationId === null)
        .map((membership) => membership.id),
    );
    const contaminatedIds = user.organizationMemberships
      .filter((membership) => !platformMembershipIds.has(membership.id) && membership.status !== "REMOVED")
      .map((membership) => membership.id);

    if (contaminatedIds.length > 0) {
      await db.$transaction([
        db.invitation.updateMany({
          where: { membershipId: { in: contaminatedIds }, status: "PENDING" },
          data: { status: "REVOKED" },
        }),
        db.organizationMember.updateMany({
          where: { id: { in: contaminatedIds } },
          data: { status: "REMOVED" },
        }),
        db.user.update({
          where: { id: user.id },
          data: { sessionVersion: { increment: 1 } },
        }),
      ]);
    }

    results.push({
      email: user.email,
      platformMemberships: platformMembershipIds.size,
      removedTenantMemberships: contaminatedIds.length,
    });
  }

  console.log(JSON.stringify({ platformUsers: platformUsers.length, results }, null, 2));
}

main().finally(() => db.$disconnect());
