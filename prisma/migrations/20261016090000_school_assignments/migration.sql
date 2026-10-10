-- CreateEnum
CREATE TYPE "SchoolAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'GRADED');

-- CreateEnum
CREATE TYPE "SchoolAssignmentQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'NUMERIC', 'SHORT_TEXT', 'ESSAY');

-- CreateEnum
CREATE TYPE "SchoolAssignmentAttemptScoring" AS ENUM ('HIGHEST', 'LATEST');

-- CreateEnum
CREATE TYPE "SchoolAssignmentFeedbackRelease" AS ENUM ('IMMEDIATE', 'AFTER_DUE', 'ON_RELEASE');

-- CreateEnum
CREATE TYPE "SchoolAssignmentGradingStatus" AS ENUM ('PENDING_REVIEW', 'AUTO_GRADED', 'REVIEWED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "schoolAssignmentsGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolAssignmentsGrantedAt" TIMESTAMP(3),
ADD COLUMN     "schoolAssignmentsGrantedById" TEXT;

-- CreateTable
CREATE TABLE "AddonPricingPlan" (
    "id" TEXT NOT NULL,
    "addonKey" TEXT NOT NULL,
    "monthlyGhs" DECIMAL(18,2) NOT NULL,
    "annualGhs" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddonPricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "SchoolAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "availableFrom" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "attemptScoring" "SchoolAssignmentAttemptScoring" NOT NULL DEFAULT 'HIGHEST',
    "feedbackRelease" "SchoolAssignmentFeedbackRelease" NOT NULL DEFAULT 'ON_RELEASE',
    "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT false,
    "includeInGradebook" BOOLEAN NOT NULL DEFAULT false,
    "gradebookExamId" TEXT,
    "currentVersionId" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAssignmentQuestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "SchoolAssignmentQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "points" DECIMAL(6,2) NOT NULL,
    "options" JSONB,
    "correctOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numericAnswer" DECIMAL(18,6),
    "numericTolerance" DECIMAL(18,6),
    "markingGuide" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssignmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAssignmentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAssignmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAssignmentSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "gradingStatus" "SchoolAssignmentGradingStatus" NOT NULL,
    "autoScore" DECIMAL(8,2) NOT NULL,
    "score" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2) NOT NULL,
    "questionResults" JSONB NOT NULL,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAssignmentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "submissionId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddonPricingPlan_addonKey_key" ON "AddonPricingPlan"("addonKey");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignment_gradebookExamId_key" ON "SchoolAssignment"("gradebookExamId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignment_currentVersionId_key" ON "SchoolAssignment"("currentVersionId");

-- CreateIndex
CREATE INDEX "SchoolAssignment_organizationId_classId_status_idx" ON "SchoolAssignment"("organizationId", "classId", "status");

-- CreateIndex
CREATE INDEX "SchoolAssignment_organizationId_termId_subjectId_idx" ON "SchoolAssignment"("organizationId", "termId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignment_organizationId_id_key" ON "SchoolAssignment"("organizationId", "id");

-- CreateIndex
CREATE INDEX "SchoolAssignmentQuestion_organizationId_assignmentId_positi_idx" ON "SchoolAssignmentQuestion"("organizationId", "assignmentId", "position");

-- CreateIndex
CREATE INDEX "SchoolAssignmentVersion_organizationId_idx" ON "SchoolAssignmentVersion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignmentVersion_assignmentId_version_key" ON "SchoolAssignmentVersion"("assignmentId", "version");

-- CreateIndex
CREATE INDEX "SchoolAssignmentSubmission_organizationId_studentId_idx" ON "SchoolAssignmentSubmission"("organizationId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolAssignmentSubmission_assignmentId_gradingStatus_idx" ON "SchoolAssignmentSubmission"("assignmentId", "gradingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignmentSubmission_assignmentId_studentId_attemptNu_key" ON "SchoolAssignmentSubmission"("assignmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAssignmentSubmission_assignmentId_studentId_idempoten_key" ON "SchoolAssignmentSubmission"("assignmentId", "studentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SchoolAssignmentEvent_organizationId_assignmentId_createdAt_idx" ON "SchoolAssignmentEvent"("organizationId", "assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAssignmentEvent_submissionId_idx" ON "SchoolAssignmentEvent"("submissionId");

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_gradebookExamId_fkey" FOREIGN KEY ("gradebookExamId") REFERENCES "SchoolExam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "SchoolAssignmentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentQuestion" ADD CONSTRAINT "SchoolAssignmentQuestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentQuestion" ADD CONSTRAINT "SchoolAssignmentQuestion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentVersion" ADD CONSTRAINT "SchoolAssignmentVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentVersion" ADD CONSTRAINT "SchoolAssignmentVersion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SchoolAssignmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentEvent" ADD CONSTRAINT "SchoolAssignmentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentEvent" ADD CONSTRAINT "SchoolAssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAssignmentEvent" ADD CONSTRAINT "SchoolAssignmentEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SchoolAssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

