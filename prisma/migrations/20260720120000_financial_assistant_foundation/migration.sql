-- Financial Assistant foundation: database-backed Telegram settings, account lifecycle,
-- transaction void/reversal, audit, templates, tags, callback idempotency, and export jobs.

DO $$ BEGIN
  CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('POSTED', 'VOIDED', 'REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "user_finance_preferences"
  ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'id',
  ADD COLUMN IF NOT EXISTS "country_code" TEXT NOT NULL DEFAULT 'ID',
  ADD COLUMN IF NOT EXISTS "time_zone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS "week_starts_on" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notification_config" JSONB,
  ADD COLUMN IF NOT EXISTS "report_config" JSONB,
  ADD COLUMN IF NOT EXISTS "default_account_id" UUID,
  ADD COLUMN IF NOT EXISTS "telegram_config_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "financial_accounts"
  ADD COLUMN IF NOT EXISTS "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "system_code" TEXT,
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3);

UPDATE "financial_accounts"
SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"AccountStatus" ELSE 'ARCHIVED'::"AccountStatus" END
WHERE "status" IS NULL OR ("is_active" = false AND "status" = 'ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS "financial_accounts_user_id_system_code_key"
  ON "financial_accounts"("user_id", "system_code");
CREATE INDEX IF NOT EXISTS "financial_accounts_user_id_status_idx"
  ON "financial_accounts"("user_id", "status");

ALTER TABLE "financial_transactions"
  ADD COLUMN IF NOT EXISTS "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "voided_by" TEXT,
  ADD COLUMN IF NOT EXISTS "reversal_of_id" UUID,
  ADD COLUMN IF NOT EXISTS "base_currency" TEXT,
  ADD COLUMN IF NOT EXISTS "fx_rate_to_base" DECIMAL(28,12),
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(24,8),
  ADD COLUMN IF NOT EXISTS "fx_captured_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_reversal_of_id_key"
  ON "financial_transactions"("reversal_of_id");
CREATE INDEX IF NOT EXISTS "financial_transactions_user_id_status_occurred_at_idx"
  ON "financial_transactions"("user_id", "status", "occurred_at");

ALTER TABLE "debt_payments"
  ADD COLUMN IF NOT EXISTS "status" "TransactionStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT;

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx"
  ON "audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx"
  ON "audit_logs"("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "telegram_processed_callbacks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "callback_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_processed_callbacks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_processed_callbacks_user_id_callback_id_key"
  ON "telegram_processed_callbacks"("user_id", "callback_id");
CREATE INDEX IF NOT EXISTS "telegram_processed_callbacks_processed_at_idx"
  ON "telegram_processed_callbacks"("processed_at");

CREATE TABLE IF NOT EXISTS "transaction_templates" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "last_used_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_templates_user_id_normalized_name_key"
  ON "transaction_templates"("user_id", "normalized_name");
CREATE INDEX IF NOT EXISTS "transaction_templates_user_id_is_favorite_last_used_at_idx"
  ON "transaction_templates"("user_id", "is_favorite", "last_used_at");

CREATE TABLE IF NOT EXISTS "transaction_field_history" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "field_type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "usage_count" INTEGER NOT NULL DEFAULT 1,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "transaction_field_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_field_history_user_field_normalized_key"
  ON "transaction_field_history"("user_id", "field_type", "normalized_value");
CREATE INDEX IF NOT EXISTS "transaction_field_history_user_field_last_used_idx"
  ON "transaction_field_history"("user_id", "field_type", "last_used_at");

CREATE TABLE IF NOT EXISTS "tags" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tags_user_id_normalized_name_key"
  ON "tags"("user_id", "normalized_name");

CREATE TABLE IF NOT EXISTS "transaction_tags" (
  "transaction_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id", "tag_id")
);

CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "format" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "file_name" TEXT,
  "file_path" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_jobs_user_id_created_at_idx"
  ON "export_jobs"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "user_finance_preferences"
    ADD CONSTRAINT "user_finance_preferences_default_account_id_fkey"
    FOREIGN KEY ("default_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "financial_transactions"
    ADD CONSTRAINT "financial_transactions_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "financial_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "telegram_processed_callbacks"
    ADD CONSTRAINT "telegram_processed_callbacks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transaction_templates"
    ADD CONSTRAINT "transaction_templates_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transaction_field_history"
    ADD CONSTRAINT "transaction_field_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tags"
    ADD CONSTRAINT "tags_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transaction_tags"
    ADD CONSTRAINT "transaction_tags_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transaction_tags"
    ADD CONSTRAINT "transaction_tags_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "export_jobs"
    ADD CONSTRAINT "export_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
