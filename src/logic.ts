export type ModeKey =
  | 'eliminateImp'
  | 'eliminateIff'
  | 'negation'
  | 'equivalence'
  | 'predNegation'
  | 'predRestricted'
  | 'predDistribution'
  | 'setIdentity'
  | 'setRelation'
  | 'setVennTermToDiagram'
  | 'setVennDiagramToTerm'
  | 'setConcrete'
  | 'setIntervals'
  | 'mathCalc'
  | 'mathPowers'
  | 'mathRoots'
  | 'mathBinom'
  | 'mathQuad'
  | 'mathLogs'
  | 'mathSums'
  | 'trigDegRad'
  | 'trigUnitCircle'
  | 'trigIdentities'
  | 'trigEquations'
  | 'trigGraphs'
  | 'trigFallacies';

type VarNode = { type: 'var'; name: string };
type UnaryNode = { type: 'not'; child: FormulaNode };
type BinaryKind = 'and' | 'or' | 'imp' | 'iff';
type BinaryNode = { type: BinaryKind; left: FormulaNode; right: FormulaNode };
export type FormulaNode = VarNode | UnaryNode | BinaryNode;

export type TruthRow = {
  assignment: Record<string, boolean>;
  left: boolean;
  right: boolean;
  matches: boolean;
};

export type TruthTableRow = {
  assignment: Record<string, boolean>;
  result: boolean;
};

export type TruthTableResult = {
  variables: string[];
  rows: TruthTableRow[];
};

export type NormalizationResult = { value: string; cursor: number };

export const normalizeWithCursor = (raw: string, cursor: number): NormalizationResult => {
  let normalized = '';
  let newCursor = cursor;
  let i = 0;
  const lower = raw.toLowerCase();

  const applyReplacement = (replacement: string, consumed: number) => {
    normalized += replacement;
    if (i < cursor) {
      newCursor += replacement.length - consumed;
    }
    i += consumed;
  };

  while (i < raw.length) {
    const slice3 = raw.slice(i, i + 3);
    const slice2 = raw.slice(i, i + 2);
    const ahead6 = lower.slice(i, i + 6);
    const ahead5 = lower.slice(i, i + 5);
    const ahead4 = lower.slice(i, i + 4);
    const ahead3 = lower.slice(i, i + 3);
    const ahead2 = lower.slice(i, i + 2);
    if (ahead6 === 'forall') {
      applyReplacement('∀', 6);
      continue;
    }
    if (ahead6 === 'exists') {
      applyReplacement('∃', 6);
      continue;
    }
    if (ahead3 === 'pi') {
      applyReplacement('π', 2);
      continue;
    }
    if (ahead4 === 'sqrt') {
      applyReplacement('√', 4);
      continue;
    }
    if (ahead3 === 'deg') {
      applyReplacement('°', 3);
      continue;
    }
    if (ahead2 === 'in') {
      const before = raw[i - 1];
      const after = raw[i + 2];
      const boundaryBefore = !before || !/[a-zA-Z]/.test(before);
      const boundaryAfter = !after || !/[a-zA-Z]/.test(after);
      if (boundaryBefore && boundaryAfter) {
        applyReplacement('∈', 2);
        continue;
      }
    }
    if (slice3 === '<->') {
      applyReplacement('⇔', 3);
      continue;
    }
    if (slice2 === '->') {
      applyReplacement('⇒', 2);
      continue;
    }
    if (ahead4 === 'cup ' || ahead4 === 'cup' || ahead4 === 'cap ') {
      const replacement = ahead4.startsWith('cap') ? '∩' : '∪';
      applyReplacement(replacement, ahead4.trim().length);
      continue;
    }
    if (ahead6 === 'union') {
      applyReplacement('∪', 5);
      continue;
    }
    const ahead8 = lower.slice(i, i + 8);
    if (ahead5 === 'delta') {
      applyReplacement('Δ', 5);
      continue;
    }
    if (ahead5 === 'empty') {
      applyReplacement('∅', 5);
      continue;
    }
    if (ahead5 === 'omega') {
      applyReplacement('Ω', 5);
      continue;
    }
    if (ahead3 === 'inf') {
      applyReplacement('∞', 3);
      continue;
    }
    if (ahead5 === 'infty') {
      applyReplacement('∞', 5);
      continue;
    }
    if (ahead8 === 'intersect') {
      applyReplacement('∩', 8);
      continue;
    }
    const char = raw[i];
    switch (char) {
      case '!':
        applyReplacement('¬', 1);
        break;
      case '&':
        applyReplacement('∧', 1);
        break;
      case '|':
        applyReplacement('∨', 1);
        break;
      case '\\':
        applyReplacement('∖', 1);
        break;
      case '-': {
        if (raw[i + 1] === '>') {
          normalized += char;
          i += 1;
          break;
        }
        let prevIdx = i - 1;
        while (prevIdx >= 0 && /\s/.test(raw[prevIdx])) prevIdx -= 1;
        let nextIdx = i + 1;
        while (nextIdx < raw.length && /\s/.test(raw[nextIdx])) nextIdx += 1;
        const prevChar = prevIdx >= 0 ? raw[prevIdx] : '';
        const nextChar = nextIdx < raw.length ? raw[nextIdx] : '';
        const prevSetLike = /[A-C\)\]]/.test(prevChar);
        const nextSetLike = /[A-CΩ∅U\(]/.test(nextChar);
        if (prevSetLike && nextSetLike) {
          applyReplacement('∖', 1);
        } else {
          normalized += char;
          i += 1;
        }
        break;
      }
      case '\'':
        applyReplacement('^c', 1);
        break;
      default: {
        const next = raw[i + 1];
        const prev = raw[i - 1];
        if (char === 'U' && prev && /[A-Za-z0-9\)]/.test(prev) && next && /[A-Za-z0-9\(]/.test(next)) {
          applyReplacement('∪', 1);
        } else if (char === 'U' && (!next || /\s|\)|\(/.test(next))) {
          applyReplacement('Ω', 1);
        } else {
          normalized += char;
          i += 1;
        }
        break;
      }
    }
  }

  const clampedCursor = Math.max(0, Math.min(normalized.length, newCursor));
  return { value: normalized, cursor: clampedCursor };
};

export const normalizeSymbols = (raw: string): string => normalizeWithCursor(raw, raw.length).value;

class FormulaParser {
  private index = 0;

  constructor(private readonly input: string) {}

  parse(): FormulaNode {
    const node = this.parseIff();
    this.skipWhitespace();
    if (this.index < this.input.length) {
      throw new Error('Unerwartete Eingabe nach Formel');
    }
    return node;
  }

  private parseIff(): FormulaNode {
    let left = this.parseImp();
    while (this.match('⇔')) {
      const right = this.parseImp();
      left = { type: 'iff', left, right };
    }
    return left;
  }

  private parseImp(): FormulaNode {
    let left = this.parseOr();
    while (this.match('⇒')) {
      const right = this.parseOr();
      left = { type: 'imp', left, right };
    }
    return left;
  }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.match('∨')) {
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): FormulaNode {
    let left = this.parseNot();
    while (this.match('∧')) {
      const right = this.parseNot();
      left = { type: 'and', left, right };
    }
    return left;
  }

  private parseNot(): FormulaNode {
    if (this.match('¬')) {
      const child = this.parseNot();
      return { type: 'not', child };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    this.skipWhitespace();
    const char = this.input[this.index];
    if (!char) {
      throw new Error('Formel ist unvollständig');
    }
    if (char === '(') {
      this.index += 1;
      const expr = this.parseIff();
      if (!this.match(')')) {
        throw new Error('Schließende Klammer fehlt');
      }
      return expr;
    }
    if (/[A-Z]/.test(char)) {
      this.index += 1;
      return { type: 'var', name: char };
    }
    throw new Error(`Unerwartetes Symbol "${char}"`);
  }

  private match(symbol: string): boolean {
    this.skipWhitespace();
    if (this.input.startsWith(symbol, this.index)) {
      this.index += symbol.length;
      this.skipWhitespace();
      return true;
    }
    return false;
  }

  private skipWhitespace() {
    while (this.index < this.input.length && /\s/.test(this.input[this.index])) {
      this.index += 1;
    }
  }
}

export const parseFormula = (input: string): FormulaNode => {
  const normalized = normalizeSymbols(input.trim());
  const parser = new FormulaParser(normalized);
  return parser.parse();
};

const toAst = (formula: FormulaNode | string): FormulaNode => (typeof formula === 'string' ? parseFormula(formula) : formula);

export const evaluateFormula = (node: FormulaNode, assignment: Record<string, boolean>): boolean => {
  switch (node.type) {
    case 'var':
      return assignment[node.name] ?? false;
    case 'not':
      return !evaluateFormula(node.child, assignment);
    case 'and':
      return evaluateFormula(node.left, assignment) && evaluateFormula(node.right, assignment);
    case 'or':
      return evaluateFormula(node.left, assignment) || evaluateFormula(node.right, assignment);
    case 'imp':
      return !evaluateFormula(node.left, assignment) || evaluateFormula(node.right, assignment);
    case 'iff':
      return evaluateFormula(node.left, assignment) === evaluateFormula(node.right, assignment);
    default:
      return false;
  }
};

export const collectVariables = (node: FormulaNode, into = new Set<string>()): Set<string> => {
  switch (node.type) {
    case 'var':
      into.add(node.name);
      break;
    case 'not':
      collectVariables(node.child, into);
      break;
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      collectVariables(node.left, into);
      collectVariables(node.right, into);
      break;
  }
  return into;
};

const generateAssignments = (variables: string[]): Record<string, boolean>[] => {
  const total = Math.max(1, 1 << variables.length);
  const assignments: Record<string, boolean>[] = [];
  for (let i = 0; i < total; i += 1) {
    const assignment: Record<string, boolean> = {};
    variables.forEach((variable, index) => {
      assignment[variable] = (i & (1 << (variables.length - index - 1))) !== 0;
    });
    assignments.push(assignment);
  }
  return assignments;
};

export const containsImplication = (node: FormulaNode): boolean => {
  if (node.type === 'imp' || node.type === 'iff') {
    return true;
  }
  if (node.type === 'not') {
    return containsImplication(node.child);
  }
  if (node.type === 'and' || node.type === 'or') {
    return containsImplication(node.left) || containsImplication(node.right);
  }
  return false;
};

export const containsIff = (node: FormulaNode): boolean => {
  if (node.type === 'iff') return true;
  if (node.type === 'not') return containsIff(node.child);
  if (node.type === 'and' || node.type === 'or' || node.type === 'imp') {
    return containsIff(node.left) || containsIff(node.right);
  }
  return false;
};

export const eliminateImplications = (node: FormulaNode): FormulaNode => {
  switch (node.type) {
    case 'var':
      return node;
    case 'not':
      return { type: 'not', child: eliminateImplications(node.child) };
    case 'and':
    case 'or':
      return { ...node, left: eliminateImplications(node.left), right: eliminateImplications(node.right) };
    case 'imp': {
      const left = eliminateImplications(node.left);
      const right = eliminateImplications(node.right);
      return { type: 'or', left: { type: 'not', child: left }, right };
    }
    case 'iff': {
      const left = eliminateImplications(node.left);
      const right = eliminateImplications(node.right);
      const leftImp = eliminateImplications({ type: 'imp', left, right });
      const rightImp = eliminateImplications({ type: 'imp', left: right, right: left });
      return { type: 'and', left: leftImp, right: rightImp };
    }
    default:
      return node;
  }
};

export const eliminateIffOnly = (node: FormulaNode): FormulaNode => {
  switch (node.type) {
    case 'var':
      return node;
    case 'not':
      return { type: 'not', child: eliminateIffOnly(node.child) };
    case 'and':
    case 'or':
    case 'imp':
      return { ...node, left: eliminateIffOnly(node.left), right: eliminateIffOnly(node.right) };
    case 'iff': {
      const left = eliminateIffOnly(node.left);
      const right = eliminateIffOnly(node.right);
      return {
        type: 'and',
        left: { type: 'imp', left, right },
        right: { type: 'imp', left: right, right: left },
      };
    }
    default:
      return node;
  }
};

const pushNegation = (node: FormulaNode, negate: boolean): FormulaNode => {
  if (node.type === 'var') {
    return negate ? { type: 'not', child: node } : node;
  }
  if (node.type === 'not') {
    return pushNegation(node.child, !negate);
  }
  if (node.type === 'and' || node.type === 'or' || node.type === 'imp' || node.type === 'iff') {
    const cleared = node.type === 'imp' || node.type === 'iff' ? eliminateImplications(node) : node;
    if (cleared.type === 'and') {
      return negate
        ? { type: 'or', left: pushNegation(cleared.left, true), right: pushNegation(cleared.right, true) }
        : { type: 'and', left: pushNegation(cleared.left, false), right: pushNegation(cleared.right, false) };
    }
    if (cleared.type === 'or') {
      return negate
        ? { type: 'and', left: pushNegation(cleared.left, true), right: pushNegation(cleared.right, true) }
        : { type: 'or', left: pushNegation(cleared.left, false), right: pushNegation(cleared.right, false) };
    }
  }
  return node;
};

export const negateWithDeMorgan = (node: FormulaNode): FormulaNode => pushNegation(node, true);

const precedence: Record<Exclude<BinaryKind, 'imp' | 'iff'>, number> = {
  or: 1,
  and: 2,
};

const formatNode = (node: FormulaNode, parentPrecedence = 0): string => {
  switch (node.type) {
    case 'var':
      return node.name;
    case 'not': {
      const childStr = formatNode(node.child, 3);
      return `¬${childStr}`;
    }
    case 'and':
    case 'or': {
      const current = precedence[node.type];
      const left = formatNode(node.left, current);
      const right = formatNode(node.right, current);
      const combined = `${left} ${node.type === 'and' ? '∧' : '∨'} ${right}`;
      return current < parentPrecedence ? `(${combined})` : combined;
    }
    case 'imp':
      return `(${formatNode(node.left)} ⇒ ${formatNode(node.right)})`;
    case 'iff':
      return `(${formatNode(node.left)} ⇔ ${formatNode(node.right)})`;
    default:
      return '';
  }
};

export const astToString = (node: FormulaNode): string => formatNode(node);

export const truthTable = (formula: FormulaNode | string): TruthTableResult => {
  const ast = toAst(formula);
  const variables = Array.from(collectVariables(ast)).sort();
  const rows = generateAssignments(variables).map((assignment) => ({
    assignment,
    result: evaluateFormula(ast, assignment),
  }));
  return { variables, rows };
};

export const truthTableEquality = (left: FormulaNode, right: FormulaNode): { equal: boolean; table: TruthRow[] } => {
  const variables = Array.from(new Set([...collectVariables(left), ...collectVariables(right)])).sort();
  const rows: TruthRow[] = generateAssignments(variables).map((assignment) => {
    const leftValue = evaluateFormula(left, assignment);
    const rightValue = evaluateFormula(right, assignment);
    return {
      assignment,
      left: leftValue,
      right: rightValue,
      matches: leftValue === rightValue,
    };
  });

  return { equal: rows.every((row) => row.matches), table: rows };
};

export const areEquivalent = (left: FormulaNode | string, right: FormulaNode | string): boolean => {
  const leftAst = toAst(left);
  const rightAst = toAst(right);
  const variables = Array.from(new Set([...collectVariables(leftAst), ...collectVariables(rightAst)])).sort();
  return generateAssignments(variables).every((assignment) => {
    const leftValue = evaluateFormula(leftAst, assignment);
    const rightValue = evaluateFormula(rightAst, assignment);
    return leftValue === rightValue;
  });
};
