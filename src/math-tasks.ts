export type MathMode = 'mathCalc' | 'mathPowers' | 'mathRoots' | 'mathBinom' | 'mathQuad' | 'mathLogs' | 'mathSums';
export type Difficulty = 'easy' | 'medium' | 'hard';

type Rational = { n: number; d: number };

export type MathTask = {
  mode: MathMode;
  difficulty: Difficulty;
  prompt: string;
  solution: string;
  payload:
    | { kind: 'rational'; value: Rational }
    | { kind: 'numeric'; value: number; tolerance?: number }
    | { kind: 'expression'; expr: string; vars: string[]; positiveOnly?: boolean }
    | { kind: 'monomial'; value: Monomial; disallowNegative?: boolean }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'polynomial'; coeffs: Record<number, number> }
    | { kind: 'text'; accepts: string[] };
  targetSeconds: number;
  seed: number;
  nextSeed: number;
  explanation?: string;
};

export type CheckResult = { correct: boolean; feedback: string; normalizedInput?: string };

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

const normalizeRational = (value: Rational): Rational => {
  if (value.d === 0) throw new Error('Nenner darf nicht 0 sein.');
  const sign = value.d < 0 ? -1 : 1;
  const n = value.n * sign;
  const d = Math.abs(value.d);
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};

const rationalToString = (r: Rational): string => {
  const val = normalizeRational(r);
  if (val.d === 1) return `${val.n}`;
  return `${val.n}/${val.d}`;
};

const parseRational = (input: string): Rational | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const mixedMatch = trimmed.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (!Number.isFinite(whole) || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    const sign = whole < 0 ? -1 : 1;
    const improper = normalizeRational({ n: sign * (Math.abs(whole) * den + num), d: den });
    return improper;
  }
  if (trimmed.includes('/')) {
    const [a, b] = trimmed.split('/').map((part) => part.trim());
    const n = Number(a);
    const d = Number(b);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return normalizeRational({ n, d });
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return normalizeRational({ n: num, d: 1 });
};

type RNG = {
  int: (min: number, max: number) => number;
  choice: <T>(list: T[]) => T;
  nextSeed: number;
};

const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_M = 2 ** 32;

const createRng = (seed: number): RNG => {
  let state = seed >>> 0;
  const next = () => {
    state = (LCG_A * state + LCG_C) % LCG_M;
    return state;
  };
  const rand = () => next() / LCG_M;
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const choice = <T,>(list: T[]): T => list[int(0, list.length - 1)];
  return {
    int,
    choice,
    get nextSeed() {
      return state;
    },
  };
};

type Token =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'op'; op: string }
  | { type: 'lparen' | 'rparen' }
  | { type: 'func'; name: string }
  | { type: 'comma' };

type ExprNode =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: '+' | '-'; arg: ExprNode }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: ExprNode; right: ExprNode }
  | { type: 'func'; name: string; args: ExprNode[] };

const tokenize = (raw: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let numStr = char;
      i += 1;
      while (i < raw.length && /[0-9.]/.test(raw[i])) {
        numStr += raw[i];
        i += 1;
      }
      tokens.push({ type: 'num', value: Number(numStr) });
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      let ident = char;
      i += 1;
      while (i < raw.length && /[a-zA-Z0-9]/.test(raw[i])) {
        ident += raw[i];
        i += 1;
      }
      const lower = ident.toLowerCase();
      if (lower === 'sqrt' || lower === 'abs' || lower === 'ln' || lower === 'log' || lower === 'exp') {
        tokens.push({ type: 'func', name: lower });
      } else {
        tokens.push({ type: 'var', name: ident });
      }
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if ('+-*/^'.includes(char)) {
      tokens.push({ type: 'op', op: char });
      i += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    throw new Error(`Unbekanntes Symbol "${char}"`);
  }
  return tokens;
};

class ExprParser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): ExprNode {
    const expr = this.parseAddSub();
    if (this.index < this.tokens.length) {
      throw new Error('Eingabe konnte nicht vollständig gelesen werden.');
    }
    return expr;
  }

  private current(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token | undefined {
    const t = this.tokens[this.index];
    this.index += 1;
    return t;
  }

  private parseAddSub(): ExprNode {
    let node = this.parseMulDiv();
    while (true) {
      const tok = this.current();
      if (tok && tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
        this.consume();
        const right = this.parseMulDiv();
        node = { type: 'bin', op: tok.op, left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  private parseMulDiv(): ExprNode {
    let node = this.parsePower();
    while (true) {
      const tok = this.current();
      if (tok && tok.type === 'op' && (tok.op === '*' || tok.op === '/')) {
        this.consume();
        const right = this.parsePower();
        node = { type: 'bin', op: tok.op, left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  private parsePower(): ExprNode {
    let node = this.parseUnary();
    while (true) {
      const tok = this.current();
      if (tok && tok.type === 'op' && tok.op === '^') {
        this.consume();
        const right = this.parseUnary();
        node = { type: 'bin', op: '^', left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  private parseUnary(): ExprNode {
    const tok = this.current();
    if (tok && tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
      this.consume();
      const arg = this.parseUnary();
      return { type: 'unary', op: tok.op, arg };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    const tok = this.consume();
    if (!tok) throw new Error('Unerwartetes Ende.');
    if (tok.type === 'num') return { type: 'num', value: tok.value };
    if (tok.type === 'var') return { type: 'var', name: tok.name };
    if (tok.type === 'lparen') {
      const expr = this.parseAddSub();
      const next = this.consume();
      if (!next || next.type !== 'rparen') throw new Error('Schließende Klammer fehlt.');
      return expr;
    }
    if (tok.type === 'func') {
      const next = this.consume();
      if (!next || next.type !== 'lparen') throw new Error(`Klammer nach ${tok.name} fehlt`);
      const args: ExprNode[] = [];
      args.push(this.parseAddSub());
      while (this.current()?.type === 'comma') {
        this.consume();
        args.push(this.parseAddSub());
      }
      const end = this.consume();
      if (!end || end.type !== 'rparen') throw new Error('Klammer schließen.');
      return { type: 'func', name: tok.name, args };
    }
    throw new Error('Unerwartetes Token');
  }
}

const parseExpr = (input: string): ExprNode => {
  const tokens = tokenize(input);
  return new ExprParser(tokens).parse();
};

const evalExpr = (node: ExprNode, env: Record<string, number>): number => {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      return env[node.name] ?? 0;
    case 'unary': {
      const v = evalExpr(node.arg, env);
      return node.op === '-' ? -v : v;
    }
    case 'bin': {
      const l = evalExpr(node.left, env);
      const r = evalExpr(node.right, env);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? NaN : l / r;
        case '^':
          return Number.isFinite(l) && Number.isFinite(r) ? l ** r : NaN;
        default:
          return NaN;
      }
    }
    case 'func': {
      const args = node.args.map((a) => evalExpr(a, env));
      switch (node.name) {
        case 'sqrt':
          return args[0] < 0 ? NaN : Math.sqrt(args[0]);
        case 'abs':
          return Math.abs(args[0]);
        case 'ln':
        case 'log':
          return args[0] <= 0 ? NaN : Math.log(args[0]);
        case 'exp':
          return Math.exp(args[0]);
        default:
          return NaN;
      }
    }
    default:
      return NaN;
  }
};

const expressionsEqual = (expected: string, input: string, vars: string[], positiveOnly?: boolean): boolean => {
  let expAst: ExprNode;
  let userAst: ExprNode;
  try {
    expAst = parseExpr(expected);
    userAst = parseExpr(input);
  } catch {
    return false;
  }
  const rng = createRng(123456789);
  const sampleValues = () => {
    const env: Record<string, number> = {};
    vars.forEach((v) => {
      const val = positiveOnly ? rng.int(1, 5) + rng.int(0, 3) : rng.int(-3, 5);
      env[v] = val === 0 && !positiveOnly ? 2 : val;
    });
    return env;
  };
  for (let i = 0; i < 6; i += 1) {
    const env = sampleValues();
    const left = evalExpr(expAst, env);
    const right = evalExpr(userAst, env);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (Math.abs(left - right) > 1e-6) return false;
  }
  return true;
};

const mathTargets: Record<MathMode, Record<Difficulty, number>> = {
  mathCalc: { easy: 45, medium: 55, hard: 65 },
  mathPowers: { easy: 55, medium: 65, hard: 75 },
  mathRoots: { easy: 55, medium: 65, hard: 75 },
  mathBinom: { easy: 65, medium: 75, hard: 85 },
  mathQuad: { easy: 80, medium: 90, hard: 100 },
  mathLogs: { easy: 60, medium: 70, hard: 80 },
  mathSums: { easy: 70, medium: 85, hard: 95 },
};

const randomSeed = () => Math.floor(Math.random() * (2 ** 31));

type Monomial = { coeff: number; exps: Record<string, number> };

const monomialFromString = (raw: string): Monomial | null => {
  const cleaned = raw.replace(/\s+/g, '');
  if (!cleaned) return null;
  let coeff = 1;
  const exps: Record<string, number> = {};

  const applyFactor = (token: string, sign: number) => {
    const numVal = Number(token);
    if (!Number.isNaN(numVal)) {
      coeff *= sign > 0 ? numVal : 1 / numVal;
      return true;
    }
    const match = token.match(/^([a-zA-Z]+)(\^(-?\d+))?$/);
    if (!match) return false;
    const base = match[1];
    const exp = match[3] ? parseInt(match[3], 10) : 1;
    const key = base.toLowerCase();
    exps[key] = (exps[key] ?? 0) + sign * exp;
    return true;
  };

  let current = '';
  let inDen = false;
  const flush = () => {
    if (!current) return true;
    if (current === '-') {
      coeff *= -1;
      current = '';
      return true;
    }
    const ok = applyFactor(current, inDen ? -1 : 1);
    current = '';
    return ok;
  };

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (ch === '*') {
      if (!flush()) return null;
    } else if (ch === '/') {
      if (!flush()) return null;
      inDen = true;
    } else if (ch === '(' || ch === ')') {
      continue;
    } else if (ch === '-' && (i === 0 || cleaned[i - 1] === '(' || cleaned[i - 1] === '/')) {
      coeff *= -1;
    } else {
      current += ch;
    }
  }
  if (!flush()) return null;

  if (Object.keys(exps).length === 0) {
    exps['1'] = 0;
  }
  return { coeff, exps };
};

const monomialsEqual = (a: Monomial, b: Monomial) => {
  if (Math.sign(a.coeff) !== Math.sign(b.coeff) || (a.coeff === 0) !== (b.coeff === 0)) return false;
  if (Math.abs(a.coeff - b.coeff) > 1e-9) return false;
  const keys = new Set([...Object.keys(a.exps), ...Object.keys(b.exps)]);
  for (const k of keys) {
    if ((a.exps[k] ?? 0) !== (b.exps[k] ?? 0)) return false;
  }
  return true;
};

const monomialToString = (m: Monomial): string => {
  const vars = Object.keys(m.exps).filter((k) => k).sort();
  const parts: string[] = [];
  vars.forEach((v) => {
    const e = m.exps[v];
    if (e === 0) return;
    parts.push(e === 1 ? v : `${v}^${e}`);
  });
  const coeffMag = Math.abs(m.coeff);
  const coeffPart = coeffMag !== 1 ? coeffMag.toString() : '';
  const sign = m.coeff < 0 ? '-' : '';
  const body = [coeffPart, ...parts].filter(Boolean).join('·') || '1';
  return sign + body;
};

type SqrtForm = { k: number; m: number };

type Polynomial = Record<number, number>; // exponent -> coeff

const parsePolynomial = (input: string): Polynomial | null => {
  const cleaned = input.replace(/\s+/g, '');
  if (!cleaned) return null;
  let expr = cleaned.replace(/-/g, '+-');
  if (expr.startsWith('+-')) expr = expr.slice(1);
  const parts = expr.split('+').filter(Boolean);
  const coeffs: Polynomial = {};
  for (const part of parts) {
    const match = part.match(/^(-?\d*\.?\d*)?(x)?(\^(-?\d+))?$/i);
    if (!match) return null;
    const hasX = Boolean(match[2]);
    const exp = hasX ? (match[4] ? parseInt(match[4], 10) : 1) : 0;
    let coeffStr = match[1];
    if (coeffStr === '' || coeffStr === undefined) coeffStr = hasX ? '1' : '0';
    if (coeffStr === '-') coeffStr = '-1';
    const coeff = Number(coeffStr);
    if (!Number.isFinite(coeff)) return null;
    coeffs[exp] = (coeffs[exp] ?? 0) + coeff;
  }
  return coeffs;
};

const polynomialsEqual = (a: Polynomial, b: Polynomial): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ea = a[Number(k)] ?? 0;
    const eb = b[Number(k)] ?? 0;
    if (Math.abs(ea - eb) > 1e-9) return false;
  }
  return true;
};

const polynomialToString = (p: Polynomial): string => {
  const exps = Object.keys(p)
    .map(Number)
    .filter((e) => Math.abs(p[e]) > 1e-9)
    .sort((a, b) => b - a);
  if (exps.length === 0) return '0';
  const parts = exps.map((e) => {
    const c = p[e];
    const sign = c < 0 ? '-' : '+';
    const abs = Math.abs(c);
    const coeffPart = e === 0 ? `${abs}` : abs === 1 ? '' : `${abs}`;
    const varPart = e === 0 ? '' : e === 1 ? 'x' : `x^${e}`;
    return `${sign}${coeffPart}${varPart}`;
  });
  let str = parts.join('');
  if (str.startsWith('+')) str = str.slice(1);
  return str;
};

const simplifySqrt = (value: number): SqrtForm => {
  let m = value;
  let k = 1;
  let d = 2;
  while (d * d <= m) {
    while (m % (d * d) === 0) {
      m /= d * d;
      k *= d;
    }
    d += 1;
  }
  return { k, m };
};

const parseSqrtForm = (input: string): SqrtForm | null => {
  const cleaned = input.trim().replace(/\s+/g, '');
  if (!cleaned) return null;
  const match = cleaned.match(/^(-?\d+)?\*?sqrt\((\d+)\)$/i) || cleaned.match(/^(-?\d+)?sqrt\((\d+)\)$/i);
  if (match) {
    const k = match[1] ? Number(match[1]) : 1;
    const m = Number(match[2]);
    if (!Number.isInteger(k) || !Number.isInteger(m)) return null;
    const simp = simplifySqrt(Math.abs(k) * Math.abs(k) * m);
    return { k: k < 0 ? -simp.k : simp.k, m: simp.m };
  }
  const plain = Number(cleaned);
  if (Number.isInteger(plain)) return { k: plain, m: 1 };
  return null;
};

const rationalOps = {
  add: (a: Rational, b: Rational): Rational => normalizeRational({ n: a.n * b.d + b.n * a.d, d: a.d * b.d }),
  sub: (a: Rational, b: Rational): Rational => normalizeRational({ n: a.n * b.d - b.n * a.d, d: a.d * b.d }),
  mul: (a: Rational, b: Rational): Rational => normalizeRational({ n: a.n * b.n, d: a.d * b.d }),
  div: (a: Rational, b: Rational): Rational => {
    if (b.n === 0) throw new Error('Division durch 0');
    return normalizeRational({ n: a.n * b.d, d: a.d * b.n });
  },
};

const buildCalcTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const intRange = difficulty === 'easy' ? 9 : difficulty === 'medium' ? 15 : 20;
  const fracDenMax = difficulty === 'easy' ? 9 : difficulty === 'medium' ? 10 : 12;
  const allowNeg = difficulty !== 'easy';
  const chooseInt = () => {
    const n = rng.int(1, intRange) * (allowNeg && rng.choice([true, false]) ? -1 : 1);
    return normalizeRational({ n, d: 1 });
  };
  const chooseFrac = () => {
    const den = rng.int(2, fracDenMax);
    const num = rng.int(1, intRange) * (allowNeg && rng.choice([true, false]) ? -1 : 1);
    return normalizeRational({ n: num, d: den });
  };

  const types = ['int-op', 'frac-op', 'simplify'];
  if (difficulty === 'hard') types.push('mixed');
  const picked = rng.choice(types);

  if (picked === 'simplify') {
    const den = rng.int(2, fracDenMax);
    const factor = rng.int(2, 6);
    const baseNum = rng.int(1, intRange);
    const num = baseNum * factor * (allowNeg && rng.choice([true, false]) ? -1 : 1);
    const raw = { n: num, d: den * factor };
    const simplified = normalizeRational(raw);
    const divHint = `Kürze durch ${factor}`;
    return {
      difficulty,
      prompt: `Vereinfache: ${raw.n}/${raw.d}`,
      solution: rationalToString(simplified),
      payload: { kind: 'rational', value: simplified },
      targetSeconds: mathTargets.mathCalc[difficulty],
      explanation: divHint,
    };
  }

  if (picked === 'mixed') {
    const den = rng.int(2, fracDenMax);
    const whole = rng.int(1, intRange);
    const rest = rng.int(1, den - 1);
    const sign = allowNeg && rng.choice([true, false]) ? -1 : 1;
    const improper = normalizeRational({ n: sign * (whole * den + rest), d: den });
    const prompt = `Schreibe als gemischte Zahl (oder gekürzten Bruch): ${improper.n}/${improper.d}`;
    return {
      difficulty,
      prompt,
      solution: rationalToString(improper),
      payload: { kind: 'rational', value: improper },
      targetSeconds: mathTargets.mathCalc[difficulty],
      explanation: 'Gemischt oder gekürzt als Bruch wird akzeptiert.',
    };
  }

  const useFrac = picked === 'frac-op';
  const a = useFrac ? chooseFrac() : chooseInt();
  const b = useFrac ? chooseFrac() : chooseInt();
  const ops = ['+', '-', '*', '/'];
  let op = rng.choice(ops);
  if (difficulty === 'easy') {
    op = rng.choice(['+', '-', '*']);
  }

  // ensure division clean for easy/medium integers
  let left = a;
  let right = b;
  if (op === '/' && !useFrac && difficulty !== 'hard') {
    const divisor = rng.int(1, intRange);
    const quotient = rng.int(1, intRange);
    const sign = allowNeg && rng.choice([true, false]) ? -1 : 1;
    left = normalizeRational({ n: quotient * divisor * sign, d: 1 });
    right = normalizeRational({ n: divisor, d: 1 });
  }
  if (op === '/' && right.n === 0) {
    right = { n: 1, d: 1 };
  }

  let result: Rational;
  switch (op) {
    case '+':
      result = rationalOps.add(left, right);
      break;
    case '-':
      result = rationalOps.sub(left, right);
      break;
    case '*':
      result = rationalOps.mul(left, right);
      break;
    case '/':
      result = rationalOps.div(left, right);
      break;
    default:
      result = { n: 0, d: 1 };
  }

  const promptLeft = rationalToString(left);
  const promptRight = rationalToString(right);
  const prompt = `Berechne: ${promptLeft} ${op} ${promptRight}`;
  const solutionStr = rationalToString(result);
  const hint = op === '/' ? 'Teilen heißt mit Kehrwert multiplizieren.' : undefined;
  return {
    difficulty,
    prompt,
    solution: solutionStr,
    payload: { kind: 'rational', value: result },
    targetSeconds: mathTargets.mathCalc[difficulty],
    explanation: hint,
  };
};

const buildPowersTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const maxExp = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const bases = ['a', 'b', 'x', 'y'];
  const pickExp = () => rng.int(1, maxExp);
  const pickBase = () => rng.choice(bases);

  const kinds = ['mul', 'div', 'pow', 'prodPow', 'zeroNeg', 'noNeg', 'tf'];
  const kind = rng.choice(kinds);

  if (kind === 'tf') {
    const claims = [
      { text: '(a+b)^2 = a^2 + b^2', value: false },
      { text: '√(a+b) = √a + √b', value: false },
      { text: '(a/b)^n = a^n / b^n (b≠0)', value: true },
      { text: 'a^0 = 1 (a≠0)', value: true },
    ];
    const claim = rng.choice(claims);
    return {
      difficulty,
      prompt: `Behauptung: ${claim.text}. Wahr oder falsch?`,
      solution: claim.value ? 'wahr' : 'falsch',
      payload: { kind: 'boolean', value: claim.value },
      targetSeconds: mathTargets.mathPowers[difficulty],
    };
  }

  if (kind === 'noNeg') {
    const base = pickBase();
    const exp = pickExp();
    const other = pickBase();
    const promptExpr = `${base}^-${exp}·${other}^${pickExp()}`;
    const monomial: Monomial = { coeff: 1, exps: { [base]: -exp, [other]: pickExp() } };
    const solution = `${other}^${monomial.exps[other]} / ${base}^${exp}`;
    return {
      difficulty,
      prompt: `Schreibe ohne negative Exponenten: ${promptExpr}`,
      solution,
      payload: { kind: 'monomial', value: monomial, disallowNegative: true },
      targetSeconds: mathTargets.mathPowers[difficulty],
      explanation: 'Negative Exponenten nach unten bringen.',
    };
  }

  if (kind === 'zeroNeg') {
    const base = pickBase();
    const makeNeg = rng.choice([true, false]);
    const exp = makeNeg ? -pickExp() : 0;
    const monomial: Monomial = { coeff: 1, exps: { [base]: exp } };
    const prompt = exp === 0 ? `${base}^0` : `${base}^${exp}`;
    const solution = exp === 0 ? '1' : `1/${base}^${Math.abs(exp)}`;
    monomial.exps[base] = exp;
    return {
      difficulty,
      prompt: `Vereinfache: ${prompt}`,
      solution,
      payload: { kind: 'monomial', value: monomial },
      targetSeconds: mathTargets.mathPowers[difficulty],
    };
  }

  if (kind === 'prodPow') {
    const exp = pickExp();
    const left = pickBase();
    const right = pickBase();
    const isDiv = rng.choice([true, false]);
    const prompt = isDiv ? `( ${left} / ${right} )^${exp}` : `( ${left}${right} )^${exp}`;
    const monomial: Monomial = { coeff: 1, exps: {} };
    monomial.exps[left] = exp;
    monomial.exps[right] = isDiv ? -exp : exp;
    const solution = monomialToString(monomial);
    return {
      difficulty,
      prompt: `Vereinfache: ${prompt}`,
      solution,
      payload: { kind: 'monomial', value: monomial },
      targetSeconds: mathTargets.mathPowers[difficulty],
    };
  }

  const base = pickBase();
  const m = pickExp();
  const n = pickExp();
  if (kind === 'mul') {
    const monomial: Monomial = { coeff: 1, exps: { [base]: m + n } };
    return {
      difficulty,
      prompt: `Vereinfache: ${base}^${m} · ${base}^${n}`,
      solution: monomialToString(monomial),
      payload: { kind: 'monomial', value: monomial },
      targetSeconds: mathTargets.mathPowers[difficulty],
    };
  }
  if (kind === 'div') {
    const monomial: Monomial = { coeff: 1, exps: { [base]: m - n } };
    return {
      difficulty,
      prompt: `Vereinfache: ${base}^${m} / ${base}^${n}`,
      solution: monomialToString(monomial),
      payload: { kind: 'monomial', value: monomial },
      targetSeconds: mathTargets.mathPowers[difficulty],
    };
  }
  // pow
  const monomial: Monomial = { coeff: 1, exps: { [base]: m * n } };
  return {
    difficulty,
    prompt: `Vereinfache: (${base}^${m})^${n}`,
    solution: monomialToString(monomial),
    payload: { kind: 'monomial', value: monomial },
    targetSeconds: mathTargets.mathPowers[difficulty],
  };
};

const buildRootsTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const kinds = ['rational', 'simplify', 'domain', 'tf'];
  const kind = rng.choice(kinds);

  if (kind === 'domain') {
    return {
      difficulty,
      prompt: 'Für welche a∈ℝ ist √a definiert?',
      solution: 'a>=0',
      payload: { kind: 'expression', expr: 'a>=0', vars: [] },
      targetSeconds: mathTargets.mathRoots[difficulty],
      explanation: 'Definitionsbereich: Radikand ≥ 0.',
    };
  }

  if (kind === 'tf') {
    return {
      difficulty,
      prompt: 'Behauptung: Für alle x∈ℝ gilt √(x^2) = |x|. Wahr oder falsch?',
      solution: 'wahr',
      payload: { kind: 'boolean', value: true },
      targetSeconds: mathTargets.mathRoots[difficulty],
      explanation: 'Betrag, da Wurzel per Definition nicht-negativ.',
    };
  }

  if (kind === 'simplify') {
    const radicand = rng.int(8, difficulty === 'easy' ? 120 : 200);
    const { k, m } = simplifySqrt(radicand);
    const prompt = `Vereinfache: √(${radicand})`;
    const solution = m === 1 ? `${k}` : `${k === 1 ? '' : `${k}*`}sqrt(${m})`;
    return {
      difficulty,
      prompt,
      solution,
      payload: { kind: 'expression', expr: solution, vars: [] },
      targetSeconds: mathTargets.mathRoots[difficulty],
      explanation: 'Ziehe Quadrate unter der Wurzel heraus.',
    };
  }

  const q = rng.int(2, difficulty === 'hard' ? 5 : 4);
  const p = rng.int(1, difficulty === 'easy' ? 3 : 5);
  const forward = rng.choice([true, false]);
  if (forward) {
    const prompt = `Schreibe mit rationalem Exponenten: √[${q}]{a^${p}}`;
    const expr = `a^(${p}/${q})`;
    return {
      difficulty,
      prompt,
      solution: expr,
      payload: { kind: 'expression', expr, vars: ['a'], positiveOnly: true },
      targetSeconds: mathTargets.mathRoots[difficulty],
    };
  }
  const prompt = `Schreibe als Wurzel: a^(${p}/${q})`;
  const solution = `√[${q}]{a^${p}}`;
  return {
    difficulty,
    prompt,
    solution,
    payload: { kind: 'expression', expr: solution, vars: ['a'], positiveOnly: true },
    targetSeconds: mathTargets.mathRoots[difficulty],
  };
};

const buildBinomTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const patterns = ['square', 'diff', 'coef', 'coeffOf'];
  const pattern = rng.choice(patterns);

  const maxNCoef = difficulty === 'hard' ? 20 : 10;

  if (pattern === 'coef') {
    const n = rng.int(3, maxNCoef);
    const k = rng.int(0, n);
    const factorial = (x: number): number => (x <= 1 ? 1 : x * factorial(x - 1));
    const value = factorial(n) / (factorial(k) * factorial(n - k));
    return {
      difficulty,
      prompt: `Berechne den Binomialkoeffizienten: C(${n}, ${k}) (Nutze ggf. C(n,k)=C(n,n-k))`,
      solution: `${value}`,
      payload: { kind: 'numeric', value },
      targetSeconds: mathTargets.mathBinom[difficulty],
      explanation: `Pascal-Zeile n=${n}: C(${n},${k}) = ${value}`,
    };
  }

  if (pattern === 'coeffOf') {
    const n = rng.int(3, difficulty === 'hard' ? 10 : 7);
    const k = rng.int(0, Math.min(n, 4));
    const base = rng.int(1, 3);
    const coeff = (factorial: (x: number) => number) =>
      (factorial(n) / (factorial(k) * factorial(n - k))) * base ** (n - k);
    const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
    const value = coeff(fact);
    return {
      difficulty,
      prompt: `Koeffizient vor x^${k} in (x+${base})^${n} ?`,
      solution: `${value}`,
      payload: { kind: 'numeric', value },
      targetSeconds: mathTargets.mathBinom[difficulty],
      explanation: `C(${n},${k})·${base}^{${n - k}}`,
    };
  }

  const aCoeff = rng.int(1, difficulty === 'easy' ? 3 : 4);
  const bCoeff = rng.int(1, difficulty === 'easy' ? 4 : 6);

  if (pattern === 'diff') {
    const prompt = `( ${aCoeff}x + ${bCoeff} )( ${aCoeff}x - ${bCoeff} )`;
    const coeffs: Record<number, number> = {};
    coeffs[2] = aCoeff * aCoeff;
    coeffs[0] = -(bCoeff * bCoeff);
    const solution = polynomialToString(coeffs);
    return {
      difficulty,
      prompt: `Expandiere: ${prompt}`,
      solution,
      payload: { kind: 'polynomial', coeffs },
      targetSeconds: mathTargets.mathBinom[difficulty],
    };
  }

  // square
  const sign = rng.choice([1, -1]);
  const b = sign * bCoeff;
  const prompt = `( ${aCoeff}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} )^2`;
  const coeffs: Record<number, number> = {};
  coeffs[2] = aCoeff * aCoeff;
  coeffs[1] = 2 * aCoeff * b;
  coeffs[0] = b * b;
  const solution = polynomialToString(coeffs);
  return {
    difficulty,
    prompt: `Expandiere: ${prompt}`,
    solution,
    payload: { kind: 'polynomial', coeffs },
    targetSeconds: mathTargets.mathBinom[difficulty],
  };
};

const buildQuadTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const useA = difficulty === 'hard' && rng.choice([true, false]);
  const a = useA ? rng.int(1, 3) : 1;
  const bRange = difficulty === 'easy' ? 8 : 11;
  const b = difficulty === 'easy' ? rng.int(-bRange, bRange) * 2 : rng.int(-bRange, bRange);
  const c = rng.int(-8, 10);
  const h: Rational = normalizeRational({ n: b, d: 2 * a });
  const kVal = c - (b * b) / (4 * a);
  const hStr = rationalToString(h);
  const qStr = rationalToString(normalizeRational({ n: kVal, d: 1 }));
  const prompt = `${a !== 1 ? `${a}` : ''}x^2 ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)} in Scheitelpunktform`;
  const expr = `${a !== 1 ? `${a}(` : ''}(x + ${hStr})^2 ${kVal >= 0 ? '+' : '-'} ${Math.abs(kVal)}${a !== 1 ? ')' : ''}`;
  return {
    difficulty,
    prompt,
    solution: expr,
    payload: { kind: 'expression', expr, vars: ['x'] },
    targetSeconds: mathTargets.mathQuad[difficulty],
    explanation: `p = ${b}/(2${useA ? `·${a}` : ''}) = ${hStr}, q = ${qStr}`,
  };
};

const buildLogsTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const patterns = ['prod', 'quot', 'power', 'changebase', 'value', 'eq', 'domain'];
  const pattern = rng.choice(patterns);
  const base = rng.int(2, 6);

  const normalizeText = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  if (pattern === 'prod') {
    const x = 'x';
    const y = 'y';
    return {
      difficulty,
      prompt: 'Spalte auf: log_b(x·y)',
      solution: 'log_b(x)+log_b(y)',
      payload: { kind: 'text', accepts: ['log_b(x)+log_b(y)', 'logb(x)+logb(y)'].map(normalizeText) },
      targetSeconds: mathTargets.mathLogs[difficulty],
      explanation: 'Produktregel: log_b(xy)=log_b(x)+log_b(y).',
    };
  }

  if (pattern === 'quot') {
    return {
      difficulty,
      prompt: 'Spalte auf: log_b(x / y)',
      solution: 'log_b(x)-log_b(y)',
      payload: { kind: 'text', accepts: ['log_b(x)-log_b(y)', 'logb(x)-logb(y)'].map(normalizeText) },
      targetSeconds: mathTargets.mathLogs[difficulty],
      explanation: 'Quotient: log_b(x/y)=log_b(x)-log_b(y).',
    };
  }

  if (pattern === 'power') {
    const k = rng.int(2, difficulty === 'hard' ? 6 : 4);
    return {
      difficulty,
      prompt: `Ziehe den Exponenten nach vorn: log_b(x^${k})`,
      solution: `${k}·log_b(x)`,
      payload: { kind: 'text', accepts: [`${k}log_b(x)`, `${k}*log_b(x)`, `${k}·log_b(x)`].map(normalizeText) },
      targetSeconds: mathTargets.mathLogs[difficulty],
      explanation: 'Potenzregel.',
    };
  }

  if (pattern === 'changebase') {
    const a = rng.int(2, 12);
    return {
      difficulty,
      prompt: `Schreibe log_${base}(${a}) mit ln.`,
      solution: `ln(${a})/ln(${base})`,
      payload: { kind: 'text', accepts: [`ln(${a})/ln(${base})`, `log(${a})/log(${base})`].map(normalizeText) },
      targetSeconds: mathTargets.mathLogs[difficulty],
      explanation: 'Basiswechsel: log_b(a)=ln(a)/ln(b).',
    };
  }

  if (pattern === 'value') {
    const k = rng.int(1, 5);
    const value = rng.choice([`log_${base}(${base}^${k})`, `log_${base}(1)`]);
    if (value.includes('1')) {
      return {
        difficulty,
        prompt: `Wert: log_${base}(1)`,
        solution: '0',
        payload: { kind: 'numeric', value: 0 },
        targetSeconds: mathTargets.mathLogs[difficulty],
      };
    }
    return {
      difficulty,
      prompt: `Wert: log_${base}(${base}^${k})`,
      solution: `${k}`,
      payload: { kind: 'numeric', value: k },
      targetSeconds: mathTargets.mathLogs[difficulty],
    };
  }

  if (pattern === 'eq') {
    const variant = rng.choice(['exp', 'log']);
    if (variant === 'exp') {
      const a = rng.int(2, 15);
      return {
        difficulty,
        prompt: `${base}^x = ${a}  → x = ?`,
        solution: `log_${base}(${a})`,
        payload: { kind: 'text', accepts: [`log_${base}(${a})`, `ln(${a})/ln(${base})`].map(normalizeText) },
        targetSeconds: mathTargets.mathLogs[difficulty],
      };
    }
    const k = rng.int(1, 4);
    return {
      difficulty,
      prompt: `log_${base}(x) = ${k}  → x = ?`,
      solution: `${base}^${k}`,
      payload: { kind: 'text', accepts: [`${base}^${k}`, `${base}**${k}`].map(normalizeText) },
      targetSeconds: mathTargets.mathLogs[difficulty],
    };
  }

  // domain
  return {
    difficulty,
    prompt: 'Welche Bedingungen gelten für log_b(x)?',
    solution: 'x>0, b>0, b≠1',
    payload: { kind: 'text', accepts: ['x>0,b>0,b!=1', 'x>0,b>0,b≠1', 'argument>0basis>0basis!=1'].map(normalizeText) },
    targetSeconds: mathTargets.mathLogs[difficulty],
    explanation: 'Argument positiv, Basis positiv und nicht 1.',
  };
};

const buildSumsTask = (rng: RNG, difficulty: Difficulty): Omit<MathTask, 'mode' | 'seed' | 'nextSeed'> => {
  const patterns = ['sigmaValue', 'sigmaExpand', 'productExpand', 'setIndex'];
  const pattern = rng.choice(patterns);

  const normText = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  if (pattern === 'sigmaValue') {
    const seq = rng.choice(['k', '2k+1', 'r^k']);
    const n = rng.int(3, difficulty === 'hard' ? 7 : 5);
    let value = 0;
    if (seq === 'k') {
      value = (n * (n + 1)) / 2;
    } else if (seq === '2k+1') {
      value = n * n + n;
    } else {
      const r = rng.int(2, 3);
      value = (r ** (n + 1) - r) / (r - 1);
    }
    const prompt = `Berechne: Σ_{k=1..${n}} ${seq === 'r^k' ? 'r^k' : seq}`;
    return {
      difficulty,
      prompt,
      solution: `${value}`,
      payload: { kind: 'numeric', value },
      targetSeconds: mathTargets.mathSums[difficulty],
      explanation: seq === 'r^k' ? 'Geometrische Reihe' : 'Arithmetische Reihe',
    };
  }

  if (pattern === 'sigmaExpand') {
    const n = rng.int(3, 6);
    const terms = Array.from({ length: n }, (_, i) => `a${i + 1}`);
    const prompt = `Expandieren: Σ_{k=1..${n}} a_k`;
    const solution = terms.join('+');
    return {
      difficulty,
      prompt,
      solution,
      payload: { kind: 'text', accepts: [normText(solution)] },
      targetSeconds: mathTargets.mathSums[difficulty],
      explanation: 'Schreibe alle Summanden aus.',
    };
  }

  if (pattern === 'productExpand') {
    const n = rng.int(3, 5);
    const terms = Array.from({ length: n }, (_, i) => `b${i + 1}`);
    const prompt = `Expandieren: Π_{k=1..${n}} b_k`;
    const solution = terms.join('*');
    return {
      difficulty,
      prompt,
      solution,
      payload: { kind: 'text', accepts: [normText(solution)] },
      targetSeconds: mathTargets.mathSums[difficulty],
      explanation: 'Schreibe alle Faktoren aus.',
    };
  }

  // setIndex
  const setElems = [1, 2, 5];
  const term = rng.choice(['k', '2k', 'k+1']);
  const values = setElems.map((k) => (term === 'k' ? k : term === '2k' ? 2 * k : k + 1));
  const sum = values.reduce((acc, v) => acc + v, 0);
  const prompt = `Berechne: Σ_{k∈{1;2;5}} ${term}`;
  return {
    difficulty,
    prompt,
    solution: `${sum}`,
    payload: { kind: 'numeric', value: sum },
    targetSeconds: mathTargets.mathSums[difficulty],
    explanation: `Setze k∈{1,2,5}: ${values.join(' + ')} = ${sum}`,
  };
};

export const generateTask = (mode: MathMode, difficulty: Difficulty, seed?: number): MathTask => {
  const seedUsed = seed ?? randomSeed();
  const rng = createRng(seedUsed);
  let task: Omit<MathTask, 'mode'>;
  switch (mode) {
    case 'mathCalc':
      task = buildCalcTask(rng, difficulty);
      break;
    case 'mathPowers':
      task = buildPowersTask(rng, difficulty);
      break;
    case 'mathRoots':
      task = buildRootsTask(rng, difficulty);
      break;
    case 'mathBinom':
      task = buildBinomTask(rng, difficulty);
      break;
    case 'mathQuad':
      task = buildQuadTask(rng, difficulty);
      break;
    case 'mathLogs':
      task = buildLogsTask(rng, difficulty);
      break;
    case 'mathSums':
    default:
      task = buildSumsTask(rng, difficulty);
      break;
  }
  return { ...task, mode, seed: seedUsed, nextSeed: rng.nextSeed };
};

export const checkAnswer = (task: MathTask, userInputRaw: string): CheckResult => {
  const input = userInputRaw.trim();
  if (!input) return { correct: false, feedback: 'Bitte gib eine Antwort ein.' };
  const payload = task.payload;
  if (payload.kind === 'rational') {
    const parsed = parseRational(input);
    if (!parsed) return { correct: false, feedback: 'Bruch/Zahl konnte nicht gelesen werden.' };
    const expected = payload.value;
    const ok = parsed.n === expected.n && parsed.d === expected.d;
    const explain = task.explanation ? ` (${task.explanation})` : '';
    return { correct: ok, feedback: ok ? 'Richtig gekürzt!' : `Erwartet: ${rationalToString(expected)}${explain}` };
  }
  if (payload.kind === 'numeric') {
    const parsed = parseRational(input);
    if (!parsed) return { correct: false, feedback: 'Zahl konnte nicht gelesen werden.' };
    const value = parsed.n / parsed.d;
    const tolerance = payload.tolerance ?? 1e-6;
    const ok = Math.abs(value - payload.value) <= tolerance;
    return { correct: ok, feedback: ok ? 'Passt!' : `Erwartet: ${payload.value}` };
  }
  if (payload.kind === 'expression') {
    // Sonderfall Wurzelvereinfachung: akzeptiere k*sqrt(m)
    if (task.solution.includes('sqrt')) {
      const parsed = parseSqrtForm(input);
      const target = parseSqrtForm(task.solution);
      if (!parsed || !target) return { correct: false, feedback: 'Form nicht erkannt. Nutze k*sqrt(m).' };
      const ok = parsed.k === target.k && parsed.m === target.m;
      return { correct: ok, feedback: ok ? 'Passt!' : `Erwartet: ${task.solution}` };
    }
    const ok = expressionsEqual(payload.expr, input, payload.vars, payload.positiveOnly);
    return { correct: ok, feedback: ok ? 'Korrekt umgeformt!' : `Nicht äquivalent zur Ziel-Form (${task.solution}).` };
  }
  if (payload.kind === 'monomial') {
    const mono = monomialFromString(input);
    if (!mono) return { correct: false, feedback: 'Term konnte nicht gelesen werden.' };
    if (payload.disallowNegative) {
      const hasNegative = Object.values(mono.exps).some((v) => v < 0);
      if (hasNegative) {
        return { correct: false, feedback: 'Bitte ohne negative Exponenten schreiben (als Bruch).' };
      }
    }
    const ok = monomialsEqual(payload.value, mono);
    return { correct: ok, feedback: ok ? 'Passt!' : `Erwartet: ${task.solution}` };
  }
  if (payload.kind === 'boolean') {
    const lower = input.toLowerCase();
    const val = ['wahr', 'true', 'ja', 'richtig'].includes(lower);
    const ok = val === payload.value;
    return { correct: ok, feedback: ok ? 'Richtig bewertet!' : `Das ist ${payload.value ? 'wahr' : 'falsch'}.` };
  }
  if (payload.kind === 'polynomial') {
    const poly = parsePolynomial(input);
    if (!poly) return { correct: false, feedback: 'Polynom konnte nicht gelesen werden.' };
    const ok = polynomialsEqual(payload.coeffs, poly);
    return { correct: ok, feedback: ok ? 'Passt!' : `Erwartet: ${task.solution}` };
  }
  if (payload.kind === 'text') {
    const norm = input.replace(/\s+/g, '').toLowerCase();
    const ok = payload.accepts.some((a) => a === norm);
    return { correct: ok, feedback: ok ? 'Passt!' : `Erwartet: ${task.solution}` };
  }
  return { correct: false, feedback: 'Unbekannter Aufgabentyp.' };
};

export const mathTargetSeconds = mathTargets;
