import { describe, expect, it } from 'vitest';
import {
  areSetExprEquivalent,
  isDisjoint,
  isSubset,
  parseSetExpression,
  truthTableSet,
} from './set-logic';

const eq = (a: string, b: string) => areSetExprEquivalent(parseSetExpression(a), parseSetExpression(b));

describe('Set parser/evaluator identities', () => {
  it('De Morgan for intersection and union', () => {
    expect(eq('(A ∩ B)^c', 'A^c ∪ B^c')).toBe(true);
    expect(eq('(A ∪ B)^c', 'A^c ∩ B^c')).toBe(true);
  });

  it('difference and symmetric difference equivalences', () => {
    expect(eq('A ∖ B', 'A ∩ B^c')).toBe(true);
    expect(eq('A Δ B', '(A ∖ B) ∪ (B ∖ A)')).toBe(true);
  });

  it('complements with Ω/∅', () => {
    expect(eq('A ∩ A^c', '∅')).toBe(true);
    expect(eq('A ∪ A^c', 'Ω')).toBe(true);
  });
});

describe('subset and disjointness', () => {
  it('subset checks', () => {
    expect(isSubset(parseSetExpression('A ∩ B'), parseSetExpression('A'))).toBe(true);
    expect(isSubset(parseSetExpression('A'), parseSetExpression('A ∪ B'))).toBe(true);
  });

  it('disjointness check', () => {
    expect(isDisjoint(parseSetExpression('A'), parseSetExpression('A^c'))).toBe(true);
    expect(isDisjoint(parseSetExpression('A'), parseSetExpression('B'))).toBe(false);
  });
});

describe('truthTableSet', () => {
  it('builds rows for used vars', () => {
    const rows = truthTableSet(parseSetExpression('A ∪ B'));
    expect(rows.length).toBe(4);
    expect(rows.filter((r) => r.value).length).toBe(3);
  });
});
