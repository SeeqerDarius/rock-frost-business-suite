-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "photoData" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
