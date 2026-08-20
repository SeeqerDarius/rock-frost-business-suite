-- CreateEnum
CREATE TYPE "HostelBedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HostelAllocationStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "HostelInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID');

-- CreateTable
-- New subscribable module for schools that also run a boarding hostel.
-- Occupants are existing SchoolStudent records (a hostel houses students
-- already enrolled, not a second identity for them); terms/academic years
-- are School's own.
CREATE TABLE "HostelBuilding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genderPolicy" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelRoom" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "floor" TEXT,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelBed" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "HostelBedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3),
    "status" "HostelAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelWarden" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostelWarden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelFeeStructure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelFeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelFeeInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "studentId" TEXT NOT NULL,
    "allocationId" TEXT,
    "feeStructureId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "HostelInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelFeeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelFeePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "HotelPaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "HostelFeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostelBuilding_organizationId_code_key" ON "HostelBuilding"("organizationId", "code");
CREATE INDEX "HostelBuilding_organizationId_active_idx" ON "HostelBuilding"("organizationId", "active");
CREATE INDEX "HostelBuilding_campusId_idx" ON "HostelBuilding"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "HostelRoom_buildingId_roomNumber_key" ON "HostelRoom"("buildingId", "roomNumber");
CREATE INDEX "HostelRoom_organizationId_idx" ON "HostelRoom"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HostelBed_roomId_label_key" ON "HostelBed"("roomId", "label");
CREATE INDEX "HostelBed_organizationId_status_idx" ON "HostelBed"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HostelAllocation_organizationId_status_idx" ON "HostelAllocation"("organizationId", "status");
CREATE INDEX "HostelAllocation_bedId_status_idx" ON "HostelAllocation"("bedId", "status");
CREATE INDEX "HostelAllocation_studentId_idx" ON "HostelAllocation"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "HostelWarden_buildingId_userId_key" ON "HostelWarden"("buildingId", "userId");
CREATE INDEX "HostelWarden_organizationId_idx" ON "HostelWarden"("organizationId");

-- CreateIndex
CREATE INDEX "HostelFeeStructure_organizationId_active_idx" ON "HostelFeeStructure"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HostelFeeInvoice_organizationId_invoiceNumber_key" ON "HostelFeeInvoice"("organizationId", "invoiceNumber");
CREATE INDEX "HostelFeeInvoice_organizationId_status_idx" ON "HostelFeeInvoice"("organizationId", "status");
CREATE INDEX "HostelFeeInvoice_studentId_idx" ON "HostelFeeInvoice"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "HostelFeePayment_organizationId_receiptNumber_key" ON "HostelFeePayment"("organizationId", "receiptNumber");
CREATE INDEX "HostelFeePayment_organizationId_receivedAt_idx" ON "HostelFeePayment"("organizationId", "receivedAt");
CREATE INDEX "HostelFeePayment_invoiceId_idx" ON "HostelFeePayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "HostelBuilding" ADD CONSTRAINT "HostelBuilding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelBuilding" ADD CONSTRAINT "HostelBuilding_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRoom" ADD CONSTRAINT "HostelRoom_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelRoom" ADD CONSTRAINT "HostelRoom_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "HostelBuilding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelBed" ADD CONSTRAINT "HostelBed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelBed" ADD CONSTRAINT "HostelBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HostelRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "HostelBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelWarden" ADD CONSTRAINT "HostelWarden_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelWarden" ADD CONSTRAINT "HostelWarden_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "HostelBuilding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelWarden" ADD CONSTRAINT "HostelWarden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelFeeStructure" ADD CONSTRAINT "HostelFeeStructure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelFeeStructure" ADD CONSTRAINT "HostelFeeStructure_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "HostelBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HostelFeeStructure" ADD CONSTRAINT "HostelFeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelFeeStructure" ADD CONSTRAINT "HostelFeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "HostelAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HostelFeeInvoice" ADD CONSTRAINT "HostelFeeInvoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "HostelFeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelFeePayment" ADD CONSTRAINT "HostelFeePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostelFeePayment" ADD CONSTRAINT "HostelFeePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HostelFeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HostelFeePayment" ADD CONSTRAINT "HostelFeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
