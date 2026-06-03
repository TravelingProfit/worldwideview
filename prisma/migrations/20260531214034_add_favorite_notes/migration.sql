-- AlterTable: add nullable notes column to favorites
-- This is a non-destructive additive change. Existing rows receive NULL.
ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "notes" TEXT;
