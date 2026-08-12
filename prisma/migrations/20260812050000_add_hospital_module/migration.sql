-- CreateEnum
CREATE TYPE "HospitalPatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECEASED', 'MERGED');

-- CreateEnum
CREATE TYPE "HospitalAppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HospitalEncounterType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "HospitalEncounterStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "HospitalDisposition" AS ENUM ('PENDING', 'DISCHARGED_HOME', 'ADMITTED', 'REFERRED', 'DECEASED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "HospitalClinicalNoteType" AS ENUM ('PROGRESS', 'TRIAGE', 'DISCHARGE_SUMMARY', 'CARE_PLAN', 'ADDENDUM');

-- CreateEnum
CREATE TYPE "HospitalDiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "HospitalBedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'OUT_OF_SERVICE', 'CLEANING');

-- CreateEnum
CREATE TYPE "HospitalAdmissionStatus" AS ENUM ('ADMITTED', 'TRANSFERRED', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "HospitalLabOrderStatus" AS ENUM ('ORDERED', 'SPECIMEN_COLLECTED', 'IN_PROGRESS', 'RESULTED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalAbnormalFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HospitalImagingStatus" AS ENUM ('ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalMedicationOrderStatus" AS ENUM ('ORDERED', 'SENT_TO_PHARMACY', 'DISPENSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HospitalInvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "HospitalPaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "HospitalClaimStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "HospitalNursingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HospitalReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalConsentType" AS ENUM ('TREATMENT', 'PROCEDURE', 'DATA_SHARING', 'OTHER');

-- CreateEnum
CREATE TYPE "HospitalAttachmentCategory" AS ENUM ('LAB_EXTERNAL', 'IMAGING_EXTERNAL', 'DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "HospitalFacility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDepartment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalServiceItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "specialty" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPatient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "nationalIdType" TEXT,
    "nationalIdNumber" TEXT,
    "bloodGroup" TEXT,
    "allergies" TEXT,
    "alerts" TEXT,
    "nextOfKinName" TEXT,
    "nextOfKinPhone" TEXT,
    "nextOfKinRelationship" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "consentOnFile" BOOLEAN NOT NULL DEFAULT false,
    "status" "HospitalPatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAppointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "providerId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentNumber" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HospitalAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalEncounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "providerId" TEXT NOT NULL,
    "encounterNumber" TEXT NOT NULL,
    "type" "HospitalEncounterType" NOT NULL,
    "status" "HospitalEncounterStatus" NOT NULL DEFAULT 'OPEN',
    "chiefComplaint" TEXT,
    "triageLevel" TEXT,
    "disposition" "HospitalDisposition" NOT NULL DEFAULT 'PENDING',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalVitals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "recordedById" TEXT,
    "temperatureC" DECIMAL(4,1),
    "pulseBpm" INTEGER,
    "respiratoryRate" INTEGER,
    "bloodPressureSystolic" INTEGER,
    "bloodPressureDiastolic" INTEGER,
    "spo2" INTEGER,
    "weightKg" DECIMAL(5,2),
    "heightCm" DECIMAL(5,1),
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalVitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalClinicalNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "authorId" TEXT,
    "correctsNoteId" TEXT,
    "type" "HospitalClinicalNoteType" NOT NULL,
    "content" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDiagnosis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "type" "HospitalDiagnosisType" NOT NULL DEFAULT 'PRIMARY',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalCarePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "instructions" TEXT,
    "followUpDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalCarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalWard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalWard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBed" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "HospitalBedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAdmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "admittingProviderId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "status" "HospitalAdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDischargeDate" TIMESTAMP(3),
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBedTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT,
    "toBedId" TEXT NOT NULL,
    "reason" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalBedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specimenType" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalLabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "orderedById" TEXT,
    "status" "HospitalLabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalLabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabOrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "status" "HospitalLabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "specimenCollectedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalLabOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "labOrderItemId" TEXT NOT NULL,
    "supersedesResultId" TEXT,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "abnormalFlag" "HospitalAbnormalFlag" NOT NULL DEFAULT 'NORMAL',
    "enteredById" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "correctionReason" TEXT,

    CONSTRAINT "HospitalLabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalImagingTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalImagingTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalImagingOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "imagingTestId" TEXT NOT NULL,
    "orderedById" TEXT,
    "status" "HospitalImagingStatus" NOT NULL DEFAULT 'ORDERED',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "externalAccessionNumber" TEXT,
    "externalSystemReference" TEXT,

    CONSTRAINT "HospitalImagingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalImagingFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "imagingOrderId" TEXT NOT NULL,
    "supersedesFindingId" TEXT,
    "findings" TEXT NOT NULL,
    "impression" TEXT,
    "enteredById" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "correctionReason" TEXT,

    CONSTRAINT "HospitalImagingFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalMedicationOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "orderedById" TEXT,
    "contractVersion" INTEGER NOT NULL DEFAULT 1,
    "medicationName" TEXT NOT NULL,
    "strength" TEXT,
    "route" TEXT,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "status" "HospitalMedicationOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "externalDispenseReference" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "HospitalMedicationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "status" "HospitalInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInvoiceLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "HospitalPaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInsuranceClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "claimNumber" TEXT,
    "status" "HospitalClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAmount" DECIMAL(12,2),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalInsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalNursingTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT,
    "patientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "HospitalNursingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalNursingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalClinicalAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "HospitalAlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalClinicalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalReferral" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "referredById" TEXT,
    "referredToFacility" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HospitalReferralStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "HospitalConsentType" NOT NULL,
    "description" TEXT NOT NULL,
    "consentedByName" TEXT NOT NULL,
    "witnessedById" TEXT,
    "documentReference" TEXT,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "category" "HospitalAttachmentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "mrnPrefix" TEXT NOT NULL DEFAULT 'MRN',
    "encounterPrefix" TEXT NOT NULL DEFAULT 'ENC',
    "appointmentPrefix" TEXT NOT NULL DEFAULT 'APT',
    "admissionPrefix" TEXT NOT NULL DEFAULT 'ADM',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "receiptPrefix" TEXT NOT NULL DEFAULT 'RCT',
    "resultVerificationRequired" BOOLEAN NOT NULL DEFAULT true,
    "bedTransferRequiresReason" BOOLEAN NOT NULL DEFAULT true,
    "retentionYears" INTEGER NOT NULL DEFAULT 7,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HospitalFacility_organizationId_active_idx" ON "HospitalFacility"("organizationId", "active");

-- CreateIndex
CREATE INDEX "HospitalFacility_branchId_idx" ON "HospitalFacility"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalFacility_organizationId_code_key" ON "HospitalFacility"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HospitalDepartment_organizationId_active_idx" ON "HospitalDepartment"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDepartment_facilityId_code_key" ON "HospitalDepartment"("facilityId", "code");

-- CreateIndex
CREATE INDEX "HospitalServiceItem_organizationId_active_idx" ON "HospitalServiceItem"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalServiceItem_facilityId_code_key" ON "HospitalServiceItem"("facilityId", "code");

-- CreateIndex
CREATE INDEX "HospitalProvider_organizationId_active_idx" ON "HospitalProvider"("organizationId", "active");

-- CreateIndex
CREATE INDEX "HospitalProvider_facilityId_idx" ON "HospitalProvider"("facilityId");

-- CreateIndex
CREATE INDEX "HospitalProvider_departmentId_idx" ON "HospitalProvider"("departmentId");

-- CreateIndex
CREATE INDEX "HospitalPatient_organizationId_lastName_dateOfBirth_idx" ON "HospitalPatient"("organizationId", "lastName", "dateOfBirth");

-- CreateIndex
CREATE INDEX "HospitalPatient_organizationId_phone_idx" ON "HospitalPatient"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "HospitalPatient_organizationId_status_idx" ON "HospitalPatient"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPatient_organizationId_mrn_key" ON "HospitalPatient"("organizationId", "mrn");

-- CreateIndex
CREATE INDEX "HospitalAppointment_organizationId_status_scheduledStart_idx" ON "HospitalAppointment"("organizationId", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "HospitalAppointment_providerId_scheduledStart_scheduledEnd_idx" ON "HospitalAppointment"("providerId", "scheduledStart", "scheduledEnd");

-- CreateIndex
CREATE INDEX "HospitalAppointment_patientId_idx" ON "HospitalAppointment"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalAppointment_organizationId_appointmentNumber_key" ON "HospitalAppointment"("organizationId", "appointmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalEncounter_appointmentId_key" ON "HospitalEncounter"("appointmentId");

-- CreateIndex
CREATE INDEX "HospitalEncounter_organizationId_status_idx" ON "HospitalEncounter"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalEncounter_patientId_idx" ON "HospitalEncounter"("patientId");

-- CreateIndex
CREATE INDEX "HospitalEncounter_facilityId_idx" ON "HospitalEncounter"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalEncounter_organizationId_encounterNumber_key" ON "HospitalEncounter"("organizationId", "encounterNumber");

-- CreateIndex
CREATE INDEX "HospitalVitals_organizationId_recordedAt_idx" ON "HospitalVitals"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "HospitalVitals_encounterId_idx" ON "HospitalVitals"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalClinicalNote_organizationId_createdAt_idx" ON "HospitalClinicalNote"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalClinicalNote_encounterId_idx" ON "HospitalClinicalNote"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalClinicalNote_correctsNoteId_idx" ON "HospitalClinicalNote"("correctsNoteId");

-- CreateIndex
CREATE INDEX "HospitalDiagnosis_organizationId_recordedAt_idx" ON "HospitalDiagnosis"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "HospitalDiagnosis_encounterId_idx" ON "HospitalDiagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalCarePlan_organizationId_createdAt_idx" ON "HospitalCarePlan"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalCarePlan_encounterId_idx" ON "HospitalCarePlan"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalWard_organizationId_active_idx" ON "HospitalWard"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalWard_facilityId_code_key" ON "HospitalWard"("facilityId", "code");

-- CreateIndex
CREATE INDEX "HospitalBed_organizationId_status_idx" ON "HospitalBed"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBed_wardId_code_key" ON "HospitalBed"("wardId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalAdmission_encounterId_key" ON "HospitalAdmission"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalAdmission_organizationId_status_idx" ON "HospitalAdmission"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalAdmission_patientId_idx" ON "HospitalAdmission"("patientId");

-- CreateIndex
CREATE INDEX "HospitalAdmission_bedId_idx" ON "HospitalAdmission"("bedId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalAdmission_organizationId_admissionNumber_key" ON "HospitalAdmission"("organizationId", "admissionNumber");

-- CreateIndex
CREATE INDEX "HospitalBedTransfer_organizationId_transferredAt_idx" ON "HospitalBedTransfer"("organizationId", "transferredAt");

-- CreateIndex
CREATE INDEX "HospitalBedTransfer_admissionId_idx" ON "HospitalBedTransfer"("admissionId");

-- CreateIndex
CREATE INDEX "HospitalLabTest_organizationId_active_idx" ON "HospitalLabTest"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalLabTest_organizationId_code_key" ON "HospitalLabTest"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HospitalLabOrder_organizationId_status_idx" ON "HospitalLabOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalLabOrder_encounterId_idx" ON "HospitalLabOrder"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalLabOrder_patientId_idx" ON "HospitalLabOrder"("patientId");

-- CreateIndex
CREATE INDEX "HospitalLabOrderItem_organizationId_status_idx" ON "HospitalLabOrderItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalLabOrderItem_labOrderId_idx" ON "HospitalLabOrderItem"("labOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalLabResult_supersedesResultId_key" ON "HospitalLabResult"("supersedesResultId");

-- CreateIndex
CREATE INDEX "HospitalLabResult_organizationId_enteredAt_idx" ON "HospitalLabResult"("organizationId", "enteredAt");

-- CreateIndex
CREATE INDEX "HospitalLabResult_labOrderItemId_idx" ON "HospitalLabResult"("labOrderItemId");

-- CreateIndex
CREATE INDEX "HospitalImagingTest_organizationId_active_idx" ON "HospitalImagingTest"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalImagingTest_organizationId_code_key" ON "HospitalImagingTest"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HospitalImagingOrder_organizationId_status_idx" ON "HospitalImagingOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalImagingOrder_encounterId_idx" ON "HospitalImagingOrder"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalImagingOrder_patientId_idx" ON "HospitalImagingOrder"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalImagingFinding_supersedesFindingId_key" ON "HospitalImagingFinding"("supersedesFindingId");

-- CreateIndex
CREATE INDEX "HospitalImagingFinding_organizationId_enteredAt_idx" ON "HospitalImagingFinding"("organizationId", "enteredAt");

-- CreateIndex
CREATE INDEX "HospitalImagingFinding_imagingOrderId_idx" ON "HospitalImagingFinding"("imagingOrderId");

-- CreateIndex
CREATE INDEX "HospitalMedicationOrder_organizationId_status_idx" ON "HospitalMedicationOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalMedicationOrder_encounterId_idx" ON "HospitalMedicationOrder"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalMedicationOrder_patientId_idx" ON "HospitalMedicationOrder"("patientId");

-- CreateIndex
CREATE INDEX "HospitalInvoice_organizationId_status_idx" ON "HospitalInvoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalInvoice_patientId_idx" ON "HospitalInvoice"("patientId");

-- CreateIndex
CREATE INDEX "HospitalInvoice_facilityId_idx" ON "HospitalInvoice"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalInvoice_organizationId_invoiceNumber_key" ON "HospitalInvoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "HospitalInvoiceLine_organizationId_idx" ON "HospitalInvoiceLine"("organizationId");

-- CreateIndex
CREATE INDEX "HospitalInvoiceLine_invoiceId_idx" ON "HospitalInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "HospitalPayment_organizationId_receivedAt_idx" ON "HospitalPayment"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "HospitalPayment_invoiceId_idx" ON "HospitalPayment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPayment_organizationId_receiptNumber_key" ON "HospitalPayment"("organizationId", "receiptNumber");

-- CreateIndex
CREATE INDEX "HospitalInsuranceClaim_organizationId_status_idx" ON "HospitalInsuranceClaim"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalInsuranceClaim_invoiceId_idx" ON "HospitalInsuranceClaim"("invoiceId");

-- CreateIndex
CREATE INDEX "HospitalInsuranceClaim_patientId_idx" ON "HospitalInsuranceClaim"("patientId");

-- CreateIndex
CREATE INDEX "HospitalNursingTask_organizationId_status_idx" ON "HospitalNursingTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalNursingTask_patientId_idx" ON "HospitalNursingTask"("patientId");

-- CreateIndex
CREATE INDEX "HospitalNursingTask_encounterId_idx" ON "HospitalNursingTask"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalClinicalAlert_organizationId_active_idx" ON "HospitalClinicalAlert"("organizationId", "active");

-- CreateIndex
CREATE INDEX "HospitalClinicalAlert_patientId_idx" ON "HospitalClinicalAlert"("patientId");

-- CreateIndex
CREATE INDEX "HospitalReferral_organizationId_status_idx" ON "HospitalReferral"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HospitalReferral_patientId_idx" ON "HospitalReferral"("patientId");

-- CreateIndex
CREATE INDEX "HospitalReferral_encounterId_idx" ON "HospitalReferral"("encounterId");

-- CreateIndex
CREATE INDEX "HospitalConsent_organizationId_type_idx" ON "HospitalConsent"("organizationId", "type");

-- CreateIndex
CREATE INDEX "HospitalConsent_patientId_idx" ON "HospitalConsent"("patientId");

-- CreateIndex
CREATE INDEX "HospitalAttachment_organizationId_category_idx" ON "HospitalAttachment"("organizationId", "category");

-- CreateIndex
CREATE INDEX "HospitalAttachment_patientId_idx" ON "HospitalAttachment"("patientId");

-- CreateIndex
CREATE INDEX "HospitalAttachment_encounterId_idx" ON "HospitalAttachment"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSettings_facilityId_key" ON "HospitalSettings"("facilityId");

-- CreateIndex
CREATE INDEX "HospitalSettings_organizationId_idx" ON "HospitalSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "HospitalFacility" ADD CONSTRAINT "HospitalFacility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalFacility" ADD CONSTRAINT "HospitalFacility_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDepartment" ADD CONSTRAINT "HospitalDepartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDepartment" ADD CONSTRAINT "HospitalDepartment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalServiceItem" ADD CONSTRAINT "HospitalServiceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalServiceItem" ADD CONSTRAINT "HospitalServiceItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalProvider" ADD CONSTRAINT "HospitalProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalProvider" ADD CONSTRAINT "HospitalProvider_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalProvider" ADD CONSTRAINT "HospitalProvider_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "HospitalDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPatient" ADD CONSTRAINT "HospitalPatient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "HospitalDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "HospitalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEncounter" ADD CONSTRAINT "HospitalEncounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEncounter" ADD CONSTRAINT "HospitalEncounter_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEncounter" ADD CONSTRAINT "HospitalEncounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEncounter" ADD CONSTRAINT "HospitalEncounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "HospitalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEncounter" ADD CONSTRAINT "HospitalEncounter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "HospitalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalVitals" ADD CONSTRAINT "HospitalVitals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalVitals" ADD CONSTRAINT "HospitalVitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClinicalNote" ADD CONSTRAINT "HospitalClinicalNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClinicalNote" ADD CONSTRAINT "HospitalClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDiagnosis" ADD CONSTRAINT "HospitalDiagnosis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDiagnosis" ADD CONSTRAINT "HospitalDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalCarePlan" ADD CONSTRAINT "HospitalCarePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalCarePlan" ADD CONSTRAINT "HospitalCarePlan_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalWard" ADD CONSTRAINT "HospitalWard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalWard" ADD CONSTRAINT "HospitalWard_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBed" ADD CONSTRAINT "HospitalBed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBed" ADD CONSTRAINT "HospitalBed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "HospitalWard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_admittingProviderId_fkey" FOREIGN KEY ("admittingProviderId") REFERENCES "HospitalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAdmission" ADD CONSTRAINT "HospitalAdmission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "HospitalBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBedTransfer" ADD CONSTRAINT "HospitalBedTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBedTransfer" ADD CONSTRAINT "HospitalBedTransfer_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "HospitalAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBedTransfer" ADD CONSTRAINT "HospitalBedTransfer_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "HospitalBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBedTransfer" ADD CONSTRAINT "HospitalBedTransfer_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "HospitalBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabTest" ADD CONSTRAINT "HospitalLabTest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrder" ADD CONSTRAINT "HospitalLabOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrder" ADD CONSTRAINT "HospitalLabOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrder" ADD CONSTRAINT "HospitalLabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrderItem" ADD CONSTRAINT "HospitalLabOrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrderItem" ADD CONSTRAINT "HospitalLabOrderItem_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "HospitalLabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrderItem" ADD CONSTRAINT "HospitalLabOrderItem_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "HospitalLabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabResult" ADD CONSTRAINT "HospitalLabResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabResult" ADD CONSTRAINT "HospitalLabResult_labOrderItemId_fkey" FOREIGN KEY ("labOrderItemId") REFERENCES "HospitalLabOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabResult" ADD CONSTRAINT "HospitalLabResult_supersedesResultId_fkey" FOREIGN KEY ("supersedesResultId") REFERENCES "HospitalLabResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingTest" ADD CONSTRAINT "HospitalImagingTest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingOrder" ADD CONSTRAINT "HospitalImagingOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingOrder" ADD CONSTRAINT "HospitalImagingOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingOrder" ADD CONSTRAINT "HospitalImagingOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingOrder" ADD CONSTRAINT "HospitalImagingOrder_imagingTestId_fkey" FOREIGN KEY ("imagingTestId") REFERENCES "HospitalImagingTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingFinding" ADD CONSTRAINT "HospitalImagingFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingFinding" ADD CONSTRAINT "HospitalImagingFinding_imagingOrderId_fkey" FOREIGN KEY ("imagingOrderId") REFERENCES "HospitalImagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalImagingFinding" ADD CONSTRAINT "HospitalImagingFinding_supersedesFindingId_fkey" FOREIGN KEY ("supersedesFindingId") REFERENCES "HospitalImagingFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMedicationOrder" ADD CONSTRAINT "HospitalMedicationOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMedicationOrder" ADD CONSTRAINT "HospitalMedicationOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMedicationOrder" ADD CONSTRAINT "HospitalMedicationOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoice" ADD CONSTRAINT "HospitalInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoice" ADD CONSTRAINT "HospitalInvoice_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoice" ADD CONSTRAINT "HospitalInvoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoice" ADD CONSTRAINT "HospitalInvoice_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoiceLine" ADD CONSTRAINT "HospitalInvoiceLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoiceLine" ADD CONSTRAINT "HospitalInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoiceLine" ADD CONSTRAINT "HospitalInvoiceLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "HospitalServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPayment" ADD CONSTRAINT "HospitalPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPayment" ADD CONSTRAINT "HospitalPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInsuranceClaim" ADD CONSTRAINT "HospitalInsuranceClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInsuranceClaim" ADD CONSTRAINT "HospitalInsuranceClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInsuranceClaim" ADD CONSTRAINT "HospitalInsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalNursingTask" ADD CONSTRAINT "HospitalNursingTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalNursingTask" ADD CONSTRAINT "HospitalNursingTask_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalNursingTask" ADD CONSTRAINT "HospitalNursingTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClinicalAlert" ADD CONSTRAINT "HospitalClinicalAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClinicalAlert" ADD CONSTRAINT "HospitalClinicalAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "HospitalReferral_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "HospitalReferral_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalReferral" ADD CONSTRAINT "HospitalReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalConsent" ADD CONSTRAINT "HospitalConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalConsent" ADD CONSTRAINT "HospitalConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAttachment" ADD CONSTRAINT "HospitalAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAttachment" ADD CONSTRAINT "HospitalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HospitalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAttachment" ADD CONSTRAINT "HospitalAttachment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HospitalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalSettings" ADD CONSTRAINT "HospitalSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalSettings" ADD CONSTRAINT "HospitalSettings_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "HospitalFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

