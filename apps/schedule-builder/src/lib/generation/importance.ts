/**
 * Relative weight of a rule's `score` contribution to a schedule's overall
 * score. Multiplies the rule's own `score()` return value when the engine
 * combines every active scoring rule into one weight-normalised average —
 * see `engine.ts`.
 */
export const IMPORTANCE = { minor: 0.5, normal: 1, major: 2 } as const;

export type Importance = keyof typeof IMPORTANCE;
