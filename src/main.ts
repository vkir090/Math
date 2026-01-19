import './style.css';
import tasksJson from './data/tasks.json';
import rulesJson from './data/rules.json';
import setsTasksJson from './data/sets.tasks.json';
import {
  ModeKey,
  NormalizationResult,
  areEquivalent,
  astToString,
  containsImplication,
  containsIff,
  eliminateIffOnly,
  eliminateImplications,
  negateWithDeMorgan,
  normalizeSymbols,
  normalizeWithCursor,
  parseFormula,
  truthTable,
  truthTableEquality,
} from './logic';
import {
  Difficulty,
  MathMode,
  MathTask,
  checkAnswer as checkMathAnswer,
  generateTask as generateMathTask,
  mathTargetSeconds,
} from './math-tasks';
import {
  Region,
  normalizeSetInput,
  parseSetExpression,
  areSetExprEquivalent,
  isDisjoint,
  isSubset,
  computeRegionMaskFromExpr,
} from './set-logic';
import { createVennDiagram } from './venn';
import { generateTrigTask, checkTrigAnswer, TrigMode } from './trig/trig-tasks';

type PropMode = 'eliminateImp' | 'eliminateIff' | 'negation' | 'equivalence';
type PredMode = 'predNegation' | 'predRestricted' | 'predDistribution';
type SetMode =
  | 'setIdentity'
  | 'setRelation'
  | 'setVennTermToDiagram'
  | 'setVennDiagramToTerm'
  | 'setConcrete'
  | 'setIntervals';
type GeneratorMode = MathMode | TrigMode;
type TopicKey = 'aussagen' | 'praedikaten' | 'mengen' | 'rechnen' | 'trig';

type TaskTemplate = string | { base: string; hint?: string };
type PredicateTask = {
  base: string;
  hint?: string;
  answers?: string[];
  correctChoice?: 'korrekt' | 'falsch';
  kind?: 'mcq' | 'formula';
};
type SetTask =
  | {
      type: 'symbolic_simplify';
      promptText: string;
      solutionExpr: string;
      tags?: string[];
      explanation?: string;
      sets?: 2 | 3;
    }
  | {
      type: 'subset_check' | 'disjoint_check';
      promptText: string;
      leftExpr: string;
      rightExpr: string;
      answer: 'yes' | 'no';
      tags?: string[];
      explanation?: string;
      sets?: 2 | 3;
    }
  | {
      type: 'venn_shade';
      promptText: string;
      term: string;
      solutionMask?: number;
      tags?: string[];
      explanation?: string;
      sets?: 2 | 3;
    }
  | {
      type: 'venn_expr';
      promptText: string;
      maskExpr?: string;
      solutionMask?: number;
      solutionExprs?: string[];
      tags?: string[];
      sets?: 2 | 3;
    }
  | {
      type: 'finite_compute';
      promptText: string;
      setA: (number | string)[];
      setB: (number | string)[];
      op: 'union' | 'inter' | 'diff' | 'sym';
      answer: (number | string)[];
      tags?: string[];
      explanation?: string;
    }
  | {
      type: 'number_set_mc';
      promptText: string;
      answer: 'yes' | 'no';
      explanation?: string;
      tags?: string[];
    }
  | {
      type: 'interval_convert';
      promptText: string;
      answers: string[];
      explanation?: string;
      tags?: string[];
    };
type Task = {
  base: string;
  hint?: string;
  answers?: string[];
  correctChoice?: 'korrekt' | 'falsch';
  kind?: 'mcq' | 'formula' | 'venn-draw' | 'venn-static' | 'concrete';
  regions?: Region[];
  prompt?: string;
  setData?: { A: (number | string)[]; B: (number | string)[]; op: 'union' | 'inter' | 'diff' | 'sym'; answer: (number | string)[] };
  explanation?: string;
  setTask?: SetTask;
  setsCount?: 2 | 3;
  expectedMask?: number;
  solutionExprs?: string[];
  maskExpr?: string;
  targetSeconds?: number;
  mathTask?: MathTask;
  trigTask?: import('./trig/trig-tasks').TrigTask;
};
type Rule = { name: string; from: string; to: string; category: 'imp' | 'iff' | 'negation'; note?: string };

type Progress = { correct: number; wrong: number };
type TimeStat = { avgTime: number; bestTime: number; attempts: number; withinTarget: number };

type TasksData = {
  variables: string[];
  modes: Record<PropMode, TaskTemplate[]>;
  predicateModes: Record<PredMode, PredicateTask[]>;
};

type SetTasksData = {
  modes: Record<SetMode, SetTask[]>;
};

const tasksData = tasksJson as TasksData;
const rulesData = rulesJson as Rule[];
const setsData = setsTasksJson as SetTasksData;
const rulesByCategory = {
  imp: rulesData.filter((rule) => rule.category === 'imp'),
  iff: rulesData.filter((rule) => rule.category === 'iff'),
  negation: rulesData.filter((rule) => rule.category === 'negation'),
};
const targetDefaults: Record<ModeKey, number> = {
  eliminateImp: 60,
  eliminateIff: 70,
  negation: 70,
  equivalence: 90,
  predNegation: 70,
  predRestricted: 70,
  predDistribution: 60,
  setIdentity: 70,
  setRelation: 70,
  setVennTermToDiagram: 80,
  setVennDiagramToTerm: 80,
  setConcrete: 60,
  setIntervals: 60,
  mathCalc: mathTargetSeconds.mathCalc.medium,
  mathPowers: mathTargetSeconds.mathPowers.medium,
  mathRoots: mathTargetSeconds.mathRoots.medium,
  mathBinom: mathTargetSeconds.mathBinom.medium,
  mathQuad: mathTargetSeconds.mathQuad.medium,
  mathLogs: mathTargetSeconds.mathLogs.medium,
  mathSums: mathTargetSeconds.mathSums.medium,
  trigDegRad: 70,
  trigUnitCircle: 70,
  trigIdentities: 80,
  trigEquations: 80,
  trigGraphs: 80,
  trigFallacies: 30,
};

const modeCopy: Record<ModeKey, { title: string; description: string; cta: string }> = {
  eliminateImp: {
    title: '⇒ eliminieren',
    description: 'Formuliere die Aufgabe ohne Implikationen.',
    cta: 'Nutze die Regel A ⇒ B ≡ ¬A ∨ B.',
  },
  eliminateIff: {
    title: '⇔ eliminieren',
    description: 'Zerlege Äquivalenzen in zwei Implikationen.',
    cta: 'A ⇔ B ≡ (A ⇒ B) ∧ (B ⇒ A).',
  },
  negation: {
    title: 'Negation bilden (De Morgan)',
    description: 'Baue eine negierte Variante mit De-Morgan-Regeln und negation-only auf Atomen.',
    cta: 'Negiere die gesamte Formel und schiebe ¬ nach innen.',
  },
  equivalence: {
    title: 'Äquivalenz prüfen (Wahrheitstabelle)',
    description: 'Gib eine Formel an, die äquivalent zur Aufgabe ist. Wir prüfen per Wahrheitstabelle.',
    cta: 'Nutze Umformungen wie Implikations- oder De-Morgan-Regeln.',
  },
  predNegation: {
    title: 'Quantoren negieren',
    description: 'Negiere ∀/∃ korrekt.',
    cta: '¬∀ wird ∃ mit negierter Formel, ¬∃ wird ∀.',
  },
  predRestricted: {
    title: 'Eingeschränkte Quantoren',
    description: 'Schreibe ∀x∈M / ∃x∈M explizit.',
    cta: '∀x∈M P → ∀x (x∈M ⇒ P), ∃x∈M P → ∃x (x∈M ∧ P).',
  },
  predDistribution: {
    title: 'Verteilungen prüfen',
    description: 'Erkenne falsche Verteilungen von Quantoren.',
    cta: 'Wähle, ob die angegebene Umformung korrekt ist.',
  },
  setIdentity: {
    title: 'Umformen / Identitäten',
    description: 'Schreibe eine äquivalente Mengenformel.',
    cta: 'Nutze Gesetze wie Distributivität oder De Morgan.',
  },
  setRelation: {
    title: 'Teilmenge / Disjunktheit',
    description: 'Formuliere die Bedingung symbolisch.',
    cta: 'Nutze ⊆, ∅, ∖, ∩ etc.',
  },
  setVennTermToDiagram: {
    title: 'Venn: Term → Diagramm',
    description: 'Markiere die Regionen, die der Term beschreibt.',
    cta: 'Tippe nicht – schraffiere im Diagramm.',
  },
  setVennDiagramToTerm: {
    title: 'Venn: Diagramm → Term',
    description: 'Finde einen Term für das markierte Diagramm.',
    cta: 'Nutze ∪, ∩, ∖, Δ, ^c.',
  },
  setConcrete: {
    title: 'Konkrete Mengen rechnen',
    description: 'Berechne mit konkreten Mengen.',
    cta: 'Gib das Ergebnis als Menge ein, z. B. {1,2,3}.',
  },
  setIntervals: {
    title: 'Zahlenmengen & Intervalle',
    description: 'MC und Intervalle umformen.',
    cta: 'Nutze R/Z/Q/N und Intervallschreibweise.',
  },
  mathCalc: {
    title: 'Kopfrechnen: +-*/ Brüche',
    description: 'Rechne exakt, kürze vollständig.',
    cta: 'Gib Brüche als a/b ein, keine Dezimalrundung.',
  },
  mathPowers: {
    title: 'Potenzgesetze',
    description: 'Nutze Potenzregeln für gleiche Basen.',
    cta: 'Addiere/Subtrahiere Exponenten, Potenz von Potenz multipliziert.',
  },
  mathRoots: {
    title: 'Wurzeln & Exponenten',
    description: 'Schreibe Wurzeln als rationale Exponenten.',
    cta: '√[n]{x^p} = x^{p/n}, arbeite mit positiven x.',
  },
  mathBinom: {
    title: 'Binome & Binomials',
    description: 'Expandieren oder C(n,k) berechnen.',
    cta: 'Nutze (a±b)^2 und kleine C(n,k) exakt.',
  },
  mathQuad: {
    title: 'Quadratische Ergänzung',
    description: 'Bringe x²+bx+c in Scheitelpunktform.',
    cta: '(x+h)^2 + k vergleichen durch Ausmultiplizieren.',
  },
  mathLogs: {
    title: 'Logarithmen',
    description: 'Log-Regeln anwenden (Produkt/Quotient/Potenz).',
    cta: 'ln(ab)=ln a+ln b, Potenz nach vorn ziehen.',
  },
  mathSums: {
    title: 'Summen/Produkte',
    description: 'Sigma/Produkte ausmultiplizieren oder berechnen.',
    cta: '∑ klein n → geschlossene Form; Produkte ausmultiplizieren.',
  },
  trigDegRad: {
    title: 'Grad ↔ Bogenmaß',
    description: 'Umrechnen zwischen Grad und Radiant.',
    cta: 'Nutze π für Radiant.',
  },
  trigUnitCircle: {
    title: 'Einheitskreis',
    description: 'sin/cos/tan Werte bestimmen.',
    cta: 'Nutze Referenzwinkel und Quadranten.',
  },
  trigIdentities: {
    title: 'Identitäten umformen',
    description: 'Trig-Identitäten anwenden.',
    cta: 'sin²+cos²=1, tan=sin/cos etc.',
  },
  trigEquations: {
    title: 'Trig-Gleichungen',
    description: 'Einfache trig. Gleichungen lösen.',
    cta: 'Referenzwinkel + Periodizität beachten.',
  },
  trigGraphs: {
    title: 'Graphen & Transformationen',
    description: 'Amplitude/Periode/Shift erkennen.',
    cta: 'y = A sin(ωx + φ) + d analysieren.',
  },
  trigFallacies: {
    title: 'Fehler finden',
    description: 'Typische trig. Fallen erkennen.',
    cta: 'Wähle A/B/C: immer wahr · nur unter Bedingungen · falsch.',
  },
};

const topicModes: Record<TopicKey, ModeKey[]> = {
  aussagen: ['eliminateImp', 'eliminateIff', 'negation', 'equivalence'],
  praedikaten: ['predNegation', 'predRestricted', 'predDistribution'],
  mengen: ['setIdentity', 'setRelation', 'setVennTermToDiagram', 'setVennDiagramToTerm', 'setConcrete', 'setIntervals'],
  rechnen: ['mathCalc', 'mathPowers', 'mathRoots', 'mathBinom', 'mathQuad', 'mathLogs', 'mathSums'],
  trig: ['trigDegRad', 'trigUnitCircle', 'trigIdentities', 'trigEquations', 'trigGraphs', 'trigFallacies'],
};

const defaultProgress = (): Record<ModeKey, Progress> => ({
  eliminateImp: { correct: 0, wrong: 0 },
  eliminateIff: { correct: 0, wrong: 0 },
  negation: { correct: 0, wrong: 0 },
  equivalence: { correct: 0, wrong: 0 },
  predNegation: { correct: 0, wrong: 0 },
  predRestricted: { correct: 0, wrong: 0 },
  predDistribution: { correct: 0, wrong: 0 },
  setIdentity: { correct: 0, wrong: 0 },
  setRelation: { correct: 0, wrong: 0 },
  setVennTermToDiagram: { correct: 0, wrong: 0 },
  setVennDiagramToTerm: { correct: 0, wrong: 0 },
  setConcrete: { correct: 0, wrong: 0 },
  setIntervals: { correct: 0, wrong: 0 },
  mathCalc: { correct: 0, wrong: 0 },
  mathPowers: { correct: 0, wrong: 0 },
  mathRoots: { correct: 0, wrong: 0 },
  mathBinom: { correct: 0, wrong: 0 },
  mathQuad: { correct: 0, wrong: 0 },
  mathLogs: { correct: 0, wrong: 0 },
  mathSums: { correct: 0, wrong: 0 },
  trigDegRad: { correct: 0, wrong: 0 },
  trigUnitCircle: { correct: 0, wrong: 0 },
  trigIdentities: { correct: 0, wrong: 0 },
  trigEquations: { correct: 0, wrong: 0 },
  trigGraphs: { correct: 0, wrong: 0 },
  trigFallacies: { correct: 0, wrong: 0 },
});

const progressKey = 'logic-trainer-progress';
const timeStatsKey = 'logic-trainer-time-stats';

const defaultTimeStats = (): Record<ModeKey, TimeStat> => ({
  eliminateImp: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  eliminateIff: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  negation: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  equivalence: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  predNegation: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  predRestricted: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  predDistribution: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setIdentity: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setRelation: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setVennTermToDiagram: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setVennDiagramToTerm: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setConcrete: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  setIntervals: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathCalc: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathPowers: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathRoots: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathBinom: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathQuad: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathLogs: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  mathSums: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigDegRad: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigUnitCircle: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigIdentities: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigEquations: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigGraphs: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
  trigFallacies: { avgTime: 0, bestTime: 0, attempts: 0, withinTarget: 0 },
});

const loadProgress = (): Record<ModeKey, Progress> => {
  try {
    const stored = localStorage.getItem(progressKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<ModeKey, Progress>>;
      const legacyEliminate = (parsed as Record<string, Progress> | undefined)?.eliminate;
      return {
        eliminateImp: parsed.eliminateImp ?? legacyEliminate ?? { correct: 0, wrong: 0 },
        eliminateIff: parsed.eliminateIff ?? { correct: 0, wrong: 0 },
        negation: parsed.negation ?? { correct: 0, wrong: 0 },
        equivalence: parsed.equivalence ?? { correct: 0, wrong: 0 },
        predNegation: parsed.predNegation ?? { correct: 0, wrong: 0 },
        predRestricted: parsed.predRestricted ?? { correct: 0, wrong: 0 },
        predDistribution: parsed.predDistribution ?? { correct: 0, wrong: 0 },
        setIdentity: parsed.setIdentity ?? { correct: 0, wrong: 0 },
        setRelation: parsed.setRelation ?? { correct: 0, wrong: 0 },
        setVennTermToDiagram: parsed.setVennTermToDiagram ?? { correct: 0, wrong: 0 },
        setVennDiagramToTerm: parsed.setVennDiagramToTerm ?? { correct: 0, wrong: 0 },
        setConcrete: parsed.setConcrete ?? { correct: 0, wrong: 0 },
        setIntervals: parsed.setIntervals ?? { correct: 0, wrong: 0 },
        mathCalc: parsed.mathCalc ?? { correct: 0, wrong: 0 },
        mathPowers: parsed.mathPowers ?? { correct: 0, wrong: 0 },
        mathRoots: parsed.mathRoots ?? { correct: 0, wrong: 0 },
        mathBinom: parsed.mathBinom ?? { correct: 0, wrong: 0 },
        mathQuad: parsed.mathQuad ?? { correct: 0, wrong: 0 },
        mathLogs: parsed.mathLogs ?? { correct: 0, wrong: 0 },
        mathSums: parsed.mathSums ?? { correct: 0, wrong: 0 },
        trigDegRad: parsed.trigDegRad ?? { correct: 0, wrong: 0 },
        trigUnitCircle: parsed.trigUnitCircle ?? { correct: 0, wrong: 0 },
        trigIdentities: parsed.trigIdentities ?? { correct: 0, wrong: 0 },
        trigEquations: parsed.trigEquations ?? { correct: 0, wrong: 0 },
        trigGraphs: parsed.trigGraphs ?? { correct: 0, wrong: 0 },
        trigFallacies: parsed.trigFallacies ?? { correct: 0, wrong: 0 },
      };
    }
  } catch (error) {
    console.error('Konnte Fortschritt nicht laden', error);
  }
  return defaultProgress();
};

const loadTimeStats = (): Record<ModeKey, TimeStat> => {
  try {
    const stored = localStorage.getItem(timeStatsKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<ModeKey, TimeStat>>;
      return { ...defaultTimeStats(), ...parsed };
    }
  } catch (error) {
    console.error('Konnte Zeit-Stats nicht laden', error);
  }
  return defaultTimeStats();
};

const saveProgress = (progress: Record<ModeKey, Progress>) => {
  try {
    localStorage.setItem(progressKey, JSON.stringify(progress));
  } catch (error) {
    console.error('Konnte Fortschritt nicht speichern', error);
  }
};

const saveTimeStats = (stats: Record<ModeKey, TimeStat>) => {
  try {
    localStorage.setItem(timeStatsKey, JSON.stringify(stats));
  } catch (error) {
    console.error('Konnte Zeit-Stats nicht speichern', error);
  }
};

const mathDifficultyKey = 'logic-trainer-math-difficulty';
const mathSeedKey = 'logic-trainer-math-seed';

const defaultMathDifficulty = (): Record<GeneratorMode, Difficulty> => ({
  mathCalc: 'easy',
  mathPowers: 'easy',
  mathRoots: 'easy',
  mathBinom: 'easy',
  mathQuad: 'easy',
  mathLogs: 'easy',
  mathSums: 'easy',
  trigDegRad: 'easy',
  trigUnitCircle: 'easy',
  trigIdentities: 'easy',
  trigEquations: 'easy',
  trigGraphs: 'easy',
  trigFallacies: 'easy',
});

const defaultMathSeeds = (): Record<GeneratorMode, number | null> => ({
  mathCalc: null,
  mathPowers: null,
  mathRoots: null,
  mathBinom: null,
  mathQuad: null,
  mathLogs: null,
  mathSums: null,
  trigDegRad: null,
  trigUnitCircle: null,
  trigIdentities: null,
  trigEquations: null,
  trigGraphs: null,
  trigFallacies: null,
});

const loadMathDifficulty = (): Record<GeneratorMode, Difficulty> => {
  try {
    const stored = localStorage.getItem(mathDifficultyKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<GeneratorMode, Difficulty>>;
      return { ...defaultMathDifficulty(), ...parsed };
    }
  } catch (error) {
    console.error('Konnte Schwierigkeitsgrade nicht laden', error);
  }
  return defaultMathDifficulty();
};

const saveMathDifficulty = (values: Record<GeneratorMode, Difficulty>) => {
  try {
    localStorage.setItem(mathDifficultyKey, JSON.stringify(values));
  } catch (error) {
    console.error('Konnte Schwierigkeitsgrade nicht speichern', error);
  }
};

const loadMathSeeds = (urlSeed?: number | null): Record<GeneratorMode, number | null> => {
  try {
    const stored = localStorage.getItem(mathSeedKey);
    const parsed = stored ? (JSON.parse(stored) as Partial<Record<GeneratorMode, number>>) : {};
    const base = { ...defaultMathSeeds(), ...parsed };
    if (urlSeed !== undefined && urlSeed !== null && Number.isFinite(urlSeed)) {
      (Object.keys(base) as GeneratorMode[]).forEach((mode) => {
        base[mode] = urlSeed;
      });
    }
    return base;
  } catch (error) {
    console.error('Konnte Seeds nicht laden', error);
  }
  return defaultMathSeeds();
};

const saveMathSeeds = (values: Record<GeneratorMode, number | null>) => {
  try {
    localStorage.setItem(mathSeedKey, JSON.stringify(values));
  } catch (error) {
    console.error('Konnte Seeds nicht speichern', error);
  }
};

const urlSeedParam = new URLSearchParams(window.location.search).get('seed');
const urlSeedNumber = urlSeedParam && !Number.isNaN(Number(urlSeedParam)) ? Number(urlSeedParam) : null;
const generatorDifficultyState = loadMathDifficulty();
const generatorSeedState = loadMathSeeds(urlSeedNumber);

const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const fillTemplate = (template: string): string => {
  const placeholders = template.match(/#\d/g) ?? [];
  const pool = shuffle(tasksData.variables);
  let result = template;
  placeholders.forEach((placeholder, index) => {
    const variable = pool[index % pool.length] ?? tasksData.variables[0];
    result = result.replace(placeholder, variable);
  });
  return normalizeSymbols(result);
};

const isPredicateMode = (mode: ModeKey): mode is 'predNegation' | 'predRestricted' | 'predDistribution' =>
  mode === 'predNegation' || mode === 'predRestricted' || mode === 'predDistribution';
const isSetMode = (mode: ModeKey): mode is SetMode =>
  mode === 'setIdentity' ||
  mode === 'setRelation' ||
  mode === 'setVennTermToDiagram' ||
  mode === 'setVennDiagramToTerm' ||
  mode === 'setConcrete' ||
  mode === 'setIntervals';
const isMathMode = (mode: ModeKey): mode is MathMode =>
  mode === 'mathCalc' ||
  mode === 'mathPowers' ||
  mode === 'mathRoots' ||
  mode === 'mathBinom' ||
  mode === 'mathQuad' ||
  mode === 'mathLogs' ||
  mode === 'mathSums';
const isTrigMode = (mode: ModeKey): mode is TrigMode =>
  mode === 'trigDegRad' ||
  mode === 'trigUnitCircle' ||
  mode === 'trigIdentities' ||
  mode === 'trigEquations' ||
  mode === 'trigGraphs' ||
  mode === 'trigFallacies';
const isGeneratorMode = (mode: ModeKey): mode is GeneratorMode => isMathMode(mode) || isTrigMode(mode);

const setListForCount = (count?: 2 | 3): ('A' | 'B' | 'C')[] => (count === 3 ? ['A', 'B', 'C'] : ['A', 'B']);

const safeMaskFromExpr = (expr: string, sets: ('A' | 'B' | 'C')[]): number | undefined => {
  try {
    const ast = parseSetExpression(expr);
    return computeRegionMaskFromExpr(ast, sets);
  } catch {
    return undefined;
  }
};

const normalizeIntervalString = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, '')
    .replace(/∞/g, 'inf')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .toLowerCase();

const pickTask = (mode: ModeKey): Task => {
  if (isTrigMode(mode)) {
    const difficulty = generatorDifficultyState[mode];
    const seed = generatorSeedState[mode];
    const trigTask = generateTrigTask(mode, difficulty, seed ?? Math.floor(Math.random() * 1_000_000));
    generatorSeedState[mode] = seed === null ? null : Math.floor(Math.random() * 10_000_000);
    if (seed !== null) saveMathSeeds(generatorSeedState);
    const hint =
      trigTask.explanation ??
      (mode === 'trigDegRad'
        ? 'Nutze π und 180° = π.'
        : mode === 'trigUnitCircle'
          ? 'Spezialwinkel auf dem Einheitskreis.'
          : mode === 'trigFallacies'
            ? 'A=immer wahr, B=manchmal (mit Bedingung), C=falsch.'
            : 'Achte auf Quadranten, Perioden und Spezialwinkel.');
    return {
      base: '',
      prompt: trigTask.prompt,
      hint,
      kind: 'formula',
      targetSeconds: trigTask.targetSeconds,
      mathTask: undefined,
      setTask: undefined,
      trigTask,
    } as Task;
  }
  if (isMathMode(mode)) {
    const difficulty = generatorDifficultyState[mode];
    const seed = generatorSeedState[mode];
    const mathTask = generateMathTask(mode, difficulty, seed ?? undefined);
    generatorSeedState[mode] = seed === null ? null : mathTask.nextSeed;
    if (seed !== null) {
      saveMathSeeds(generatorSeedState);
    }
    return {
      base: '',
      prompt: mathTask.prompt,
      hint: mathTask.explanation,
      kind: 'formula',
      mathTask,
      targetSeconds: mathTask.targetSeconds,
    };
  }
  if (isSetMode(mode)) {
    const list = setsData.modes[mode];
    const template = list[Math.floor(Math.random() * list.length)] as SetTask;
    const setsCount = template.sets ?? 2;
    const setsArray = setListForCount(setsCount);
    if (template.type === 'symbolic_simplify') {
      return {
        base: '',
        prompt: template.promptText,
        hint: template.explanation,
        kind: 'formula',
        setTask: template,
        setsCount,
      };
    }
    if (template.type === 'subset_check' || template.type === 'disjoint_check') {
      return {
        base: '',
        prompt: template.promptText,
        hint: template.explanation,
        kind: 'mcq',
        setTask: template,
        setsCount,
      };
    }
    if (template.type === 'venn_shade') {
      const expectedMask = template.solutionMask ?? safeMaskFromExpr(template.term, setsArray) ?? 0;
      return {
        base: template.term,
        prompt: template.promptText,
        hint: template.explanation,
        kind: 'venn-draw',
        setTask: template,
        setsCount,
        expectedMask,
      };
    }
    if (template.type === 'venn_expr') {
      const mask =
        template.solutionMask ??
        (template.maskExpr ? safeMaskFromExpr(template.maskExpr, setsArray) : undefined) ??
        (template.solutionExprs && template.solutionExprs[0] ? safeMaskFromExpr(template.solutionExprs[0], setsArray) : 0);
      return {
        base: '',
        prompt: template.promptText,
        hint: template.explanation,
        kind: 'venn-static',
        setTask: template,
        setsCount,
        expectedMask: mask ?? 0,
        solutionExprs: template.solutionExprs,
        maskExpr: template.maskExpr,
      };
    }
    if (template.type === 'finite_compute') {
      return {
        base: '',
        prompt: template.promptText,
        setData: { A: template.setA, B: template.setB, op: template.op, answer: template.answer },
        hint: template.explanation,
        kind: 'concrete',
        setTask: template,
      };
    }
    if (template.type === 'number_set_mc' || template.type === 'interval_convert') {
      return {
        base: '',
        prompt: template.promptText,
        hint: template.explanation,
        kind: template.type === 'number_set_mc' ? 'mcq' : 'formula',
        setTask: template,
        setsCount,
      };
    }
  }
  if (isPredicateMode(mode)) {
    const list = tasksData.predicateModes[mode];
    const template = list[Math.floor(Math.random() * list.length)];
    return {
      base: template.base,
      hint: template.hint,
      answers: template.answers,
      correctChoice: template.correctChoice,
      kind: template.kind ?? (mode === 'predDistribution' ? 'mcq' : 'formula'),
    };
  }
  const list = tasksData.modes[mode];
  const template = list[Math.floor(Math.random() * list.length)];
  if (typeof template === 'string') {
    return { base: fillTemplate(template) };
  }
  return { base: fillTemplate(template.base), hint: template.hint };
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Root Element fehlt.');
}

app.innerHTML = `
  <div class="page">
    <header class="hero">
      <div class="hero__text">
        <p class="pill">Uni Prep</p>
        <h1>Logic Trainer</h1>
        <p class="lede">Logik, Mengenlehre, Rechengrundlagen & Trigonometrie – mobilfreundlich und PWA-ready.</p>
        <div class="topic-switch" role="tablist" aria-label="Topic Auswahl">
          <button class="topic-button active" data-topic="aussagen">Aussagenlogik</button>
          <button class="topic-button" data-topic="praedikaten">Prädikatenlogik</button>
          <button class="topic-button" data-topic="mengen">Mengenlehre</button>
          <button class="topic-button" data-topic="rechnen">Rechengrundlagen</button>
          <button class="topic-button" data-topic="trig">Trigonometrie</button>
        </div>
      </div>
      <div class="hero__status">
        <div class="status-card">
          <p class="eyebrow">Fortschritt gesamt</p>
          <div id="progressSummary" class="progress-summary"></div>
          <p class="tiny">Speichert lokal (localStorage)</p>
        </div>
      </div>
    </header>
    <main class="grid">
      <section class="card">
        <div id="tabRow" class="tab-row" role="tablist" aria-label="Übungsmodi"></div>
        <div id="modeControls" class="mode-controls hidden">
          <label class="control">
            <span class="label">Schwierigkeit</span>
            <select id="difficultySelect">
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
          <label class="control">
            <span class="label">Seed (optional)</span>
            <input id="seedInput" type="text" inputmode="numeric" placeholder="z.B. 42" />
          </label>
          <button class="ghost-button" id="seedApply" type="button">Seed setzen</button>
        </div>
        <div class="task-header">
          <div>
            <p id="modeLabel" class="eyebrow"></p>
            <h2 id="taskTitle"></h2>
            <p id="taskDescription" class="task-description"></p>
          </div>
          <div class="small-progress" id="modeProgress"></div>
        </div>
        <div class="task-body">
          <div class="task-card">
            <p class="label">Aufgabe</p>
            <p id="taskText" class="formula"></p>
          </div>
          <div class="hint-box">
            <p class="label">Hinweis</p>
            <p id="taskHint" class="hint"></p>
          </div>
        </div>
        <div class="editor" id="editor">
          <div class="editor__label">
            <div>
              <p class="label">Formel-Editor</p>
              <p class="tiny">ASCII-Kürzel werden automatisch normalisiert (!, &, |, ->, <->, forall, exists, in)</p>
            </div>
            <button class="ghost-button" id="clearButton" type="button">Leeren</button>
          </div>
          <textarea id="formulaInput" rows="3" placeholder="Formel eingeben…"></textarea>
          <div class="symbol-row" aria-label="Formel-Symbole">
            <div class="symbol-group">
              <button data-symbol="¬" type="button">¬</button>
              <button data-symbol="∧" type="button">∧</button>
              <button data-symbol="∨" type="button">∨</button>
              <button data-symbol="⇒" type="button">⇒</button>
              <button data-symbol="⇔" type="button">⇔</button>
              <button data-symbol="(" type="button">(</button>
              <button data-symbol=")" type="button">)</button>
              <button data-symbol="[" type="button">[</button>
              <button data-symbol="]" type="button">]</button>
              <button data-symbol="±" type="button">±</button>
            </div>
            <div class="symbol-group">
              <button data-symbol="∪" type="button">∪</button>
              <button data-symbol="∩" type="button">∩</button>
              <button data-symbol="∖" type="button">∖</button>
              <button data-symbol="Δ" type="button">Δ</button>
              <button data-symbol="⊆" type="button">⊆</button>
              <button data-symbol="⊂" type="button">⊂</button>
              <button data-symbol="∅" type="button">∅</button>
              <button data-symbol="Ω" type="button">Ω</button>
              <button data-symbol="^c" type="button">^c</button>
              <button data-symbol="∞" type="button">∞</button>
              <button data-symbol=";" type="button">;</button>
            </div>
            <div class="symbol-group">
              <button data-symbol="∀" type="button">∀</button>
              <button data-symbol="∃" type="button">∃</button>
              <button data-symbol="∈" type="button">∈</button>
              <button data-symbol="x" type="button">x</button>
              <button data-symbol="y" type="button">y</button>
              <button data-symbol="z" type="button">z</button>
              <button data-symbol="P(x)" type="button">P(x)</button>
              <button data-symbol="Q(x)" type="button">Q(x)</button>
              <button data-symbol="π" type="button">π</button>
              <button data-symbol="°" type="button">°</button>
              <button data-symbol="√" type="button">√</button>
              <button data-symbol="sin()" type="button">sin()</button>
              <button data-symbol="cos()" type="button">cos()</button>
              <button data-symbol="tan()" type="button">tan()</button>
              <button data-symbol="arcsin()" type="button">arcsin()</button>
              <button data-symbol="arccos()" type="button">arccos()</button>
              <button data-symbol="arctan()" type="button">arctan()</button>
            </div>
          </div>
        </div>
        <div id="mcq" class="mcq hidden">
          <p class="label">Multiple Choice</p>
          <div class="mcq-options">
            <button data-choice="korrekt" type="button">Ja</button>
            <button data-choice="falsch" type="button">Nein</button>
          </div>
        </div>
        <div id="vennInteractive" class="venn hidden">
          <p class="label">Schraffiere die passenden Bereiche</p>
          <div class="venn-grid" id="vennGrid"></div>
        </div>
        <div id="vennStatic" class="venn hidden">
          <p class="label">Gegebenes Diagramm</p>
          <div class="venn-grid" id="vennStaticGrid"></div>
        </div>
        <div id="concreteBox" class="card-sub hidden">
          <p class="label">Konkrete Mengen</p>
          <p id="concretePrompt" class="muted"></p>
        </div>
        <div class="actions">
          <button id="checkButton" class="primary" type="button">Prüfen</button>
          <button id="solutionButton" class="ghost-button" type="button">Zeige Lösung</button>
          <button id="nextButton" class="ghost-button" type="button">Neue Aufgabe</button>
          <label class="hint-toggle hidden" id="hintToggle">
            <input type="checkbox" id="hintCheckbox" />
            <span>Hinweis anzeigen (Einheitskreis)</span>
          </label>
        </div>
        <div id="unitCircle" class="unit-circle hidden" aria-hidden="true"></div>
        <div id="feedback" class="feedback" role="status"></div>
        <div id="solution" class="solution" aria-live="polite"></div>
        <div id="truthTable" class="truth-table"></div>
      </section>
      <section class="card secondary" id="comingSoon">
        <p class="eyebrow">Hinweis</p>
        <h3>Alle Topics bereit</h3>
        <p class="muted">Aussagenlogik, Prädikatenlogik, Mengenlehre, Rechengrundlagen und Trigonometrie mit Venn-Modi, Intervallen und Kopf-Rechnen.</p>
      </section>
    </main>
  </div>
`;

const input = document.querySelector<HTMLTextAreaElement>('#formulaInput');
const feedback = document.querySelector<HTMLDivElement>('#feedback');
const truthTableContainer = document.querySelector<HTMLDivElement>('#truthTable');
const modeProgress = document.querySelector<HTMLDivElement>('#modeProgress');
const progressSummary = document.querySelector<HTMLDivElement>('#progressSummary');
const taskText = document.querySelector<HTMLParagraphElement>('#taskText');
const taskHint = document.querySelector<HTMLParagraphElement>('#taskHint');
const taskTitle = document.querySelector<HTMLHeadingElement>('#taskTitle');
const taskDescription = document.querySelector<HTMLParagraphElement>('#taskDescription');
const modeLabel = document.querySelector<HTMLParagraphElement>('#modeLabel');
const editor = document.querySelector<HTMLDivElement>('#editor');
const timerBox = document.createElement('div');
timerBox.className = 'timer-box';
const solutionBox = document.querySelector<HTMLDivElement>('#solution');
const solutionButton = document.querySelector<HTMLButtonElement>('#solutionButton');
const tabRow = document.querySelector<HTMLDivElement>('#tabRow');
const modeControls = document.querySelector<HTMLDivElement>('#modeControls');
const difficultySelect = document.querySelector<HTMLSelectElement>('#difficultySelect');
const seedInput = document.querySelector<HTMLInputElement>('#seedInput');
const seedApply = document.querySelector<HTMLButtonElement>('#seedApply');
const hintToggle = document.querySelector<HTMLLabelElement>('#hintToggle');
const hintCheckbox = document.querySelector<HTMLInputElement>('#hintCheckbox');
const unitCircle = document.querySelector<HTMLDivElement>('#unitCircle');
const mcqBox = document.querySelector<HTMLDivElement>('#mcq');
const vennInteractive = document.querySelector<HTMLDivElement>('#vennInteractive');
const vennGrid = document.querySelector<HTMLDivElement>('#vennGrid');
const vennStatic = document.querySelector<HTMLDivElement>('#vennStatic');
const vennStaticGrid = document.querySelector<HTMLDivElement>('#vennStaticGrid');
const concreteBox = document.querySelector<HTMLDivElement>('#concreteBox');
const concretePrompt = document.querySelector<HTMLParagraphElement>('#concretePrompt');
let vennInteractiveDiagram: ReturnType<typeof createVennDiagram> | null = null;
let vennStaticDiagram: ReturnType<typeof createVennDiagram> | null = null;
let vennExpectedMask: number | undefined;

if (
  !input ||
  !feedback ||
  !truthTableContainer ||
  !modeProgress ||
  !progressSummary ||
  !taskText ||
  !taskHint ||
  !taskTitle ||
  !taskDescription ||
  !modeLabel ||
  !editor ||
  !solutionBox ||
  !solutionButton ||
  !tabRow ||
  !modeControls ||
  !difficultySelect ||
  !seedInput ||
  !seedApply ||
  !hintToggle ||
  !hintCheckbox ||
  !unitCircle ||
  !mcqBox ||
  !vennInteractive ||
  !vennGrid ||
  !vennStatic ||
  !vennStaticGrid ||
  !concreteBox ||
  !concretePrompt
) {
  throw new Error('UI konnte nicht initialisiert werden.');
}
const taskHeader = document.querySelector('.task-header');
if (taskHeader) {
  const timerWrapper = document.createElement('div');
  timerWrapper.className = 'timer-wrapper';
  timerWrapper.appendChild(timerBox);
  taskHeader.appendChild(timerWrapper);
}

const state: {
  topic: TopicKey;
  mode: ModeKey;
  task: Task;
  progress: Record<ModeKey, Progress>;
  timeStats: Record<ModeKey, TimeStat>;
  mathDifficulty: Record<GeneratorMode, Difficulty>;
  mathSeeds: Record<GeneratorMode, number | null>;
  choice: 'korrekt' | 'falsch' | null;
  vennMask: number;
  timer: {
    start: number;
    accumulated: number;
    running: boolean;
    target: number;
    intervalId: number | null;
  };
} = {
  topic: 'aussagen',
  mode: 'eliminateImp',
  task: pickTask('eliminateImp'),
  progress: loadProgress(),
  timeStats: loadTimeStats(),
  mathDifficulty: generatorDifficultyState,
  mathSeeds: generatorSeedState,
  choice: null,
  vennMask: 0,
  timer: { start: 0, accumulated: 0, running: false, target: 60, intervalId: null },
};

const ruleNamesForMode = (mode: ModeKey): string => {
  if (mode === 'eliminateImp') return rulesByCategory.imp.map((r) => r.name).join(', ');
  if (mode === 'eliminateIff') return rulesByCategory.iff.map((r) => r.name).join(', ');
  if (mode === 'negation' || mode === 'predNegation') return rulesByCategory.negation.map((r) => r.name).join(', ');
  if (mode === 'predRestricted') return 'Einschränken über ∈';
  if (mode === 'predDistribution') return 'Quantorenverteilung';
  if (mode === 'setIdentity' || mode === 'setRelation') return 'Mengenidentitäten';
  if (mode === 'setVennTermToDiagram' || mode === 'setVennDiagramToTerm') return 'Venn-Darstellung';
  if (mode === 'setConcrete') return 'Mengenoperationen';
  if (isMathMode(mode)) return 'Rechengrundlagen';
  if (isTrigMode(mode)) return 'Trigonometrie';
  return 'Wahrheitstabellen';
};

const clearSolution = () => {
  solutionBox.textContent = '';
  solutionBox.className = 'solution';
};

const normalizePredicateAnswer = (text: string) => normalizeSymbols(text).replace(/\s+/g, '');

const destroyVennDiagrams = () => {
  vennInteractiveDiagram?.destroy();
  vennStaticDiagram?.destroy();
  vennInteractiveDiagram = null;
  vennStaticDiagram = null;
  vennExpectedMask = undefined;
};

const setupVennInteractive = (setsCount: 2 | 3, expectedMask = 0) => {
  vennInteractive.classList.remove('hidden');
  vennStatic.classList.add('hidden');
  destroyVennDiagrams();
  state.vennMask = 0;
  vennExpectedMask = expectedMask;
  vennInteractiveDiagram = createVennDiagram({
    sets: setsCount,
    container: vennGrid,
    interactive: true,
    onMaskChange: (mask) => {
      state.vennMask = mask;
    },
  });
  vennInteractiveDiagram.setMask(0);
  vennInteractiveDiagram.setExpectedMask?.(expectedMask);
};

const setupVennStatic = (setsCount: 2 | 3, mask: number) => {
  vennInteractive.classList.add('hidden');
  vennStatic.classList.remove('hidden');
  destroyVennDiagrams();
  vennStaticDiagram = createVennDiagram({
    sets: setsCount,
    container: vennStaticGrid,
    interactive: false,
  });
  vennStaticDiagram.setMask(mask);
  vennStaticDiagram.setExpectedMask?.(mask);
};

const formatSet = (values: (string | number)[]) => `{${values.join(', ')}}`;

const parseSetLiteral = (input: string): (string | number)[] => {
  const trimmed = input.trim();
  const inner = trimmed.replace(/^{|}$/g, '');
  if (!inner) return [];
  return inner
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((item) => {
      const num = Number(item);
      return Number.isNaN(num) ? item : num;
    });
};

const compareSetLiterals = (a: (string | number)[], b: (string | number)[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map(String));
  return b.every((x) => sa.has(String(x)));
};

const computeConcreteOp = (task: NonNullable<Task['setData']>): (string | number)[] => {
  const setA = new Set(task.A.map(String));
  const setB = new Set(task.B.map(String));
  const union = new Set([...setA, ...setB]);
  const inter = new Set([...setA].filter((x) => setB.has(x)));
  const diff = new Set([...setA].filter((x) => !setB.has(x)));
  const sym = new Set([...union].filter((x) => !(setA.has(x) && setB.has(x))));
  const mapBack = (set: Set<string>) =>
    Array.from(set).map((x) => {
      const num = Number(x);
      return Number.isNaN(num) ? x : num;
    });
  switch (task.op) {
    case 'union':
      return mapBack(union);
    case 'inter':
      return mapBack(inter);
    case 'diff':
      return mapBack(diff);
    case 'sym':
      return mapBack(sym);
    default:
      return [];
  }
};

const formatSeconds = (seconds: number) => {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
};

const getElapsedMs = () => state.timer.accumulated + (state.timer.running ? performance.now() - state.timer.start : 0);

const updateTimerView = () => {
  const elapsed = Math.floor(getElapsedMs() / 1000);
  const target = state.timer.target;
  const within = !target || elapsed <= target;
  timerBox.innerHTML = `<div>Zeit: ${formatSeconds(elapsed)}${target ? ` (Ziel: ${formatSeconds(target)})` : ''}</div>`;
  timerBox.classList.toggle('ok', within);
};

const startTimer = (targetSeconds: number) => {
  stopTimer();
  state.timer = {
    start: performance.now(),
    accumulated: 0,
    running: true,
    target: targetSeconds,
    intervalId: window.setInterval(() => updateTimerView(), 500),
  };
  updateTimerView();
};

const stopTimer = () => {
  if (state.timer.intervalId !== null) {
    clearInterval(state.timer.intervalId);
  }
  state.timer.accumulated = getElapsedMs();
  state.timer.intervalId = null;
  state.timer.running = false;
  updateTimerView();
};

const pauseTimer = () => {
  if (!state.timer.running) return;
  state.timer.accumulated = getElapsedMs();
  state.timer.running = false;
  if (state.timer.intervalId !== null) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
};

const resumeTimer = () => {
  if (state.timer.running) return;
  state.timer.start = performance.now();
  state.timer.running = true;
  if (state.timer.intervalId === null) {
    state.timer.intervalId = window.setInterval(() => updateTimerView(), 500);
  }
};

const recordTimeStat = (mode: ModeKey, elapsedSeconds: number, hitTarget: boolean) => {
  const stat = state.timeStats[mode];
  const totalTime = stat.avgTime * stat.attempts + elapsedSeconds;
  const attempts = stat.attempts + 1;
  const withinTarget = stat.withinTarget + (hitTarget ? 1 : 0);
  const best = stat.bestTime === 0 ? elapsedSeconds : Math.min(stat.bestTime, elapsedSeconds);
  state.timeStats[mode] = {
    avgTime: totalTime / attempts,
    attempts,
    withinTarget,
    bestTime: best,
  };
  saveTimeStats(state.timeStats);
};

const updateProgressViews = () => {
  const entries = (Object.keys(state.progress) as ModeKey[]).map((key) => {
    const stats = state.progress[key];
    const total = stats.correct + stats.wrong;
    const ratio = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
    return `<div class="progress-item">
      <div>
        <p class="label">${modeCopy[key].title}</p>
        <p class="muted">${stats.correct} richtig · ${stats.wrong} falsch</p>
      </div>
      <span class="pill pill--ghost">${ratio}%</span>
    </div>`;
  });
  progressSummary.innerHTML = entries.join('');
  const stats = state.progress[state.mode];
  modeProgress.innerHTML = `<strong>${stats.correct}✓</strong> · <span class="muted">${stats.wrong}✗</span>`;
};

const clearMcqSelection = () => {
  state.choice = null;
  mcqBox.querySelectorAll('button').forEach((btn) => btn.classList.remove('active'));
};

const renderMcqSelection = () => {
  mcqBox.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.choice as 'korrekt' | 'falsch') === state.choice);
  });
};

const renderGeneratorControls = () => {
  if (!isGeneratorMode(state.mode) || (state.topic !== 'rechnen' && state.topic !== 'trig')) {
    modeControls.classList.add('hidden');
    return;
  }
  modeControls.classList.remove('hidden');
  difficultySelect.value = state.mathDifficulty[state.mode];
  const seedVal = state.mathSeeds[state.mode];
  seedInput.value = seedVal !== null && seedVal !== undefined ? String(seedVal) : '';
};

const renderUnitCircle = () => {
  unitCircle.innerHTML = `
    <svg viewBox="-1.2 -1.2 2.4 2.4" class="unit-circle-svg">
      <circle cx="0" cy="0" r="1" stroke="var(--border)" fill="none" />
      <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="var(--border)" />
      <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="var(--border)" />
      <text x="1.05" y="-0.05" fill="var(--muted)" font-size="0.12">1</text>
      <text x="0.05" y="-1.05" fill="var(--muted)" font-size="0.12">1</text>
    </svg>
  `;
};

const renderHintToggle = () => {
  const show = isTrigMode(state.mode) && (state.mode === 'trigUnitCircle' || state.mode === 'trigEquations' || state.mode === 'trigGraphs');
  hintToggle.classList.toggle('hidden', !show);
  unitCircle.classList.toggle('hidden', !show || !hintCheckbox.checked);
  if (show && hintCheckbox.checked) {
    if (state.mode === 'trigGraphs') {
      renderTrigGraph();
    } else {
      renderUnitCircle();
    }
  }
};

const renderTrigGraph = () => {
  const task = state.task.trigTask;
  if (!task || !task.graphFn) return;
  const { a, b, c, d, type } = task.graphFn as { a: number; b: number; c: number; d: number; type: string };
  const width = 320;
  const height = 200;
  const samples = 200;
  const path: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = (i / samples) * 2 * Math.PI;
    const yBase = type === 'sin' ? Math.sin(b * (x - c)) : Math.cos(b * (x - c));
    const y = a * yBase + d;
    const sx = (x / (2 * Math.PI)) * width;
    const sy = height / 2 - y * (height / 4);
    path.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  unitCircle.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="unit-circle-svg">
      <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="var(--border)" />
      <line x1="0" y1="${height / 2 - d * (height / 4)}" x2="${width}" y2="${height / 2 - d * (height / 4)}" stroke="var(--muted)" stroke-dasharray="4 4" />
      <path d="${path.join(' ')}" fill="none" stroke="var(--primary, #4fd1c5)" stroke-width="2" />
    </svg>
  `;
};

const renderTabs = () => {
  const modes = topicModes[state.topic];
  tabRow.innerHTML = modes
    .map(
      (mode) =>
        `<button class="tab ${state.mode === mode ? 'active' : ''}" data-mode="${mode}">${modeCopy[mode].title}</button>`,
    )
    .join('');
  tabRow.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode as ModeKey;
      if (mode && mode !== state.mode) {
        state.mode = mode;
        state.task = pickTask(mode);
        clearMcqSelection();
        renderTask();
        renderTabs();
      }
    });
  });
};

const renderTask = () => {
  const meta = modeCopy[state.mode];
  modeLabel.textContent = meta.title;
  taskTitle.textContent = meta.description;
  taskDescription.textContent = meta.cta;
  renderGeneratorControls();
  renderHintToggle();
  if (state.mode === 'trigGraphs') {
    hintCheckbox.checked = true;
    renderTrigGraph();
    unitCircle.classList.remove('hidden');
  }
  taskText.textContent = state.task.prompt || state.task.base || '';
  taskHint.textContent = isMathMode(state.mode)
    ? state.task.hint ?? 'Antwort als Zahl/Term eingeben. Brüche als a/b, Seed/Difficulty oben wählbar.'
    : state.task.hint ?? 'Nutze die Buttons oder ASCII-Kürzel für Symbole.';
  feedback.textContent = '';
  feedback.className = 'feedback';
  truthTableContainer.innerHTML = '';
  input.value = '';
  state.choice = null;
  state.vennMask = 0;
  clearSolution();
  const isMcq = state.task.kind === 'mcq';
  const isVennDraw = state.task.kind === 'venn-draw';
  const isVennStatic = state.task.kind === 'venn-static';
  const isConcrete = state.task.kind === 'concrete';
  editor.classList.toggle('hidden', isVennDraw || isMcq);
  mcqBox.classList.toggle('hidden', !isMcq);
  vennInteractive.classList.toggle('hidden', !isVennDraw);
  vennStatic.classList.toggle('hidden', !isVennStatic);
  concreteBox.classList.toggle('hidden', !isConcrete);
  renderMcqSelection();
  if (isVennDraw) {
    setupVennInteractive(state.task.setsCount ?? 2, state.task.expectedMask ?? 0);
  } else if (vennGrid) {
    vennGrid.innerHTML = '';
  }
  if (isVennStatic) {
    setupVennStatic(state.task.setsCount ?? 2, state.task.expectedMask ?? 0);
  } else if (vennStaticGrid) {
    vennStaticGrid.innerHTML = '';
  }
  if (!isVennDraw && !isVennStatic) {
    destroyVennDiagrams();
  }
  if (isConcrete && state.task.setData) {
    const { A, B, op } = state.task.setData;
    const opText = op === 'union' ? '∪' : op === 'inter' ? '∩' : op === 'diff' ? '∖' : 'Δ';
    const promptText = state.task.prompt ?? `A=${formatSet(A)}, B=${formatSet(B)}, berechne A ${opText} B`;
    concretePrompt.textContent = promptText;
    taskText.textContent = '';
  }
  const target = state.task.targetSeconds ?? targetDefaults[state.mode];
  startTimer(target);
  updateProgressViews();
};

const resetTask = () => {
  state.task = pickTask(state.mode);
  renderTask();
};

const markTopicActive = (topic: TopicKey) => {
  document.querySelectorAll<HTMLButtonElement>('.topic-button').forEach((button) => {
    const isActive = button.dataset.topic === topic;
    button.classList.toggle('active', isActive);
  });
};

const updateInputWithNormalization = (result: NormalizationResult) => {
  input.value = result.value;
  input.setSelectionRange(result.cursor, result.cursor);
};

input.addEventListener('input', () => {
  if (isMathMode(state.mode)) return;
  const caret = input.selectionStart ?? input.value.length;
  const normalized = normalizeWithCursor(input.value, caret);
  updateInputWithNormalization(normalized);
});

document.querySelectorAll<HTMLButtonElement>('.symbol-row button').forEach((button) => {
  button.addEventListener('click', () => {
    const symbol = button.dataset.symbol ?? '';
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + symbol + input.value.slice(end);
    const cursorTarget = symbol.endsWith('()') ? start + symbol.length - 1 : start + symbol.length;
    const normalized = isMathMode(state.mode)
      ? { value: next, cursor: cursorTarget }
      : normalizeWithCursor(next, cursorTarget);
    updateInputWithNormalization(normalized);
    input.focus();
  });
});

const applySeedForCurrentMode = () => {
  if (!isGeneratorMode(state.mode)) return;
  const raw = seedInput.value.trim();
  const parsed = raw === '' ? null : Number(raw);
  const valid = parsed === null ? null : Number.isFinite(parsed) ? parsed : null;
  state.mathSeeds[state.mode] = valid;
  generatorSeedState[state.mode] = valid;
  saveMathSeeds(state.mathSeeds);
  state.task = pickTask(state.mode);
  renderTask();
};

difficultySelect.addEventListener('change', () => {
  if (!isGeneratorMode(state.mode)) return;
  const value = (difficultySelect.value as Difficulty) ?? 'easy';
  state.mathDifficulty[state.mode] = value;
  generatorDifficultyState[state.mode] = value;
  saveMathDifficulty(state.mathDifficulty);
  state.task = pickTask(state.mode);
  renderTask();
});

seedApply.addEventListener('click', applySeedForCurrentMode);
seedInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applySeedForCurrentMode();
  }
});

hintCheckbox.addEventListener('change', () => {
  renderHintToggle();
});

document.querySelector<HTMLButtonElement>('#clearButton')?.addEventListener('click', () => {
  input.value = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  truthTableContainer.innerHTML = '';
});

document.querySelector<HTMLButtonElement>('#nextButton')?.addEventListener('click', () => resetTask());
solutionButton.addEventListener('click', () => {
  try {
    let example = '';
    if (!isPredicateMode(state.mode) && !isSetMode(state.mode) && !isMathMode(state.mode)) {
      const baseAst = parseFormula(normalizeSymbols(state.task.base));
      if (state.mode === 'eliminateImp') {
        example = astToString(eliminateImplications(baseAst));
      } else if (state.mode === 'eliminateIff') {
        example = astToString(eliminateIffOnly(baseAst));
      } else if (state.mode === 'negation') {
        example = astToString(negateWithDeMorgan(baseAst));
      } else if (state.mode === 'equivalence') {
        const table = truthTable(baseAst);
        example = `Wahrheitstabelle mit Variablen: ${table.variables.join(', ')}`;
      }
    } else if (isSetMode(state.mode) && state.task.setTask) {
      const setTask = state.task.setTask;
      if (setTask.type === 'symbolic_simplify') {
        example = setTask.solutionExpr;
      } else if (setTask.type === 'subset_check' || setTask.type === 'disjoint_check') {
        example = setTask.answer === 'yes' ? 'Ja, gilt.' : 'Nein, gilt nicht.';
      } else if (setTask.type === 'venn_shade') {
        example = `Term: ${setTask.term}`;
      } else if (setTask.type === 'venn_expr') {
        example = setTask.solutionExprs?.[0] ?? setTask.maskExpr ?? '';
    } else if (setTask.type === 'finite_compute') {
      example = `{${setTask.answer.join(', ')}}`;
    }
  } else if (isMathMode(state.mode) && state.task.mathTask) {
    example = state.task.mathTask.solution;
  } else if (isTrigMode(state.mode) && state.task.trigTask) {
    example = state.task.trigTask.explanation
      ? `${state.task.trigTask.solution} · ${state.task.trigTask.explanation}`
      : state.task.trigTask.solution;
  } else if (state.mode === 'predNegation' || state.mode === 'predRestricted') {
    example = state.task.answers?.[0] ?? '';
  } else if (state.mode === 'predDistribution') {
    example = state.task.correctChoice === 'korrekt' ? 'Äquivalent' : 'Nicht äquivalent';
  }
    solutionBox.textContent = example ? `Beispiel-Umformung: ${example} · Regeln: ${ruleNamesForMode(state.mode)}` : 'Keine Lösung gefunden.';
    solutionBox.className = 'solution visible';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Keine Lösung verfügbar';
    solutionBox.textContent = message;
    solutionBox.className = 'solution';
  }
});

mcqBox.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.choice = (btn.dataset.choice as 'korrekt' | 'falsch') ?? null;
    renderMcqSelection();
  });
});

document.querySelectorAll<HTMLButtonElement>('.topic-button').forEach((button) => {
  button.addEventListener('click', () => {
    const topic = (button.dataset.topic as TopicKey) ?? 'aussagen';
    if (topic !== state.topic) {
      state.topic = topic;
      const modes = topicModes[state.topic];
      state.mode = modes[0];
      state.task = pickTask(state.mode);
      markTopicActive(topic);
      renderTabs();
      renderTask();
    }
  });
});

const renderTruthTable = (rows: ReturnType<typeof truthTableEquality>['table'], labels: { left: string; right: string }) => {
  if (state.mode !== 'equivalence') {
    truthTableContainer.innerHTML = '';
    return;
  }
  const variables = rows[0] ? Object.keys(rows[0].assignment) : [];
  const headers = variables.map((v) => `<th>${v}</th>`).join('');
  const body = rows
    .map((row) => {
      const assignmentCells = variables.map((v) => `<td>${row.assignment[v] ? '1' : '0'}</td>`).join('');
      return `<tr>
        ${assignmentCells}
        <td>${row.left ? '1' : '0'}</td>
        <td>${row.right ? '1' : '0'}</td>
        <td class="${row.matches ? 'ok' : 'bad'}">${row.matches ? '✓' : '✗'}</td>
      </tr>`;
    })
    .join('');
  truthTableContainer.innerHTML = `
    <div class="table-wrapper">
      <div class="table-caption">Wahrheitstabelle</div>
      <table>
        <thead>
          <tr>${headers}<th>${labels.left}</th><th>${labels.right}</th><th></th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
};

const updateProgress = (correct: boolean) => {
  const stats = state.progress[state.mode];
  if (correct) {
    stats.correct += 1;
  } else {
    stats.wrong += 1;
  }
  saveProgress(state.progress);
  updateProgressViews();
};

const finalizeAttempt = (correct: boolean) => {
  const elapsedMs = getElapsedMs();
  stopTimer();
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const target = state.timer.target;
  const hitTarget = !target || elapsedSeconds <= target;
  recordTimeStat(state.mode, elapsedSeconds, hitTarget);
  return `Zeit: ${formatSeconds(elapsedSeconds)}${target ? ` (Ziel: ${formatSeconds(target)})` : ''} ${hitTarget ? '✅' : '❌'}`;
};

const showFeedback = (message: string, correct: boolean) => {
  const timeNote = finalizeAttempt(correct);
  feedback.innerHTML = `${message}<div class="time-note">${timeNote}</div>`;
  feedback.className = `feedback ${correct ? 'success' : 'error'}`;
  updateProgress(correct);
};

const evaluatePredicateFormula = (answers: string[], userInput: string): boolean => {
  const normalizedUser = normalizePredicateAnswer(userInput);
  return answers.some((expected) => normalizePredicateAnswer(expected) === normalizedUser);
};

const evaluateInput = () => {
  const rawInput = input.value.trim();
  const normalizedInput = isMathMode(state.mode) ? rawInput : normalizeSymbols(rawInput);
  if (!isMathMode(state.mode)) {
    input.value = normalizedInput;
  }
  const needsInput = state.task.kind !== 'mcq' && state.task.kind !== 'venn-draw';
  if (needsInput && !normalizedInput) {
    feedback.textContent = 'Bitte gib eine Formel ein.';
    return;
  }
  try {
    if (isMathMode(state.mode) && state.task.mathTask) {
      const result = checkMathAnswer(state.task.mathTask, rawInput);
      showFeedback(result.feedback, result.correct);
      return;
    }

    if (isTrigMode(state.mode) && state.task.trigTask) {
      const result = checkTrigAnswer(state.task.trigTask, rawInput);
      const msgParts = [result.correct ? 'Korrekt!' : `Nicht korrekt. Erwartet: ${state.task.trigTask.solution}`];
      if (result.feedback) {
        msgParts.push(result.feedback);
      } else if (state.task.trigTask.explanation) {
        msgParts.push(state.task.trigTask.explanation);
      }
      showFeedback(msgParts.join(' '), result.correct);
      if (state.task.trigTask.mode === 'trigUnitCircle' && hintCheckbox.checked) {
        renderUnitCircle();
      }
      return;
    }

    if (state.mode === 'equivalence') {
      const userAst = parseFormula(normalizedInput);
      const baseAst = parseFormula(state.task.base);
      const { equal, table } = truthTableEquality(baseAst, userAst);
      renderTruthTable(table, { left: 'Aufgabe', right: 'Deine Formel' });
      const msg = equal
        ? 'Stark! Formeln sind äquivalent (Wahrheitstabelle passt).'
        : 'Nicht äquivalent. Schau dir die Wahrheitstabelle an.';
      showFeedback(msg, equal);
      return;
    }

    if (state.mode === 'eliminateImp') {
      const baseAst = parseFormula(state.task.base);
      const expected = eliminateImplications(baseAst);
      const userAst = parseFormula(normalizedInput);
      const ok = areEquivalent(expected, userAst) && !containsImplication(userAst);
      const msg = ok
        ? 'Korrekt: ⇒ entfernt und äquivalent zur Vorgabe.'
        : containsImplication(userAst)
          ? 'Noch vorhanden: Bitte ⇒ eliminieren.'
          : 'Nicht äquivalent. Prüfe deine Umformung.';
      showFeedback(msg, ok);
      return;
    }

    if (state.mode === 'eliminateIff') {
      const baseAst = parseFormula(state.task.base);
      const expected = eliminateIffOnly(baseAst);
      const userAst = parseFormula(normalizedInput);
      const ok = areEquivalent(expected, userAst) && !containsIff(userAst);
      const msg = ok
        ? 'Korrekt: ⇔ zerlegt und äquivalent zur Vorgabe.'
        : containsIff(userAst)
          ? 'Noch vorhanden: Bitte ⇔ eliminieren.'
          : 'Nicht äquivalent. Prüfe deine Umformung.';
      showFeedback(msg, ok);
      return;
    }

    if (state.mode === 'negation') {
      const baseAst = parseFormula(state.task.base);
      const expected = negateWithDeMorgan(baseAst);
      const userAst = parseFormula(normalizedInput);
      const ok = areEquivalent(expected, userAst);
      const msg = ok ? 'Korrekt negiert mit De Morgan!' : 'Nicht korrekt negiert. Versuch es erneut.';
      showFeedback(msg, ok);
      return;
    }

    if (state.mode === 'predNegation' || state.mode === 'predRestricted') {
      const answers = state.task.answers ?? [];
      const ok = evaluatePredicateFormula(answers, normalizedInput);
      const msg = ok ? 'Korrekt umgeschrieben!' : 'Nicht die erwartete Form. Prüfe die Quantoren-Umformung.';
      showFeedback(msg, ok);
      return;
    }

    if (state.mode === 'predDistribution') {
      if (!state.choice) {
        feedback.textContent = 'Bitte wähle, ob die Umformung äquivalent ist.';
        feedback.className = 'feedback error';
        return;
      }
      const ok = state.choice === state.task.correctChoice;
      const msg = ok ? 'Richtig erkannt!' : 'Falsch – vergleiche die Verteilungsregel.';
      showFeedback(msg, ok);
      return;
    }

    if (isSetMode(state.mode) && state.task.setTask) {
      const setsCount = state.task.setsCount ?? 2;
      const setsArray = setListForCount(setsCount);
      const setTask = state.task.setTask;

      if (setTask.type === 'symbolic_simplify') {
        const userAst = parseSetExpression(normalizedInput);
        const solutionAst = parseSetExpression(setTask.solutionExpr);
        const ok = areSetExprEquivalent(solutionAst, userAst);
        const msg = `${ok ? 'Korrekt umgeformt!' : 'Nicht äquivalent zum Zielausdruck.'}${setTask.explanation ? ` ${setTask.explanation}` : ''}`;
        showFeedback(msg, ok);
        return;
      }

      if (setTask.type === 'subset_check' || setTask.type === 'disjoint_check') {
        if (!state.choice) {
          feedback.textContent = 'Bitte wähle Ja oder Nein.';
          feedback.className = 'feedback error';
          return;
        }
        const userYes = state.choice === 'korrekt' ? 'yes' : 'no';
        const left = parseSetExpression(setTask.leftExpr);
        const right = parseSetExpression(setTask.rightExpr);
        let okExpected = false;
        if (setTask.type === 'subset_check') {
          okExpected = isSubset(left, right);
        } else {
          okExpected = isDisjoint(left, right);
        }
        const ok = (userYes === 'yes') === okExpected;
        const msg = `${ok ? 'Richtig erkannt!' : 'Das stimmt hier nicht.'}${setTask.explanation ? ` ${setTask.explanation}` : ''}`;
        showFeedback(msg, ok);
        return;
      }

      if (setTask.type === 'venn_shade') {
        const expected = state.task.expectedMask ?? safeMaskFromExpr(setTask.term, setsArray) ?? 0;
        const userMask = state.vennMask;
        const ok = userMask === expected;
        const msg = ok ? 'Diagramm stimmt mit dem Term überein!' : 'Schraffur passt nicht zum Term.';
        showFeedback(msg, ok);
        vennInteractiveDiagram?.setExpectedMask?.(expected);
        return;
      }

      if (setTask.type === 'venn_expr') {
        const expected = state.task.expectedMask ?? 0;
        const userMask = safeMaskFromExpr(normalizedInput, setsArray);
        if (userMask === undefined) {
          feedback.textContent = 'Term konnte nicht gelesen werden.';
          feedback.className = 'feedback error';
          return;
        }
        const ok = userMask === expected;
        const msg = ok ? 'Korrekte Beschreibung des Diagramms!' : 'Term markiert andere Bereiche.';
        showFeedback(msg, ok);
        vennStaticDiagram?.setMask?.(userMask);
        vennStaticDiagram?.setExpectedMask?.(expected);
        return;
      }

      if (setTask.type === 'finite_compute' && state.task.setData) {
        const expectedAnswer = state.task.setData.answer ?? computeConcreteOp(state.task.setData);
        const userSet = parseSetLiteral(normalizedInput.replace(/\s+/g, ''));
        const ok = compareSetLiterals(expectedAnswer, userSet);
        const msg = `${ok ? 'Richtig berechnet!' : 'Menge stimmt nicht.'}${setTask.explanation ? ` ${setTask.explanation}` : ''}`;
        showFeedback(msg, ok);
        return;
      }

      if (setTask.type === 'number_set_mc') {
        if (!state.choice) {
          feedback.textContent = 'Bitte wähle Ja oder Nein.';
          feedback.className = 'feedback error';
          return;
        }
        const ok = (state.choice === 'korrekt' ? 'yes' : 'no') === setTask.answer;
        const msg = `${ok ? 'Richtig erkannt!' : 'Das stimmt hier nicht.'}${setTask.explanation ? ` ${setTask.explanation}` : ''}`;
        showFeedback(msg, ok);
        return;
      }

      if (setTask.type === 'interval_convert') {
        const answers = setTask.answers.map(normalizeIntervalString);
        const ok = answers.includes(normalizeIntervalString(normalizedInput));
        const msg = `${ok ? 'Korrekt umgeformt!' : 'Form passt nicht.'}${setTask.explanation ? ` ${setTask.explanation}` : ''}`;
        showFeedback(msg, ok);
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Formel konnte nicht gelesen werden.';
    feedback.textContent = `Fehler: ${message}`;
    feedback.className = 'feedback error';
  }
};

document.querySelector<HTMLButtonElement>('#checkButton')?.addEventListener('click', evaluateInput);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    evaluateInput();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseTimer();
  } else if (!document.hidden && state.timer.start !== 0) {
    resumeTimer();
  }
});

markTopicActive(state.topic);
renderTabs();
renderTask();

if ('serviceWorker' in navigator) {
  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const manifestUrl = `${import.meta.env.BASE_URL}manifest.webmanifest`;
  if (manifestLink) {
    manifestLink.href = manifestUrl;
  }
  const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (appleTouch) {
    appleTouch.href = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  }
  window.addEventListener('load', () => {
    const swPath = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swPath)
      .catch((error) => console.error('Service Worker Registrierung fehlgeschlagen', error));
  });
}
