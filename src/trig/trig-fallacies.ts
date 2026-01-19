import { Difficulty } from '../math-tasks';

export type FallacyLabel = 'always' | 'sometimes' | 'false';

export type FallacyRule = {
  statement: string;
  label: FallacyLabel;
  explanation: string;
  condition?: string;
};

export type FallacyTask = {
  rule: FallacyRule;
  feedback: string;
  option: 'A' | 'B' | 'C';
};

type AngleSample = { value: number; label: string };

const angleSamples: AngleSample[] = [
  { value: 0, label: '0' },
  { value: Math.PI / 6, label: 'π/6' },
  { value: Math.PI / 4, label: 'π/4' },
  { value: Math.PI / 3, label: 'π/3' },
  { value: Math.PI / 2, label: 'π/2' },
];

const nonSingularAngles = angleSamples.filter((a) => Math.abs(Math.cos(a.value)) > 1e-6);

const rngLCG = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
};

const randomChoice = <T,>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];
const formatVal = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : 'undef');
const formatExample = (lhs: number, rhs: number) => `LHS≈${formatVal(lhs)}, RHS≈${formatVal(rhs)}`;

export const ruleBank: FallacyRule[] = [
  { statement: 'sin(a+b)=sin a cos b + cos a sin b', label: 'always', explanation: 'Additionstheorem Sinus.' },
  { statement: 'sin(a+b)=sin a + sin b', label: 'false', explanation: 'Fehlt Kreuzterm; nur für Spezialfälle.' },
  { statement: 'cos(a+b)=cos a cos b − sin a sin b', label: 'always', explanation: 'Additionstheorem Cosinus.' },
  { statement: 'cos(a+b)=cos a + cos b', label: 'false', explanation: 'Fehlt Kreuzterm; stimmt nur selten.' },
  {
    statement: 'tan(a+b)=(tan a + tan b)/(1 − tan a tan b)',
    label: 'sometimes',
    condition: 'Definiert nur wenn tan a tan b ≠ 1 und cos a, cos b ≠ 0.',
    explanation: 'Additionstheorem Tangens.',
  },
  { statement: 'tan(a+b)=tan a + tan b', label: 'false', explanation: 'Additionstheorem falsch vereinfacht.' },
  { statement: 'sin^2 x + cos^2 x = 1', label: 'always', explanation: 'Pythagoras auf dem Einheitskreis.' },
  { statement: 'cos^2 x = 1 − sin x', label: 'false', explanation: 'Richtig wäre 1 − sin^2 x.' },
  { statement: 'cos^2 x = 1 − sin^2 x', label: 'always', explanation: 'Umformung von sin²+cos²=1.' },
  { statement: '1 + tan^2 x = 1/cos^2 x', label: 'sometimes', condition: 'Nur wenn cos x ≠ 0.', explanation: 'Pythagoras geteilt durch cos².' },
  { statement: 'sin(-x) = -sin x', label: 'always', explanation: 'Sinus ist ungerade.' },
  { statement: 'cos(-x) = -cos x', label: 'false', explanation: 'Cosinus ist gerade: cos(-x)=cos x.' },
  { statement: 'tan(x+π) = tan x', label: 'sometimes', condition: 'Nur wenn tan definiert (cos x ≠ 0).', explanation: 'Periode π für Tangens.' },
  { statement: 'sin(x+π) = sin x', label: 'false', explanation: 'Richtig: sin(x+π) = -sin x.' },
  { statement: 'sin(2x)=2 sin x cos x', label: 'always', explanation: 'Doppelwinkel Sinus.' },
  { statement: 'cos(2x)=1-2 sin^2 x', label: 'always', explanation: 'Doppelwinkel Cosinus.' },
  { statement: 'cos(2x)=1−sin x', label: 'false', explanation: 'Fehlt Quadrat.' },
  { statement: 'sin^2 x = sin x', label: 'sometimes', condition: 'Nur für sin x ∈ {0,1}.', explanation: 'Quadrat verändert Wert außer bei 0/1.' },
  { statement: '√(sin^2 x) = sin x', label: 'false', explanation: 'Richtig: |sin x|.' },
];

const exampleForRule = (rule: FallacyRule, rng: () => number): string | undefined => {
  switch (rule.statement) {
    case 'sin(a+b)=sin a cos b + cos a sin b': {
      const a = randomChoice(nonSingularAngles, rng);
      const b = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(a.value + b.value);
      const rhs = Math.sin(a.value) * Math.cos(b.value) + Math.cos(a.value) * Math.sin(b.value);
      return `Check: a=${a.label}, b=${b.label} → ${formatExample(lhs, rhs)}`;
    }
    case 'sin(a+b)=sin a + sin b': {
      const a = randomChoice(nonSingularAngles, rng);
      const b = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(a.value + b.value);
      const rhs = Math.sin(a.value) + Math.sin(b.value);
      return `Gegenbeispiel a=${a.label}, b=${b.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'cos(a+b)=cos a cos b − sin a sin b': {
      const a = randomChoice(nonSingularAngles, rng);
      const b = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(a.value + b.value);
      const rhs = Math.cos(a.value) * Math.cos(b.value) - Math.sin(a.value) * Math.sin(b.value);
      return `Check: a=${a.label}, b=${b.label} → ${formatExample(lhs, rhs)}`;
    }
    case 'cos(a+b)=cos a + cos b': {
      const a = randomChoice(nonSingularAngles, rng);
      const b = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(a.value + b.value);
      const rhs = Math.cos(a.value) + Math.cos(b.value);
      return `Gegenbeispiel a=${a.label}, b=${b.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'tan(a+b)=(tan a + tan b)/(1 − tan a tan b)': {
      const goodA = randomChoice(nonSingularAngles, rng);
      const goodB = randomChoice(nonSingularAngles, rng);
      const good = `gilt z.B. bei a=${goodA.label}, b=${goodB.label}`;
      const badA = { value: Math.PI / 4, label: 'π/4' };
      const badB = { value: Math.PI / 4, label: 'π/4' };
      return `${good}; Gegenbeispiel a=${badA.label}, b=${badB.label}: tan(a)·tan(b)=1 → Nenner 0 (nicht definiert)`;
    }
    case 'tan(a+b)=tan a + tan b': {
      const a = randomChoice(nonSingularAngles, rng);
      const b = randomChoice(nonSingularAngles, rng);
      const lhs = Math.tan(a.value + b.value);
      const rhs = Math.tan(a.value) + Math.tan(b.value);
      return `Gegenbeispiel a=${a.label}, b=${b.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'sin^2 x + cos^2 x = 1': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(x.value) ** 2 + Math.cos(x.value) ** 2;
      return `Check x=${x.label}: ${formatExample(lhs, 1)}`;
    }
    case 'cos^2 x = 1 − sin x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(x.value) ** 2;
      const rhs = 1 - Math.sin(x.value);
      return `Gegenbeispiel x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'cos^2 x = 1 − sin^2 x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(x.value) ** 2;
      const rhs = 1 - Math.sin(x.value) ** 2;
      return `Check x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case '1 + tan^2 x = 1/cos^2 x': {
      const good = randomChoice(nonSingularAngles, rng);
      const bad = { value: Math.PI / 2, label: 'π/2' };
      const lhsBad = 1 + Math.tan(bad.value) ** 2;
      return `Bedingung cos x ≠ 0. Beispiel x=${good.label} funktioniert; x=${bad.label} → cos x=0, RHS nicht definiert (${formatExample(lhsBad, Number.POSITIVE_INFINITY)})`;
    }
    case 'sin(-x) = -sin x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(-x.value);
      const rhs = -Math.sin(x.value);
      return `Check x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'cos(-x) = -cos x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(-x.value);
      const rhs = -Math.cos(x.value);
      return `Gegenbeispiel x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'tan(x+π) = tan x': {
      const ok = randomChoice(nonSingularAngles, rng);
      const bad = { value: Math.PI / 2, label: 'π/2' };
      const lhs = Math.tan(bad.value + Math.PI);
      const rhs = Math.tan(bad.value);
      return `Gilt wenn tan definiert, z.B. x=${ok.label}. Bei x=${bad.label} ist tan(x) undef → ${formatExample(lhs, rhs)}`;
    }
    case 'sin(x+π) = sin x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(x.value + Math.PI);
      const rhs = Math.sin(x.value);
      return `Gegenbeispiel x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'sin(2x)=2 sin x cos x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.sin(2 * x.value);
      const rhs = 2 * Math.sin(x.value) * Math.cos(x.value);
      return `Check x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'cos(2x)=1-2 sin^2 x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(2 * x.value);
      const rhs = 1 - 2 * Math.sin(x.value) ** 2;
      return `Check x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'cos(2x)=1−sin x': {
      const x = randomChoice(nonSingularAngles, rng);
      const lhs = Math.cos(2 * x.value);
      const rhs = 1 - Math.sin(x.value);
      return `Gegenbeispiel x=${x.label}: ${formatExample(lhs, rhs)}`;
    }
    case 'sin^2 x = sin x': {
      const good = { value: 0, label: '0' };
      const bad = randomChoice(nonSingularAngles.filter((a) => Math.abs(Math.sin(a.value)) > 1e-6 && Math.abs(Math.sin(a.value) - 1) > 1e-6), rng);
      const lhs = Math.sin(bad.value) ** 2;
      const rhs = Math.sin(bad.value);
      return `Gilt nur bei sin x ∈ {0,1}, z.B. x=${good.label}. Gegenbeispiel x=${bad.label}: ${formatExample(lhs, rhs)}`;
    }
    case '√(sin^2 x) = sin x': {
      const x = randomChoice(nonSingularAngles.filter((a) => a.value !== 0), rng);
      const lhs = Math.sqrt(Math.sin(x.value) ** 2);
      const rhs = Math.sin(x.value);
      return `Gegenbeispiel x=${x.label}: ${formatExample(lhs, rhs)} (Vorzeichenverlust)`;
    }
    default:
      return undefined;
  }
};

const labelToOption: Record<FallacyLabel, 'A' | 'B' | 'C'> = {
  always: 'A',
  sometimes: 'B',
  false: 'C',
};

export const generateFallacyRule = (seed: number, difficulty: Difficulty): FallacyTask => {
  const rng = rngLCG(seed || 1);
  const weighted = ruleBank.flatMap((rule) => {
    const weight =
      rule.label === 'sometimes'
        ? difficulty === 'hard'
          ? 3
          : difficulty === 'medium'
            ? 2
            : 1
        : 1;
    return Array.from({ length: weight }, () => rule);
  });
  const rule = randomChoice(weighted, rng);
  const detail = exampleForRule(rule, rng);
  const parts = [rule.explanation];
  if (rule.condition) parts.push(`Bedingung: ${rule.condition}`);
  if (detail) parts.push(detail);
  const feedback = parts.join(' · ');
  return {
    rule,
    feedback,
    option: labelToOption[rule.label],
  };
};
