-- Ensure score columns exist (idempotent)
ALTER TABLE "public"."Question"
  ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

ALTER TABLE "public"."Resource"
  ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;




