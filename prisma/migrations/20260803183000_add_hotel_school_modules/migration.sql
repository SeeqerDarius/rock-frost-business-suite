-- CreateEnum
CREATE TYPE "HotelRoomStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEANING', 'INSPECTION', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "HotelReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HotelFolioEntryType" AS ENUM ('CHARGE', 'ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "HotelPaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "HotelHousekeepingStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "HotelOrderStatus" AS ENUM ('OPEN', 'PREPARING', 'SERVED', 'COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SchoolStudentStatus" AS ENUM ('APPLICANT', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'GRADUATED');

-- CreateEnum
CREATE TYPE "SchoolEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SchoolAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "SchoolInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "SchoolExamStatus" AS ENUM ('DRAFT', 'OPEN', 'MODERATION', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SchoolLibraryLoanStatus" AS ENUM ('BORROWED', 'RETURNED', 'OVERDUE', 'LOST', 'DAMAGED');

-- CreateTable
CREATE TABLE "HotelProperty" (
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

    CONSTRAINT "HotelProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoomType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "baseRate" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoom" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" TEXT,
    "status" "HotelRoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelGuest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "guestNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "identityType" TEXT,
    "identityNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "guestId" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "status" "HotelReservationStatus" NOT NULL DEFAULT 'PENDING',
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "nightlyRate" DECIMAL(12,2) NOT NULL,
    "source" TEXT,
    "channelReference" TEXT,
    "specialRequests" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelFolio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelFolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelFolioEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "type" "HotelFolioEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "reversedEntryId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelFolioEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "HotelPaymentMethod" NOT NULL,
    "reference" TEXT,
    "refundedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelHousekeepingTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "HotelHousekeepingStatus" NOT NULL DEFAULT 'PENDING',
    "assignedTo" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelHousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRestaurantOutlet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRestaurantOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelMenuItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "folioId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "tableOrRoom" TEXT,
    "status" "HotelOrderStatus" NOT NULL DEFAULT 'OPEN',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "HotelOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelOrderLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "HotelOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalPropertyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "checkInTime" TEXT NOT NULL DEFAULT '14:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '11:00',
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "serviceChargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "allowOutstandingCheckout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCampus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCampus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicYear" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTerm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolGuardian" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "guardianNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "occupation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStudent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "status" "SchoolStudentStatus" NOT NULL DEFAULT 'APPLICANT',
    "admissionDate" TIMESTAMP(3),
    "medicalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStudentGuardian" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "authorizedPickup" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SchoolStudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSubject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrollment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "status" "SchoolEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAttendance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "SchoolAttendanceStatus" NOT NULL,
    "reason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "studentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SchoolInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeePayment" (
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

    CONSTRAINT "SchoolFeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExam" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalMarks" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "status" "SchoolExamStatus" NOT NULL DEFAULT 'DRAFT',
    "examDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL,
    "grade" TEXT,
    "remark" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTimetableEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "room" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolTimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTransportRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle" TEXT,
    "driverName" TEXT,
    "stops" JSONB,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolTransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTransportAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stopName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolTransportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolLibraryBook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accessionCode" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "category" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolLibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolLibraryLoan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SchoolLibraryLoanStatus" NOT NULL DEFAULT 'BORROWED',
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "fineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SchoolLibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPayrollAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolPayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "gradingScale" JSONB,
    "attendanceCloseDays" INTEGER NOT NULL DEFAULT 7,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'SCH',
    "allowRanking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelProperty_organizationId_active_idx" ON "HotelProperty"("organizationId", "active");

-- CreateIndex
CREATE INDEX "HotelProperty_branchId_idx" ON "HotelProperty"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelProperty_organizationId_code_key" ON "HotelProperty"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HotelRoomType_organizationId_active_idx" ON "HotelRoomType"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomType_propertyId_code_key" ON "HotelRoomType"("propertyId", "code");

-- CreateIndex
CREATE INDEX "HotelRoom_organizationId_status_idx" ON "HotelRoom"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HotelRoom_roomTypeId_idx" ON "HotelRoom"("roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoom_propertyId_number_key" ON "HotelRoom"("propertyId", "number");

-- CreateIndex
CREATE INDEX "HotelGuest_organizationId_lastName_idx" ON "HotelGuest"("organizationId", "lastName");

-- CreateIndex
CREATE INDEX "HotelGuest_organizationId_phone_idx" ON "HotelGuest"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "HotelGuest_organizationId_guestNumber_key" ON "HotelGuest"("organizationId", "guestNumber");

-- CreateIndex
CREATE INDEX "HotelReservation_organizationId_status_arrivalDate_idx" ON "HotelReservation"("organizationId", "status", "arrivalDate");

-- CreateIndex
CREATE INDEX "HotelReservation_roomId_arrivalDate_departureDate_idx" ON "HotelReservation"("roomId", "arrivalDate", "departureDate");

-- CreateIndex
CREATE INDEX "HotelReservation_guestId_idx" ON "HotelReservation"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelReservation_organizationId_confirmationCode_key" ON "HotelReservation"("organizationId", "confirmationCode");

-- CreateIndex
CREATE UNIQUE INDEX "HotelFolio_reservationId_key" ON "HotelFolio"("reservationId");

-- CreateIndex
CREATE INDEX "HotelFolio_organizationId_closedAt_idx" ON "HotelFolio"("organizationId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HotelFolio_organizationId_folioNumber_key" ON "HotelFolio"("organizationId", "folioNumber");

-- CreateIndex
CREATE INDEX "HotelFolioEntry_organizationId_postedAt_idx" ON "HotelFolioEntry"("organizationId", "postedAt");

-- CreateIndex
CREATE INDEX "HotelFolioEntry_folioId_idx" ON "HotelFolioEntry"("folioId");

-- CreateIndex
CREATE INDEX "HotelFolioEntry_reversedEntryId_idx" ON "HotelFolioEntry"("reversedEntryId");

-- CreateIndex
CREATE INDEX "HotelPayment_organizationId_receivedAt_idx" ON "HotelPayment"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "HotelPayment_folioId_idx" ON "HotelPayment"("folioId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelPayment_organizationId_receiptNumber_key" ON "HotelPayment"("organizationId", "receiptNumber");

-- CreateIndex
CREATE INDEX "HotelHousekeepingTask_organizationId_status_idx" ON "HotelHousekeepingTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HotelHousekeepingTask_roomId_idx" ON "HotelHousekeepingTask"("roomId");

-- CreateIndex
CREATE INDEX "HotelRestaurantOutlet_organizationId_active_idx" ON "HotelRestaurantOutlet"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRestaurantOutlet_propertyId_name_key" ON "HotelRestaurantOutlet"("propertyId", "name");

-- CreateIndex
CREATE INDEX "HotelMenuItem_organizationId_active_idx" ON "HotelMenuItem"("organizationId", "active");

-- CreateIndex
CREATE INDEX "HotelMenuItem_outletId_idx" ON "HotelMenuItem"("outletId");

-- CreateIndex
CREATE INDEX "HotelOrder_organizationId_status_idx" ON "HotelOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HotelOrder_outletId_idx" ON "HotelOrder"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelOrder_organizationId_orderNumber_key" ON "HotelOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "HotelOrderLine_organizationId_idx" ON "HotelOrderLine"("organizationId");

-- CreateIndex
CREATE INDEX "HotelOrderLine_orderId_idx" ON "HotelOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "HotelChannel_organizationId_active_idx" ON "HotelChannel"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HotelChannel_propertyId_provider_key" ON "HotelChannel"("propertyId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "HotelSettings_propertyId_key" ON "HotelSettings"("propertyId");

-- CreateIndex
CREATE INDEX "HotelSettings_organizationId_idx" ON "HotelSettings"("organizationId");

-- CreateIndex
CREATE INDEX "SchoolCampus_organizationId_active_idx" ON "SchoolCampus"("organizationId", "active");

-- CreateIndex
CREATE INDEX "SchoolCampus_branchId_idx" ON "SchoolCampus"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCampus_organizationId_code_key" ON "SchoolCampus"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SchoolAcademicYear_organizationId_current_idx" ON "SchoolAcademicYear"("organizationId", "current");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAcademicYear_organizationId_name_key" ON "SchoolAcademicYear"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SchoolTerm_organizationId_current_idx" ON "SchoolTerm"("organizationId", "current");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTerm_academicYearId_name_key" ON "SchoolTerm"("academicYearId", "name");

-- CreateIndex
CREATE INDEX "SchoolGuardian_organizationId_phone_idx" ON "SchoolGuardian"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolGuardian_organizationId_guardianNumber_key" ON "SchoolGuardian"("organizationId", "guardianNumber");

-- CreateIndex
CREATE INDEX "SchoolStudent_organizationId_status_idx" ON "SchoolStudent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SchoolStudent_campusId_idx" ON "SchoolStudent"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_organizationId_admissionNumber_key" ON "SchoolStudent"("organizationId", "admissionNumber");

-- CreateIndex
CREATE INDEX "SchoolStudentGuardian_organizationId_idx" ON "SchoolStudentGuardian"("organizationId");

-- CreateIndex
CREATE INDEX "SchoolStudentGuardian_guardianId_idx" ON "SchoolStudentGuardian"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudentGuardian_studentId_guardianId_key" ON "SchoolStudentGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "SchoolClass_organizationId_active_idx" ON "SchoolClass"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_campusId_code_key" ON "SchoolClass"("campusId", "code");

-- CreateIndex
CREATE INDEX "SchoolSubject_organizationId_active_idx" ON "SchoolSubject"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubject_organizationId_code_key" ON "SchoolSubject"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_organizationId_status_idx" ON "SchoolEnrollment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_classId_idx" ON "SchoolEnrollment"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolEnrollment_studentId_academicYearId_key" ON "SchoolEnrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "SchoolAttendance_organizationId_date_idx" ON "SchoolAttendance"("organizationId", "date");

-- CreateIndex
CREATE INDEX "SchoolAttendance_classId_date_idx" ON "SchoolAttendance"("classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAttendance_studentId_date_key" ON "SchoolAttendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoice_organizationId_status_idx" ON "SchoolFeeInvoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoice_studentId_idx" ON "SchoolFeeInvoice"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeInvoice_organizationId_invoiceNumber_key" ON "SchoolFeeInvoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SchoolFeePayment_organizationId_receivedAt_idx" ON "SchoolFeePayment"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "SchoolFeePayment_invoiceId_idx" ON "SchoolFeePayment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeePayment_organizationId_receiptNumber_key" ON "SchoolFeePayment"("organizationId", "receiptNumber");

-- CreateIndex
CREATE INDEX "SchoolExam_organizationId_status_idx" ON "SchoolExam"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SchoolExam_termId_subjectId_idx" ON "SchoolExam"("termId", "subjectId");

-- CreateIndex
CREATE INDEX "SchoolExamResult_organizationId_idx" ON "SchoolExamResult"("organizationId");

-- CreateIndex
CREATE INDEX "SchoolExamResult_classId_subjectId_idx" ON "SchoolExamResult"("classId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamResult_examId_studentId_key" ON "SchoolExamResult"("examId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolTimetableEntry_organizationId_dayOfWeek_idx" ON "SchoolTimetableEntry"("organizationId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "SchoolTimetableEntry_classId_dayOfWeek_idx" ON "SchoolTimetableEntry"("classId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "SchoolTransportRoute_organizationId_active_idx" ON "SchoolTransportRoute"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTransportRoute_campusId_code_key" ON "SchoolTransportRoute"("campusId", "code");

-- CreateIndex
CREATE INDEX "SchoolTransportAssignment_organizationId_active_idx" ON "SchoolTransportAssignment"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTransportAssignment_routeId_studentId_key" ON "SchoolTransportAssignment"("routeId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolLibraryBook_organizationId_active_idx" ON "SchoolLibraryBook"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLibraryBook_organizationId_accessionCode_key" ON "SchoolLibraryBook"("organizationId", "accessionCode");

-- CreateIndex
CREATE INDEX "SchoolLibraryLoan_organizationId_status_idx" ON "SchoolLibraryLoan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SchoolLibraryLoan_studentId_idx" ON "SchoolLibraryLoan"("studentId");

-- CreateIndex
CREATE INDEX "SchoolPayrollAdjustment_organizationId_period_idx" ON "SchoolPayrollAdjustment"("organizationId", "period");

-- CreateIndex
CREATE INDEX "SchoolPayrollAdjustment_employeeId_idx" ON "SchoolPayrollAdjustment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSettings_campusId_key" ON "SchoolSettings"("campusId");

-- CreateIndex
CREATE INDEX "SchoolSettings_organizationId_idx" ON "SchoolSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "HotelProperty" ADD CONSTRAINT "HotelProperty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProperty" ADD CONSTRAINT "HotelProperty_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomType" ADD CONSTRAINT "HotelRoomType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomType" ADD CONSTRAINT "HotelRoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelGuest" ADD CONSTRAINT "HotelGuest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "HotelGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolio" ADD CONSTRAINT "HotelFolio_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolio" ADD CONSTRAINT "HotelFolio_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "HotelReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolioEntry" ADD CONSTRAINT "HotelFolioEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolioEntry" ADD CONSTRAINT "HotelFolioEntry_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "HotelFolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPayment" ADD CONSTRAINT "HotelPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPayment" ADD CONSTRAINT "HotelPayment_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "HotelFolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelHousekeepingTask" ADD CONSTRAINT "HotelHousekeepingTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelHousekeepingTask" ADD CONSTRAINT "HotelHousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRestaurantOutlet" ADD CONSTRAINT "HotelRestaurantOutlet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRestaurantOutlet" ADD CONSTRAINT "HotelRestaurantOutlet_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelMenuItem" ADD CONSTRAINT "HotelMenuItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelMenuItem" ADD CONSTRAINT "HotelMenuItem_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "HotelRestaurantOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrder" ADD CONSTRAINT "HotelOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrder" ADD CONSTRAINT "HotelOrder_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "HotelRestaurantOutlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrder" ADD CONSTRAINT "HotelOrder_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "HotelFolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrderLine" ADD CONSTRAINT "HotelOrderLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrderLine" ADD CONSTRAINT "HotelOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "HotelOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelOrderLine" ADD CONSTRAINT "HotelOrderLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "HotelMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelChannel" ADD CONSTRAINT "HotelChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelChannel" ADD CONSTRAINT "HotelChannel_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSettings" ADD CONSTRAINT "HotelSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSettings" ADD CONSTRAINT "HotelSettings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCampus" ADD CONSTRAINT "SchoolCampus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCampus" ADD CONSTRAINT "SchoolCampus_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicYear" ADD CONSTRAINT "SchoolAcademicYear_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTerm" ADD CONSTRAINT "SchoolTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTerm" ADD CONSTRAINT "SchoolTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolGuardian" ADD CONSTRAINT "SchoolGuardian_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "SchoolGuardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSubject" ADD CONSTRAINT "SchoolSubject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendance" ADD CONSTRAINT "SchoolAttendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendance" ADD CONSTRAINT "SchoolAttendance_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendance" ADD CONSTRAINT "SchoolAttendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendance" ADD CONSTRAINT "SchoolAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeePayment" ADD CONSTRAINT "SchoolFeePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeePayment" ADD CONSTRAINT "SchoolFeePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolFeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeePayment" ADD CONSTRAINT "SchoolFeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExam" ADD CONSTRAINT "SchoolExam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExam" ADD CONSTRAINT "SchoolExam_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExam" ADD CONSTRAINT "SchoolExam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExam" ADD CONSTRAINT "SchoolExam_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_examId_fkey" FOREIGN KEY ("examId") REFERENCES "SchoolExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTimetableEntry" ADD CONSTRAINT "SchoolTimetableEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTimetableEntry" ADD CONSTRAINT "SchoolTimetableEntry_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTimetableEntry" ADD CONSTRAINT "SchoolTimetableEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTimetableEntry" ADD CONSTRAINT "SchoolTimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTimetableEntry" ADD CONSTRAINT "SchoolTimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTransportRoute" ADD CONSTRAINT "SchoolTransportRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTransportRoute" ADD CONSTRAINT "SchoolTransportRoute_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTransportAssignment" ADD CONSTRAINT "SchoolTransportAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTransportAssignment" ADD CONSTRAINT "SchoolTransportAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SchoolTransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTransportAssignment" ADD CONSTRAINT "SchoolTransportAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLibraryBook" ADD CONSTRAINT "SchoolLibraryBook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLibraryLoan" ADD CONSTRAINT "SchoolLibraryLoan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLibraryLoan" ADD CONSTRAINT "SchoolLibraryLoan_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "SchoolLibraryBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLibraryLoan" ADD CONSTRAINT "SchoolLibraryLoan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPayrollAdjustment" ADD CONSTRAINT "SchoolPayrollAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
