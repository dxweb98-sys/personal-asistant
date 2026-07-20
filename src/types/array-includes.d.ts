export {};

declare global {
  interface ReadonlyArray<T> {
    includes(
      searchElement: T | (T extends string ? string : never),
      fromIndex?: number,
    ): boolean;
  }
}
