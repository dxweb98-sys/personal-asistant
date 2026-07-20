# Debt & Credit — Stage 1 Baseline

Date: 2026-07-20

## Scope boundary

Development is limited to the Debt & Credit module and its direct prerequisites:

- financial accounts and balances;
- account movements and transfers;
- fixed income and mandatory-expense data required by debt analysis;
- debt schedules, bills, payments, simulation, reports, exports, and notifications;
- minimal shared changes for feature flags, routing, transaction classification, audit, and authorization.

Do not refactor, reformat, remove, or redesign unrelated modules. Investment and saving-goal business flows remain outside the active scope.

## Available quality commands

The repository currently exposes these relevant scripts:

- `npm run build` — Prisma generation and TypeScript compilation;
- `npm test` — Vitest test run;
- `npm run db:generate`;
- `npm run db:migrate`;
- `npm run db:deploy`.

The following requested quality commands do not currently exist and must not be reported as successful:

- `npm run format:check`;
- `npm run lint -- --max-warnings=0`;
- `npm run typecheck`;
- `npm run test:e2e`.

No dependency or project configuration should be changed merely to fabricate these gates. Any future addition requires a separate justified change.

## Current account foundation

Implemented before this stage:

- account creation and listing;
- current and opening balances;
- transfers;
- archive and restore;
- transfer of remaining balance before archive;
- Unallocated Funds system account;
- idempotency keys on financial transactions;
- audit records for account and transaction actions;
- transaction reversal support.

Gaps to address in Stage 1:

- no account update endpoint;
- account types do not explicitly distinguish savings and liability accounts;
- amount parsing still crosses JavaScript `number` before Prisma Decimal persistence;
- several finance data-access operations use `any`;
- account movement reconciliation and database integration tests are incomplete.

## Current transaction classification

Current persisted transaction types are:

- `INCOME`;
- `EXPENSE`;
- `TRANSFER`;
- `INVESTMENT_BUY`;
- `INVESTMENT_SELL`;
- `DIVIDEND`;
- `DEBT_PAYMENT`;
- `ADJUSTMENT`.

Required economic classifications are not yet represented consistently:

- daily expense;
- bill payment;
- debt disbursement;
- credit purchase;
- savings allocation;
- investment purchase;
- balance adjustment;
- reversal.

Backward compatibility must be preserved while the classification model is extended.

## Accounting rules for the implementation

### Cash outflow

Cash outflow includes every movement reducing a source-account balance, including:

- daily expenses;
- bill payments;
- total debt payments;
- transfers;
- savings allocations;
- investment purchases.

### Actual expense

Actual expense includes only:

- consumption/daily expense;
- bills;
- debt interest;
- penalties;
- administration and financing fees;
- investment transaction fees when that module is activated later.

Actual expense excludes:

- transfer principal;
- savings allocation;
- investment asset purchase principal;
- debt principal repayment.

### Debt payment components

A debt payment must be represented once as cash outflow and split into:

- principal reduction;
- interest expense;
- penalty expense;
- administration/other financing fee.

The payment total and its components must not be added together as expense.

### Debt disbursement

Loan proceeds increase cash and debt principal but do not increase income.

## Existing report behavior requiring correction

The current cash-flow aggregation separates income, expense, debt payment, and transfers, but it does not expose a dedicated actual-expense total. Debt payments are subtracted in full from net cash flow, while interest, penalty, and principal components are not represented independently.

The report layer must eventually provide three separate views:

1. actual expense;
2. cash flow;
3. debt report.

## Atomicity risk

The current Telegram debt-payment flow can create the debt payment and financial cash-flow transaction in separate service calls. This can leave debt and account balances inconsistent when one operation succeeds and the other fails.

Before expanding payment functionality, debt allocation and account movement must be coordinated through one database transaction owned by the central transaction service.

## Type-safety baseline

Pre-existing issues include:

- `prisma as any` aliases;
- transaction callback parameters typed as `any`;
- report rows and aggregate objects typed as `any`;
- legacy Telegram v2 files excluded from TypeScript compilation.

New or modified production files in this stage must not introduce:

- `any`;
- `@ts-ignore`;
- `@ts-nocheck`;
- disabled lint rules;
- reduced TypeScript strictness.

Pre-existing issues outside the changed scope are recorded rather than silently fixed.

## Feature-flag baseline

The baseline did not have a central feature-flag registry. The current focus implementation now uses one source of truth for backend guards, navigation metadata, and Telegram access. Debt & Credit prerequisites are `ACTIVE`; unrelated roadmap modules are `COMING_SOON`, remain visible with lock metadata, and are rejected before their service handlers run.

## Stage order

1. Account, balance, movement, transfer, audit, and reconciliation.
2. Debt contract, schedule, principal, interest, charges, and bills.
3. Full/partial payment, settlement, reversal, and reconciliation.
4. New-credit simulation and urgent override.
5. Debt reports and exports.

A stage is not complete until the available repository build and tests pass. Missing quality scripts and database-dependent checks must be reported explicitly.
