import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";
import { listMyFeedback, listPublishedTestimonials, moderateCustomerFeedback, submitCustomerFeedback, withdrawCustomerFeedback } from "@/lib/customer-feedback";

let orgA: TestOrg;
let orgB: TestOrg;
let reviewerId: string;

beforeAll(async () => {
  orgA = await createTestOrg("feedback-a");
  orgB = await createTestOrg("feedback-b");
  reviewerId = (await testDb.user.create({ data: { name: "Feedback Reviewer", email: `feedback-reviewer-${Date.now()}@example.invalid`, status: "ACTIVE" } })).id;
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
  await testDb.user.delete({ where: { id: reviewerId } }).catch(() => {});
});

describe("customer feedback tenant isolation and publication", () => {
  it("keeps private feedback scoped, publishes only consented testimonials, and honors withdrawal", async () => {
    const testimonial = await submitCustomerFeedback({ organizationId: orgA.organizationId, userId: orgA.userId, category: "TESTIMONIAL", rating: 5, title: "Clear operations", message: "The workspace keeps our work visible.", consentToPublish: true, consentDisplayName: true, consentDisplayOrganization: true, consentDisplayLogo: false });
    await submitCustomerFeedback({ organizationId: orgB.organizationId, userId: orgB.userId, category: "PROBLEM", rating: 2, title: "Private problem", message: "This must remain private.", consentToPublish: true, consentDisplayName: true, consentDisplayOrganization: true, consentDisplayLogo: true });

    expect((await listMyFeedback(orgA.organizationId, orgA.userId)).map((item) => item.id)).toEqual([testimonial.id]);
    expect(await listMyFeedback(orgB.organizationId, orgA.userId)).toEqual([]);

    await moderateCustomerFeedback({ feedbackId: testimonial.id, actorId: reviewerId, status: "PUBLISHED", publishedMessage: testimonial.message, moderationNote: "Approved without changing meaning.", displayPerson: true, displayOrganization: true, displayLogo: false, publicationOrder: 1 });
    expect((await listPublishedTestimonials()).some((item) => item.id === testimonial.id)).toBe(true);

    await withdrawCustomerFeedback(orgA.organizationId, orgA.userId, testimonial.id);
    expect((await listPublishedTestimonials()).some((item) => item.id === testimonial.id)).toBe(false);
    await expect(withdrawCustomerFeedback(orgB.organizationId, orgB.userId, testimonial.id)).rejects.toThrow();
  });
});
