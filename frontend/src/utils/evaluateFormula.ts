/**
 * Safely evaluate a simple arithmetic formula with variable substitution.
 * Supports: +, -, *, /, parentheses, unary +/- and numeric literals.
 * Does NOT use eval / Function — required under CSP without 'unsafe-eval'.
 */
export function evaluateFormula(
  formula: string,
  context: Record<string, number>
): number | null {
  try {
    let expr = formula.trim();
    if (!expr) return null;

    // Substitute known variables (longest names first to avoid partial matches)
    const keys = Object.keys(context).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      const value = Number(context[key]);
      const safe = Number.isFinite(value) ? value : 0;
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), `(${safe})`);
    }

    // Any leftover identifier means an unknown variable
    if (/[a-zA-Z_]/.test(expr)) return null;

    // Only allow arithmetic characters after substitution
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;

    const tokens = tokenize(expr);
    if (tokens.length === 0) return null;

    const parser = new Parser(tokens);
    const result = parser.parseExpression();
    if (!parser.atEnd()) return null;

    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Math.round(result);
    }
    return null;
  } catch {
    return null;
  }
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      const value = Number(num);
      if (!Number.isFinite(value)) throw new Error('Invalid number');
      tokens.push({ type: 'number', value });
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error('Unexpected end of expression');
    this.pos++;
    return t;
  }

  parseExpression(): number {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      this.consume();
      const right = this.parseTerm();
      left = t.value === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op' || (t.value !== '*' && t.value !== '/')) break;
      this.consume();
      const right = this.parseUnary();
      if (t.value === '/') {
        if (right === 0) throw new Error('Division by zero');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
      this.consume();
      const value = this.parseUnary();
      return t.value === '-' ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.consume();
    if (t.type === 'number') return t.value;
    if (t.type === 'lparen') {
      const value = this.parseExpression();
      const close = this.consume();
      if (close.type !== 'rparen') throw new Error('Expected closing parenthesis');
      return value;
    }
    throw new Error('Expected number or parenthesis');
  }
}
