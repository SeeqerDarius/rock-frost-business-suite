import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrentTenant } from "@/lib/tenant";
import { getFleetDriverWorkspace, listFleetMaintenanceRequests } from "@/modules/fleet/service";
import { getFleetOwnerWorkspace } from "@/modules/fleet/owner-workspace";

const MAX_RECORDS = 500;

export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const moduleKey = url.searchParams.get("module") ?? "";
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const device = await db.offlineDevice.findFirst({ where: { id: deviceId, organizationId: tenant.organizationId, userId: tenant.userId, status: "ACTIVE" } });
  if (!device || !device.moduleKeys.includes(moduleKey) || !tenant.accessibleModuleKeys.includes(moduleKey) || device.offlineAccessUntil <= new Date()) return NextResponse.json({ error: "access-revoked" }, { status: 403 });

  let records: unknown[] = [];
  if (moduleKey === "fleet") {
    const values: unknown[] = [];
    if (hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) values.push({ kind: "driver-workspace", value: await getFleetDriverWorkspace(tenant.organizationId, tenant.userId) });
    if (hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)) values.push({ kind: "maintenance", value: await listFleetMaintenanceRequests(tenant.organizationId) });
    if (hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)) values.push({ kind: "owner-workspace", value: await getFleetOwnerWorkspace(tenant.organizationId, tenant.userId) });
    records = values;
  } else if (moduleKey === "inventory" && hasPermission(tenant, PERMISSIONS.INVENTORY_VIEW)) {
    const [warehouses, counts] = await Promise.all([
      db.inventoryWarehouse.findMany({ where: { organizationId: tenant.organizationId, active: true }, take: 50, include: { stock: { take: MAX_RECORDS, include: { item: { select: { id: true, sku: true, name: true, barcode: true, unit: true, updatedAt: true } } } } } }),
      db.inventoryCount.findMany({ where: { organizationId: tenant.organizationId, status: "DRAFT" }, take: 50, include: { warehouse: { select: { id: true, name: true } }, lines: { take: MAX_RECORDS, include: { item: { select: { id: true, sku: true, name: true } } } } } }),
    ]);
    records = [{ kind: "warehouses", value: warehouses }, { kind: "draft-counts", value: counts }];
  } else if (moduleKey === "school" && hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE)) {
    const [classes, terms] = await Promise.all([
      db.schoolClass.findMany({ where: { organizationId: tenant.organizationId, active: true }, take: 50, include: { enrollments: { where: { status: "ACTIVE", student: { status: "ACTIVE" } }, take: MAX_RECORDS, include: { student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true, updatedAt: true } } } }, campus: { select: { id: true, name: true, settings: { select: { attendanceCloseDays: true } } } } } }),
      db.schoolTerm.findMany({ where: { organizationId: tenant.organizationId }, orderBy: { startDate: "desc" }, take: 20, select: { id: true, name: true, startDate: true, endDate: true, academicYearId: true } }),
    ]);
    records = [{ kind: "classes", value: classes }, { kind: "terms", value: terms }];
  } else if (moduleKey === "hotel" && hasPermission(tenant, PERMISSIONS.HOTEL_VIEW)) {
    const [rooms, reservations, housekeeping] = await Promise.all([
      db.hotelRoom.findMany({ where: { organizationId: tenant.organizationId }, take: 200, include: { property: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } } } }),
      db.hotelReservation.findMany({ where: { organizationId: tenant.organizationId, departureDate: { gte: new Date() } }, take: 200, include: { guest: { select: { id: true, firstName: true, lastName: true } }, room: { select: { id: true, number: true } } } }),
      db.hotelHousekeepingTask.findMany({ where: { organizationId: tenant.organizationId, status: { not: "COMPLETED" } }, take: 200, include: { room: { select: { id: true, number: true } } } }),
    ]);
    records = [{ kind: "rooms", value: rooms }, { kind: "reservations", value: reservations }, { kind: "housekeeping", value: housekeeping }];
  } else if (moduleKey === "hostel" && hasPermission(tenant, PERMISSIONS.HOSTEL_VIEW)) {
    const [buildings, allocations] = await Promise.all([
      db.hostelBuilding.findMany({ where: { organizationId: tenant.organizationId, active: true }, take: 50, include: { rooms: { take: 200, include: { beds: true } } } }),
      db.hostelAllocation.findMany({ where: { organizationId: tenant.organizationId, status: "ACTIVE" }, take: 300, include: { student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true } }, bed: { include: { room: { select: { id: true, roomNumber: true } } } } } }),
    ]);
    records = [{ kind: "buildings", value: buildings }, { kind: "active-allocations", value: allocations }];
  } else if (moduleKey === "accounting" && hasPermission(tenant, PERMISSIONS.ACCOUNTING_VIEW)) {
    const [accounts, recentJournals] = await Promise.all([
      db.accountingAccount.findMany({ where: { organizationId: tenant.organizationId, active: true }, take: 300, select: { id: true, code: true, name: true, type: true, createdAt: true } }),
      db.accountingJournalEntry.findMany({ where: { organizationId: tenant.organizationId, status: "POSTED" }, orderBy: { entryDate: "desc" }, take: 100, select: { id: true, postingNumber: true, entryDate: true, description: true, status: true, createdAt: true } }),
    ]);
    records = [{ kind: "accounts", value: accounts }, { kind: "posted-journal-snapshot", value: recentJournals }];
  } else if (moduleKey === "pharmacy" && hasPermission(tenant, PERMISSIONS.PHARMACY_VIEW)) {
    records = await db.pharmacyMedicine.findMany({ where: { organizationId: tenant.organizationId, active: true }, take: MAX_RECORDS, select: { id: true, sku: true, name: true, genericName: true, dosageForm: true, strength: true, updatedAt: true } });
  } else if (moduleKey === "hospital" && hasPermission(tenant, PERMISSIONS.HOSPITAL_VIEW)) {
    records = await db.hospitalFacility.findMany({ where: { organizationId: tenant.organizationId }, take: 50, select: { id: true, code: true, name: true, updatedAt: true } });
  } else return NextResponse.json({ error: "work-pack-unavailable" }, { status: 403 });

  const capturedAt = new Date();
  const body = { module: moduleKey, workPackId: crypto.randomUUID(), records, capturedAt: capturedAt.toISOString(), expiresAt: new Date(capturedAt.getTime() + 12 * 60 * 60 * 1000).toISOString(), serverVersion: capturedAt.getTime() };
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > 5_000_000) return NextResponse.json({ error: "work-pack-too-large" }, { status: 413 });
  return new NextResponse(serialized, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
