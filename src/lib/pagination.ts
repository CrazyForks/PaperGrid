export function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min ? Math.min(parsed, max) : fallback
}
export const pageNumber = (value: unknown) => boundedInteger(value, 1, 1, 10000)
export const pageSize = (value: unknown, fallback = 20) => boundedInteger(value, fallback, 1, 100)
