import { normalizeSymbols } from './logic';

export type Region = 'Aonly' | 'Bonly' | 'AB' | 'outside';

export type SetVarNode = { type: 'var'; name: 'A' | 'B' | 'C' };
export type SetConstNode = { type: 'const'; value: boolean };
export type SetUnaryNode = { type: 'not'; child: SetNode };
export type SetBinaryKind = 'union' | 'inter' | 'diff' | 'sym';
export type SetBinaryNode = { type: SetBinaryKind; left: SetNode; right: SetNode };
export type SetNode = SetVarNode | SetConstNode | SetUnaryNode | SetBinaryNode;

const isLetter = (char: string) => /[A-Za-z]/.test(char);

export const normalizeSetInput = (input: string) => normalizeSymbols(input).replace(/\s+/g, '');

class SetParser {
  private index = 0;
  constructor(private readonly input: string) {}

  parse(): SetNode {
    const node = this.parseUnion();
    this.skipWs();
    if (this.index < this.input.length) {
      throw new Error('Unerwartete Eingabe nach Mengenformel');
    }
    return node;
  }

  private parseUnion(): SetNode {
    let left = this.parseDiff();
    while (true) {
      let op: SetBinaryKind | null = null;
      if (this.match('∪')) {
        op = 'union';
      } else if (this.match('Δ')) {
        op = 'sym';
      }
      if (!op) break;
      const right = this.parseDiff();
      left = { type: op, left, right } as SetBinaryNode;
    }
    return left;
  }

  private parseDiff(): SetNode {
    let left = this.parseInter();
    while (this.match('∖') || this.match('\\')) {
      const right = this.parseInter();
      left = { type: 'diff', left, right };
    }
    return left;
  }

  private parseInter(): SetNode {
    let left = this.parseSuffix();
    while (this.match('∩')) {
      const right = this.parseSuffix();
      left = { type: 'inter', left, right };
    }
    return left;
  }

  private parseSuffix(): SetNode {
    let node = this.parsePrimary();
    while (this.peek('^c')) {
      this.index += 2;
      node = { type: 'not', child: node };
    }
    return node;
  }

  private parsePrimary(): SetNode {
    this.skipWs();
    const char = this.input[this.index];
    if (!char) throw new Error('Formel unvollständig');
    if (char === '(') {
      this.index += 1;
      const expr = this.parseUnion();
      if (!this.match(')')) throw new Error('Schließende Klammer fehlt');
      return expr;
    }
    if (char === '∅') {
      this.index += 1;
      return { type: 'const', value: false };
    }
    if (char === 'Ω') {
      this.index += 1;
      return { type: 'const', value: true };
    }
    if (isLetter(char)) {
      const name = char.toUpperCase();
      if (name === 'U') {
        this.index += 1;
        return { type: 'const', value: true };
      }
      if (name === 'A' || name === 'B' || name === 'C') {
        this.index += 1;
        return { type: 'var', name } as SetVarNode;
      }
    }
    throw new Error(`Unerwartetes Symbol "${char}"`);
  }

  private match(symbol: string): boolean {
    this.skipWs();
    if (this.input.startsWith(symbol, this.index)) {
      this.index += symbol.length;
      this.skipWs();
      return true;
    }
    return false;
  }

  private peek(symbol: string): boolean {
    this.skipWs();
    return this.input.startsWith(symbol, this.index);
  }

  private skipWs() {
    while (this.index < this.input.length && /\s/.test(this.input[this.index])) {
      this.index += 1;
    }
  }
}

export const parseSetExpression = (input: string): SetNode => {
  const normalized = normalizeSymbols(input.trim());
  const parser = new SetParser(normalized);
  return parser.parse();
};

export const evalSetExpr = (node: SetNode, assignment: Record<'A' | 'B' | 'C', boolean>): boolean => {
  switch (node.type) {
    case 'var':
      return assignment[node.name] ?? false;
    case 'const':
      return node.value;
    case 'not':
      return !evalSetExpr(node.child, assignment);
    case 'union':
      return evalSetExpr(node.left, assignment) || evalSetExpr(node.right, assignment);
    case 'inter':
      return evalSetExpr(node.left, assignment) && evalSetExpr(node.right, assignment);
    case 'diff':
      return evalSetExpr(node.left, assignment) && !evalSetExpr(node.right, assignment);
    case 'sym': {
      const l = evalSetExpr(node.left, assignment);
      const r = evalSetExpr(node.right, assignment);
      return (l || r) && !(l && r);
    }
    default:
      return false;
  }
};

const collectSetVars = (node: SetNode, vars = new Set<'A' | 'B' | 'C'>()): Set<'A' | 'B' | 'C'> => {
  if (node.type === 'var') {
    vars.add(node.name);
    return vars;
  }
  if (node.type === 'not') {
    collectSetVars(node.child, vars);
  }
  if (node.type === 'union' || node.type === 'inter' || node.type === 'diff' || node.type === 'sym') {
    collectSetVars(node.left, vars);
    collectSetVars(node.right, vars);
  }
  return vars;
};

type SetTruthRow = { assignment: Record<'A' | 'B' | 'C', boolean>; value: boolean };

export const truthTableSet = (node: SetNode, vars?: ('A' | 'B' | 'C')[]): SetTruthRow[] => {
  const used = vars ?? Array.from(collectSetVars(node)).sort();
  const rows: SetTruthRow[] = [];
  const total = Math.max(1, 1 << used.length);
  for (let i = 0; i < total; i += 1) {
    const assignment: Record<'A' | 'B' | 'C', boolean> = { A: false, B: false, C: false };
    used.forEach((v, idx) => {
      assignment[v] = (i & (1 << (used.length - idx - 1))) !== 0;
    });
    rows.push({ assignment, value: evalSetExpr(node, assignment) });
  }
  return rows;
};

export const areSetExprEquivalent = (left: SetNode, right: SetNode): boolean => {
  const vars = Array.from(new Set([...collectSetVars(left), ...collectSetVars(right)])).sort();
  const rowsLeft = truthTableSet(left, vars);
  return rowsLeft.every((row) => evalSetExpr(right, row.assignment) === row.value);
};

export const isSubset = (left: SetNode, right: SetNode): boolean => {
  const vars = Array.from(new Set([...collectSetVars(left), ...collectSetVars(right)])).sort();
  return truthTableSet(left, vars).every((row) => !row.value || evalSetExpr(right, row.assignment));
};

export const isDisjoint = (left: SetNode, right: SetNode): boolean => {
  const vars = Array.from(new Set([...collectSetVars(left), ...collectSetVars(right)])).sort();
  return truthTableSet(left, vars).every((row) => !(row.value && evalSetExpr(right, row.assignment)));
};

export const regionsForExpression = (input: string): Region[] => {
  const ast = parseSetExpression(input);
  const regions: Region[] = [];
  const combos: { region: Region; assignment: Record<'A' | 'B' | 'C', boolean> }[] = [
    { region: 'AB', assignment: { A: true, B: true, C: false } },
    { region: 'Aonly', assignment: { A: true, B: false, C: false } },
    { region: 'Bonly', assignment: { A: false, B: true, C: false } },
    { region: 'outside', assignment: { A: false, B: false, C: false } },
  ];
  combos.forEach((combo) => {
    if (evalSetExpr(ast, combo.assignment)) {
      regions.push(combo.region);
    }
  });
  return regions;
};

export const regionsEqual = (a: Region[], b: Region[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((r) => sa.has(r));
};

const assignmentsForSets = (sets: ('A' | 'B' | 'C')[]): Record<'A' | 'B' | 'C', boolean>[] => {
  const total = 1 << sets.length;
  const base: Record<'A' | 'B' | 'C', boolean> = { A: false, B: false, C: false };
  const result: Record<'A' | 'B' | 'C', boolean>[] = [];
  for (let i = 0; i < total; i += 1) {
    const assignment = { ...base };
    sets.forEach((set, idx) => {
      assignment[set] = (i & (1 << (sets.length - idx - 1))) !== 0;
    });
    result.push(assignment);
  }
  return result;
};

export const computeRegionMaskFromExpr = (node: SetNode, sets: ('A' | 'B' | 'C')[]): number => {
  const assignments = assignmentsForSets(sets);
  let mask = 0;
  assignments.forEach((assignment, idx) => {
    if (evalSetExpr(node, assignment)) {
      mask |= 1 << idx;
    }
  });
  return mask;
};
