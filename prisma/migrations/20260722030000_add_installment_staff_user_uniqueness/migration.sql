-- Prevent one login from ambiguously resolving to multiple field-staff
-- profiles inside the same organization. PostgreSQL still permits multiple
-- unlinked (NULL userId) staff profiles under this unique constraint.
CREATE UNIQUE INDEX "HirePurchaseStaff_organizationId_userId_key"
ON "HirePurchaseStaff"("organizationId", "userId");
