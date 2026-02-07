import React, { useState, useMemo, useRef, useCallback } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import './BitwiseCalc.css';

// ============================================================
// Types
// ============================================================

type BitWidth = 8 | 16 | 32 | 64;

interface Token {
  type: 'number' | 'operator' | 'lparen' | 'rparen';
  value: string;
  start: number;
  end: number;
}

interface LiteralNode {
  kind: 'literal';
  raw: string;
  value: bigint;
  start: number;
  end: number;
}

interface BinaryNode {
  kind: 'binary';
  op: string;
  opSymbol: string;
  left: ASTNode;
  right: ASTNode;
}

interface UnaryNode {
  kind: 'unary';
  op: string;
  opSymbol: string;
  operand: ASTNode;
}

type ASTNode = LiteralNode | BinaryNode | UnaryNode;

interface EvalStep {
  label: string;
  operandA: bigint;
  operandB?: bigint;
  operandALabel: string;
  operandBLabel?: string;
  result: bigint;
  op: string;
  opSymbol: string;
  isUnary: boolean;
  leftNode?: ASTNode;
  rightNode?: ASTNode;
  operandNode?: ASTNode;
}

interface EvalResult {
  value: bigint;
  steps: EvalStep[];
  truncated: boolean;
}

interface ParseResult {
  ast: ASTNode;
  result: EvalResult;
}

// ============================================================
// Tokenizer
// ============================================================

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // Three-char operators first
    if (i + 2 < input.length && input.slice(i, i + 3) === '>>>') {
      tokens.push({ type: 'operator', value: '>>>', start: i, end: i + 3 });
      i += 3;
      continue;
    }

    // Two-char operators
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2);
      if (two === '<<' || two === '>>') {
        tokens.push({ type: 'operator', value: two, start: i, end: i + 2 });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if ('&|^~'.includes(input[i])) {
      tokens.push({ type: 'operator', value: input[i], start: i, end: i + 1 });
      i++;
      continue;
    }

    // Parentheses
    if (input[i] === '(') {
      tokens.push({ type: 'lparen', value: '(', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'rparen', value: ')', start: i, end: i + 1 });
      i++;
      continue;
    }

    // Numbers: 0x, 0b, 0o prefixed, or decimal (including negative)
    if (/[0-9]/.test(input[i]) || (input[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'operator' || tokens[tokens.length - 1].type === 'lparen'))) {
      const start = i;
      if (input[i] === '-') i++;

      if (i + 1 < input.length && input[i] === '0' && /[xXbBoO]/.test(input[i + 1])) {
        const prefix = input[i + 1].toLowerCase();
        i += 2;
        if (prefix === 'x') {
          while (i < input.length && /[0-9a-fA-F_]/.test(input[i])) i++;
        } else if (prefix === 'b') {
          while (i < input.length && /[01_]/.test(input[i])) i++;
        } else if (prefix === 'o') {
          while (i < input.length && /[0-7_]/.test(input[i])) i++;
        }
      } else {
        while (i < input.length && /[0-9_]/.test(input[i])) i++;
      }

      const raw = input.slice(start, i);
      tokens.push({ type: 'number', value: raw, start, end: i });
      continue;
    }

    throw new Error(`Unexpected character '${input[i]}' at position ${i}`);
  }

  return tokens;
}

// ============================================================
// Parser — recursive descent with precedence
// ============================================================

function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  function peek(): Token | null {
    return pos < tokens.length ? tokens[pos] : null;
  }

  function consume(): Token {
    return tokens[pos++];
  }

  // Precedence levels (lowest to highest):
  // 1. |
  // 2. ^
  // 3. &
  // 4. << >> >>>
  // 5. ~ (unary prefix)
  // 6. literals / parenthesized

  function parseOr(): ASTNode {
    let left = parseXor();
    while (peek()?.type === 'operator' && peek()!.value === '|') {
      consume();
      const right = parseXor();
      left = { kind: 'binary', op: 'or', opSymbol: '|', left, right };
    }
    return left;
  }

  function parseXor(): ASTNode {
    let left = parseAnd();
    while (peek()?.type === 'operator' && peek()!.value === '^') {
      consume();
      const right = parseAnd();
      left = { kind: 'binary', op: 'xor', opSymbol: '^', left, right };
    }
    return left;
  }

  function parseAnd(): ASTNode {
    let left = parseShift();
    while (peek()?.type === 'operator' && peek()!.value === '&') {
      consume();
      const right = parseShift();
      left = { kind: 'binary', op: 'and', opSymbol: '&', left, right };
    }
    return left;
  }

  function parseShift(): ASTNode {
    let left = parseUnary();
    while (peek()?.type === 'operator' && (peek()!.value === '<<' || peek()!.value === '>>' || peek()!.value === '>>>')) {
      const op = consume();
      const right = parseUnary();
      const opName = op.value === '<<' ? 'shl' : op.value === '>>' ? 'sar' : 'shr';
      left = { kind: 'binary', op: opName, opSymbol: op.value, left, right };
    }
    return left;
  }

  function parseUnary(): ASTNode {
    if (peek()?.type === 'operator' && peek()!.value === '~') {
      consume();
      const operand = parseUnary();
      return { kind: 'unary', op: 'not', opSymbol: '~', operand };
    }
    return parsePrimary();
  }

  function parsePrimary(): ASTNode {
    const token = peek();

    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'lparen') {
      consume();
      const node = parseOr();
      const close = peek();
      if (!close || close.type !== 'rparen') {
        throw new Error('Expected closing parenthesis');
      }
      consume();
      return node;
    }

    if (token.type === 'number') {
      consume();
      const raw = token.value.replace(/_/g, '');
      let value: bigint;
      try {
        if (raw.startsWith('-')) {
          value = BigInt(raw);
        } else {
          value = BigInt(raw);
        }
      } catch {
        throw new Error(`Invalid number: ${token.value}`);
      }
      return { kind: 'literal', raw: token.value, value, start: token.start, end: token.end };
    }

    throw new Error(`Unexpected token '${token.value}' at position ${token.start}`);
  }

  const ast = parseOr();

  if (pos < tokens.length) {
    throw new Error(`Unexpected token '${tokens[pos].value}' at position ${tokens[pos].start}`);
  }

  return ast;
}

// ============================================================
// Evaluator
// ============================================================

function applyMask(value: bigint, bitWidth: BitWidth): bigint {
  const mask = (1n << BigInt(bitWidth)) - 1n;
  return value & mask;
}

function signedValue(unsigned: bigint, bitWidth: BitWidth): bigint {
  const signBit = 1n << BigInt(bitWidth - 1);
  if (unsigned >= signBit) {
    return unsigned - (1n << BigInt(bitWidth));
  }
  return unsigned;
}

function nodeLabel(node: ASTNode): string {
  if (node.kind === 'literal') return node.raw;
  if (node.kind === 'unary') return `~${nodeLabel(node.operand)}`;
  if (node.kind === 'binary') return `${nodeLabel(node.left)} ${node.opSymbol} ${nodeLabel(node.right)}`;
  return '?';
}

function evaluate(node: ASTNode, bitWidth: BitWidth): EvalResult {
  const steps: EvalStep[] = [];
  let truncated = false;

  function walk(n: ASTNode): bigint {
    if (n.kind === 'literal') {
      const raw = n.value < 0n ? applyMask(n.value, bitWidth) : applyMask(n.value, bitWidth);
      if (n.value >= 0n && n.value !== raw) truncated = true;
      return raw;
    }

    if (n.kind === 'unary') {
      const operandVal = walk(n.operand);
      const mask = (1n << BigInt(bitWidth)) - 1n;
      const result = applyMask(~operandVal & mask, bitWidth);
      steps.push({
        label: `~${nodeLabel(n.operand)}`,
        operandA: operandVal,
        operandALabel: nodeLabel(n.operand),
        result,
        op: n.op,
        opSymbol: n.opSymbol,
        isUnary: true,
        operandNode: n.operand,
      });
      return result;
    }

    // Binary
    const leftVal = walk(n.left);
    const rightVal = walk(n.right);
    let result: bigint;

    switch (n.op) {
      case 'and': result = leftVal & rightVal; break;
      case 'or': result = leftVal | rightVal; break;
      case 'xor': result = leftVal ^ rightVal; break;
      case 'shl': result = applyMask(leftVal << rightVal, bitWidth); break;
      case 'sar': {
        // Arithmetic shift right (sign-extending)
        const signed = signedValue(leftVal, bitWidth);
        const shifted = signed >> rightVal;
        result = applyMask(shifted, bitWidth);
        break;
      }
      case 'shr': result = leftVal >> rightVal; break;
      default: result = 0n;
    }

    result = applyMask(result, bitWidth);

    steps.push({
      label: `${nodeLabel(n.left)} ${n.opSymbol} ${nodeLabel(n.right)}`,
      operandA: leftVal,
      operandB: rightVal,
      operandALabel: nodeLabel(n.left),
      operandBLabel: nodeLabel(n.right),
      result,
      op: n.op,
      opSymbol: n.opSymbol,
      isUnary: false,
      leftNode: n.left,
      rightNode: n.right,
    });

    return result;
  }

  const value = walk(node);
  return { value, steps, truncated };
}

// ============================================================
// Formatting utilities
// ============================================================

function formatHex(value: bigint, bitWidth: BitWidth): string {
  return '0x' + value.toString(16).toUpperCase().padStart(bitWidth / 4, '0');
}

function formatBin(value: bigint, bitWidth: BitWidth): string {
  return '0b' + value.toString(2).padStart(bitWidth, '0');
}

function formatOct(value: bigint, _bitWidth: BitWidth): string {
  return '0o' + value.toString(8);
}

function formatDecUnsigned(value: bigint): string {
  return addCommas(value.toString());
}

function formatDecSigned(value: bigint, bitWidth: BitWidth): string {
  return addCommas(signedValue(value, bitWidth).toString());
}

function addCommas(str: string): string {
  const isNeg = str.startsWith('-');
  const abs = isNeg ? str.slice(1) : str;
  const formatted = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return isNeg ? '-' + formatted : formatted;
}

function updateExpressionLiteral(expression: string, node: LiteralNode, newValue: bigint): string {
  const before = expression.slice(0, node.start);
  const after = expression.slice(node.end);
  // Determine format from original raw
  const raw = node.raw.toLowerCase();
  let newRaw: string;
  if (raw.startsWith('0x') || raw.startsWith('-0x')) {
    newRaw = '0x' + newValue.toString(16).toUpperCase();
  } else if (raw.startsWith('0b') || raw.startsWith('-0b')) {
    newRaw = '0b' + newValue.toString(2);
  } else if (raw.startsWith('0o') || raw.startsWith('-0o')) {
    newRaw = '0o' + newValue.toString(8);
  } else {
    newRaw = newValue.toString();
  }
  return before + newRaw + after;
}

// ============================================================
// Component
// ============================================================

const BitwiseCalc: React.FC = () => {
  const [expression, setExpression] = useState('0xFF & 0b10101010');
  const [bitWidth, setBitWidth] = useState<BitWidth>(32);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const lastValidRef = useRef<{ result: EvalResult; ast: ASTNode } | null>(null);

  // Parse and evaluate
  const parseResult = useMemo((): { ok: true; data: ParseResult } | { ok: false; error: string } => {
    const trimmed = expression.trim();
    if (!trimmed) {
      return { ok: true, data: { ast: { kind: 'literal', raw: '0', value: 0n, start: 0, end: 1 }, result: { value: 0n, steps: [], truncated: false } } };
    }
    try {
      const tokens = tokenize(trimmed);
      const ast = parse(tokens);
      const result = evaluate(ast, bitWidth);
      lastValidRef.current = { result, ast };
      return { ok: true, data: { ast, result } };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Parse error';
      return { ok: false, error: msg };
    }
  }, [expression, bitWidth]);

  const currentData = parseResult.ok ? parseResult.data : null;
  const steps = currentData?.result.steps ?? [];
  const finalValue = currentData?.result.value ?? 0n;
  const truncated = currentData?.result.truncated ?? false;

  // Auto-select for single step
  const effectiveStepIdx = useMemo(() => {
    if (steps.length === 0) return null;
    if (steps.length === 1) return 0;
    return selectedStepIdx !== null && selectedStepIdx < steps.length ? selectedStepIdx : steps.length - 1;
  }, [steps.length, selectedStepIdx]);

  // Auto-expand single-step
  const effectiveExpanded = useMemo(() => {
    if (steps.length === 1) {
      const s = new Set(expandedSteps);
      s.add(0);
      return s;
    }
    return expandedSteps;
  }, [steps.length, expandedSteps]);

  const activeStep = effectiveStepIdx !== null ? steps[effectiveStepIdx] : null;

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const toggleStepExpand = useCallback((idx: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleBitToggle = useCallback((node: ASTNode | undefined, bitIndex: number) => {
    if (!node || node.kind !== 'literal') return;
    const currentVal = applyMask(node.value, bitWidth);
    const mask = 1n << BigInt(bitIndex);
    const newVal = currentVal ^ mask;
    setExpression(prev => updateExpressionLiteral(prev, node, newVal));
  }, [bitWidth]);

  // Determine if a node is a leaf literal (editable)
  const isLeafLiteral = (node?: ASTNode): node is LiteralNode => {
    return node?.kind === 'literal';
  };

  // ============================================================
  // Render helpers
  // ============================================================

  const renderValueRow = (label: string, value: string, mono: boolean = false) => (
    <div className="bitwise-calc__value-row">
      <span className="bitwise-calc__value-label">{label}</span>
      <span className={`bitwise-calc__value-data${mono ? ' bitwise-calc__value-data--mono' : ''}`}>{value}</span>
      <button
        className="bitwise-calc__copy-btn"
        onClick={() => copyToClipboard(value)}
        title="Copy"
      >
        <CopyIcon size={16} />
      </button>
    </div>
  );

  const renderBitGrid = (
    value: bigint,
    label: string,
    editable: boolean,
    editNode?: ASTNode,
    highlightDiff?: bigint
  ) => {
    const nibblesTotal = bitWidth / 4;

    return (
      <div className="bitwise-calc__grid-block">
        <span className="bitwise-calc__grid-label">{label}</span>
        <div className="bitwise-calc__bit-grid">
          {Array.from({ length: Math.ceil(nibblesTotal / 8) }, (_, rowIdx) => {
            const rowStartNibble = rowIdx * 8;
            const nibblesInRow = Math.min(8, nibblesTotal - rowStartNibble);

            return (
              <div key={rowIdx} className="bitwise-calc__bit-row">
                {Array.from({ length: nibblesInRow }, (_, nibbleInRow) => {
                  const nibbleIdx = rowStartNibble + nibbleInRow;
                  const startBit = bitWidth - 1 - nibbleIdx * 4;
                  if (startBit < 0) return null;
                  const nibbleValue = Number((value >> BigInt(Math.max(0, startBit - 3))) & 0xFn);

                  return (
                    <div key={nibbleIdx} className="bitwise-calc__nibble">
                      <div className="bitwise-calc__bit-labels">
                        {[0, 1, 2, 3].map(i => {
                          const bitIdx = startBit - i;
                          if (bitIdx < 0) return <span key={i} className="bitwise-calc__bit-label" />;
                          return <span key={i} className="bitwise-calc__bit-label">{bitIdx}</span>;
                        })}
                      </div>
                      <div className="bitwise-calc__bit-cells">
                        {[0, 1, 2, 3].map(i => {
                          const bitIdx = startBit - i;
                          if (bitIdx < 0) return null;
                          const bitVal = (value >> BigInt(bitIdx)) & 1n;
                          const diffBit = highlightDiff !== undefined
                            ? ((value >> BigInt(bitIdx)) & 1n) !== ((highlightDiff >> BigInt(bitIdx)) & 1n)
                            : false;

                          return (
                            <button
                              key={i}
                              className={
                                `bitwise-calc__bit-cell` +
                                `${bitVal === 1n ? ' bitwise-calc__bit-cell--set' : ''}` +
                                `${diffBit ? ' bitwise-calc__bit-cell--changed' : ''}` +
                                `${!editable ? ' bitwise-calc__bit-cell--readonly' : ''}`
                              }
                              onClick={editable ? () => handleBitToggle(editNode, bitIdx) : undefined}
                              title={editable
                                ? `Bit ${bitIdx}: Click to ${bitVal === 1n ? 'clear' : 'set'}`
                                : `Bit ${bitIdx}`}
                            >
                              {bitVal.toString()}
                            </button>
                          );
                        })}
                      </div>
                      <span className="bitwise-calc__nibble-hex">{nibbleValue.toString(16).toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================
  // Main render
  // ============================================================

  return (
    <ToolPage
      title="Bitwise Calculator"
      description="Free online bitwise calculator. Perform AND, OR, XOR, NOT, shifts, and rotations on binary, hex, and decimal values. Visualize bit manipulation with interactive binary display."
      keywords={[
        'bitwise calculator',
        'bitwise calculator online',
        'binary calculator',
        'AND OR XOR calculator',
        'bit shift calculator',
        'hex calculator',
        'binary AND',
        'binary OR',
        'binary XOR',
        'binary NOT',
        'left shift',
        'right shift',
        'rotate bits',
        'bit manipulation',
        'bitmask calculator',
        'binary operations',
        'hex operations',
        'developer tools',
        'programmer calculator',
        'free bitwise calculator'
      ]}
    >
      <div className="bitwise-calc">
        {/* Config Bar */}
        <div className="bitwise-calc__config">
          <select
            className="bitwise-calc__width-select"
            value={bitWidth}
            onChange={(e) => {
              setBitWidth(Number(e.target.value) as BitWidth);
              setSelectedStepIdx(null);
            }}
          >
            <option value={8}>8-bit</option>
            <option value={16}>16-bit</option>
            <option value={32}>32-bit</option>
            <option value={64}>64-bit</option>
          </select>
        </div>

        {/* Expression Input */}
        <div className="bitwise-calc__input-section">
          <input
            type="text"
            className={`bitwise-calc__input${!parseResult.ok ? ' bitwise-calc__input--error' : ''}`}
            value={expression}
            onChange={(e) => {
              setExpression(e.target.value);
              setSelectedStepIdx(null);
              setExpandedSteps(new Set());
            }}
            placeholder="(0xFF & 0b10101010) | (42 << 3)"
            spellCheck={false}
            autoComplete="off"
          />
          {!parseResult.ok && (
            <span className="bitwise-calc__error-msg">{parseResult.error}</span>
          )}
          {truncated && (
            <span className="bitwise-calc__warning-msg">Value was truncated to fit {bitWidth}-bit width</span>
          )}
        </div>

        {/* Result Values */}
        {currentData && (
          <div className="bitwise-calc__values">
            {renderValueRow('Hexadecimal', formatHex(finalValue, bitWidth), true)}
            {renderValueRow('Decimal (unsigned)', formatDecUnsigned(finalValue))}
            {renderValueRow('Decimal (signed)', formatDecSigned(finalValue, bitWidth))}
            {renderValueRow('Binary', formatBin(finalValue, bitWidth), true)}
            {renderValueRow('Octal', formatOct(finalValue, bitWidth), true)}
          </div>
        )}

        {/* Step-by-Step Breakdown */}
        {steps.length > 0 && (
          <div className="bitwise-calc__steps">
            <span className="bitwise-calc__steps-title">Step-by-Step Breakdown</span>
            <div className="bitwise-calc__step-list">
              {steps.map((step, idx) => {
                const isSelected = idx === effectiveStepIdx;
                const isExpanded = effectiveExpanded.has(idx);

                return (
                  <div
                    key={idx}
                    className={`bitwise-calc__step-card${isSelected ? ' bitwise-calc__step-card--selected' : ''}`}
                  >
                    <button
                      className="bitwise-calc__step-header"
                      onClick={() => {
                        setSelectedStepIdx(idx);
                        toggleStepExpand(idx);
                      }}
                    >
                      <span className="bitwise-calc__step-num">{idx + 1}</span>
                      <span className="bitwise-calc__step-expr">{step.label}</span>
                      <span className="bitwise-calc__step-eq">=</span>
                      <span className="bitwise-calc__step-result">{formatHex(step.result, bitWidth)}</span>
                      <span className={`bitwise-calc__step-chevron${isExpanded ? ' bitwise-calc__step-chevron--open' : ''}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="bitwise-calc__step-detail">
                        <div className="bitwise-calc__step-detail-row">
                          <span className="bitwise-calc__step-detail-label">Hex</span>
                          <span className="bitwise-calc__step-detail-value">{formatHex(step.result, bitWidth)}</span>
                        </div>
                        <div className="bitwise-calc__step-detail-row">
                          <span className="bitwise-calc__step-detail-label">Dec</span>
                          <span className="bitwise-calc__step-detail-value">{formatDecUnsigned(step.result)}</span>
                        </div>
                        <div className="bitwise-calc__step-detail-row">
                          <span className="bitwise-calc__step-detail-label">Bin</span>
                          <span className="bitwise-calc__step-detail-value">{formatBin(step.result, bitWidth)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bit Grid Visualization */}
        {currentData && (
          <div className="bitwise-calc__visualization">
            {activeStep ? (
              // Show operand(s) + result for selected step
              activeStep.isUnary ? (
                <div className="bitwise-calc__grids bitwise-calc__grids--unary">
                  {renderBitGrid(
                    activeStep.operandA,
                    `Operand: ${activeStep.operandALabel}`,
                    isLeafLiteral(activeStep.operandNode),
                    activeStep.operandNode
                  )}
                  <div className="bitwise-calc__op-label">{activeStep.opSymbol}</div>
                  {renderBitGrid(
                    activeStep.result,
                    'Result',
                    false,
                    undefined,
                    activeStep.operandA
                  )}
                </div>
              ) : (
                <div className="bitwise-calc__grids bitwise-calc__grids--binary">
                  {renderBitGrid(
                    activeStep.operandA,
                    `A: ${activeStep.operandALabel}`,
                    isLeafLiteral(activeStep.leftNode),
                    activeStep.leftNode
                  )}
                  <div className="bitwise-calc__op-label">{activeStep.opSymbol}</div>
                  {renderBitGrid(
                    activeStep.operandB!,
                    `B: ${activeStep.operandBLabel!}`,
                    isLeafLiteral(activeStep.rightNode),
                    activeStep.rightNode
                  )}
                  <div className="bitwise-calc__op-label">=</div>
                  {renderBitGrid(
                    activeStep.result,
                    'Result',
                    false,
                    undefined,
                    activeStep.operandA
                  )}
                </div>
              )
            ) : (
              // Single literal, no steps — show one editable grid
              currentData.ast.kind === 'literal' ? (
                renderBitGrid(
                  finalValue,
                  'Value',
                  true,
                  currentData.ast
                )
              ) : (
                // Fallback: just show final value
                renderBitGrid(finalValue, 'Result', false)
              )
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default BitwiseCalc;
