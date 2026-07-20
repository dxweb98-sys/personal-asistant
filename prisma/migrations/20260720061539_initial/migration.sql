-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'PRINCIPAL_PAID', 'SETTLEMENT_PENDING', 'PAID', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DebtPriority" AS ENUM ('CRITICAL', 'URGENT', 'NORMAL', 'SLOW');

-- CreateEnum
CREATE TYPE "PaymentPolicy" AS ENUM ('FIXED', 'FLEXIBLE', 'NEGOTIABLE');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'TELEGRAM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'PAID_LATE', 'OVERDUE', 'RESCHEDULED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('LATE_FEE', 'INTEREST', 'ADMIN_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeBillingStatus" AS ENUM ('PENDING', 'BILLED', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "LateFeeCalculationType" AS ENUM ('NONE', 'FIXED', 'DAILY', 'PERCENTAGE_DAILY', 'PERCENTAGE_FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "LateFeeSettlementPolicy" AS ENUM ('IMMEDIATE', 'NEXT_INSTALLMENT', 'END_OF_TERM', 'MANUAL');

-- CreateEnum
CREATE TYPE "PercentageBase" AS ENUM ('INSTALLMENT_AMOUNT', 'UNPAID_INSTALLMENT', 'REMAINING_PRINCIPAL');

-- CreateEnum
CREATE TYPE "PaymentAllocationPolicy" AS ENUM ('OLDEST_CHARGE_FIRST', 'CURRENT_INSTALLMENT_FIRST', 'PRINCIPAL_FIRST', 'MANUAL');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('AVAILABLE', 'IN_PROGRESS', 'AGREED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('DUE_DATE_EXTENSION', 'PAYMENT_REDUCTION', 'PAYMENT_HOLIDAY', 'LATE_FEE_WAIVER', 'OTHER');

-- CreateEnum
CREATE TYPE "InvestmentPlatformType" AS ENUM ('BROKER', 'EXCHANGE', 'GOLD_PROVIDER', 'BANK', 'WALLET', 'MARKETPLACE', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'E_WALLET', 'CREDIT_CARD', 'PAYLATER', 'CRYPTO_WALLET', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'INVESTMENT_BUY', 'INVESTMENT_SELL', 'DIVIDEND', 'DEBT_PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'CRYPTO', 'GOLD', 'MUTUAL_FUND', 'DEPOSIT', 'PROPERTY', 'OTHER');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MANUAL', 'API', 'IMPORT');

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'API', 'IMPORT');

-- CreateEnum
CREATE TYPE "PriceStorageMode" AS ENUM ('LATEST_ONLY', 'SNAPSHOT');

-- CreateEnum
CREATE TYPE "TelegramTheme" AS ENUM ('FRIENDLY', 'MOTIVATIONAL', 'PROFESSIONAL', 'MINIMAL', 'CALM', 'PLAYFUL', 'GAMIFIED', 'FINANCIAL_COACH');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('UNPRICED', 'PURCHASE_PRICE_ONLY', 'MANUAL_PRICE', 'MARKET_PRICE', 'STALE_PRICE');

-- CreateEnum
CREATE TYPE "LiquidityLevel" AS ENUM ('INSTANT', 'HIGH', 'MEDIUM', 'LOW', 'LOCKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "telegram_chat_id" BIGINT,
    "telegram_username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_finance_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'IDR',
    "price_storage_mode" "PriceStorageMode" NOT NULL DEFAULT 'LATEST_ONLY',
    "confirm_before_price_refresh" BOOLEAN NOT NULL DEFAULT true,
    "create_snapshot_after_refresh" BOOLEAN NOT NULL DEFAULT false,
    "stock_stale_hours" INTEGER NOT NULL DEFAULT 24,
    "crypto_stale_hours" INTEGER NOT NULL DEFAULT 6,
    "gold_stale_hours" INTEGER NOT NULL DEFAULT 24,
    "telegram_theme" "TelegramTheme" NOT NULL DEFAULT 'FRIENDLY',
    "show_motivation" BOOLEAN NOT NULL DEFAULT true,
    "compact_numbers" BOOLEAN NOT NULL DEFAULT false,
    "fx_stale_hours" INTEGER NOT NULL DEFAULT 24,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_finance_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creditor" TEXT NOT NULL,
    "description" TEXT,
    "original_principal" DECIMAL(19,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "remaining_principal" DECIMAL(19,2) NOT NULL,
    "payment_policy" "PaymentPolicy" NOT NULL,
    "fixed_monthly_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "minimum_monthly_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "target_monthly_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "interest_rate_annual" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "start_date" DATE,
    "maturity_date" DATE,
    "due_day" INTEGER,
    "tenor_months" INTEGER,
    "priority" "DebtPriority" NOT NULL DEFAULT 'NORMAL',
    "can_be_negotiated" BOOLEAN NOT NULL DEFAULT false,
    "allocation_policy" "PaymentAllocationPolicy" NOT NULL DEFAULT 'CURRENT_INSTALLMENT_FIRST',
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_late_fee_rules" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "calculation_type" "LateFeeCalculationType" NOT NULL DEFAULT 'NONE',
    "fixed_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "daily_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "percentage_base" "PercentageBase" NOT NULL DEFAULT 'UNPAID_INSTALLMENT',
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "max_days" INTEGER,
    "max_amount" DECIMAL(19,2),
    "settlement_policy" "LateFeeSettlementPolicy" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_late_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_installments" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "scheduled_principal" DECIMAL(19,2) NOT NULL,
    "paid_principal" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "expected_payment_date" DATE,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_charges" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "source_installment_id" UUID,
    "billed_installment_id" UUID,
    "type" "ChargeType" NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "paid_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "billing_status" "ChargeBillingStatus" NOT NULL DEFAULT 'PENDING',
    "settlement_policy" "LateFeeSettlementPolicy" NOT NULL,
    "source_period" TEXT,
    "target_period" TEXT,
    "late_days" INTEGER,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "installment_id" UUID,
    "charge_id" UUID,
    "principal_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "charge_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,

    CONSTRAINT "debt_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_negotiations" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "status" "NegotiationStatus" NOT NULL,
    "previous_monthly_amount" DECIMAL(19,2),
    "agreed_monthly_amount" DECIMAL(19,2),
    "effective_from" DATE,
    "effective_until" DATE,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_adjustments" (
    "id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "previous_due_date" DATE,
    "new_due_date" DATE,
    "previous_amount" DECIMAL(19,2),
    "new_amount" DECIMAL(19,2),
    "late_fee_waived" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL(28,12) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "opening_balance" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "category_id" UUID,
    "source_account_id" UUID,
    "destination_account_id" UUID,
    "debt_id" UUID,
    "amount" DECIMAL(24,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_platforms" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InvestmentPlatformType" NOT NULL,
    "account_reference" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_instruments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "unit_name" TEXT NOT NULL DEFAULT 'unit',
    "units_per_lot" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "liquidity_level" "LiquidityLevel" NOT NULL DEFAULT 'MEDIUM',
    "stale_after_hours" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_trades" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "platform_id" UUID,
    "type" "TradeType" NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "price_per_unit" DECIMAL(24,8) NOT NULL,
    "fee" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "price_currency" TEXT NOT NULL DEFAULT 'IDR',
    "settlement_currency" TEXT NOT NULL DEFAULT 'IDR',
    "fx_rate_to_settlement" DECIMAL(28,12) NOT NULL DEFAULT 1,
    "settlement_amount" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "traded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_incomes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "platform_id" UUID,
    "amount" DECIMAL(19,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "quantity_snapshot" DECIMAL(24,8),
    "amount_per_unit" DECIMAL(24,8),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_prices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "source" "PriceSource" NOT NULL DEFAULT 'MANUAL',
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_finance_preferences_user_id_key" ON "user_finance_preferences"("user_id");

-- CreateIndex
CREATE INDEX "debts_user_id_status_idx" ON "debts"("user_id", "status");

-- CreateIndex
CREATE INDEX "debts_user_id_priority_idx" ON "debts"("user_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "debt_late_fee_rules_debt_id_key" ON "debt_late_fee_rules"("debt_id");

-- CreateIndex
CREATE INDEX "debt_installments_debt_id_due_date_status_idx" ON "debt_installments"("debt_id", "due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "debt_installments_debt_id_period_key" ON "debt_installments"("debt_id", "period");

-- CreateIndex
CREATE INDEX "debt_charges_debt_id_billing_status_idx" ON "debt_charges"("debt_id", "billing_status");

-- CreateIndex
CREATE UNIQUE INDEX "debt_payments_idempotency_key_key" ON "debt_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "debt_payments_debt_id_paid_at_idx" ON "debt_payments"("debt_id", "paid_at");

-- CreateIndex
CREATE INDEX "debt_negotiations_debt_id_status_idx" ON "debt_negotiations"("debt_id", "status");

-- CreateIndex
CREATE INDEX "exchange_rates_user_id_captured_at_idx" ON "exchange_rates"("user_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_user_id_base_currency_quote_currency_key" ON "exchange_rates"("user_id", "base_currency", "quote_currency");

-- CreateIndex
CREATE INDEX "financial_accounts_user_id_type_idx" ON "financial_accounts"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_user_id_name_key" ON "financial_accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_categories_user_id_name_transaction_type_key" ON "transaction_categories"("user_id", "name", "transaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_idempotency_key_key" ON "financial_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "financial_transactions_user_id_type_occurred_at_idx" ON "financial_transactions"("user_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "investment_platforms_user_id_type_idx" ON "investment_platforms"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "investment_platforms_user_id_name_key" ON "investment_platforms"("user_id", "name");

-- CreateIndex
CREATE INDEX "investment_instruments_user_id_type_idx" ON "investment_instruments"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "investment_instruments_user_id_type_symbol_exchange_key" ON "investment_instruments"("user_id", "type", "symbol", "exchange");

-- CreateIndex
CREATE INDEX "investment_trades_user_id_instrument_id_traded_at_idx" ON "investment_trades"("user_id", "instrument_id", "traded_at");

-- CreateIndex
CREATE INDEX "investment_trades_user_id_platform_id_traded_at_idx" ON "investment_trades"("user_id", "platform_id", "traded_at");

-- CreateIndex
CREATE INDEX "dividend_incomes_user_id_received_at_idx" ON "dividend_incomes"("user_id", "received_at");

-- CreateIndex
CREATE INDEX "dividend_incomes_user_id_platform_id_received_at_idx" ON "dividend_incomes"("user_id", "platform_id", "received_at");

-- CreateIndex
CREATE INDEX "market_prices_instrument_id_captured_at_idx" ON "market_prices"("instrument_id", "captured_at");

-- AddForeignKey
ALTER TABLE "user_finance_preferences" ADD CONSTRAINT "user_finance_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_late_fee_rules" ADD CONSTRAINT "debt_late_fee_rules_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_charges" ADD CONSTRAINT "debt_charges_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_charges" ADD CONSTRAINT "debt_charges_source_installment_id_fkey" FOREIGN KEY ("source_installment_id") REFERENCES "debt_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_charges" ADD CONSTRAINT "debt_charges_billed_installment_id_fkey" FOREIGN KEY ("billed_installment_id") REFERENCES "debt_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "debt_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "debt_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "debt_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_negotiations" ADD CONSTRAINT "debt_negotiations_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "debt_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_categories" ADD CONSTRAINT "transaction_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_platforms" ADD CONSTRAINT "investment_platforms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_instruments" ADD CONSTRAINT "investment_instruments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "investment_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "investment_platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_incomes" ADD CONSTRAINT "dividend_incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_incomes" ADD CONSTRAINT "dividend_incomes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "investment_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_incomes" ADD CONSTRAINT "dividend_incomes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_incomes" ADD CONSTRAINT "dividend_incomes_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "investment_platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "investment_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
