export const FeatureStatus = {
  ACTIVE: "ACTIVE",
  COMING_SOON: "COMING_SOON",
} as const;

export type FeatureStatus =
  (typeof FeatureStatus)[keyof typeof FeatureStatus];

export const Feature = {
  PROFILE: "profile",
  TELEGRAM_PROFILE: "telegram_profile",
  ONBOARDING: "onboarding",
  ACCOUNTS: "accounts",
  BALANCES: "balances",
  ACCOUNT_MOVEMENTS: "account_movements",
  TRANSFERS: "transfers",
  FIXED_INCOME: "fixed_income",
  BASIC_EXPENSES: "basic_expenses",
  BILLS: "bills",
  DEBTS: "debts",
  INSTALLMENTS: "installments",
  DEBT_PAYMENTS: "debt_payments",
  CREDIT_SIMULATION: "credit_simulation",
  DEBT_REPORTS: "debt_reports",
  DEBT_EXPORTS: "debt_exports",
  AUDIT: "audit",
  SETTINGS: "settings",
  NOTIFICATIONS: "notifications",
  SAVING_GOALS: "saving_goals",
  INVESTMENTS: "investments",
  ADVANCED_BUDGET: "advanced_budget",
  WEALTH_MANAGEMENT: "wealth_management",
  GENERAL_REPORTS: "general_reports",
  RECOMMENDATIONS: "recommendations",
} as const;

export type FeatureKey = (typeof Feature)[keyof typeof Feature];

type NavigationDefinition = Readonly<{
  icon: string;
  order: number;
}>;

export type FeatureDefinition = Readonly<{
  key: FeatureKey;
  label: string;
  status: FeatureStatus;
  dependencies: readonly FeatureKey[];
  navigation?: NavigationDefinition;
}>;

const active = FeatureStatus.ACTIVE;
const comingSoon = FeatureStatus.COMING_SOON;

export const featureRegistry = {
  [Feature.PROFILE]: {
    key: Feature.PROFILE,
    label: "Profil Pengguna",
    status: active,
    dependencies: [],
  },
  [Feature.TELEGRAM_PROFILE]: {
    key: Feature.TELEGRAM_PROFILE,
    label: "Profil Telegram",
    status: active,
    dependencies: [Feature.PROFILE],
  },
  [Feature.ONBOARDING]: {
    key: Feature.ONBOARDING,
    label: "Onboarding",
    status: active,
    dependencies: [Feature.PROFILE, Feature.SETTINGS],
  },
  [Feature.ACCOUNTS]: {
    key: Feature.ACCOUNTS,
    label: "Account",
    status: active,
    dependencies: [Feature.PROFILE],
    navigation: { icon: "wallet", order: 10 },
  },
  [Feature.BALANCES]: {
    key: Feature.BALANCES,
    label: "Saldo",
    status: active,
    dependencies: [Feature.ACCOUNTS],
  },
  [Feature.ACCOUNT_MOVEMENTS]: {
    key: Feature.ACCOUNT_MOVEMENTS,
    label: "Mutasi Account",
    status: active,
    dependencies: [Feature.ACCOUNTS, Feature.BALANCES],
  },
  [Feature.TRANSFERS]: {
    key: Feature.TRANSFERS,
    label: "Transfer",
    status: active,
    dependencies: [Feature.ACCOUNTS, Feature.BALANCES],
  },
  [Feature.FIXED_INCOME]: {
    key: Feature.FIXED_INCOME,
    label: "Pendapatan Tetap",
    status: active,
    dependencies: [Feature.ACCOUNTS],
    navigation: { icon: "banknote", order: 20 },
  },
  [Feature.BASIC_EXPENSES]: {
    key: Feature.BASIC_EXPENSES,
    label: "Pengeluaran Dasar",
    status: active,
    dependencies: [Feature.ACCOUNTS],
    navigation: { icon: "receipt", order: 30 },
  },
  [Feature.BILLS]: {
    key: Feature.BILLS,
    label: "Tagihan",
    status: active,
    dependencies: [Feature.ACCOUNTS, Feature.BASIC_EXPENSES],
    navigation: { icon: "calendar-clock", order: 40 },
  },
  [Feature.DEBTS]: {
    key: Feature.DEBTS,
    label: "Utang & Kredit",
    status: active,
    dependencies: [Feature.ACCOUNTS, Feature.BALANCES],
    navigation: { icon: "credit-card", order: 50 },
  },
  [Feature.INSTALLMENTS]: {
    key: Feature.INSTALLMENTS,
    label: "Cicilan",
    status: active,
    dependencies: [Feature.DEBTS, Feature.BILLS],
  },
  [Feature.DEBT_PAYMENTS]: {
    key: Feature.DEBT_PAYMENTS,
    label: "Pembayaran Utang",
    status: active,
    dependencies: [
      Feature.DEBTS,
      Feature.INSTALLMENTS,
      Feature.ACCOUNT_MOVEMENTS,
    ],
  },
  [Feature.CREDIT_SIMULATION]: {
    key: Feature.CREDIT_SIMULATION,
    label: "Simulasi Kredit",
    status: active,
    dependencies: [
      Feature.DEBTS,
      Feature.FIXED_INCOME,
      Feature.BASIC_EXPENSES,
    ],
    navigation: { icon: "calculator", order: 60 },
  },
  [Feature.DEBT_REPORTS]: {
    key: Feature.DEBT_REPORTS,
    label: "Laporan Utang",
    status: active,
    dependencies: [Feature.DEBTS, Feature.DEBT_PAYMENTS],
    navigation: { icon: "file-chart", order: 70 },
  },
  [Feature.DEBT_EXPORTS]: {
    key: Feature.DEBT_EXPORTS,
    label: "Export Utang",
    status: active,
    dependencies: [Feature.DEBT_REPORTS],
  },
  [Feature.AUDIT]: {
    key: Feature.AUDIT,
    label: "Audit Log",
    status: active,
    dependencies: [Feature.PROFILE],
  },
  [Feature.SETTINGS]: {
    key: Feature.SETTINGS,
    label: "Pengaturan",
    status: active,
    dependencies: [Feature.PROFILE],
    navigation: { icon: "settings", order: 80 },
  },
  [Feature.NOTIFICATIONS]: {
    key: Feature.NOTIFICATIONS,
    label: "Notifikasi Utang",
    status: active,
    dependencies: [Feature.DEBTS, Feature.SETTINGS],
  },
  [Feature.SAVING_GOALS]: {
    key: Feature.SAVING_GOALS,
    label: "Target Tabungan",
    status: comingSoon,
    dependencies: [Feature.ACCOUNTS],
    navigation: { icon: "target", order: 90 },
  },
  [Feature.INVESTMENTS]: {
    key: Feature.INVESTMENTS,
    label: "Investasi",
    status: comingSoon,
    dependencies: [Feature.ACCOUNTS],
    navigation: { icon: "chart-candlestick", order: 100 },
  },
  [Feature.ADVANCED_BUDGET]: {
    key: Feature.ADVANCED_BUDGET,
    label: "Budget Lanjutan",
    status: comingSoon,
    dependencies: [Feature.BASIC_EXPENSES],
    navigation: { icon: "chart-pie", order: 110 },
  },
  [Feature.WEALTH_MANAGEMENT]: {
    key: Feature.WEALTH_MANAGEMENT,
    label: "Wealth Management",
    status: comingSoon,
    dependencies: [Feature.INVESTMENTS, Feature.SAVING_GOALS],
    navigation: { icon: "landmark", order: 120 },
  },
  [Feature.GENERAL_REPORTS]: {
    key: Feature.GENERAL_REPORTS,
    label: "Laporan Umum",
    status: comingSoon,
    dependencies: [Feature.INVESTMENTS, Feature.WEALTH_MANAGEMENT],
    navigation: { icon: "files", order: 130 },
  },
  [Feature.RECOMMENDATIONS]: {
    key: Feature.RECOMMENDATIONS,
    label: "Rekomendasi Keuangan Lanjutan",
    status: comingSoon,
    dependencies: [Feature.GENERAL_REPORTS],
  },
} satisfies Record<FeatureKey, FeatureDefinition>;

export function getFeature(feature: FeatureKey): FeatureDefinition {
  return featureRegistry[feature];
}

export function isFeatureActive(feature: FeatureKey): boolean {
  return getFeature(feature).status === FeatureStatus.ACTIVE;
}

function toPublicFeature(definition: FeatureDefinition) {
  const locked = definition.status === FeatureStatus.COMING_SOON;
  return {
    key: definition.key,
    label: definition.label,
    status: definition.status,
    dependencies: definition.dependencies,
    enabled: !locked,
    disabled: locked,
    locked,
    lockIcon: locked ? "lock" : null,
    badge: locked ? "Segera Hadir" : null,
  };
}

export function listFeatures() {
  return (Object.values(featureRegistry) as FeatureDefinition[]).map(
    toPublicFeature,
  );
}

export function listNavigationFeatures() {
  return (Object.values(featureRegistry) as FeatureDefinition[])
    .flatMap((definition) => {
      const navigation = definition.navigation;
      return navigation
        ? [
            {
              ...toPublicFeature(definition),
              icon: navigation.icon,
              order: navigation.order,
            },
          ]
        : [];
    })
    .sort((left, right) => left.order - right.order);
}
