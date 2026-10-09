export const DELEGATION_BUDGETS = {
  simple: { minWorkers: 1, maxWorkers: 2 },
  structured: { minWorkers: 2, maxWorkers: 5 },
  complex: { minWorkers: 1, maxWorkers: 16 },
  hardCeiling: 16,
} as const;
