import "server-only";
import type { CustomerFeedbackCategory, CustomerFeedbackStatus } from "@prisma/client";
import { db } from "@/lib/db";

export class FeedbackRateLimitError extends Error {}
export class FeedbackNotFoundError extends Error {}
export class FeedbackPublicationError extends Error {}

export function plainFeedbackText(value: string, max: number) {
  return value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function submitCustomerFeedback(input: {
  organizationId: string;
  userId: string;
  category: CustomerFeedbackCategory;
  rating: number;
  title: string;
  message: string;
  jobTitle?: string | null;
  consentToPublish: boolean;
  consentDisplayName: boolean;
  consentDisplayOrganization: boolean;
  consentDisplayLogo: boolean;
}) {
  const [organization, user, recent] = await Promise.all([
    db.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
    db.user.findUnique({ where: { id: input.userId }, select: { name: true, firstName: true, email: true } }),
    db.customerFeedback.findFirst({
      where: { userId: input.userId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
      select: { id: true },
    }),
  ]);
  if (!organization || !user) throw new FeedbackNotFoundError();
  if (recent) throw new FeedbackRateLimitError();

  const publishable = input.category === "TESTIMONIAL" && input.consentToPublish;
  const created = await db.customerFeedback.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      category: input.category,
      rating: Math.max(1, Math.min(5, input.rating)),
      title: plainFeedbackText(input.title, 120),
      message: plainFeedbackText(input.message, 1200),
      jobTitleSnapshot: plainFeedbackText(input.jobTitle || "", 100) || null,
      submitterNameSnapshot: plainFeedbackText(user.name || user.firstName || user.email, 120),
      organizationNameSnapshot: plainFeedbackText(organization.name, 160),
      consentToPublish: publishable,
      consentDisplayName: publishable && input.consentDisplayName,
      consentDisplayOrganization: publishable && input.consentDisplayOrganization,
      consentDisplayLogo: publishable && input.consentDisplayLogo,
      events: { create: { actorId: input.userId, toStatus: "SUBMITTED", note: publishable ? "Submitted with publication consent." : "Submitted as private product feedback." } },
    },
  });
  return created;
}

export function listMyFeedback(organizationId: string, userId: string) {
  return db.customerFeedback.findMany({ where: { organizationId, userId }, orderBy: { createdAt: "desc" } });
}

export async function withdrawCustomerFeedback(organizationId: string, userId: string, feedbackId: string) {
  const current = await db.customerFeedback.findFirst({ where: { id: feedbackId, organizationId, userId } });
  if (!current) throw new FeedbackNotFoundError();
  if (current.status === "WITHDRAWN") return current;
  return db.customerFeedback.update({
    where: { id: current.id },
    data: {
      status: "WITHDRAWN",
      consentToPublish: false,
      displayPerson: false,
      displayOrganization: false,
      displayLogo: false,
      withdrawnAt: new Date(),
      events: { create: { actorId: userId, fromStatus: current.status, toStatus: "WITHDRAWN", note: "Publication consent withdrawn by submitter." } },
    },
  });
}

export async function moderateCustomerFeedback(input: {
  feedbackId: string;
  actorId: string;
  status: CustomerFeedbackStatus;
  publishedMessage?: string | null;
  moderationNote?: string | null;
  displayPerson: boolean;
  displayOrganization: boolean;
  displayLogo: boolean;
  publicationOrder: number;
}) {
  const current = await db.customerFeedback.findUnique({ where: { id: input.feedbackId } });
  if (!current) throw new FeedbackNotFoundError();
  if (current.status === "WITHDRAWN") throw new FeedbackPublicationError("Withdrawn feedback cannot be moderated.");
  if (input.status === "PUBLISHED" && (current.category !== "TESTIMONIAL" || !current.consentToPublish)) {
    throw new FeedbackPublicationError("Publication consent is required.");
  }
  const displayPerson = input.status === "PUBLISHED" && current.consentDisplayName && input.displayPerson;
  const displayOrganization = input.status === "PUBLISHED" && current.consentDisplayOrganization && input.displayOrganization;
  const displayLogo = displayOrganization && current.consentDisplayLogo && input.displayLogo;
  return db.customerFeedback.update({
    where: { id: current.id },
    data: {
      status: input.status,
      publishedMessage: plainFeedbackText(input.publishedMessage || current.message, 1200),
      moderationNote: plainFeedbackText(input.moderationNote || "", 1000) || null,
      displayPerson,
      displayOrganization,
      displayLogo,
      publicationOrder: Math.max(0, Math.min(9999, input.publicationOrder)),
      reviewedById: input.actorId,
      reviewedAt: new Date(),
      publishedAt: input.status === "PUBLISHED" ? new Date() : current.publishedAt,
      events: { create: { actorId: input.actorId, fromStatus: current.status, toStatus: input.status, note: plainFeedbackText(input.moderationNote || "Moderation updated.", 1000) } },
    },
  });
}

export function listPublishedTestimonials() {
  return db.customerFeedback.findMany({
    where: { status: "PUBLISHED", category: "TESTIMONIAL", consentToPublish: true },
    select: {
      id: true, rating: true, publishedMessage: true, message: true, jobTitleSnapshot: true,
      submitterNameSnapshot: true, organizationNameSnapshot: true, displayPerson: true,
      displayOrganization: true, displayLogo: true, organizationId: true,
      organization: { select: { industry: true, logoUrl: true } },
    },
    orderBy: [{ publicationOrder: "asc" }, { publishedAt: "desc" }],
    take: 12,
  });
}
