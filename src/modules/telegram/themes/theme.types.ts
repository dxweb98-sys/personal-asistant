export type TelegramThemeKey =
  | "FRIENDLY"
  | "MOTIVATIONAL"
  | "PROFESSIONAL"
  | "MINIMAL"
  | "CALM"
  | "PLAYFUL"
  | "GAMIFIED"
  | "FINANCIAL_COACH";

export interface TelegramThemeDefinition {
  key: TelegramThemeKey;
  name: string;
  emoji: string;
  description: string;
  homeTitle: string;
  greeting: (name: string) => string;
  labels: {
    expense: string;
    income: string;
    dashboard: string;
    portfolio: string;
    debt: string;
    accounts: string;
    settings: string;
    help: string;
  };
  motivation: string[];
}
