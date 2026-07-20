import { describe, expect, it } from "vitest";
import { Feature } from "../../config/features.js";
import {
  isTelegramInputBlocked,
  requiredFeatureForTelegramInput,
} from "./telegram-feature-access.js";

describe("Telegram feature access", () => {
  it.each([
    "menu:portfolio",
    "price:menu",
    "price:manual:asset-id",
    "platform:list",
    "invest:add-help",
    "settings:storage",
    "settings:stale",
  ])("blocks investment callback %s before its handler", (callbackData) => {
    expect(requiredFeatureForTelegramInput({ callbackData })).toBe(
      Feature.INVESTMENTS,
    );
    expect(isTelegramInputBlocked({ callbackData })).toBe(true);
  });

  it.each([
    "/portfolio",
    "/portfolio@personal_finance_bot",
    "/tambahplatform Stockbit | BROKER",
    "/tambahinvestasi BBCA | BCA | STOCK",
  ])("blocks direct investment command %s", (messageText) => {
    expect(isTelegramInputBlocked({ messageText })).toBe(true);
  });

  it("does not block debt, account, settings, or basic transaction actions", () => {
    for (const callbackData of [
      "menu:debt",
      "menu:accounts",
      "menu:settings",
      "flow:income",
      "flow:expense",
      "debt:pay:debt-id",
    ]) {
      expect(requiredFeatureForTelegramInput({ callbackData })).toBeNull();
      expect(isTelegramInputBlocked({ callbackData })).toBe(false);
    }
  });
});
