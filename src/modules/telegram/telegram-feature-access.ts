import {
  Feature,
  getFeature,
  isFeatureActive,
  type FeatureKey,
} from "../../config/features.js";

const investmentCallbacks = [
  "menu:portfolio",
  "price:",
  "platform:",
  "invest:",
  "settings:price",
  "settings:storage",
  "settings:confirm",
  "settings:snapshot",
  "settings:stale",
  "set:storage:",
  "set:stale:",
] as const;

const investmentCommand =
  /^\/(portfolio|tambahplatform|tambahinvestasi)(?:@\w+)?(?:\s|$)/i;

const telegramUuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const telegramDebtPaymentAction = new RegExp(
  `^debt:pay:(${telegramUuid})$`,
  "i",
);

export const telegramDebtDetailAction = new RegExp(
  `^debt:(${telegramUuid})$`,
  "i",
);

export const telegramDebtInstallmentPaymentAction = new RegExp(
  `^debtpay:i:(${telegramUuid})$`,
  "i",
);

export const telegramDebtBankPaymentAction = new RegExp(
  `^debtpay:b:(${telegramUuid})$`,
  "i",
);

export const telegramDebtScheduleAction = new RegExp(
  `^debt:s:(${telegramUuid})$`,
  "i",
);

export const telegramDebtHistoryAction = new RegExp(
  `^debt:h:(${telegramUuid})$`,
  "i",
);

export type TelegramFeatureInput = Readonly<{
  callbackData?: string;
  messageText?: string;
}>;

export function requiredFeatureForTelegramInput(
  input: TelegramFeatureInput,
): FeatureKey | null {
  if (
    input.callbackData &&
    investmentCallbacks.some((value) => input.callbackData?.startsWith(value))
  ) {
    return Feature.INVESTMENTS;
  }
  if (input.messageText && investmentCommand.test(input.messageText.trim())) {
    return Feature.INVESTMENTS;
  }
  return null;
}

export function isTelegramInputBlocked(input: TelegramFeatureInput): boolean {
  const feature = requiredFeatureForTelegramInput(input);
  return feature !== null && !isFeatureActive(feature);
}

export function telegramComingSoonMessage(feature: FeatureKey): string {
  const definition = getFeature(feature);
  return `🔒 <b>${definition.label}</b> dinonaktifkan sementara.\n\n<b>Segera Hadir</b> — saat ini pengembangan difokuskan pada Utang &amp; Kredit beserta fitur pendukungnya.`;
}
