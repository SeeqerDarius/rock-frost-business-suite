-- CreateEnum
CREATE TYPE "PharmacyMedicineClass" AS ENUM ('OTC', 'PHARMACY_ONLY', 'PRESCRIPTION_ONLY', 'CONTROLLED');

-- CreateEnum
CREATE TYPE "PharmacyBatchStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'RECALLED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "PharmacyPrescriptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PharmacyDispensingStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateTable
CREATE TABLE "PharmacyMedicine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "medicineClass" "PharmacyMedicineClass" NOT NULL DEFAULT 'OTC',
    "registrationNumber" TEXT,
    "barcode" TEXT,
    "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyMedicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licenceNumber" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "supplierId" TEXT,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PharmacyBatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "invoiceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPatient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "sex" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "allergies" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPrescriber" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "facilityName" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPrescriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPrescription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prescriptionNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriberId" TEXT NOT NULL,
    "prescribedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "PharmacyPrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "clinicalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPrescriptionLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "quantityPrescribed" INTEGER NOT NULL,
    "quantityDispensed" INTEGER NOT NULL DEFAULT 0,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT,
    "instructions" TEXT,

    CONSTRAINT "PharmacyPrescriptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispensing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispensingNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "prescriptionId" TEXT,
    "status" "PharmacyDispensingStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "dispensedById" TEXT NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyDispensing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispensingLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispensingId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "prescriptionLineId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PharmacyDispensingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyRestrictedRegister" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispensingId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientAddress" TEXT,
    "prescriberName" TEXT,
    "prescriberRegistration" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,
    "reason" TEXT,

    CONSTRAINT "PharmacyRestrictedRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "licenceNumber" TEXT,
    "superintendentPharmacist" TEXT,
    "superintendentRegistration" TEXT,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'PHA',
    "prescriptionValidityDays" INTEGER NOT NULL DEFAULT 30,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 90,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "requirePatientForControlled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacyMedicine_organizationId_active_idx" ON "PharmacyMedicine"("organizationId", "active");

-- CreateIndex
CREATE INDEX "PharmacyMedicine_organizationId_barcode_idx" ON "PharmacyMedicine"("organizationId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyMedicine_organizationId_sku_key" ON "PharmacyMedicine"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "PharmacySupplier_organizationId_active_idx" ON "PharmacySupplier"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySupplier_organizationId_name_key" ON "PharmacySupplier"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PharmacyBatch_organizationId_status_expiryDate_idx" ON "PharmacyBatch"("organizationId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "PharmacyBatch_medicineId_expiryDate_idx" ON "PharmacyBatch"("medicineId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyBatch_organizationId_medicineId_batchNumber_key" ON "PharmacyBatch"("organizationId", "medicineId", "batchNumber");

-- CreateIndex
CREATE INDEX "PharmacyPatient_organizationId_fullName_idx" ON "PharmacyPatient"("organizationId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPatient_organizationId_patientNumber_key" ON "PharmacyPatient"("organizationId", "patientNumber");

-- CreateIndex
CREATE INDEX "PharmacyPrescriber_organizationId_active_idx" ON "PharmacyPrescriber"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPrescriber_organizationId_registrationNumber_key" ON "PharmacyPrescriber"("organizationId", "registrationNumber");

-- CreateIndex
CREATE INDEX "PharmacyPrescription_organizationId_status_prescribedAt_idx" ON "PharmacyPrescription"("organizationId", "status", "prescribedAt");

-- CreateIndex
CREATE INDEX "PharmacyPrescription_patientId_idx" ON "PharmacyPrescription"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPrescription_organizationId_prescriptionNumber_key" ON "PharmacyPrescription"("organizationId", "prescriptionNumber");

-- CreateIndex
CREATE INDEX "PharmacyPrescriptionLine_organizationId_idx" ON "PharmacyPrescriptionLine"("organizationId");

-- CreateIndex
CREATE INDEX "PharmacyPrescriptionLine_prescriptionId_idx" ON "PharmacyPrescriptionLine"("prescriptionId");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_organizationId_status_dispensedAt_idx" ON "PharmacyDispensing"("organizationId", "status", "dispensedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyDispensing_organizationId_dispensingNumber_key" ON "PharmacyDispensing"("organizationId", "dispensingNumber");

-- CreateIndex
CREATE INDEX "PharmacyDispensingLine_organizationId_idx" ON "PharmacyDispensingLine"("organizationId");

-- CreateIndex
CREATE INDEX "PharmacyDispensingLine_dispensingId_idx" ON "PharmacyDispensingLine"("dispensingId");

-- CreateIndex
CREATE INDEX "PharmacyDispensingLine_batchId_idx" ON "PharmacyDispensingLine"("batchId");

-- CreateIndex
CREATE INDEX "PharmacyRestrictedRegister_organizationId_recordedAt_idx" ON "PharmacyRestrictedRegister"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "PharmacyRestrictedRegister_dispensingId_idx" ON "PharmacyRestrictedRegister"("dispensingId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySettings_organizationId_key" ON "PharmacySettings"("organizationId");

-- AddForeignKey
ALTER TABLE "PharmacyMedicine" ADD CONSTRAINT "PharmacyMedicine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySupplier" ADD CONSTRAINT "PharmacySupplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "PharmacyMedicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPatient" ADD CONSTRAINT "PharmacyPatient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescriber" ADD CONSTRAINT "PharmacyPrescriber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescription" ADD CONSTRAINT "PharmacyPrescription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescription" ADD CONSTRAINT "PharmacyPrescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PharmacyPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescription" ADD CONSTRAINT "PharmacyPrescription_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "PharmacyPrescriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionLine" ADD CONSTRAINT "PharmacyPrescriptionLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionLine" ADD CONSTRAINT "PharmacyPrescriptionLine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "PharmacyMedicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PharmacyPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingLine" ADD CONSTRAINT "PharmacyDispensingLine_dispensingId_fkey" FOREIGN KEY ("dispensingId") REFERENCES "PharmacyDispensing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingLine" ADD CONSTRAINT "PharmacyDispensingLine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "PharmacyMedicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingLine" ADD CONSTRAINT "PharmacyDispensingLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyRestrictedRegister" ADD CONSTRAINT "PharmacyRestrictedRegister_dispensingId_fkey" FOREIGN KEY ("dispensingId") REFERENCES "PharmacyDispensing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySettings" ADD CONSTRAINT "PharmacySettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
