import { friendlyTheme } from "./friendly.theme.js";
import { motivationalTheme } from "./motivational.theme.js";
import { professionalTheme } from "./professional.theme.js";
import {
  minimalTheme,
  calmTheme,
  playfulTheme,
  gamifiedTheme,
  financialCoachTheme,
} from "./extra.themes.js";
import { TelegramThemeDefinition, TelegramThemeKey } from "./theme.types.js";
export const telegramThemes: Record<TelegramThemeKey, TelegramThemeDefinition> =
  {
    FRIENDLY: friendlyTheme,
    MOTIVATIONAL: motivationalTheme,
    PROFESSIONAL: professionalTheme,
    MINIMAL: minimalTheme,
    CALM: calmTheme,
    PLAYFUL: playfulTheme,
    GAMIFIED: gamifiedTheme,
    FINANCIAL_COACH: financialCoachTheme,
  };
export const getTelegramTheme = (key?: string) =>
  telegramThemes[(key as TelegramThemeKey) ?? "FRIENDLY"] ?? friendlyTheme;
export const listTelegramThemes = () => Object.values(telegramThemes);
export * from "./theme.types.js";
