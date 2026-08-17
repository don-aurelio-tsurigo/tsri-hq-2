-- Split the single display name into first and last name.
-- Existing users keep `name` and complete the new fields on next login.
ALTER TABLE "user" ADD COLUMN "firstName" TEXT;
ALTER TABLE "user" ADD COLUMN "lastName" TEXT;
