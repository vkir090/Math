export type ModeKey = 'eliminate' | 'negation' | 'equivalence';

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

export type NormalizationResult = { value: string; cursor: number };

export const normalizeWithCursor = (raw: string, cursor: number): NormalizationResult => {
  let normalized = '';
  let newCursor = cursor;
  let i = 0;

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
    if (slice3 === '<->') {
      applyReplacement('⇔', 3);
      continue;
    }
    if (slice2 === '->') {
      applyReplacement('⇒', 2);
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
      default:
        normalized += char;
        i += 1;
        break;
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

export const truthTableEquality = (left: FormulaNode, right: FormulaNode): { equal: boolean; table: TruthRow[] } => {
  const variables = Array.from(new Set([...collectVariables(left), ...collectVariables(right)])).sort();
  const rows: TruthRow[] = [];
  const total = Math.max(1, 1 << variables.length);

  for (let i = 0; i < total; i += 1) {
    const assignment: Record<string, boolean> = {};
    variables.forEach((variable, index) => {
      assignment[variable] = (i & (1 << (variables.length - index - 1))) !== 0;
    });
    const leftValue = evaluateFormula(left, assignment);
    const rightValue = evaluateFormula(right, assignment);
    rows.push({
      assignment,
      left: leftValue,
      right: rightValue,
      matches: leftValue === rightValue,
    });
  }

  return { equal: rows.every((row) => row.matches), table: rows };
};
