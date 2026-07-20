# Financial Assistant Improvement Roadmap

This document is the implementation roadmap for improving the existing Personal Finance OS across Telegram, API, and Dashboard.

## Principles

- Telegram and Dashboard must use the same services, validation, transaction rules, reporting logic, and authorization boundaries.
- Financial records that affect balances must not be hard-deleted.
- Multi-step financial operations must use database transactions and idempotency.
- User-specific settings must live in PostgreSQL, not local JSON or process memory.
- Original transaction values and currencies must remain immutable; converted values are presentation/reporting concerns.

## Phase 1 — Database foundation

- Move Telegram profile/settings fully into `UserFinancePreference` or related database entities.
- Add language, country, timezone, week start, notification preferences, report preferences, default account, and fallback configuration.
- Add account lifecycle metadata: active, archived, archivedAt, archivedReason, system-account marker, default-account marker.
- Add a system account for Unallocated Funds per user and currency.
- Add financial transaction status, cancellation metadata, reversal linkage, original amount/currency, FX metadata, and audit metadata.
- Add audit log entity.
- Add processed Telegram callback/idempotency entity.

## Phase 2 — Shared business services

- Account archive and restore flows.
- Atomic balance transfer before archive.
- Transfer to Unallocated Funds.
- Transaction cancellation and reversal.
- Atomic reversal for transfers.
- Shared transaction preview/validation service.
- Shared query model for Telegram, API, Dashboard, reporting, and export.

## Phase 3 — History and templates

- Normalized per-user field history.
- Transaction templates with favorites, usage count, and last-used ordering.
- Case-insensitive duplicate prevention.
- Template preview and editable prefill.

## Phase 4 — Reporting

- Unified report filters: period, date range, grouping, accounts, categories, tags, transaction type, status, currency, archived accounts, cancelled transactions.
- Period presets: daily, weekly, monthly, yearly, custom, all time.
- Grouping: none, day, week, month, year.
- Account reconciliation report with opening balance, income, expense, transfers, adjustments, closing balance, and converted totals.
- Internal transfers excluded from income and expense totals.

## Phase 5 — Export

- PDF summary reports.
- XLSX with summary and detail sheets.
- CSV raw transaction export.
- JSON backup export.
- Background export jobs for large data.
- Secure owner-only download delivery.

## Phase 6 — Telegram UX parity

- Clear home hierarchy for Transactions, Accounts, Debts, Investments, Reports, Master Data, and Settings.
- Wizard navigation with Back, Cancel, Continue, and Confirm.
- Post-transaction actions: Details, Cancel Transaction, Create Similar, Home.
- Account archive/restore flow.
- Report period navigation and pagination.
- Export wizard and file delivery.

## Phase 7 — Dashboard parity

- Use the same endpoints and report filters as Telegram.
- Account archive/restore UI.
- Transaction void/reversal UI.
- Templates and history UI.
- Report and export filter parity.

## Phase 8 — Automated tests

- Database-backed Telegram settings persistence.
- Backward-compatible theme fallback.
- Account archive restrictions and balance migration.
- Unallocated Funds reconciliation.
- Draft cancellation and persisted transaction reversal.
- Atomic transfer reversal.
- Templates and history reuse.
- Daily/weekly/monthly/yearly/custom/all-time reports.
- Internal-transfer double-count prevention.
- Telegram, Dashboard, API, and export filter consistency.
- PDF/XLSX/CSV export validation.
- Timezone and multi-currency consistency.

## Delivery rules

Each phase must include:

1. Prisma schema changes and migration.
2. Shared service changes.
3. API endpoint changes.
4. Telegram changes where applicable.
5. Dashboard changes where applicable.
6. Automated tests.
7. Migration, build, and test commands in the commit notes.
