import { describe, expect, it } from 'vitest';
import { generateFallacyRule, ruleBank } from './trig-fallacies';

describe('trig fallacies', () => {
  it('contains the classic rules with correct labels', () => {
    const lookup = Object.fromEntries(ruleBank.map((r) => [r.statement, r.label]));
    expect(lookup['sin(a+b)=sin a + sin b']).toBe('false');
    expect(lookup['tan(a+b)=tan a + tan b']).toBe('false');
    expect(lookup['cos^2 x = 1 − sin x']).toBe('false');
    expect(lookup['sin^2 x + cos^2 x = 1']).toBe('always');
    expect(lookup['cos(-x) = -cos x']).toBe('false');
    expect(lookup['tan(x+π) = tan x']).toBe('sometimes');
    expect(lookup['1 + tan^2 x = 1/cos^2 x']).toBe('sometimes');
    expect(lookup['√(sin^2 x) = sin x']).toBe('false');
    expect(lookup['sin^2 x = sin x']).toBe('sometimes');
    expect(lookup['sin(x+π) = sin x']).toBe('false');
  });

  it('is deterministic for the same seed and difficulty', () => {
    const a = generateFallacyRule(12345, 'medium');
    const b = generateFallacyRule(12345, 'medium');
    expect(a.rule.statement).toBe(b.rule.statement);
    expect(a.option).toBe(b.option);
    expect(a.feedback).toBe(b.feedback);
  });

  it('provides feedback/counterexamples for non-trivial cases', () => {
    const sample = generateFallacyRule(7, 'hard');
    expect(sample.feedback.length).toBeGreaterThan(10);
    if (sample.rule.label !== 'always') {
      expect(sample.feedback.toLowerCase()).not.toContain('nan');
    }
  });
});
