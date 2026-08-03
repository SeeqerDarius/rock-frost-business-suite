import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hotel from "@/modules/hotel/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg; let orgB: TestOrg;
let propertyA: Awaited<ReturnType<typeof hotel.createHotelProperty>>;
let propertyB: Awaited<ReturnType<typeof hotel.createHotelProperty>>;
let typeB: Awaited<ReturnType<typeof hotel.createHotelRoomType>>;
let roomB: Awaited<ReturnType<typeof hotel.createHotelRoom>>;
let guestB: Awaited<ReturnType<typeof hotel.createHotelGuest>>;

beforeAll(async()=>{orgA=await createTestOrg("orgA-hotel");orgB=await createTestOrg("orgB-hotel");propertyA=await hotel.createHotelProperty(orgA.organizationId,{code:"A",name:"A Hotel"});propertyB=await hotel.createHotelProperty(orgB.organizationId,{code:"B",name:"B Hotel"});typeB=await hotel.createHotelRoomType(orgB.organizationId,{propertyId:propertyB.id,code:"STD",name:"Standard",capacity:2,baseRate:"100"});roomB=await hotel.createHotelRoom(orgB.organizationId,{propertyId:propertyB.id,roomTypeId:typeB.id,number:"101"});guestB=await hotel.createHotelGuest(orgB.organizationId,{firstName:"Guest",lastName:"B"});});
afterAll(async()=>{await cleanupTestOrg(orgA);await cleanupTestOrg(orgB);});

describe("Hotel service — real tenant isolation and lifecycle guards",()=>{
  it("rejects a cross-tenant room type",async()=>{await expect(hotel.createHotelRoom(orgA.organizationId,{propertyId:propertyA.id,roomTypeId:typeB.id,number:"X"})).rejects.toThrow(hotel.HotelNotFoundError);});
  it("rejects cross-tenant reservation references",async()=>{await expect(hotel.createHotelReservation(orgA.organizationId,{propertyId:propertyB.id,roomTypeId:typeB.id,roomId:roomB.id,guestId:guestB.id,arrivalDate:new Date("2030-01-01"),departureDate:new Date("2030-01-03"),adults:1,nightlyRate:"100"})).rejects.toThrow(hotel.HotelNotFoundError);});
  it("prevents overlapping room reservations",async()=>{const guest=await hotel.createHotelGuest(orgA.organizationId,{firstName:"Guest",lastName:"A"});const type=await hotel.createHotelRoomType(orgA.organizationId,{propertyId:propertyA.id,code:"STD",name:"Standard",capacity:2,baseRate:"100"});const room=await hotel.createHotelRoom(orgA.organizationId,{propertyId:propertyA.id,roomTypeId:type.id,number:"101"});await hotel.createHotelReservation(orgA.organizationId,{propertyId:propertyA.id,roomTypeId:type.id,roomId:room.id,guestId:guest.id,arrivalDate:new Date("2030-02-01"),departureDate:new Date("2030-02-03"),adults:1,nightlyRate:"100"});await expect(hotel.createHotelReservation(orgA.organizationId,{propertyId:propertyA.id,roomTypeId:type.id,roomId:room.id,guestId:guest.id,arrivalDate:new Date("2030-02-02"),departureDate:new Date("2030-02-04"),adults:1,nightlyRate:"100"})).rejects.toThrow(hotel.HotelStateError);});
  it("lists only its own properties",async()=>{const list=await hotel.listHotelProperties(orgA.organizationId);expect(list.map(x=>x.id)).toContain(propertyA.id);expect(list.map(x=>x.id)).not.toContain(propertyB.id);});
});
