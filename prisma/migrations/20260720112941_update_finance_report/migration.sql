-- AlterTable
ALTER TABLE "financial_transactions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "transaction_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "transaction_field_history_user_field_last_used_idx" RENAME TO "transaction_field_history_user_id_field_type_last_used_at_idx";

-- RenameIndex
ALTER INDEX "transaction_field_history_user_field_normalized_key" RENAME TO "transaction_field_history_user_id_field_type_normalized_val_key";
