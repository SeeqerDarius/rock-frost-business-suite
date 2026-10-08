import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import * as school from "@/modules/school/service";
import * as comms from "@/modules/school/communications-service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

let orgA: TestOrg;
let orgB: TestOrg;
const extraUserIds: string[] = [];
let n = 0;
const rid = () => `req-${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(label: string) {
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await testDb.user.create({ data: { name: `Comms ${label}`, email: `itest-${runId}@example.invalid`, passwordHash: await bcrypt.hash("not-a-real-password", 4), status: "ACTIVE" } });
  extraUserIds.push(user.id);
  return user;
}
async function addMember(org: TestOrg, roleName: string, label: string) {
  const user = await makeUser(label);
  const role = await testDb.role.findFirstOrThrow({ where: { organizationId: null, name: roleName } });
  await testDb.organizationMember.create({ data: { organizationId: org.organizationId, userId: user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date() } });
  return user;
}
async function guardianFor(org: TestOrg, studentId: string, label: string, withPortal = true) {
  const user = withPortal ? await addMember(org, "Parent", label) : null;
  const guardian = await testDb.schoolGuardian.create({ data: { organizationId: org.organizationId, guardianNumber: `G-${label}-${Date.now()}`, firstName: label, lastName: "Guardian", phone: "0240000000", userId: user?.id ?? null } });
  await testDb.schoolStudentGuardian.create({ data: { organizationId: org.organizationId, studentId, guardianId: guardian.id, relationship: "Parent", primary: true } });
  return { guardian, user };
}
const staff = (org: TestOrg, userId: string, extra: Partial<comms.StaffActor> = {}): comms.StaffActor => ({ organizationId: org.organizationId, userId, canViewSchool: true, canManageMessages: true, canPublishAnnouncements: false, ...extra });

let classOne: { id: string };
let classTwo: { id: string };
let studentOne: { id: string };
let studentTwo: { id: string };
let guardianOne: Awaited<ReturnType<typeof guardianFor>>;
let guardianTwo: Awaited<ReturnType<typeof guardianFor>>;
let noPortalGuardian: Awaited<ReturnType<typeof guardianFor>>;
let teacherOne: { id: string };
let admin: { id: string };

beforeAll(async () => {
  orgA = await createTestOrg("school-comms-a");
  orgB = await createTestOrg("school-comms-b");
  const token = `Comms${Date.now()}`;
  const campus = await school.createSchoolCampus(orgA.organizationId, { code: `C${Date.now() % 100000}`, name: `${token} campus` });
  const year = await school.createSchoolAcademicYear(orgA.organizationId, { name: `${token} year`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") });
  classOne = await school.createSchoolClass(orgA.organizationId, { campusId: campus.id, code: `${token}1`, name: `${token} One` });
  classTwo = await school.createSchoolClass(orgA.organizationId, { campusId: campus.id, code: `${token}2`, name: `${token} Two` });
  studentOne = await school.createSchoolStudent(orgA.organizationId, { campusId: campus.id, firstName: "Ama", lastName: "One" });
  studentTwo = await school.createSchoolStudent(orgA.organizationId, { campusId: campus.id, firstName: "Kojo", lastName: "Two" });
  await testDb.schoolStudent.updateMany({ where: { id: { in: [studentOne.id, studentTwo.id] } }, data: { status: "ACTIVE" } });
  await school.enrollSchoolStudent(orgA.organizationId, { campusId: campus.id, academicYearId: year.id, studentId: studentOne.id, classId: classOne.id });
  await school.enrollSchoolStudent(orgA.organizationId, { campusId: campus.id, academicYearId: year.id, studentId: studentTwo.id, classId: classTwo.id });
  guardianOne = await guardianFor(orgA, studentOne.id, "One");
  guardianTwo = await guardianFor(orgA, studentTwo.id, "Two");
  noPortalGuardian = await guardianFor(orgA, studentOne.id, "NoPortal", false);
  teacherOne = await addMember(orgA, "Teacher", "teacher-one");
  admin = await addMember(orgA, "School Administrator", "admin");
  await school.assignSchoolClassTeacher(orgA.organizationId, classOne.id, teacherOne.id);
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
  for (const userId of extraUserIds) await testDb.user.delete({ where: { id: userId } }).catch(() => {});
});

const grant = (portal: boolean, messaging: boolean) => testDb.organization.update({ where: { id: orgA.organizationId }, data: { schoolPortalGranted: portal, schoolGuardianMessagingGranted: messaging } });

describe("School communications entitlements (real Postgres)", () => {
  it("keeps direct messaging off until both the portal and guardian messaging add-ons are granted", async () => {
    await grant(true, false);
    await expect(comms.listStaffConversations(staff(orgA, admin.id))).rejects.toMatchObject({ code: "unavailable" });
    await expect(comms.startGuardianConversation(orgA.organizationId, guardianOne.user!.id, { studentId: studentOne.id, subject: "Hello", body: "Hi", clientRequestId: rid() })).rejects.toMatchObject({ code: "unavailable" });
    await grant(false, true);
    expect(await comms.isGuardianMessagingAvailable(orgA.organizationId)).toBe(false);
    await grant(true, true);
    expect(await comms.isGuardianMessagingAvailable(orgA.organizationId)).toBe(true);
  });
});

describe("School conversations (real Postgres)", () => {
  let conversationId: string;

  it("limits a class teacher to students in their classes and guardians with portal accounts", async () => {
    const teacher = staff(orgA, teacherOne.id);
    const students = await comms.listMessageableStudents(teacher);
    expect(students.map((student) => student.id)).toEqual([studentOne.id]);
    expect(students[0].guardians.map((guardian) => guardian.id)).toEqual([guardianOne.guardian.id]);
    await expect(comms.startStaffConversation(teacher, { studentId: studentTwo.id, guardianId: guardianTwo.guardian.id, subject: "Homework", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianTwo.guardian.id, subject: "Homework", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: noPortalGuardian.guardian.id, subject: "Homework", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(staff(orgA, teacherOne.id, { canManageMessages: false }), { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Homework", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects invalid input before writing anything", async () => {
    const teacher = staff(orgA, teacherOne.id);
    const before = await testDb.schoolConversation.count({ where: { organizationId: orgA.organizationId } });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: " ", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Hi there", body: "   ", clientRequestId: rid() })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Hi there", body: "x".repeat(4001), clientRequestId: rid() })).rejects.toMatchObject({ code: "invalid" });
    await expect(comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Hi there", body: "Hello", clientRequestId: "bad id!" })).rejects.toMatchObject({ code: "invalid" });
    expect(await testDb.schoolConversation.count({ where: { organizationId: orgA.organizationId } })).toBe(before);
  });

  it("starts a conversation once per submitted form and tracks unread state for each reader", async () => {
    const teacher = staff(orgA, teacherOne.id);
    const requestId = rid();
    const first = await comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Reading progress", body: "Ama read very well today.", clientRequestId: requestId });
    const repeat = await comms.startStaffConversation(teacher, { studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Reading progress", body: "Ama read very well today.", clientRequestId: requestId });
    expect(repeat).toEqual({ conversationId: first.conversationId, duplicate: true });
    conversationId = first.conversationId;
    expect(await testDb.schoolMessage.count({ where: { conversationId } })).toBe(1);

    const guardianUserId = guardianOne.user!.id;
    expect((await comms.getGuardianUnreadSummary(orgA.organizationId, guardianUserId)).messages).toBe(1);
    const thread = await comms.getGuardianConversation(orgA.organizationId, guardianUserId, conversationId);
    expect(thread.messages.map((message) => message.senderSide)).toEqual(["STAFF"]);
    expect((await comms.getGuardianUnreadSummary(orgA.organizationId, guardianUserId)).messages).toBe(0);

    const replyId = rid();
    await comms.sendGuardianMessage(orgA.organizationId, guardianUserId, { conversationId, body: "Thank you!", clientRequestId: replyId });
    expect(await comms.sendGuardianMessage(orgA.organizationId, guardianUserId, { conversationId, body: "Thank you!", clientRequestId: replyId })).toMatchObject({ duplicate: true });
    expect(await testDb.schoolMessage.count({ where: { conversationId } })).toBe(2);

    // The teacher and an unrestricted administrator each see the reply as unread until they open it.
    expect((await comms.getStaffUnreadSummary(teacher)).messages).toBe(1);
    expect((await comms.getStaffUnreadSummary(staff(orgA, admin.id))).messages).toBe(2);
    const staffList = await comms.listStaffConversations(teacher);
    expect(staffList.find((row) => row.id === conversationId)?.unread).toBe(1);
    await comms.getStaffConversation(teacher, conversationId);
    expect((await comms.getStaffUnreadSummary(teacher)).messages).toBe(0);
  });

  it("never shows a conversation to an out-of-scope teacher, another guardian, a student account, or another organization", async () => {
    const otherTeacher = await addMember(orgA, "Teacher", "teacher-two");
    await school.assignSchoolClassTeacher(orgA.organizationId, classTwo.id, otherTeacher.id);
    await expect(comms.getStaffConversation(staff(orgA, otherTeacher.id), conversationId)).rejects.toMatchObject({ code: "not-found" });
    expect((await comms.listStaffConversations(staff(orgA, otherTeacher.id))).map((row) => row.id)).not.toContain(conversationId);
    await expect(comms.getGuardianConversation(orgA.organizationId, guardianTwo.user!.id, conversationId)).rejects.toMatchObject({ code: "not-found" });
    await expect(comms.sendGuardianMessage(orgA.organizationId, guardianTwo.user!.id, { conversationId, body: "Not mine", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
    const studentUser = await makeUser("student-login");
    await testDb.schoolStudent.update({ where: { id: studentTwo.id }, data: { userId: studentUser.id } });
    await expect(comms.listGuardianConversations(orgA.organizationId, studentUser.id)).rejects.toMatchObject({ code: "forbidden" });
    await testDb.organization.update({ where: { id: orgB.organizationId }, data: { schoolPortalGranted: true, schoolGuardianMessagingGranted: true } });
    await expect(comms.getStaffConversation(staff(orgB, orgB.userId), conversationId)).rejects.toMatchObject({ code: "not-found" });
    await expect(comms.sendStaffMessage(staff(orgB, orgB.userId), { conversationId, body: "Cross tenant", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a conversation row that points at another organization's student at the database level", async () => {
    await expect(testDb.schoolConversation.create({ data: { organizationId: orgB.organizationId, studentId: studentOne.id, guardianId: guardianOne.guardian.id, subject: "Cross tenant", startedBySide: "STAFF", createdById: orgB.userId } })).rejects.toThrow();
  });

  it("removes guardian access when the student link is removed, and blocks replies on closed conversations", async () => {
    const teacher = staff(orgA, teacherOne.id);
    await comms.setConversationStatus(teacher, conversationId, "CLOSED");
    await expect(comms.sendGuardianMessage(orgA.organizationId, guardianOne.user!.id, { conversationId, body: "One more thing", clientRequestId: rid() })).rejects.toMatchObject({ code: "closed" });
    await expect(comms.sendStaffMessage(teacher, { conversationId, body: "Reply", clientRequestId: rid() })).rejects.toMatchObject({ code: "closed" });
    await comms.setConversationStatus(teacher, conversationId, "OPEN");
    await testDb.schoolStudentGuardian.deleteMany({ where: { guardianId: guardianOne.guardian.id, studentId: studentOne.id } });
    await expect(comms.getGuardianConversation(orgA.organizationId, guardianOne.user!.id, conversationId)).rejects.toMatchObject({ code: "not-found" });
    await testDb.schoolStudentGuardian.create({ data: { organizationId: orgA.organizationId, studentId: studentOne.id, guardianId: guardianOne.guardian.id, relationship: "Parent", primary: true } });
    expect(await testDb.auditLog.count({ where: { organizationId: orgA.organizationId, entityId: conversationId, action: { in: ["school.conversation.started", "school.conversation.closed", "school.conversation.reopened"] } } })).toBe(3);
  });

  it("lets a guardian start a conversation only about their own linked child", async () => {
    await expect(comms.startGuardianConversation(orgA.organizationId, guardianOne.user!.id, { studentId: studentTwo.id, subject: "Question", body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
    const started = await comms.startGuardianConversation(orgA.organizationId, guardianOne.user!.id, { studentId: studentOne.id, subject: "Sick day", body: "Ama is unwell today.", clientRequestId: rid() });
    expect((await comms.listStaffConversations(staff(orgA, teacherOne.id))).map((row) => row.id)).toContain(started.conversationId);
  });
});

describe("School announcements (real Postgres)", () => {
  it("requires the publish permission and a valid audience", async () => {
    await expect(comms.publishAnnouncement(staff(orgA, teacherOne.id), { title: "Sports day", body: "Friday", audience: "ALL_GUARDIANS", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
    await expect(comms.publishAnnouncement(staff(orgA, admin.id, { canPublishAnnouncements: true }), { title: "Class trip", body: "Monday", audience: "CLASS_GUARDIANS", clientRequestId: rid() })).rejects.toMatchObject({ code: "invalid" });
    await expect(testDb.schoolAnnouncement.create({ data: { organizationId: orgA.organizationId, title: "Bad", body: "Bad", audience: "ALL_GUARDIANS", classId: classOne.id, publishedById: admin.id, publishedByName: "Admin", clientRequestId: rid() } })).rejects.toThrow();
  });

  it("targets guardians by class, tracks read state, deduplicates, and hides withdrawn notices", async () => {
    const publisher = staff(orgA, admin.id, { canPublishAnnouncements: true });
    const requestId = rid();
    await comms.publishAnnouncement(publisher, { title: "Class One trip", body: "Bring a packed lunch.", audience: "CLASS_GUARDIANS", classId: classOne.id, clientRequestId: requestId });
    expect(await comms.publishAnnouncement(publisher, { title: "Class One trip", body: "Bring a packed lunch.", audience: "CLASS_GUARDIANS", classId: classOne.id, clientRequestId: requestId })).toMatchObject({ duplicate: true });
    await comms.publishAnnouncement(publisher, { title: "School closed Monday", body: "Public holiday.", audience: "EVERYONE", clientRequestId: rid() });
    await comms.publishAnnouncement(publisher, { title: "Staff meeting", body: "3pm in the hall.", audience: "STAFF", clientRequestId: rid() });

    expect((await comms.getGuardianUnreadSummary(orgA.organizationId, guardianOne.user!.id)).announcements).toBe(2);
    expect((await comms.getGuardianUnreadSummary(orgA.organizationId, guardianTwo.user!.id)).announcements).toBe(1);
    const seen = await comms.listGuardianAnnouncements(orgA.organizationId, guardianTwo.user!.id);
    expect(seen.map((announcement) => announcement.title)).toEqual(["School closed Monday"]);
    expect((await comms.getGuardianUnreadSummary(orgA.organizationId, guardianTwo.user!.id)).announcements).toBe(0);

    const teacher = staff(orgA, teacherOne.id);
    expect((await comms.getStaffUnreadSummary(teacher)).announcements).toBe(2);
    await comms.listStaffAnnouncements(teacher);
    expect((await comms.getStaffUnreadSummary(teacher)).announcements).toBe(0);

    const trip = await testDb.schoolAnnouncement.findFirstOrThrow({ where: { organizationId: orgA.organizationId, title: "Class One trip" } });
    await expect(comms.withdrawAnnouncement(staff(orgB, orgB.userId, { canPublishAnnouncements: true }), trip.id)).rejects.toMatchObject({ code: "not-found" });
    await comms.withdrawAnnouncement(publisher, trip.id);
    expect((await comms.listGuardianAnnouncements(orgA.organizationId, guardianOne.user!.id)).map((announcement) => announcement.title)).not.toContain("Class One trip");
    expect((await comms.listStaffAnnouncements(teacher)).map((announcement) => announcement.id)).not.toContain(trip.id);
  });

  it("hides guardian announcements when the portal add-on is revoked", async () => {
    await grant(false, true);
    await expect(comms.listGuardianAnnouncements(orgA.organizationId, guardianOne.user!.id)).rejects.toMatchObject({ code: "unavailable" });
    expect(await comms.getGuardianUnreadSummary(orgA.organizationId, guardianOne.user!.id)).toMatchObject({ messages: 0, announcements: 0, messagingAvailable: false });
    await grant(true, true);
  });
});
