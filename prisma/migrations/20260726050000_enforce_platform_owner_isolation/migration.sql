-- Platform identities are control-plane identities and must not retain tenant
-- memberships. This data repair is idempotent and invalidates affected JWTs.

UPDATE "Invitation"
SET
    "status" = 'REVOKED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING'
  AND "membershipId" IN (
    SELECT contaminated."id"
    FROM "OrganizationMember" AS contaminated
    WHERE contaminated."status" <> 'REMOVED'
      AND EXISTS (
        SELECT 1
        FROM "OrganizationMember" AS platform_membership
        INNER JOIN "Role" AS platform_role
          ON platform_role."id" = platform_membership."roleId"
        WHERE platform_membership."userId" = contaminated."userId"
          AND platform_membership."status" = 'ACTIVE'
          AND platform_role."name" = 'Super Admin'
          AND platform_role."isSystem" = TRUE
          AND platform_role."organizationId" IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "Role" AS retained_role
        WHERE retained_role."id" = contaminated."roleId"
          AND contaminated."status" = 'ACTIVE'
          AND retained_role."name" = 'Super Admin'
          AND retained_role."isSystem" = TRUE
          AND retained_role."organizationId" IS NULL
      )
  );

UPDATE "User" AS platform_user
SET
    "sessionVersion" = platform_user."sessionVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS platform_membership
    INNER JOIN "Role" AS platform_role
      ON platform_role."id" = platform_membership."roleId"
    WHERE platform_membership."userId" = platform_user."id"
      AND platform_membership."status" = 'ACTIVE'
      AND platform_role."name" = 'Super Admin'
      AND platform_role."isSystem" = TRUE
      AND platform_role."organizationId" IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS contaminated
    WHERE contaminated."userId" = platform_user."id"
      AND contaminated."status" <> 'REMOVED'
      AND NOT EXISTS (
        SELECT 1
        FROM "Role" AS retained_role
        WHERE retained_role."id" = contaminated."roleId"
          AND contaminated."status" = 'ACTIVE'
          AND retained_role."name" = 'Super Admin'
          AND retained_role."isSystem" = TRUE
          AND retained_role."organizationId" IS NULL
      )
  );

UPDATE "OrganizationMember" AS contaminated
SET
    "status" = 'REMOVED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE contaminated."status" <> 'REMOVED'
  AND EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS platform_membership
    INNER JOIN "Role" AS platform_role
      ON platform_role."id" = platform_membership."roleId"
    WHERE platform_membership."userId" = contaminated."userId"
      AND platform_membership."status" = 'ACTIVE'
      AND platform_role."name" = 'Super Admin'
      AND platform_role."isSystem" = TRUE
      AND platform_role."organizationId" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Role" AS retained_role
    WHERE retained_role."id" = contaminated."roleId"
      AND contaminated."status" = 'ACTIVE'
      AND retained_role."name" = 'Super Admin'
      AND retained_role."isSystem" = TRUE
      AND retained_role."organizationId" IS NULL
  );
