-- AlterTable
ALTER TABLE "HospitalSettings" ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HotelSettings" ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PayrollSettings" ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PharmacySettings" ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
