-- Finalize the finance-report schema changes after the foundation migration has
-- created the relevant columns, tables, and indexes. All statements remain
-- conditional so this migration is safe when an existing database already has
-- one or more of the final changes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'financial_transactions'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE "financial_transactions"
      ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'transaction_templates'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE "transaction_templates"
      ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_namespace namespace_relation
      ON namespace_relation.oid = index_relation.relnamespace
    WHERE index_relation.relkind = 'i'
      AND namespace_relation.nspname = current_schema()
      AND index_relation.relname = 'transaction_field_history_user_field_last_used_idx'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_namespace namespace_relation
      ON namespace_relation.oid = index_relation.relnamespace
    WHERE index_relation.relkind = 'i'
      AND namespace_relation.nspname = current_schema()
      AND index_relation.relname = 'transaction_field_history_user_id_field_type_last_used_at_idx'
  ) THEN
    ALTER INDEX "transaction_field_history_user_field_last_used_idx"
      RENAME TO "transaction_field_history_user_id_field_type_last_used_at_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_namespace namespace_relation
      ON namespace_relation.oid = index_relation.relnamespace
    WHERE index_relation.relkind = 'i'
      AND namespace_relation.nspname = current_schema()
      AND index_relation.relname = 'transaction_field_history_user_field_normalized_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_namespace namespace_relation
      ON namespace_relation.oid = index_relation.relnamespace
    WHERE index_relation.relkind = 'i'
      AND namespace_relation.nspname = current_schema()
      AND index_relation.relname = 'transaction_field_history_user_id_field_type_normalized_val_key'
  ) THEN
    ALTER INDEX "transaction_field_history_user_field_normalized_key"
      RENAME TO "transaction_field_history_user_id_field_type_normalized_val_key";
  END IF;
END $$;
