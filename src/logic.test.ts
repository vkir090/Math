import { describe, expect, it } from 'vitest';
import {
  astToString,
  areEquivalent,
  containsImplication,
  containsIff,
  eliminateImplications,
  eliminateIffOnly,
  negateWithDeMorgan,
  normalizeWithCursor,
  evaluateFormula,
  parseFormula,
  truthTable,
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

describe('eliminateIffOnly', () => {
  it('removes ⇔ but lässt ⇒ bestehen', () => {
    const base = parseFormula('A ⇔ (B ⇒ C)');
    const simplified = eliminateIffOnly(base);
    expect(containsIff(simplified)).toBe(false);
    // Implikationen bleiben erhalten
    expect(containsImplication(simplified)).toBe(true);
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

describe('parser and evaluator', () => {
  it('respects operator precedence', () => {
    const ast = parseFormula('A ∧ B ∨ C ⇒ D ⇔ E');
    if (ast.type !== 'iff') {
      throw new Error('Top level should be ⇔');
    }
    expect(ast.right.type).toBe('var');
    const implication = ast.left;
    if (implication.type !== 'imp') {
      throw new Error('Expected ⇒ at second level');
    }
    expect(implication.right.type).toBe('var');
    const disjunction = implication.left;
    if (disjunction.type !== 'or') {
      throw new Error('Expected ∨ binding below ⇒');
    }
    expect(disjunction.right.type).toBe('var');
    const conjunction = disjunction.left;
    expect(conjunction.type).toBe('and');
  });

  it('evaluates with given assignment', () => {
    const ast = parseFormula('A ⇒ (B ∨ ¬C)');
    const value = evaluateFormula(ast, { A: true, B: false, C: true });
    expect(value).toBe(false);
    const value2 = evaluateFormula(ast, { A: false, B: false, C: true });
    expect(value2).toBe(true);
  });
});

describe('truth tables and equivalence', () => {
  it('builds truth table with detected variables', () => {
    const table = truthTable('B ∨ A');
    expect(table.variables).toEqual(['A', 'B']);
    expect(table.rows).toHaveLength(4);
    const allResults = table.rows.map((row) => row.result);
    expect(allResults.filter(Boolean)).toHaveLength(3);
  });

  it('detects equivalence via truth tables', () => {
    expect(areEquivalent('A ⇒ B', '¬A ∨ B')).toBe(true);
    expect(areEquivalent('A ∧ B', 'A ∨ B')).toBe(false);
  });
});
