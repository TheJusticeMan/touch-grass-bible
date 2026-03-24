function isPlainObject(value: unknown): value is object {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge<T extends object>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults } as T;
  for (const key in saved) {
    const k = key as keyof T;
    if (isPlainObject(saved[k])) {
      if (isPlainObject(defaults[k])) {
        result[k] = deepMerge(defaults[k] as object, saved[k] as object) as T[keyof T];
      } else {
        result[k] = saved[k] as T[keyof T];
      }
    } else if (saved[k] !== undefined) {
      result[k] = saved[k] as T[keyof T];
    }
  }
  return result;
}
