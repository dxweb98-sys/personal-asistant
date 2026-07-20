-- Debt contract breakdown, affordability inputs, and bank-backed debt payments.

DO $$ BEGIN
  CREATE TYPE "DebtKind" AS ENUM (
    'CASH_LOAN',
    'VEHICLE_FINANCING',
    'GOODS_CREDIT',
    'CREDIT_CARD',
    'PAYLATER',
    'HOME_FINANCING',
    'FAMILY_FRIEND',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DebtInterestMethod" AS ENUM (
    'NONE',
    'FLAT',
    'EFFECTIVE',
    'ANNUITY',
    'MANUAL_CONTRACT',
    'MANUAL_SCHEDULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "debts"
  ADD COLUMN IF NOT EXISTS "kind" "DebtKind" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "interest_method" "DebtInterestMethod" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "total_contract_amount" DECIMAL(19,2);

UPDATE "debts"
SET
  "total_contract_amount" = "fixed_monthly_amount" * "tenor_months",
  "interest_method" = CASE
    WHEN "fixed_monthly_amount" * "tenor_months" > "original_principal"
      THEN 'MANUAL_CONTRACT'::"DebtInterestMethod"
    ELSE 'NONE'::"DebtInterestMethod"
  END
WHERE
  "payment_policy" = 'FIXED'
  AND "fixed_monthly_amount" > 0
  AND "tenor_months" > 0
  AND "total_contract_amount" IS NULL;

ALTER TABLE "user_finance_preferences"
  ADD COLUMN IF NOT EXISTS "fixed_monthly_income" DECIMAL(19,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mandatory_monthly_expenses" DECIMAL(19,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "debt_safety_buffer" DECIMAL(19,2) NOT NULL DEFAULT 0;

ALTER TABLE "debt_payments"
  ADD COLUMN IF NOT EXISTS "source_account_id" UUID;

CREATE INDEX IF NOT EXISTS "debt_payments_source_account_id_idx"
  ON "debt_payments"("source_account_id");

DO $$ BEGIN
  ALTER TABLE "debt_payments"
    ADD CONSTRAINT "debt_payments_source_account_id_fkey"
    FOREIGN KEY ("source_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
