-- AlterEnum
-- A persisted, visible notice about the AI assistant's own failure (e.g.
-- rate-limited, provider error) — never a fake reply from any party.
ALTER TYPE "SupportSenderRole" ADD VALUE 'SYSTEM';
