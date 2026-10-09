import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import * as school from "@/modules/school/service";
import * as comms from "@/modules/school/communications-service";
import * as chat from "@/modules/school/chat-service";
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

const staffViewer = (userId: string, canBroadcast = false, org: TestOrg = orgA): chat.ChatViewer => ({ kind: "staff", organizationId: org.organizationId, userId, name: `Staff ${userId.slice(-4)}`, canBroadcast });
const guardianViewer = async (userId: string) => {
  const viewer = await chat.resolveChatViewer({ organizationId: orgA.organizationId, userId }, (permission) => permission === "school.portal.view");
  if (!viewer) throw new Error("expected a guardian viewer");
  return viewer;
};
const unreadBell = (userId: string) => testDb.notification.count({ where: { organizationId: orgA.organizationId, userId, type: "SCHOOL_CHAT_MESSAGE", readAt: null } });

let teacherTwo: { id: string };
let dmId: string;
let groupId: string;

describe("School chat entitlements (real Postgres)", () => {
  it("lets staff chat with staff on School alone, and needs both add-ons for anything with a guardian", async () => {
    await grant(false, false);
    teacherTwo = await addMember(orgA, "Teacher", "teacher-two");
    await school.assignSchoolClassTeacher(orgA.organizationId, classTwo.id, teacherTwo.id);
    const staffChat = await chat.startDirectChat(staffViewer(teacherOne.id), admin.id);
    await chat.sendChatMessage(staffViewer(teacherOne.id), { chatId: staffChat.chatId, body: "Staff meeting at 3?", clientRequestId: rid() });
    expect(await chat.unreadChatTotal(staffViewer(admin.id))).toBe(1);
    await expect(chat.startDirectChat(staffViewer(teacherOne.id), guardianOne.user!.id)).rejects.toMatchObject({ code: "unavailable" });
    const guardian = await guardianViewer(guardianOne.user!.id);
    expect(await chat.listChats(guardian)).toEqual([]);
    await expect(chat.startDirectChat(guardian, teacherOne.id)).rejects.toMatchObject({ code: "unavailable" });
    await grant(true, true);
  }, 60_000);
});

describe("School chat (real Postgres)", () => {
  it("applies class scope both ways and never lets guardians message each other", async () => {
    const teacher = staffViewer(teacherOne.id);
    const one = await guardianViewer(guardianOne.user!.id);
    const two = await guardianViewer(guardianTwo.user!.id);
    dmId = (await chat.startDirectChat(teacher, guardianOne.user!.id)).chatId;
    expect((await chat.startDirectChat(one, teacherOne.id)).chatId).toBe(dmId);
    await expect(chat.startDirectChat(teacher, guardianTwo.user!.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(chat.startDirectChat(two, teacherOne.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(chat.startDirectChat(one, guardianTwo.user!.id)).rejects.toMatchObject({ code: "forbidden" });
    expect((await chat.startDirectChat(two, admin.id)).created).toBe(true);
    const contacts = await chat.listChatContacts(two);
    expect(contacts.staff.map((member) => member.userId)).toContain(admin.id);
    expect(contacts.staff.map((member) => member.userId)).not.toContain(teacherOne.id);
    expect(contacts.guardians).toEqual([]);
    const teacherContacts = await chat.listChatContacts(teacher);
    expect(teacherContacts.guardians.map((guardian) => guardian.userId)).toEqual([guardianOne.user!.id]);
  }, 60_000);

  it("sends once per form, tracks unread and seen state, and notifies through one bell entry per chat", async () => {
    const teacher = staffViewer(teacherOne.id);
    const one = await guardianViewer(guardianOne.user!.id);
    const requestId = rid();
    await chat.sendChatMessage(teacher, { chatId: dmId, body: "Ama did well in maths today.", clientRequestId: requestId });
    expect(await chat.sendChatMessage(teacher, { chatId: dmId, body: "Ama did well in maths today.", clientRequestId: requestId })).toMatchObject({ duplicate: true });
    expect(await testDb.schoolChatMessage.count({ where: { chatId: dmId } })).toBe(1);
    await chat.sendChatMessage(teacher, { chatId: dmId, body: "Homework is page 12.", clientRequestId: rid() });
    expect(await chat.unreadChatTotal(one)).toBe(2);
    expect(await unreadBell(guardianOne.user!.id)).toBe(1);
    const bell = await testDb.notification.findFirstOrThrow({ where: { userId: guardianOne.user!.id, type: "SCHOOL_CHAT_MESSAGE", readAt: null } });
    expect(bell.message).toContain("Homework is page 12.");

    const opened = await chat.getChat(one, dmId);
    expect(opened.messages.map((message) => message.body)).toEqual(["Ama did well in maths today.", "Homework is page 12."]);
    expect(await chat.unreadChatTotal(one)).toBe(0);
    expect(await unreadBell(guardianOne.user!.id)).toBe(0);
    expect((await chat.getChat(teacher, dmId)).messages.every((message) => message.seenByAll)).toBe(true);

    await chat.setChatPreferences(one, dmId, { mute: "always" });
    await chat.sendChatMessage(teacher, { chatId: dmId, body: "Reminder: sports kit tomorrow.", clientRequestId: rid() });
    expect(await unreadBell(guardianOne.user!.id)).toBe(0);
    await chat.setChatPreferences(one, dmId, { mute: "off", pinned: true });
    expect((await chat.listChats(one))[0]).toMatchObject({ id: dmId, pinned: true, unread: 1 });
  }, 60_000);

  it("supports replies, edits within 15 minutes, delete for everyone, and reactions", async () => {
    const teacher = staffViewer(teacherOne.id);
    const one = await guardianViewer(guardianOne.user!.id);
    const original = await testDb.schoolChatMessage.findFirstOrThrow({ where: { chatId: dmId, body: "Homework is page 12." } });
    await chat.sendChatMessage(one, { chatId: dmId, body: "Thank you, will check.", clientRequestId: rid(), replyToId: original.id });
    const withReply = await chat.getChat(teacher, dmId);
    expect(withReply.messages.at(-1)?.replyTo).toMatchObject({ id: original.id, preview: "Homework is page 12." });

    await chat.editChatMessage(teacher, { messageId: original.id, body: "Homework is page 14." });
    await expect(chat.editChatMessage(one, { messageId: original.id, body: "Changed" })).rejects.toMatchObject({ code: "forbidden" });
    await testDb.schoolChatMessage.update({ where: { id: original.id }, data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    await expect(chat.editChatMessage(teacher, { messageId: original.id, body: "Too late" })).rejects.toMatchObject({ code: "invalid" });
    // Restore the timestamp: members only see messages sent after they joined the chat.
    await testDb.schoolChatMessage.update({ where: { id: original.id }, data: { createdAt: new Date() } });

    await chat.reactToChatMessage(one, { messageId: original.id, emoji: "👍" });
    await chat.reactToChatMessage(one, { messageId: original.id, emoji: "❤️" });
    expect(await testDb.schoolChatReaction.findMany({ where: { messageId: original.id }, select: { emoji: true } })).toEqual([{ emoji: "❤️" }]);
    await chat.reactToChatMessage(one, { messageId: original.id, emoji: "❤️" });
    expect(await testDb.schoolChatReaction.count({ where: { messageId: original.id } })).toBe(0);

    await expect(chat.deleteChatMessage(one, original.id)).rejects.toMatchObject({ code: "forbidden" });
    await chat.deleteChatMessage(teacher, original.id);
    const deleted = (await chat.getChat(one, dmId)).messages.find((message) => message.id === original.id);
    expect(deleted).toMatchObject({ deleted: true, body: "" });
  }, 60_000);

  it("shares photos and documents only with members of the chat", async () => {
    const one = await guardianViewer(guardianOne.user!.id);
    const two = await guardianViewer(guardianTwo.user!.id);
    await chat.sendChatMessage(one, { chatId: dmId, body: "Signed form attached", clientRequestId: rid(), attachment: { fileName: "form.pdf", mimeType: "application/pdf", size: 6, dataUrl: "data:application/pdf;base64,JVBERi0x" } });
    const message = await testDb.schoolChatMessage.findFirstOrThrow({ where: { chatId: dmId, kind: "ATTACHMENT" } });
    const file = await chat.getChatAttachment(staffViewer(teacherOne.id), message.id);
    expect(file.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(chat.getChatAttachment(two, message.id)).rejects.toMatchObject({ code: "not-found" });
    await expect(chat.getChatAttachment(staffViewer(orgB.userId, false, orgB), message.id)).rejects.toMatchObject({ code: "not-found" });
  }, 60_000);

  it("lets only staff create groups, with admin controls, announcement mode, removal, and leaving", async () => {
    const adminViewer = staffViewer(admin.id);
    const one = await guardianViewer(guardianOne.user!.id);
    const two = await guardianViewer(guardianTwo.user!.id);
    await expect(chat.createGroupChat(staffViewer(teacherOne.id), { name: "Mixed parents", memberUserIds: [guardianTwo.user!.id] })).rejects.toMatchObject({ code: "forbidden" });
    groupId = (await chat.createGroupChat(adminViewer, { name: "Year group parents", memberUserIds: [teacherOne.id, guardianOne.user!.id, guardianTwo.user!.id] })).chatId;
    expect(await testDb.schoolChatMessage.count({ where: { chatId: groupId, kind: "SYSTEM" } })).toBe(1);
    // Check the bell before opening the chat: opening it marks the chat notification read.
    expect(await unreadBell(guardianTwo.user!.id)).toBeGreaterThan(0);
    expect((await chat.getChat(two, groupId)).members).toHaveLength(4);
    expect(await unreadBell(guardianTwo.user!.id)).toBe(0);

    await chat.updateGroupSettings(adminViewer, groupId, { name: "Year group parents", onlyAdminsCanPost: true });
    await expect(chat.sendChatMessage(one, { chatId: groupId, body: "Hello all", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
    await expect(chat.sendChatMessage(staffViewer(teacherOne.id), { chatId: groupId, body: "Hello", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
    await chat.sendChatMessage(adminViewer, { chatId: groupId, body: "Welcome to the group.", clientRequestId: rid() });
    await chat.setGroupAdmin(adminViewer, groupId, teacherOne.id, true);
    await chat.sendChatMessage(staffViewer(teacherOne.id), { chatId: groupId, body: "Hello from your teacher.", clientRequestId: rid() });
    await expect(chat.setGroupAdmin(adminViewer, groupId, guardianOne.user!.id, true)).rejects.toMatchObject({ code: "invalid" });
    await expect(chat.addGroupMembers(staffViewer(teacherOne.id), groupId, [noPortalGuardian.guardian.id])).rejects.toThrow();

    await chat.updateGroupSettings(adminViewer, groupId, { name: "Year group parents", onlyAdminsCanPost: false });
    const sent = await chat.sendChatMessage(one, { chatId: groupId, body: "Off-topic message", clientRequestId: rid() });
    await chat.deleteChatMessage(adminViewer, sent.messageId!);
    expect(await testDb.auditLog.count({ where: { organizationId: orgA.organizationId, action: "school.chat.message_removed_by_admin", entityId: sent.messageId! } })).toBe(1);

    await chat.removeGroupMember(adminViewer, groupId, guardianTwo.user!.id);
    await expect(chat.getChat(two, groupId)).rejects.toMatchObject({ code: "not-found" });
    expect((await chat.listChats(two)).map((item) => item.id)).not.toContain(groupId);
    await chat.leaveChat(one, groupId);
    await expect(chat.getChat(one, groupId)).rejects.toMatchObject({ code: "not-found" });
    await expect(chat.leaveChat(one, dmId)).rejects.toMatchObject({ code: "invalid" });
  }, 90_000);

  it("delivers broadcast lists privately into each recipient's own chat", async () => {
    const broadcaster = staffViewer(admin.id, true);
    await expect(chat.broadcastMessage(staffViewer(teacherOne.id), { audience: "ALL_STAFF", body: "Hi", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
    const requestId = rid();
    expect(await chat.broadcastMessage(broadcaster, { audience: "CLASS_GUARDIANS", classId: classOne.id, body: "Class One trip on Friday.", clientRequestId: requestId })).toMatchObject({ recipients: 1, duplicate: false });
    expect(await chat.broadcastMessage(broadcaster, { audience: "CLASS_GUARDIANS", classId: classOne.id, body: "Class One trip on Friday.", clientRequestId: requestId })).toMatchObject({ duplicate: true });
    expect(await chat.broadcastMessage(broadcaster, { audience: "ALL_GUARDIANS", body: "School closes early on Monday.", clientRequestId: rid() })).toMatchObject({ recipients: 2 });
    const one = await guardianViewer(guardianOne.user!.id);
    const two = await guardianViewer(guardianTwo.user!.id);
    const oneChat = (await chat.listChats(one)).find((item) => item.type === "DIRECT" && item.preview.includes("School closes early"));
    expect(oneChat).toBeTruthy();
    const oneMessages = (await chat.getChat(one, oneChat!.id)).messages;
    expect(oneMessages.filter((message) => message.broadcast).map((message) => message.body)).toEqual(["Class One trip on Friday.", "School closes early on Monday."]);
    const twoChats = await chat.listChats(two);
    const twoBroadcast = twoChats.find((item) => item.preview.includes("School closes early"));
    expect((await chat.getChat(two, twoBroadcast!.id)).messages.map((message) => message.body)).not.toContain("Class One trip on Friday.");
    expect(twoBroadcast!.id).not.toBe(oneChat!.id);
  }, 90_000);

  it("never exposes chats across organizations, including at the database level", async () => {
    const outsider = staffViewer(orgB.userId, false, orgB);
    await testDb.organization.update({ where: { id: orgB.organizationId }, data: { schoolPortalGranted: true, schoolGuardianMessagingGranted: true } });
    await expect(chat.getChat(outsider, dmId)).rejects.toMatchObject({ code: "not-found" });
    await expect(chat.sendChatMessage(outsider, { chatId: dmId, body: "Cross tenant", clientRequestId: rid() })).rejects.toMatchObject({ code: "not-found" });
    await expect(chat.startDirectChat(outsider, guardianOne.user!.id)).rejects.toThrow();
    await expect(testDb.schoolChatMember.create({ data: { organizationId: orgB.organizationId, chatId: dmId, userId: orgB.userId, side: "STAFF", displayName: "Outsider" } })).rejects.toThrow();
  }, 60_000);

  it("ends a guardian's access when they no longer have a linked child", async () => {
    await testDb.schoolStudentGuardian.deleteMany({ where: { guardianId: guardianOne.guardian.id, studentId: studentOne.id } });
    expect(await chat.resolveChatViewer({ organizationId: orgA.organizationId, userId: guardianOne.user!.id }, (permission) => permission === "school.portal.view")).toBeNull();
    await expect(chat.sendChatMessage(staffViewer(teacherOne.id), { chatId: dmId, body: "Are you there?", clientRequestId: rid() })).rejects.toMatchObject({ code: "forbidden" });
    await testDb.schoolStudentGuardian.create({ data: { organizationId: orgA.organizationId, studentId: studentOne.id, guardianId: guardianOne.guardian.id, relationship: "Parent", primary: true } });
  }, 60_000);
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
    expect(await comms.getGuardianUnreadSummary(orgA.organizationId, guardianOne.user!.id)).toMatchObject({ announcements: 0, messagingAvailable: false });
    await grant(true, true);
  });
});
