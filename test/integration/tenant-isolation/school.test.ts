import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as school from "@/modules/school/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;let orgB: TestOrg;let campusA: Awaited<ReturnType<typeof school.createSchoolCampus>>;let campusB: Awaited<ReturnType<typeof school.createSchoolCampus>>;let studentB: Awaited<ReturnType<typeof school.createSchoolStudent>>;
beforeAll(async()=>{orgA=await createTestOrg("orgA-school");orgB=await createTestOrg("orgB-school");campusA=await school.createSchoolCampus(orgA.organizationId,{code:"A",name:"A Campus"});campusB=await school.createSchoolCampus(orgB.organizationId,{code:"B",name:"B Campus"});studentB=await school.createSchoolStudent(orgB.organizationId,{campusId:campusB.id,firstName:"Student",lastName:"B"});});
afterAll(async()=>{await cleanupTestOrg(orgA);await cleanupTestOrg(orgB);});

describe("School service — real tenant isolation and financial guards",()=>{
  it("rejects creating a student under another tenant campus",async()=>{await expect(school.createSchoolStudent(orgA.organizationId,{campusId:campusB.id,firstName:"Bad",lastName:"Reference"})).rejects.toThrow(school.SchoolNotFoundError);});
  it("rejects linking a foreign guardian or student",async()=>{const guardian=await school.createSchoolGuardian(orgA.organizationId,{firstName:"Guardian",lastName:"A",phone:"123"});await expect(school.linkSchoolGuardian(orgA.organizationId,studentB.id,guardian.id,"Parent")).rejects.toThrow(school.SchoolNotFoundError);});
  it("prevents fee overpayment",async()=>{const student=await school.createSchoolStudent(orgA.organizationId,{campusId:campusA.id,firstName:"Student",lastName:"A"});const year=await school.createSchoolAcademicYear(orgA.organizationId,{name:"2030",startDate:new Date("2030-01-01"),endDate:new Date("2030-12-31")});const invoice=await school.createSchoolFeeInvoice(orgA.organizationId,{academicYearId:year.id,studentId:student.id,description:"Tuition",amount:"100"});await expect(school.recordSchoolFeePayment(orgA.organizationId,invoice.id,{amount:"101",method:"CASH"})).rejects.toThrow(school.SchoolStateError);});
  it("lists only its own campuses",async()=>{const list=await school.listSchoolCampuses(orgA.organizationId);expect(list.map(x=>x.id)).toContain(campusA.id);expect(list.map(x=>x.id)).not.toContain(campusB.id);});
});
