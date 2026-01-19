export type Rational = { n: number; d: number };

export type Angle =
  | { kind: 'deg'; value: number }
  | { kind: 'rad'; p: number; q: number }; // p/q * π

export type ExactValue =
  | { kind: 'zero' }
  | { kind: 'one'; sign: 1 | -1 }
  | { kind: 'half'; sign: 1 | -1 }
  | { kind: 'sqrt'; n: 2 | 3; sign: 1 | -1; overTwo: boolean }
  | { kind: 'rational'; r: Rational }
  | { kind: 'undef' };

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

const normRational = (r: Rational): Rational => {
  if (r.d === 0) throw new Error('Denominator 0');
  const sign = r.d < 0 ? -1 : 1;
  const n = r.n * sign;
  const d = Math.abs(r.d);
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};

export const parseAngle = (input: string): Angle | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('°')) {
    const val = Number(trimmed.replace('°', ''));
    if (!Number.isFinite(val)) return null;
    return { kind: 'deg', value: val };
  }
  if (trimmed === 'π') return { kind: 'rad', p: 1, q: 1 };
  const piParts = trimmed.split('π');
  if (piParts.length === 2) {
    const left = piParts[0];
    const right = piParts[1];
    let factor = 1;
    if (left && left !== '+') factor = Number(left);
    if (Number.isNaN(factor)) return null;
    let q = 1;
    if (right.startsWith('/')) {
      q = Number(right.slice(1));
    }
    if (!Number.isFinite(q) || q === 0) return null;
    const frac = normRational({ n: factor, d: q });
    return { kind: 'rad', p: frac.n, q: frac.d };
  }
  const num = Number(trimmed);
  if (Number.isFinite(num)) return { kind: 'rad', p: num, q: 1 };
  return null;
};

export const normalizeAngle = (ang: Angle): Angle => {
  if (ang.kind === 'deg') {
    let val = ang.value % 360;
    if (val < 0) val += 360;
    return { kind: 'deg', value: val };
  }
  const twoPi = 2;
  const frac = normRational({ n: ang.p, d: ang.q });
  let n = frac.n % (frac.d * twoPi);
  if (n < 0) n += frac.d * twoPi;
  return { kind: 'rad', p: n, q: frac.d };
};

const isSpecialMultiple = (p: number, q: number): { base: number; m: number } | null => {
  const specials = [1 / 6, 1 / 4, 1 / 3, 1 / 2, 1];
  const value = p / q;
  for (const s of specials) {
    const ratio = value / s;
    if (Math.abs(ratio - Math.round(ratio)) < 1e-9) {
      return { base: s, m: Math.round(ratio) };
    }
  }
  return null;
};

const valueForSpecial = (baseVal: number, sign: 1 | -1): ExactValue => {
  if (Math.abs(baseVal) < 1e-9) return { kind: 'zero' };
  if (Math.abs(baseVal - 1) < 1e-9) return { kind: 'one', sign };
  if (Math.abs(baseVal - 0.5) < 1e-9) return { kind: 'half', sign };
  if (Math.abs(baseVal - Math.SQRT1_2) < 1e-9) return { kind: 'sqrt', n: 2, sign, overTwo: true };
  if (Math.abs(baseVal - Math.sqrt(3) / 2) < 1e-9) return { kind: 'sqrt', n: 3, sign, overTwo: true };
  if (Math.abs(baseVal - Math.sqrt(3) / 3) < 1e-9) return { kind: 'sqrt', n: 3, sign, overTwo: false };
  return { kind: 'rational', r: normRational({ n: sign * baseVal, d: 1 }) };
};

const exactSinCos = (ang: Angle): { sin: ExactValue; cos: ExactValue } | null => {
  const rad = ang.kind === 'rad' ? ang : { kind: 'rad', p: ang.value, q: 180 };
  const norm = normalizeAngle(rad) as Extract<Angle, { kind: 'rad' }>;
  const spec = isSpecialMultiple(norm.p, norm.q);
  if (!spec) return null;
  const { base, m } = spec;
  const stepsPerTurn = Math.round(2 / base);
  const modStep = ((m % stepsPerTurn) + stepsPerTurn) % stepsPerTurn;
  const angle = modStep * base * Math.PI; // for quadrant checks

  const quadrant = Math.floor((angle + 1e-12) / (Math.PI / 2)) % 4;
  const sinSign = quadrant === 2 || quadrant === 3 ? -1 : 1;
  const cosSign = quadrant === 1 || quadrant === 2 ? -1 : 1;

  const baseAngle = modStep * base * Math.PI;
  const baseSin = Math.sin(baseAngle);
  const baseCos = Math.cos(baseAngle);
  const sinVal = valueForSpecial(Math.abs(baseSin), sinSign as 1 | -1);
  const cosVal = valueForSpecial(Math.abs(baseCos), cosSign as 1 | -1);
  // exact overrides for cardinal angles
  if (base === 1 && modStep % 2 === 0) {
    return {
      sin: { kind: 'zero' },
      cos: { kind: 'one', sign: modStep % 4 === 0 ? 1 : -1 },
    };
  }
  if (base === 1 / 2 && (modStep === 1 || modStep === 3)) {
    return {
      sin: { kind: 'one', sign: modStep === 1 ? 1 : -1 },
      cos: { kind: 'zero' },
    };
  }
  return { sin: sinVal, cos: cosVal };
};

export const tanFromExact = (sin: ExactValue, cos: ExactValue): ExactValue => {
  if (cos.kind === 'zero') return { kind: 'undef' };
  if (sin.kind === 'zero') return { kind: 'zero' };
  if (sin.kind === 'half' && cos.kind === 'half') return { kind: 'one', sign: (sin.sign ?? 1) as 1 | -1 };
  if (sin.kind === 'sqrt' && cos.kind === 'half' && sin.overTwo) {
    return { kind: 'sqrt', n: sin.n, sign: sin.sign, overTwo: false };
  }
  if (sin.kind === 'half' && cos.kind === 'sqrt' && cos.overTwo) {
    return { kind: 'sqrt', n: cos.n, sign: sin.sign === 1 ? 1 : -1, overTwo: false };
  }
  return { kind: 'undef' };
};

export const formatExact = (val: ExactValue): string => {
  switch (val.kind) {
    case 'zero':
      return '0';
    case 'one':
      return val.sign === -1 ? '-1' : '1';
    case 'half':
      return val.sign === -1 ? '-1/2' : '1/2';
    case 'sqrt':
      if (val.overTwo) return `${val.sign === -1 ? '-' : ''}sqrt(${val.n})/2`;
      return `${val.sign === -1 ? '-' : ''}sqrt(${val.n})`;
    case 'rational': {
      const r = normRational(val.r);
      if (r.d === 1) return `${r.n}`;
      return `${r.n}/${r.d}`;
    }
    case 'undef':
      return 'undef';
    default:
      return '';
  }
};

export const parseExactValue = (input: string): ExactValue | null => {
  const t = input.trim().replace(/\s+/g, '');
  if (!t) return null;
  if (t === '0') return { kind: 'zero' };
  if (t === '1') return { kind: 'one', sign: 1 };
  if (t === '-1') return { kind: 'one', sign: -1 };
  if (t === '1/2') return { kind: 'half', sign: 1 };
  if (t === '-1/2') return { kind: 'half', sign: -1 };
  if (t === 'undef') return { kind: 'undef' };
  const sqrtMatch = t.match(/^(-?)sqrt\((\d+)\)(\/2)?$/i);
  if (sqrtMatch) {
    const sign = sqrtMatch[1] === '-' ? -1 : 1;
    const n = Number(sqrtMatch[2]) as 2 | 3;
    const overTwo = Boolean(sqrtMatch[3]);
    if (n !== 2 && n !== 3) return null;
    return { kind: 'sqrt', n, sign: sign as 1 | -1, overTwo };
  }
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    const n = Number(a);
    const d = Number(b);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return { kind: 'rational', r: normRational({ n, d }) };
  }
  const num = Number(t);
  if (!Number.isNaN(num)) return { kind: 'rational', r: normRational({ n: num, d: 1 }) };
  return null;
};

export const sinCosTanExact = (ang: Angle): { sin: ExactValue; cos: ExactValue; tan: ExactValue } => {
  const special = exactSinCos(ang);
  if (special) {
    const tan = tanFromExact(special.sin, special.cos);
    return { ...special, tan };
  }
  // Fallback approximate
  const radVal = ang.kind === 'rad' ? (ang.p / ang.q) * Math.PI : (ang.value * Math.PI) / 180;
  const s = Math.sin(radVal);
  const c = Math.cos(radVal);
  const t = Math.tan(radVal);
  const approx = (v: number): ExactValue => ({ kind: 'rational', r: { n: v, d: 1 } });
  const tanVal = Math.abs(c) < 1e-9 ? ({ kind: 'undef' } as ExactValue) : approx(t);
  return { sin: approx(s), cos: approx(c), tan: tanVal };
};
