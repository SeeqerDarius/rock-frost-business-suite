"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, shortText, longText, moneyAmountPositive, dateInput, parseWithSchema } from "@/lib/validation";
import { createHotelProperty, createHotelRoomType, createHotelRoom, createHotelGuest, createHotelReservation, checkInHotelReservation, checkOutHotelReservation, postHotelFolioCharge, recordHotelPayment, createHotelHousekeepingTask, updateHotelHousekeepingTask, createHotelRestaurantOutlet, createHotelMenuItem, createHotelOrder, upsertHotelChannel, upsertHotelSettings, HotelStateError, HotelNotFoundError } from "@/modules/hotel/service";

const clean = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return text || null; };
const integer = z.coerce.number().int().min(0).max(1000);
const paymentMethods = z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"]);

async function authorize(permission: string, path: string) {
  const tenant = await requireModuleAccess("hotel");
  if (!hasPermission(tenant, permission)) redirect(`${path}?error=forbidden`);
  return tenant;
}

export async function createPropertyAction(formData: FormData) {
  const path = "/app/hotel/properties"; const tenant = await authorize(PERMISSIONS.HOTEL_PROPERTIES_MANAGE, path);
  const parsed = parseWithSchema(z.object({ code: shortText, name: shortText, address: longText.nullable(), phone: shortText.nullable(), email: z.string().email().nullable(), timezone: shortText, currency: z.string().trim().length(3) }), { code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", address: clean(formData.get("address")), phone: clean(formData.get("phone")), email: clean(formData.get("email")), timezone: clean(formData.get("timezone")) ?? "UTC", currency: clean(formData.get("currency")) ?? "USD" });
  if (!parsed.success) redirect(`${path}?error=invalid`); await createHotelProperty(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createRoomTypeAction(formData: FormData) {
  const path = "/app/hotel/rooms"; const tenant = await authorize(PERMISSIONS.HOTEL_ROOMS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ propertyId: cuid, code: shortText, name: shortText, capacity: integer.min(1), baseRate: moneyAmountPositive, description: longText.nullable() }), { propertyId: clean(formData.get("propertyId")) ?? "", code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", capacity: clean(formData.get("capacity")), baseRate: clean(formData.get("baseRate")), description: clean(formData.get("description")) });
  if (!parsed.success) redirect(`${path}?error=invalid`); await createHotelRoomType(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createRoomAction(formData: FormData) {
  const path = "/app/hotel/rooms"; const tenant = await authorize(PERMISSIONS.HOTEL_ROOMS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ propertyId: cuid, roomTypeId: cuid, number: shortText, floor: shortText.nullable() }), { propertyId: clean(formData.get("propertyId")) ?? "", roomTypeId: clean(formData.get("roomTypeId")) ?? "", number: clean(formData.get("number")) ?? "", floor: clean(formData.get("floor")) });
  if (!parsed.success) redirect(`${path}?error=invalid`); try { await createHotelRoom(tenant.organizationId, parsed.data); } catch (error) { if (error instanceof HotelNotFoundError) redirect(`${path}?error=not-found`); throw error; } revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createGuestAction(formData: FormData) {
  const path = "/app/hotel/guests"; const tenant = await authorize(PERMISSIONS.HOTEL_GUESTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ firstName: shortText, lastName: shortText, email: z.string().email().nullable(), phone: shortText.nullable(), nationality: shortText.nullable(), identityType: shortText.nullable(), identityNumber: shortText.nullable(), notes: longText.nullable() }), { firstName: clean(formData.get("firstName")) ?? "", lastName: clean(formData.get("lastName")) ?? "", email: clean(formData.get("email")), phone: clean(formData.get("phone")), nationality: clean(formData.get("nationality")), identityType: clean(formData.get("identityType")), identityNumber: clean(formData.get("identityNumber")), notes: clean(formData.get("notes")) });
  if (!parsed.success) redirect(`${path}?error=invalid`); await createHotelGuest(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createReservationAction(formData: FormData) {
  const path = "/app/hotel/reservations"; const tenant = await authorize(PERMISSIONS.HOTEL_RESERVATIONS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ propertyId: cuid, roomTypeId: cuid, roomId: cuid.nullable(), guestId: cuid, arrivalDate: dateInput, departureDate: dateInput, adults: integer.min(1), children: integer, nightlyRate: moneyAmountPositive, source: shortText.nullable(), specialRequests: longText.nullable() }), { propertyId: clean(formData.get("propertyId")) ?? "", roomTypeId: clean(formData.get("roomTypeId")) ?? "", roomId: clean(formData.get("roomId")), guestId: clean(formData.get("guestId")) ?? "", arrivalDate: clean(formData.get("arrivalDate")), departureDate: clean(formData.get("departureDate")), adults: clean(formData.get("adults")), children: clean(formData.get("children")) ?? "0", nightlyRate: clean(formData.get("nightlyRate")), source: clean(formData.get("source")), specialRequests: clean(formData.get("specialRequests")) });
  if (!parsed.success) redirect(`${path}?error=invalid`); try { await createHotelReservation(tenant.organizationId, parsed.data); } catch (error) { if (error instanceof HotelStateError) redirect(`${path}?error=conflict`); if (error instanceof HotelNotFoundError) redirect(`${path}?error=not-found`); throw error; } revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function checkInAction(formData: FormData) { const path = "/app/hotel/reservations"; const tenant = await authorize(PERMISSIONS.HOTEL_RESERVATIONS_MANAGE, path); const id = clean(formData.get("reservationId")); const roomId = clean(formData.get("roomId")); if (!id || !roomId) redirect(`${path}?error=invalid`); try { await checkInHotelReservation(tenant.organizationId, id, roomId); } catch (error) { if (error instanceof HotelStateError || error instanceof HotelNotFoundError) redirect(`${path}?error=conflict`); throw error; } revalidatePath(path); redirect(`${path}?saved=1`); }
export async function checkOutAction(formData: FormData) { const path = "/app/hotel/reservations"; const tenant = await authorize(PERMISSIONS.HOTEL_RESERVATIONS_MANAGE, path); const id = clean(formData.get("reservationId")); if (!id) redirect(`${path}?error=invalid`); try { await checkOutHotelReservation(tenant.organizationId, id); } catch (error) { if (error instanceof HotelStateError || error instanceof HotelNotFoundError) redirect(`${path}?error=balance`); throw error; } revalidatePath(path); revalidatePath("/app/hotel/housekeeping"); redirect(`${path}?saved=1`); }
export async function postFolioChargeAction(formData: FormData) { const path = "/app/hotel/folios"; const tenant = await authorize(PERMISSIONS.HOTEL_FOLIOS_MANAGE, path); const parsed = parseWithSchema(z.object({ folioId: cuid, description: shortText, amount: moneyAmountPositive, reference: shortText.nullable() }), { folioId: clean(formData.get("folioId")) ?? "", description: clean(formData.get("description")) ?? "", amount: clean(formData.get("amount")), reference: clean(formData.get("reference")) }); if (!parsed.success) redirect(`${path}?error=invalid`); const { folioId, ...data } = parsed.data; await postHotelFolioCharge(tenant.organizationId, folioId, data); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function recordFolioPaymentAction(formData: FormData) { const path = "/app/hotel/folios"; const tenant = await authorize(PERMISSIONS.HOTEL_FOLIOS_MANAGE, path); const parsed = parseWithSchema(z.object({ folioId: cuid, amount: moneyAmountPositive, method: paymentMethods, reference: shortText.nullable() }), { folioId: clean(formData.get("folioId")) ?? "", amount: clean(formData.get("amount")), method: clean(formData.get("method")), reference: clean(formData.get("reference")) }); if (!parsed.success) redirect(`${path}?error=invalid`); const { folioId, ...data } = parsed.data; await recordHotelPayment(tenant.organizationId, folioId, data); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function createHousekeepingTaskAction(formData: FormData) { const path = "/app/hotel/housekeeping"; const tenant = await authorize(PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE, path); const parsed = z.object({ roomId: cuid, assignedTo: shortText.nullable(), priority: z.enum(["LOW", "NORMAL", "HIGH", "CHECKOUT", "URGENT"]), notes: longText.nullable(), dueAt: z.coerce.date().nullable() }).safeParse({ roomId: clean(formData.get("roomId")), assignedTo: clean(formData.get("assignedTo")), priority: clean(formData.get("priority")), notes: clean(formData.get("notes")), dueAt: clean(formData.get("dueAt")) }); if (!parsed.success) redirect(`${path}?error=invalid`); try { await createHotelHousekeepingTask(tenant.organizationId, parsed.data); } catch (error) { if (error instanceof HotelStateError || error instanceof HotelNotFoundError) redirect(`${path}?error=conflict`); throw error; } revalidatePath(path); redirect(`${path}?saved=1`); }
export async function updateHousekeepingAction(formData: FormData) { const path = "/app/hotel/housekeeping"; const tenant = await authorize(PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE, path); const parsed = z.object({ id: cuid, status: z.enum(["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION", "COMPLETED", "BLOCKED"]), assignedTo: shortText.nullable() }).safeParse({ id: clean(formData.get("id")), status: clean(formData.get("status")), assignedTo: clean(formData.get("assignedTo")) }); if (!parsed.success) redirect(`${path}?error=invalid`); try { await updateHotelHousekeepingTask(tenant.organizationId, parsed.data.id, parsed.data.status, parsed.data.assignedTo); } catch (error) { if (error instanceof HotelStateError || error instanceof HotelNotFoundError) redirect(`${path}?error=inspection`); throw error; } revalidatePath(path); redirect(`${path}?saved=1`); }
export async function createOutletAction(formData: FormData) { const path="/app/hotel/restaurant"; const tenant=await authorize(PERMISSIONS.HOTEL_RESTAURANT_MANAGE,path); const parsed=z.object({propertyId:cuid,name:shortText}).safeParse({propertyId:clean(formData.get("propertyId")),name:clean(formData.get("name"))}); if(!parsed.success)redirect(`${path}?error=invalid`); await createHotelRestaurantOutlet(tenant.organizationId,parsed.data.propertyId,parsed.data.name); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function createMenuItemAction(formData: FormData) { const path="/app/hotel/restaurant"; const tenant=await authorize(PERMISSIONS.HOTEL_RESTAURANT_MANAGE,path); const parsed=parseWithSchema(z.object({outletId:cuid,name:shortText,category:shortText.nullable(),price:moneyAmountPositive}),{outletId:clean(formData.get("outletId"))??"",name:clean(formData.get("name"))??"",category:clean(formData.get("category")),price:clean(formData.get("price"))}); if(!parsed.success)redirect(`${path}?error=invalid`); const {outletId,...data}=parsed.data; await createHotelMenuItem(tenant.organizationId,outletId,data); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function createOrderAction(formData: FormData) { const path="/app/hotel/restaurant"; const tenant=await authorize(PERMISSIONS.HOTEL_RESTAURANT_MANAGE,path); const parsed=z.object({outletId:cuid,folioId:cuid.nullable(),tableOrRoom:shortText.nullable(),menuItemId:cuid,quantity:z.coerce.number().int().min(1).max(100)}).safeParse({outletId:clean(formData.get("outletId")),folioId:clean(formData.get("folioId")),tableOrRoom:clean(formData.get("tableOrRoom")),menuItemId:clean(formData.get("menuItemId")),quantity:clean(formData.get("quantity"))}); if(!parsed.success)redirect(`${path}?error=invalid`); await createHotelOrder(tenant.organizationId,parsed.data); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function upsertChannelAction(formData: FormData) { const path="/app/hotel/channels"; const tenant=await authorize(PERMISSIONS.HOTEL_CHANNELS_MANAGE,path); const parsed=z.object({propertyId:cuid,provider:shortText,externalPropertyId:shortText.nullable(),active:z.boolean()}).safeParse({propertyId:clean(formData.get("propertyId")),provider:clean(formData.get("provider")),externalPropertyId:clean(formData.get("externalPropertyId")),active:formData.get("active")==="on"}); if(!parsed.success)redirect(`${path}?error=invalid`); await upsertHotelChannel(tenant.organizationId,parsed.data); revalidatePath(path); redirect(`${path}?saved=1`); }
export async function upsertHotelSettingsAction(formData: FormData) {
  const path = "/app/hotel/settings";
  const tenant = await authorize(PERMISSIONS.HOTEL_SETTINGS_MANAGE, path);
  const prefix = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/);
  const parsed = z.object({
    propertyId: cuid,
    timezone: shortText,
    currency: z.string().trim().toUpperCase().length(3),
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
    checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
    taxRate: z.coerce.number().min(0).max(100),
    serviceChargeRate: z.coerce.number().min(0).max(100),
    allowOutstandingCheckout: z.boolean(),
    reservationPrefix: prefix,
    folioPrefix: prefix,
    receiptPrefix: prefix,
    orderPrefix: prefix,
    autoCreateCheckoutTask: z.boolean(),
    housekeepingDueHours: z.coerce.number().int().min(1).max(168),
    requireHousekeepingInspection: z.boolean(),
  }).safeParse({
    propertyId: clean(formData.get("propertyId")),
    timezone: clean(formData.get("timezone")),
    currency: clean(formData.get("currency")),
    checkInTime: clean(formData.get("checkInTime")),
    checkOutTime: clean(formData.get("checkOutTime")),
    taxRate: clean(formData.get("taxRate")),
    serviceChargeRate: clean(formData.get("serviceChargeRate")),
    allowOutstandingCheckout: formData.get("allowOutstandingCheckout") === "on",
    reservationPrefix: clean(formData.get("reservationPrefix")),
    folioPrefix: clean(formData.get("folioPrefix")),
    receiptPrefix: clean(formData.get("receiptPrefix")),
    orderPrefix: clean(formData.get("orderPrefix")),
    autoCreateCheckoutTask: formData.get("autoCreateCheckoutTask") === "on",
    housekeepingDueHours: clean(formData.get("housekeepingDueHours")),
    requireHousekeepingInspection: formData.get("requireHousekeepingInspection") === "on",
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await upsertHotelSettings(tenant.organizationId, parsed.data); }
  catch (error) { if (error instanceof HotelNotFoundError) redirect(`${path}?error=not-found`); throw error; }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
