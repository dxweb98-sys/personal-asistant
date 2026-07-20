# Financial Assistant Foundation Implementation

This delivery implements the first working foundation of the Telegram and Dashboard parity roadmap.

## Database changes

Migration: `20260720120000_financial_assistant_foundation`

### Extended entities

- `UserFinancePreference`: language, country, timezone, week start, notifications, report preferences, default account, and Telegram configuration version.
- `FinancialAccount`: active/archived lifecycle, archive metadata, system account marker, system code, and last-used timestamp.
- `FinancialTransaction`: posted/voided/reversal status, reversal relationship, cancellation metadata, base-currency snapshot, FX metadata, and JSON metadata.
- `DebtPayment`: void status and cancellation metadata.

### New entities

- `AuditLog`
- `TelegramProcessedCallback`
- `TransactionTemplate`
- `TransactionFieldHistory`
- `Tag`
- `TransactionTag`
- `ExportJob`

## Shared business services

- Database-backed Telegram profile and settings.
- Legacy JSON profile import into PostgreSQL on Telegram startup.
- Account archive and restore.
- Atomic balance relocation to another account or `Dana Belum Dialokasikan`.
- Transaction creation with account, category, debt, and tag ownership checks.
- Transaction void/reversal with atomic account balance restoration.
- Debt-payment reversal when a linked cash-flow transaction is cancelled.
- Per-user field history and reusable transaction templates.
- Unified financial reporting query shared by REST, Telegram, and export.

## API changes

### Settings

- `GET /api/v1/settings`
- `PATCH /api/v1/settings`

### Account lifecycle

- `GET /api/v1/finance/accounts?includeArchived=true`
- `GET /api/v1/finance/accounts/:id/archive-targets`
- `POST /api/v1/finance/accounts/:id/archive`
- `POST /api/v1/finance/accounts/:id/restore`

### Transactions

- `GET /api/v1/finance/transactions` with status, account, date, and pagination filters.
- `POST /api/v1/finance/transactions/:id/cancel`

### Templates, history, and tags

- `GET|POST /api/v1/finance/templates`
- `PATCH|DELETE /api/v1/finance/templates/:id`
- `POST /api/v1/finance/templates/:id/use`
- `GET /api/v1/finance/history`
- `PATCH /api/v1/finance/history/:id/favorite`
- `GET|POST /api/v1/finance/tags`

### Reports and exports

- `GET|POST /api/v1/reports/financial`
- `POST /api/v1/exports/financial`
- `GET /api/v1/audit`

Supported report presets: today, selected day, current/selected week, current/previous/selected month, current/selected year, custom range, and all time. Supported grouping: none, day, week, month, and year.

Supported export formats: PDF, XLSX, CSV, and JSON.

## Telegram changes

- Active profile/settings are read from PostgreSQL, not local JSON.
- Processed callback IDs are persisted to prevent duplicate execution.
- Added Reports menu with period selection, month navigation, and PDF/XLSX/CSV delivery.
- Added account archive, balance relocation, unallocated funds, and restore flows.
- Added transaction details, cancellation with reason and confirmation, and reusable similar transactions.
- Income, expense, and debt-payment success messages now expose detail and cancellation actions.

Multi-step drafts remain in process memory only until confirmed. Cancelling a draft clears the session and does not change balances or reports.

## Run migration

```bash
npm install
npm run db:generate
npm run db:migrate -- --name financial_assistant_foundation
```

For an existing deployment that uses committed migrations:

```bash
npm run db:generate
npm run db:deploy
```

Then restart the application. The Telegram startup process imports legacy profile values from `data/telegram-profiles.json` only when the database profile has an older configuration version.

## Validation

```bash
npm run build
npm test
```

Validated during implementation:

- Prisma schema validation passed.
- TypeScript strict compilation passed.
- 8 automated tests passed.

## Remaining roadmap items

The foundation is ready, but the following still require dedicated deliveries:

- Full Dashboard UI implementation; this repository currently exposes the shared API contracts.
- Standalone bill, receivable, budget, recurring transaction, and notification modules.
- Background export workers and expiring secure download URLs for very large reports.
- Complete Telegram filter wizard for account/category/tag/status/custom date combinations.
- Database integration tests against PostgreSQL for every balance and reversal scenario.
