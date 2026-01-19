import { Angle, ExactValue, formatExact, parseAngle, parseExactValue, sinCosTanExact } from './trig-core';
import { Difficulty } from '../math-tasks';
import { generateFallacyRule, FallacyLabel } from './trig-fallacies';

export type TrigMode = 'trigDegRad' | 'trigUnitCircle' | 'trigIdentities' | 'trigEquations' | 'trigGraphs' | 'trigFallacies';

export type TrigTask = {
  mode: TrigMode;
  prompt: string;
  solution: string;
  targetSeconds: number;
  angle?: Angle;
  func?: 'sin' | 'cos' | 'tan';
  exprExpected?: string;
  truthExpected?: boolean;
  explanation?: string;
  solutions?: Angle[];
  value?: ExactValue;
  funcEquation?: 'sin' | 'cos' | 'tan';
  shift?: number;
  graphFn?:
    | { type: 'sin' | 'cos'; a: number; b: number; c: number; d: number; variant: 'params' }
    | { type: 'sin' | 'cos'; a: number; b: number; c: number; d: number; variant: 'mc'; options: string[]; correctIndex: number };
  fallacy?: { label: FallacyLabel; feedback: string; option: 'A' | 'B' | 'C' };
};

export type TrigCheckResult = { correct: boolean; feedback?: string };

const toDegString = (deg: number) => `${deg}°`;
const toRadString = (p: number, q: number) => (q === 1 ? `${p}π` : `${p}π/${q}`);
const randomChoice = <T,>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];

const simplifyDegree = (deg: number) => {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
};

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

const degToRad = (deg: number): { p: number; q: number } => {
  const num = deg;
  const den = 180;
  const g = gcd(num, den);
  return { p: num / g, q: den / g };
};

const targetTimes: Record<TrigMode, Record<Difficulty, number>> = {
  trigDegRad: { easy: 20, medium: 30, hard: 45 },
  trigUnitCircle: { easy: 20, medium: 30, hard: 45 },
  trigIdentities: { easy: 25, medium: 35, hard: 50 },
  trigEquations: { easy: 25, medium: 35, hard: 55 },
  trigGraphs: { easy: 45, medium: 60, hard: 90 },
  trigFallacies: { easy: 20, medium: 30, hard: 45 },
};

type ASTNode =
  | { type: 'num'; value: number }
  | { type: 'var' }
  | { type: 'unary'; op: '+' | '-'; arg: ASTNode }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: ASTNode; right: ASTNode }
  | { type: 'func'; name: 'sin' | 'cos' | 'tan'; arg: ASTNode };

const tokenizeExpr = (input: string) => {
  const tokens: { type: string; value?: string }[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, '');
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let num = ch;
      i += 1;
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i];
        i += 1;
      }
      tokens.push({ type: 'num', value: num });
      continue;
    }
    if (ch === 'π' || s.slice(i, i + 2).toLowerCase() === 'pi') {
      tokens.push({ type: 'num', value: `${Math.PI}` });
      i += ch === 'π' ? 1 : 2;
      continue;
    }
    if (ch === 'x') {
      tokens.push({ type: 'var' });
      i += 1;
      continue;
    }
    if ('+-*/^()'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    const funcs = ['sin', 'cos', 'tan'];
    const matchFunc = funcs.find((f) => s.startsWith(f, i));
    if (matchFunc) {
      tokens.push({ type: 'func', value: matchFunc });
      i += matchFunc.length;
      continue;
    }
    throw new Error(`Unbekanntes Symbol ${ch}`);
  }
  return tokens;
};

const parseExpression = (input: string): ASTNode => {
  const tokens = tokenizeExpr(input);
  let idx = 0;
  const peek = () => tokens[idx];
  const consume = () => tokens[idx++];

  const parsePrimary = (): ASTNode => {
    const tok = consume();
    if (!tok) throw new Error('Unerwartetes Ende');
    if (tok.type === 'num') return { type: 'num', value: Number(tok.value) };
    if (tok.type === 'var') return { type: 'var' };
    if (tok.type === '(') {
      const expr = parseAdd();
      if (peek()?.type !== ')') throw new Error('Klammer fehlt');
      consume();
      return expr;
    }
    if (tok.type === 'func') {
      if (peek()?.type !== '(') throw new Error('Klammer nach Funktion');
      consume();
      const arg = parseAdd();
      if (peek()?.type !== ')') throw new Error('Klammer schließen');
      consume();
      return { type: 'func', name: tok.value as 'sin' | 'cos' | 'tan', arg };
    }
    if (tok.type === '+' || tok.type === '-') {
      const arg = parsePrimary();
      return { type: 'unary', op: tok.type, arg };
    }
    throw new Error('Unerwartetes Token');
  };

  const parsePow = (): ASTNode => {
    let node = parsePrimary();
    while (peek()?.type === '^') {
      consume();
      const right = parsePrimary();
      node = { type: 'bin', op: '^', left: node, right };
    }
    return node;
  };

  const parseMul = (): ASTNode => {
    let node = parsePow();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const op = consume()!.type as '*' | '/';
      const right = parsePow();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  };

  const parseAdd = (): ASTNode => {
    let node = parseMul();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const op = consume()!.type as '+' | '-';
      const right = parseMul();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  };

  const expr = parseAdd();
  if (idx < tokens.length) throw new Error('Unerwartete Fortsetzung');
  return expr;
};

const evalAst = (node: ASTNode, xVal: number): number => {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      return xVal;
    case 'unary':
      return node.op === '-' ? -evalAst(node.arg, xVal) : evalAst(node.arg, xVal);
    case 'bin': {
      const l = evalAst(node.left, xVal);
      const r = evalAst(node.right, xVal);
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
          return l ** r;
        default:
          return NaN;
      }
    }
    case 'func': {
      const v = evalAst(node.arg, xVal);
      switch (node.name) {
        case 'sin':
          return Math.sin(v);
        case 'cos':
          return Math.cos(v);
        case 'tan':
          return Math.tan(v);
        default:
          return NaN;
      }
    }
    default:
      return NaN;
  }
};

const approxEqual = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

export const generateTrigTask = (mode: TrigMode, difficulty: Difficulty, seed: number): TrigTask => {
  let s = seed >>> 0;
  const rng = () => {
    s = (1664525 * s + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };

  if (mode === 'trigDegRad') {
    const easyAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, 270, 360];
    const mediumExtra = [15, 75, 105, 165, 210, 225, 240, 300, 315, 330];
    let pool = easyAngles;
    if (difficulty !== 'easy') pool = pool.concat(mediumExtra);
    if (difficulty === 'hard') {
      const extra = Array.from({ length: 6 }, () => (rng() > 0.5 ? Math.round(rng() * 72) * 5 : Math.round(rng() * 36) * 10));
      pool = pool.concat(extra);
    }
    const angleDeg = simplifyDegree(randomChoice(pool, rng) * (rng() > 0.5 && difficulty === 'hard' ? -1 : 1));
    const asRad = degToRad(angleDeg);
    const asDegString = toDegString(angleDeg);
    const asRadString = toRadString(asRad.p, asRad.q);
    const askDegToRad = rng() > 0.5;
    const prompt = askDegToRad ? `Wandle ${asDegString} ins Bogenmaß um.` : `Wandle ${asRadString} in Grad um.`;
    const solution = askDegToRad ? `${asRadString}` : `${angleDeg}`;
    return { mode, prompt, solution, targetSeconds: targetTimes.trigDegRad[difficulty], angle: { kind: 'deg', value: angleDeg } };
  }

  if (mode === 'trigUnitCircle') {
    const bases = [
      { p: 1, q: 6 },
      { p: 1, q: 4 },
      { p: 1, q: 3 },
      { p: 1, q: 2 },
      { p: 2, q: 3 },
      { p: 3, q: 4 },
      { p: 5, q: 6 },
      { p: 1, q: 1 },
    ];
    const base = randomChoice(bases, rng);
    const sign = rng() > 0.5 ? 1 : -1;
    const factor = rng() > 0.5 ? 1 : rng() > 0.5 ? 2 : 3;
    const p = base.p * factor * sign;
    const q = base.q;
    const func = randomChoice(['sin', 'cos', 'tan'] as const, rng);
    const ang = { kind: 'rad', p, q } as Angle;
    const prompt = `Bestimme ${func}(${toRadString(p, q)}) exakt.`;
    const values = sinCosTanExact(ang);
    const val = func === 'sin' ? values.sin : func === 'cos' ? values.cos : values.tan;
    const solution = formatExact(val);
    return { mode, prompt, solution, targetSeconds: targetTimes.trigUnitCircle[difficulty], angle: ang, func };
  }

  if (mode === 'trigIdentities') {
    const identityTasks: { prompt: string; expected: string; explanation: string }[] = [
      { prompt: 'Vereinfache: sin(x)^2 + cos(x)^2', expected: '1', explanation: 'Pythagoras: sin²+cos²=1.' },
      { prompt: 'Vereinfache: sin(-x)', expected: '-sin(x)', explanation: 'Sinus ist ungerade.' },
      { prompt: 'Vereinfache: cos(-x)', expected: 'cos(x)', explanation: 'Cosinus ist gerade.' },
      { prompt: 'Vereinfache: tan(-x)', expected: '-tan(x)', explanation: 'Tangens ungerade.' },
      { prompt: 'Schreibe um: sin(π/2 - x)', expected: 'cos(x)', explanation: 'Co-Funktion.' },
      { prompt: 'Schreibe um: cos(π/2 - x)', expected: 'sin(x)', explanation: 'Co-Funktion.' },
      { prompt: 'Schreibe um: sin(x+2π)', expected: 'sin(x)', explanation: 'Periode 2π.' },
      { prompt: 'Schreibe um: cos(x+2π)', expected: 'cos(x)', explanation: 'Periode 2π.' },
      { prompt: 'Schreibe um: tan(x+π)', expected: 'tan(x)', explanation: 'Tangens-Periode π.' },
      { prompt: 'Schreibe um: sin(2x)', expected: '2*sin(x)*cos(x)', explanation: 'Doppelwinkel.' },
      { prompt: 'Schreibe um: cos(2x)', expected: 'cos(x)^2 - sin(x)^2', explanation: 'cos(2x)=cos²−sin².' },
    ];
    const tfTasks: { prompt: string; truth: boolean; explanation: string }[] = [
      { prompt: 'Identität? sin(x)^2 + cos(x)^2 = 1', truth: true, explanation: 'Pythagoras.' },
      { prompt: 'Identität? sin(x) = cos(x+π/2)', truth: true, explanation: 'Phasenverschiebung π/2.' },
      { prompt: 'Identität? sin(x)+cos(x)=1', truth: false, explanation: 'Nur für Spezialwinkel wahr.' },
    ];
    const useTf = rng() > 0.6;
    if (useTf) {
      const t = randomChoice(tfTasks, rng);
      return { mode, prompt: t.prompt, solution: t.truth ? 'wahr' : 'falsch', targetSeconds: targetTimes.trigIdentities[difficulty], truthExpected: t.truth, explanation: t.explanation };
    }
    const t = randomChoice(identityTasks, rng);
    return { mode, prompt: t.prompt, solution: t.expected, targetSeconds: targetTimes.trigIdentities[difficulty], exprExpected: t.expected, explanation: t.explanation };
  }

  if (mode === 'trigEquations') {
    const valuePool: ExactValue[] = [
      { kind: 'zero' },
      { kind: 'half', sign: 1 },
      { kind: 'half', sign: -1 },
      { kind: 'sqrt', n: 2, sign: 1, overTwo: true },
      { kind: 'sqrt', n: 2, sign: -1, overTwo: true },
      { kind: 'sqrt', n: 3, sign: 1, overTwo: true },
      { kind: 'sqrt', n: 3, sign: -1, overTwo: true },
      { kind: 'one', sign: 1 },
      { kind: 'one', sign: -1 },
    ];
    const funcs = ['sin', 'cos', 'tan'] as const;
    const funcEq = randomChoice(funcs, rng);
    const val = funcEq === 'tan' ? randomChoice(valuePool.filter((v) => v.kind !== 'one' || v.sign === 1), rng) : randomChoice(valuePool, rng);
    const coeff = difficulty === 'easy' ? 1 : randomChoice([1, 2, 3], rng);
    const shift = difficulty === 'hard' && rng() > 0.5 ? randomChoice([1, -1], rng) * (Math.PI / 6) : 0;
    const rhs = formatExact(val).replace('sqrt', '√');
    const prompt = `${funcEq}(${coeff === 1 ? 'x' : `${coeff}x`}${shift !== 0 ? `${shift > 0 ? ' - ' : ' + '}${Math.abs(shift)}rad` : ''}) = ${rhs} in [0,2π)`;
    const solutions: Angle[] = [];
    const candidateAngles = [
      { p: 0, q: 1 },
      { p: 1, q: 6 },
      { p: 5, q: 6 },
      { p: 1, q: 4 },
      { p: 3, q: 4 },
      { p: 1, q: 3 },
      { p: 2, q: 3 },
      { p: 1, q: 2 },
      { p: 3, q: 2 },
      { p: 2, q: 1 },
    ];
    candidateAngles.forEach((a) => {
      const ang = { kind: 'rad', p: a.p, q: a.q } as Angle;
      const valSet = sinCosTanExact(ang);
      const targetVal = funcEq === 'sin' ? valSet.sin : funcEq === 'cos' ? valSet.cos : valSet.tan;
      if (formatExact(targetVal) === formatExact(val)) solutions.push(ang);
    });
    const normalizedSolutions = solutions.map((a) => parseAngle(toRadString((a as Angle).p, (a as Angle).q))).filter((a): a is Angle => Boolean(a)).map((a) => ({ ...a }));
    return {
      mode,
      prompt,
      solution: normalizedSolutions.map((a) => toRadString((a as Angle).p, (a as Angle).q)).join('; '),
      targetSeconds: targetTimes.trigEquations[difficulty],
      solutions: normalizedSolutions,
      funcEquation: funcEq,
      value: val,
      shift,
    };
  }

  if (mode === 'trigFallacies') {
    const task = generateFallacyRule(seed ?? Math.floor(Math.random() * 1_000_000), difficulty);
    const prompt = `Fehler finden: ${task.rule.statement}\nA) immer wahr · B) manchmal wahr (Bedingung) · C) falsch. Tippe A/B/C.`;
    return {
      mode,
      prompt,
      solution: task.option,
      targetSeconds: targetTimes.trigFallacies[difficulty],
      fallacy: { label: task.rule.label, feedback: task.feedback, option: task.option },
      explanation: task.feedback,
    };
  }

  // trigGraphs
  const fnType = randomChoice(['sin', 'cos'] as const, rng);
  const a = randomChoice([1, 2], rng);
  const b = randomChoice([1, 2], rng);
  const c = randomChoice([0, Math.PI / 2], rng);
  const d = randomChoice([0, 1], rng);
  const period = (2 * Math.PI) / b;
  const useMc = difficulty !== 'easy' && rng() > 0.6;
  if (useMc) {
    const correctFn = `${fnType}(${b === 1 ? '' : `${b}`}x${c ? `-${c}` : ''})${d ? `+${d}` : ''}`;
    const options = [correctFn];
    while (options.length < 4) {
      const altB = randomChoice([1, 2], rng);
      const altC = randomChoice([0, Math.PI / 2], rng);
      const altD = randomChoice([0, 1], rng);
      const altFn = `${fnType}(${altB === 1 ? '' : `${altB}`}x${altC ? `-${altC}` : ''})${altD ? `+${altD}` : ''}`;
      if (!options.includes(altFn)) options.push(altFn);
    }
    const shuffled = options.sort(() => rng() - 0.5);
    const correctIndex = shuffled.indexOf(correctFn);
    const prompt = `Welcher Ausdruck passt zum gezeigten Graphen? Optionen: A) ${shuffled[0]}  B) ${shuffled[1]}  C) ${shuffled[2]}  D) ${shuffled[3]} (Tippe A/B/C/D)`;
    return { mode, prompt, solution: ['A', 'B', 'C', 'D'][correctIndex], targetSeconds: targetTimes.trigGraphs[difficulty], graphFn: { type: fnType, a, b, c, d, variant: 'mc', options: shuffled, correctIndex } };
  }
  const prompt = `Gegeben: y = ${a}·${fnType}(${b === 1 ? '' : `${b}`} (x - ${c})) + ${d}. Gib Amplitude;Periode;Phase;Vertikalverschiebung als a;T;phi;d ein.`;
  const solution = `${a};${period};${c};${d}`;
  return { mode, prompt, solution, targetSeconds: targetTimes.trigGraphs[difficulty], graphFn: { type: fnType, a, b, c, d, variant: 'params' } };
};

export const checkTrigAnswer = (task: TrigTask, userInput: string): TrigCheckResult => {
  if (task.mode === 'trigFallacies' && task.fallacy) {
    const norm = userInput.trim().toUpperCase();
    const choice = norm.startsWith('A') ? 'A' : norm.startsWith('B') ? 'B' : norm.startsWith('C') ? 'C' : '';
    const correct = choice === task.fallacy.option;
    const feedback = `${task.fallacy.feedback}${!correct ? ` · Erwartet: ${task.fallacy.option}` : ''}`;
    return { correct, feedback };
  }
  if (task.mode === 'trigDegRad') {
    const userAng = parseAngle(userInput);
    if (!userAng) return { correct: false };
    const expected = task.solution.endsWith('°') ? parseAngle(task.solution) : parseAngle(task.solution.replace('°', ''));
    if (!expected) return { correct: false };
    const normUser = userAng;
    const normExpected = expected;
    if (normUser.kind === 'deg' && normExpected.kind === 'deg')
      return { correct: Math.abs(normUser.value - normExpected.value) < 1e-9 };
    if (normUser.kind === 'rad' && normExpected.kind === 'rad')
      return { correct: normUser.p * normExpected.q === normExpected.p * normUser.q };
    return { correct: false };
  }
  if (task.mode === 'trigUnitCircle') {
    const val = parseExactValue(userInput);
    if (!val || !task.func || !task.angle) return { correct: false };
    const expected = sinCosTanExact(task.angle);
    const target = task.func === 'sin' ? expected.sin : task.func === 'cos' ? expected.cos : expected.tan;
    return { correct: formatExact(val) === formatExact(target) };
  }
  if (task.mode === 'trigIdentities') {
    if (task.truthExpected !== undefined) {
      const norm = userInput.trim().toLowerCase();
      const val = norm === 'wahr' || norm === 'true' || norm === 'ja';
      return { correct: val === task.truthExpected, feedback: task.explanation };
    }
    if (!task.exprExpected) return { correct: false };
    try {
      const expectedAst = parseExpression(task.exprExpected);
      const userAst = parseExpression(userInput);
      const xs = [0.2, 0.5, 1, 1.5, 2.1, 2.7, 3.4, 4.2];
      const correct = xs.every((x) => {
        const e = evalAst(expectedAst, x);
        const u = evalAst(userAst, x);
        return Number.isFinite(e) && Number.isFinite(u) && approxEqual(e, u);
      });
      return { correct, feedback: task.explanation };
    } catch {
      return { correct: false, feedback: 'Konnte Ausdruck nicht parsen.' };
    }
  }
  if (task.mode === 'trigEquations' && task.solutions) {
    const parts = userInput.split(';').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { correct: false };
    const parsed = parts
      .map((p) => parseAngle(p))
      .filter((a): a is Angle => Boolean(a))
      .map((a) => ({ kind: 'rad', ...(a.kind === 'rad' ? a : { p: a.value, q: 180 }) } as Angle));
    if (parsed.length !== task.solutions.length) return { correct: false };
    const toKey = (a: Angle) => (a.kind === 'deg' ? `d${a.value}` : `r${a.p}/${a.q}`);
    const expectedKeys = new Set(task.solutions.map(toKey));
    return { correct: parsed.every((a) => expectedKeys.has(toKey(a))) };
  }
  if (task.mode === 'trigGraphs' && task.graphFn) {
    if (task.graphFn.variant === 'mc') {
      const norm = userInput.trim().toUpperCase();
      return { correct: ['A', 'B', 'C', 'D'][task.graphFn.correctIndex] === norm };
    }
    const parts = userInput.split(';').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 4) return { correct: false };
    const [aStr, tStr, phiStr, dStr] = parts;
    const aUser = Number(aStr);
    const tUser = Number(tStr);
    const phi = parseAngle(phiStr);
    const dUser = Number(dStr);
    if (!Number.isFinite(aUser) || !Number.isFinite(tUser) || !phi || !Number.isFinite(dUser)) return { correct: false };
    const periodExpected = (2 * Math.PI) / task.graphFn.b;
    const ampOk = Math.abs(Math.abs(aUser) - Math.abs(task.graphFn.a)) < 1e-3;
    const perOk = Math.abs(tUser - periodExpected) < 1e-3;
    const phiVal = phi.kind === 'deg' ? (phi.value * Math.PI) / 180 : (phi.p / phi.q) * Math.PI;
    const phiDiff = Math.abs(((phiVal - task.graphFn.c + periodExpected) % periodExpected));
    const phiOk = phiDiff < 1e-3 || Math.abs(phiDiff - periodExpected) < 1e-3;
    const dOk = Math.abs(dUser - task.graphFn.d) < 1e-3;
    return { correct: ampOk && perOk && phiOk && dOk };
  }
  return { correct: false };
};
