import { describe, expect, it } from 'vitest';
import { parseAngle, normalizeAngle, sinCosTanExact, parseExactValue, formatExact } from './trig-core';

describe('angle parsing', () => {
  it('parses degrees', () => {
    const a = parseAngle('30°');
    expect(a).toEqual({ kind: 'deg', value: 30 });
  });
  it('parses pi fractions', () => {
    const a = parseAngle('π/6');
    expect(a).toEqual({ kind: 'rad', p: 1, q: 6 });
  });
  it('normalizes to 0..360', () => {
    const a = normalizeAngle({ kind: 'deg', value: -30 });
    expect(a).toEqual({ kind: 'deg', value: 330 });
  });
});

describe('exact trig values', () => {
  it('sin pi/6', () => {
    const ang = parseAngle('π/6');
    const val = sinCosTanExact(ang!);
    expect(formatExact(val.sin)).toBe('1/2');
  });
  it('cos pi/3', () => {
    const ang = parseAngle('π/3');
    const val = sinCosTanExact(ang!);
    expect(formatExact(val.cos)).toBe('1/2');
  });
  it('sin 3pi/4', () => {
    const ang = parseAngle('3π/4');
    const val = sinCosTanExact(ang!);
    expect(formatExact(val.sin)).toBe('sqrt(2)/2');
    expect(formatExact(val.cos)).toBe('-sqrt(2)/2');
  });
  it('tan pi/2 is undef', () => {
    const ang = parseAngle('π/2');
    const val = sinCosTanExact(ang!);
    expect(val.tan.kind).toBe('undef');
  });
});

describe('parse exact values', () => {
  it('parses sqrt forms', () => {
    expect(parseExactValue('sqrt(3)/2')).toEqual({ kind: 'sqrt', n: 3, sign: 1, overTwo: true });
    expect(parseExactValue('-sqrt(2)/2')).toEqual({ kind: 'sqrt', n: 2, sign: -1, overTwo: true });
  });
});
