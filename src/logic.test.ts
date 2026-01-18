import { describe, expect, it } from 'vitest';
import {
  astToString,
  containsImplication,
  eliminateImplications,
  negateWithDeMorgan,
  normalizeWithCursor,
  parseFormula,
  truthTableEquality,
} from './logic';

describe('normalizeWithCursor', () => {
  it('replaces ascii shortcuts and keeps cursor', () => {
    const result = normalizeWithCursor('A -> B', 4);
    expect(result.value).toBe('A ⇒ B');
    expect(result.cursor).toBe(3);
  });
});

describe('eliminateImplications', () => {
  it('removes ⇒ and ⇔ while keeping equivalence', () => {
    const base = parseFormula('(A ⇒ B) ⇔ C');
    const simplified = eliminateImplications(base);
    expect(containsImplication(simplified)).toBe(false);
    const { equal } = truthTableEquality(base, simplified);
    expect(equal).toBe(true);
  });
});

describe('negateWithDeMorgan', () => {
  it('pushes negations to atoms', () => {
    const base = parseFormula('A ∨ (B ∧ C)');
    const negated = negateWithDeMorgan(base);
    const text = astToString(negated);
    expect(text.includes('⇒')).toBe(false);
    const { equal } = truthTableEquality(parseFormula('¬A ∧ (¬B ∨ ¬C)'), negated);
    expect(equal).toBe(true);
  });
});
