/**
 * Seeds FleetVehicleDocument (insurance/roadworthy) records for the existing
 * "Rock Frost Demo Fleet" vehicles. FleetVehicleDocument is a new model added
 * alongside the Phase 6 Fleet backend work, so unlike the rest of the Fleet
 * data (seeded 2026-07-04), nothing exists for it on a fresh database. Skips
 * if any documents already exist for the organization.
 * Run with: npx tsx prisma/seed-fleet-documents.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.findFirstOrThrow({ where: { tenantCode: "rock-frost-demo-fleet" } });

  const existing = await db.fleetVehicleDocument.count({ where: { organizationId: org.id } });
  if (existing > 0) {
    console.log(`Organization already has ${existing} vehicle documents — skipping.`);
    return;
  }

  const vehicles = await db.fleetVehicle.findMany({ where: { organizationId: org.id } });
  const byTag = new Map(vehicles.map((v) => [v.assetTag, v]));

  const records: Array<{
    assetTag: string;
    provider: string;
    policyNumber: string;
    insuranceExpiresAt: string;
    roadworthyExpiresAt: string;
    renewalStatus: "READY" | "DUE" | "CLEAR";
    alerts: string;
  }> = [
    { assetTag: "RF-1023", provider: "Star Assurance Ghana", policyNumber: "SAG-23118", insuranceExpiresAt: "2026-08-12", roadworthyExpiresAt: "2026-09-04", renewalStatus: "READY", alerts: "2 reminders set" },
    { assetTag: "RF-1081", provider: "Enterprise Insurance", policyNumber: "ENT-42099", insuranceExpiresAt: "2026-07-10", roadworthyExpiresAt: "2026-07-25", renewalStatus: "DUE", alerts: "Expiry alert" },
    { assetTag: "RF-1117", provider: "SIC Insurance", policyNumber: "SIC-92130", insuranceExpiresAt: "2026-10-01", roadworthyExpiresAt: "2026-11-14", renewalStatus: "CLEAR", alerts: "No active alerts" },
    { assetTag: "RF-1180", provider: "Vanguard Assurance", policyNumber: "VAN-58820", insuranceExpiresAt: "2026-07-05", roadworthyExpiresAt: "2026-08-22", renewalStatus: "DUE", alerts: "Insurance renewal due" },
  ];

  let created = 0;
  for (const record of records) {
    const vehicle = byTag.get(record.assetTag);
    if (!vehicle) {
      console.warn(`No vehicle found with assetTag ${record.assetTag}, skipping.`);
      continue;
    }
    await db.fleetVehicleDocument.create({
      data: {
        organizationId: org.id,
        branchId: vehicle.branchId,
        vehicleId: vehicle.id,
        provider: record.provider,
        policyNumber: record.policyNumber,
        insuranceExpiresAt: new Date(record.insuranceExpiresAt),
        roadworthyExpiresAt: new Date(record.roadworthyExpiresAt),
        renewalStatus: record.renewalStatus,
        alerts: record.alerts,
      },
    });
    created += 1;
  }

  console.log(`Seeded ${created} vehicle documents.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
