import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");
const schema = normalize(readFileSync("prisma/schema.prisma", "utf8"));
const service = normalize(readFileSync("src/modules/hospital/service.ts", "utf8"));
const permissions = normalize(readFileSync("src/lib/auth/permissions.ts", "utf8"));
const seed = normalize(readFileSync("prisma/seed-data.ts", "utf8"));
const actions = normalize(readFileSync("src/app/app/hospital/actions.ts", "utf8"));

/**
 * Structural coverage for the clinical-upgrades tranche: permission split,
 * maker-checker enforcement, rejection fields, and audit-event wiring for
 * lab/imaging. Behavioral (real-Postgres) coverage lives in
 * test/integration/concurrency/hospital-clinical-upgrades.test.ts.
 */
describe("Hospital lab/imaging permission split", () => {
  it("replaces the single manage permission with enter/verify keys in both permissions.ts and the seed duplicate", () => {
    for (const file of [permissions, seed]) {
      expect(file).toContain('HOSPITAL_LAB_ENTER: "hospital.lab.enter"');
      expect(file).toContain('HOSPITAL_LAB_VERIFY: "hospital.lab.verify"');
      expect(file).toContain('HOSPITAL_IMAGING_ENTER: "hospital.imaging.enter"');
      expect(file).toContain('HOSPITAL_IMAGING_VERIFY: "hospital.imaging.verify"');
    }
    expect(permissions).not.toContain("hospital.lab.manage");
    expect(permissions).not.toContain("hospital.imaging.manage");
    expect(seed).toContain('["hospital.lab.manage", PERMISSIONS.HOSPITAL_LAB_ENTER]');
    expect(seed).toContain('["hospital.imaging.manage", PERMISSIONS.HOSPITAL_IMAGING_ENTER]');
  });

  it("grants Laboratory Scientist and Radiology Staff both enter and verify, so today's single-role workflow keeps working", () => {
    expect(seed).toContain('"Laboratory Scientist": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_LAB_ENTER, PERMISSIONS.HOSPITAL_LAB_VERIFY])');
    expect(seed).toContain('"Radiology Staff": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_IMAGING_ENTER, PERMISSIONS.HOSPITAL_IMAGING_VERIFY])');
  });

  it("gates entry vs verification actions with the correct half of the split permission", () => {
    expect(actions).toContain('authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);\n  const parsed = parseWithSchema(z.object({ itemId: cuid, value: shortText');
    expect(actions).toMatch(/verifyLabResultAction[\s\S]{0,120}HOSPITAL_LAB_VERIFY/);
    expect(actions).toMatch(/verifyImagingFindingAction[\s\S]{0,120}HOSPITAL_IMAGING_VERIFY/);
  });
});

describe("Hospital lab/imaging maker-checker", () => {
  it("adds a configurable enforcement toggle to HospitalSettings, defaulting to enforced", () => {
    expect(schema).toContain("labImagingMakerCheckerEnforced Boolean  @default(true)");
  });

  it("rejects a verifier who is also the enterer, for both lab and imaging, when enforcement is on", () => {
    expect(service).toContain("The person who entered this result cannot also verify it.");
    expect(service).toContain("The person who entered this finding cannot also verify it.");
    expect(service).toContain("isMakerCheckerEnforced(organizationId)");
  });

  it("preserves immutable verified results and correction-by-supersession unchanged", () => {
    expect(service).toContain("Only a verified result can be corrected");
    expect(service).toContain("Only a verified finding can be corrected");
    expect(service).toContain("supersedesResultId: prior.id");
    expect(service).toContain("supersedesFindingId: prior.id");
  });
});

describe("Hospital lab/imaging rejection and audit", () => {
  it("adds rejection fields to both result models", () => {
    expect(schema).toMatch(/model HospitalLabResult \{[\s\S]*?rejectedById\s+String\?[\s\S]*?rejectedAt\s+DateTime\?[\s\S]*?rejectionReason\s+String\?/);
    expect(schema).toMatch(/model HospitalImagingFinding \{[\s\S]*?rejectedById\s+String\?[\s\S]*?rejectedAt\s+DateTime\?[\s\S]*?rejectionReason\s+String\?/);
  });

  it("logs a focused audit event for entry, verification, rejection, and correction on both lab and imaging", () => {
    for (const action of ["lab_result.entered", "lab_result.verified", "lab_result.rejected", "lab_result.corrected", "imaging_finding.entered", "imaging_finding.verified", "imaging_finding.rejected", "imaging_finding.corrected"]) {
      expect(service).toContain(`action: "${action}"`);
    }
  });

  it("exports rejectHospitalLabResult and rejectHospitalImagingFinding, gated by the verify permission at the action layer", () => {
    expect(service).toContain("export async function rejectHospitalLabResult(");
    expect(service).toContain("export async function rejectHospitalImagingFinding(");
    expect(actions).toContain("export async function rejectLabResultAction(");
    expect(actions).toContain("export async function rejectImagingFindingAction(");
  });
});

describe("Hospital duplicate-patient advisory", () => {
  it("never blocks registration — createHospitalPatient does not call the duplicate check itself", () => {
    const createFn = service.slice(service.indexOf("export async function createHospitalPatient"), service.indexOf("export async function createHospitalPatient") + 400);
    expect(createFn).not.toContain("findHospitalPatientDuplicates");
  });

  it("exposes an advisory-only server action that never redirects to an error, only returns state", () => {
    expect(actions).toContain("export async function checkPatientDuplicatesAction(");
    const fn = actions.slice(actions.indexOf("export async function checkPatientDuplicatesAction"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toContain("redirect(");
  });
});
