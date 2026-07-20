import { describe, expect, it } from "vitest";
import {
  Feature,
  FeatureStatus,
  getFeature,
  isFeatureActive,
  listFeatures,
  listNavigationFeatures,
} from "./features.js";

describe("debt and credit feature focus", () => {
  it("keeps debt and its direct dependencies active", () => {
    const activeFeatures = [
      Feature.ACCOUNTS,
      Feature.BALANCES,
      Feature.ACCOUNT_MOVEMENTS,
      Feature.TRANSFERS,
      Feature.FIXED_INCOME,
      Feature.BASIC_EXPENSES,
      Feature.BILLS,
      Feature.DEBTS,
      Feature.INSTALLMENTS,
      Feature.DEBT_PAYMENTS,
      Feature.CREDIT_SIMULATION,
      Feature.DEBT_REPORTS,
      Feature.DEBT_EXPORTS,
      Feature.AUDIT,
      Feature.SETTINGS,
      Feature.NOTIFICATIONS,
    ];

    expect(activeFeatures.every(isFeatureActive)).toBe(true);
  });

  it("marks unrelated roadmap modules as coming soon", () => {
    const disabledFeatures = [
      Feature.SAVING_GOALS,
      Feature.INVESTMENTS,
      Feature.ADVANCED_BUDGET,
      Feature.WEALTH_MANAGEMENT,
      Feature.GENERAL_REPORTS,
      Feature.RECOMMENDATIONS,
    ];

    expect(
      disabledFeatures.every(
        (feature) => getFeature(feature).status === FeatureStatus.COMING_SOON,
      ),
    ).toBe(true);
  });

  it("does not leave an active feature dependent on a locked feature", () => {
    const activeFeatures = listFeatures().filter((feature) => feature.enabled);

    for (const feature of activeFeatures) {
      expect(
        feature.dependencies.every((dependency) =>
          isFeatureActive(dependency),
        ),
      ).toBe(true);
    }
  });

  it("keeps disabled navigation visible with lock and badge", () => {
    const investments = listNavigationFeatures().find(
      (item) => item.key === Feature.INVESTMENTS,
    );

    expect(investments).toMatchObject({
      disabled: true,
      locked: true,
      lockIcon: "lock",
      badge: "Segera Hadir",
    });
  });
});
