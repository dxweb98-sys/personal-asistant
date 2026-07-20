export const moneyToNumber = (value: { toString(): string } | number): number =>
  Number(value.toString());
export const roundMoney = (value: number): number =>
  Math.round(value * 100) / 100;
