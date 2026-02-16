import React, { useState, useCallback } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import { TabSelector } from '../../components';
import type { TabItem } from '../../types';
import type { Instruction } from '../../types';
import EncodingVisualization from '../ISAReference/components/InstructionDetail/components/EncodingVisualization/EncodingVisualization';
import {
  lookupInstruction,
  parseModifiers,
  parseOperand,
  getRegisterValue,
  encodeInstructionDataDriven,
  decodeWord,
  type Xlen,
  type ParsedOperand,
  type DecodeResult,
} from '../Simulator/assembler/Assembler';
import './EncoderDecoder.css';

type Direction = 'encode' | 'decode';
type Mode = 'single' | 'bulk';

const DIRECTION_TABS: TabItem[] = [
  { id: 'encode', label: 'Encode' },
  { id: 'decode', label: 'Decode' },
];

const MODE_TABS: TabItem[] = [
  { id: 'single', label: 'Single' },
  { id: 'bulk', label: 'Bulk' },
];

const XLEN_TABS: TabItem[] = [
  { id: '32', label: 'RV32' },
  { id: '64', label: 'RV64' },
];

interface EncodeResult {
  success: boolean;
  encoded?: number;
  instruction?: Instruction;
  operandValues?: Record<string, number>;
  error?: string;
}

interface BulkEncodeRow {
  line: string;
  result: EncodeResult;
}

interface BulkDecodeRow {
  line: string;
  value?: number;
  result: DecodeResult | null;
  error?: string;
}

/**
 * Build a concrete encoding string by replacing 'x' bits with actual bit values.
 */
function buildConcreteEncoding(value: number, template: string): string {
  const bits = template.split('');
  const totalBits = bits.length;
  return bits.map((ch, i) => {
    const bitPos = totalBits - 1 - i;
    if (ch === 'x' || ch === 'X') {
      return ((value >>> bitPos) & 1).toString();
    }
    return ch;
  }).join('');
}

/**
 * Parse a hex or binary string into a number.
 */
function parseInputValue(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Binary: 0b prefix or all 0s and 1s (32+ chars suggests binary)
  if (trimmed.startsWith('0b') || trimmed.startsWith('0B')) {
    const val = parseInt(trimmed.slice(2), 2);
    return isNaN(val) ? null : val;
  }

  // Pure binary (32 chars of 0/1)
  if (/^[01]{1,32}$/.test(trimmed) && trimmed.length >= 8) {
    return parseInt(trimmed, 2);
  }

  // Hex with prefix — require exactly 4 (16-bit) or 8 (32-bit) hex digits
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hexStr = trimmed.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hexStr)) return null;
    if (hexStr.length > 4 && hexStr.length < 8) return null;
    if (hexStr.length > 8) return null;
    const val = parseInt(hexStr, 16);
    return isNaN(val) ? null : val;
  }

  // Bare hex (contains a-f chars) — same width rule
  if (/^[0-9a-fA-F]+$/.test(trimmed) && /[a-fA-F]/.test(trimmed)) {
    if (trimmed.length > 4 && trimmed.length < 8) return null;
    if (trimmed.length > 8) return null;
    const val = parseInt(trimmed, 16);
    return isNaN(val) ? null : val;
  }

  // Decimal
  if (/^[0-9]+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    return isNaN(val) ? null : val;
  }

  return null;
}

/**
 * Encode a single assembly instruction string.
 */
function encodeSingle(input: string, xlen: Xlen): EncodeResult {
  const trimmed = input.trim();
  if (!trimmed) return { success: false, error: 'Empty input' };

  // Strip comments
  const withoutComment = trimmed.split('#')[0].trim();
  if (!withoutComment) return { success: false, error: 'Empty input (only comments)' };

  // Split mnemonic and operands
  const firstSpace = withoutComment.search(/\s/);
  const mnemonic = firstSpace === -1 ? withoutComment : withoutComment.slice(0, firstSpace);
  const operandsPart = firstSpace === -1 ? '' : withoutComment.slice(firstSpace).trim();

  // Parse modifiers
  const { baseMnemonic, rm, aq, rl } = parseModifiers(mnemonic);

  // Lookup instruction
  let instr = lookupInstruction(mnemonic.toUpperCase(), xlen);
  let usedBaseMnemonic = false;
  if (!instr && baseMnemonic !== mnemonic.toUpperCase()) {
    instr = lookupInstruction(baseMnemonic, xlen);
    usedBaseMnemonic = true;
  }

  if (!instr) {
    return { success: false, error: `Unknown instruction: "${mnemonic}". Check spelling or extension support.` };
  }

  // Parse operands
  const operandStrs = operandsPart
    ? operandsPart.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const parsedOperands: ParsedOperand[] = operandStrs.map(s => parseOperand(s));

  // Build operand values map (same logic as encodeInstruction in Assembler.ts)
  const opValues: Record<string, number> = {};
  const instrOperands = instr.operands ?? [];

  for (let i = 0; i < instrOperands.length && i < parsedOperands.length; i++) {
    const opName = instrOperands[i].toLowerCase();
    const opValue = parsedOperands[i];

    if (opName === 'rd') {
      opValues.rd = getRegisterValue(opValue);
    } else if (opName === 'rs1') {
      if (opValue.type === 'memory') {
        opValues.rs1 = opValue.base ?? 0;
        opValues.imm = opValue.offset ?? 0;
      } else {
        opValues.rs1 = getRegisterValue(opValue);
      }
    } else if (opName === 'rs') {
      opValues.rs1 = getRegisterValue(opValue);
    } else if (opName === 'rs2') {
      if (opValue.type === 'memory') {
        opValues.rs1 = opValue.base ?? 0;
        opValues.imm = opValue.offset ?? 0;
      } else {
        opValues.rs2 = getRegisterValue(opValue);
      }
    } else if (opName === 'rs3') {
      opValues.rs3 = getRegisterValue(opValue);
    } else if (opName === 'imm' || opName === 'offset' || opName === 'shamt') {
      if (opValue.type === 'memory') {
        opValues.imm = opValue.offset ?? 0;
        if (!('rs1' in opValues)) {
          opValues.rs1 = opValue.base ?? 0;
        }
      } else if (opValue.type === 'immediate') {
        opValues.imm = opValue.value as number;
      }
    } else if (opName === 'csr') {
      opValues.csr = opValue.type === 'csr' ? opValue.value as number :
                     opValue.type === 'immediate' ? opValue.value as number : 0;
    } else if (opName === 'rm') {
      opValues.rm = opValue.type === 'immediate' ? opValue.value as number :
                    opValue.type === 'rounding_mode' ? opValue.value as number : 7;
    } else if (opName === 'vd' || opName === 'vs3') {
      opValues.rd = getRegisterValue(opValue);
    } else if (opName === 'vs1') {
      opValues.rs1 = getRegisterValue(opValue);
    } else if (opName === 'vs2') {
      opValues.rs2 = getRegisterValue(opValue);
    }
  }

  // Check for rounding mode operand
  for (const op of parsedOperands) {
    if (op.type === 'rounding_mode' && !('rm' in opValues)) {
      opValues.rm = op.value as number;
      break;
    }
  }

  // Handle special instruction categories
  const isAtomic = baseMnemonic.startsWith('LR.') || baseMnemonic.startsWith('SC.') || baseMnemonic.startsWith('AMO');
  if (isAtomic && parsedOperands.length >= 2) {
    opValues.rd = getRegisterValue(parsedOperands[0]);
    if (parsedOperands.length === 2) {
      if (parsedOperands[1]?.type === 'memory') {
        opValues.rs1 = parsedOperands[1].base ?? 0;
      }
    } else if (parsedOperands.length >= 3) {
      opValues.rs2 = getRegisterValue(parsedOperands[1]);
      if (parsedOperands[2]?.type === 'memory') {
        opValues.rs1 = parsedOperands[2].base ?? 0;
      }
    }
  } else if (instr.format === 'S-type' ||
    ['FSW', 'FSD', 'FSH', 'FSQ'].includes(instr.mnemonic)) {
    if (parsedOperands.length >= 2) {
      opValues.rs2 = getRegisterValue(parsedOperands[0]);
      if (parsedOperands[1]?.type === 'memory') {
        opValues.rs1 = parsedOperands[1].base ?? 0;
        opValues.imm = parsedOperands[1].offset ?? 0;
      }
    }
  } else if (instr.category === 'Load' ||
    ['FLW', 'FLD', 'FLH', 'FLQ'].includes(instr.mnemonic)) {
    if (parsedOperands.length >= 2) {
      opValues.rd = getRegisterValue(parsedOperands[0]);
      if (parsedOperands[1]?.type === 'memory') {
        opValues.rs1 = parsedOperands[1].base ?? 0;
        opValues.imm = parsedOperands[1].offset ?? 0;
      }
    }
  }

  // Apply modifiers
  if (usedBaseMnemonic) {
    if (rm !== undefined) opValues.rm = rm;
    if (aq !== undefined) opValues.aq = aq;
    if (rl !== undefined) opValues.rl = rl;
  }

  // Default rm for FP instructions
  if (!('rm' in opValues)) {
    const hasExplicitRm = instr.encodingFields?.some(f => f.name === 'rm' && f.category === 'rm');
    const isFpWithRounding = baseMnemonic.startsWith('F') &&
      !baseMnemonic.startsWith('FENCE') &&
      !baseMnemonic.startsWith('FMV') &&
      !baseMnemonic.startsWith('FCLASS') &&
      !baseMnemonic.startsWith('FEQ') &&
      !baseMnemonic.startsWith('FLT') &&
      !baseMnemonic.startsWith('FLE') &&
      instr.encodingFields?.some(f => f.name === 'funct3' && f.startBit === 12 && f.endBit === 14 && f.value.includes('x'));
    if (hasExplicitRm || isFpWithRounding) {
      opValues.rm = 7;
    }
  }

  try {
    const encoded = encodeInstructionDataDriven(instr, opValues);
    return { success: true, encoded, instruction: instr, operandValues: opValues };
  } catch (e) {
    return { success: false, error: `Encoding failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Format a 32-bit number as hex string.
 */
function toHex(value: number): string {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Format a 32-bit number as binary string.
 */
function toBinary(value: number): string {
  return (value >>> 0).toString(2).padStart(32, '0');
}

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

const EncoderDecoder: React.FC = () => {
  const [direction, setDirection] = useState<Direction>('encode');
  const [mode, setMode] = useState<Mode>('single');
  const [xlen, setXlen] = useState<Xlen>(32);
  const [singleInput, setSingleInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');

  // Single encode
  const encodeResult = useCallback((): EncodeResult | null => {
    if (direction !== 'encode' || !singleInput.trim()) return null;
    return encodeSingle(singleInput, xlen);
  }, [direction, singleInput, xlen]);

  // Single decode
  const decodeResult = useCallback((): { result: DecodeResult | null; error?: string; value?: number } | null => {
    if (direction !== 'decode' || !singleInput.trim()) return null;
    const value = parseInputValue(singleInput);
    if (value === null) {
      return { result: null, error: 'Invalid input. Enter a hex value (0x003100B3), binary (0b...), or decimal number.' };
    }
    const result = decodeWord(value, xlen);
    if (!result) {
      return { result: null, error: `No matching instruction found for ${toHex(value)}. The encoding may not correspond to a valid RISC-V instruction.`, value };
    }
    return { result, value };
  }, [direction, singleInput, xlen]);

  // Bulk encode
  const bulkEncodeResults = useCallback((): BulkEncodeRow[] => {
    if (direction !== 'encode' || !bulkInput.trim()) return [];
    return bulkInput.split('\n')
      .filter(line => line.trim())
      .map(line => ({
        line: line.trim(),
        result: encodeSingle(line, xlen),
      }));
  }, [direction, bulkInput, xlen]);

  // Bulk decode
  const bulkDecodeResults = useCallback((): BulkDecodeRow[] => {
    if (direction !== 'decode' || !bulkInput.trim()) return [];
    // Split by lines, then each line can have multiple values separated by spaces/commas
    const entries: string[] = [];
    for (const line of bulkInput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Split by comma or whitespace
      for (const token of trimmed.split(/[,\s]+/)) {
        if (token.trim()) entries.push(token.trim());
      }
    }
    return entries.map(entry => {
      const value = parseInputValue(entry);
      if (value === null) {
        return { line: entry, result: null, error: 'Invalid format' };
      }
      const result = decodeWord(value, xlen);
      return { line: entry, value, result, error: result ? undefined : 'No match' };
    });
  }, [direction, bulkInput, xlen]);

  const singleEncResult = mode === 'single' ? encodeResult() : null;
  const singleDecResult = mode === 'single' ? decodeResult() : null;
  const bulkEncRows = mode === 'bulk' ? bulkEncodeResults() : [];
  const bulkDecRows = mode === 'bulk' ? bulkDecodeResults() : [];

  // Concrete encoding for visualization
  const getConcreteEncoding = (value: number, template: string): string => {
    return buildConcreteEncoding(value, template);
  };

  return (
    <ToolPage
      title="Instruction Encoder/Decoder"
      description="Encode RISC-V assembly instructions to machine code or decode hex/binary back to assembly. Visualize bit fields with color-coded encoding diagrams."
      keywords={[
        'RISC-V encoder',
        'RISC-V decoder',
        'instruction encoding',
        'machine code',
        'assembly to hex',
        'hex to assembly',
        'RISC-V instruction format',
        'binary encoding',
        'R-type',
        'I-type',
        'S-type',
        'B-type',
        'U-type',
        'J-type',
      ]}
    >
      <div className="ed">
        {/* Config bar */}
        <div className="ed__config-bar">
          <TabSelector
            tabs={DIRECTION_TABS}
            activeTab={direction}
            onTabChange={(id) => { setDirection(id as Direction); setSingleInput(''); setBulkInput(''); }}
            size="md"
          />
          <TabSelector
            tabs={MODE_TABS}
            activeTab={mode}
            onTabChange={(id) => setMode(id as Mode)}
            size="sm"
          />
          <TabSelector
            tabs={XLEN_TABS}
            activeTab={String(xlen)}
            onTabChange={(id) => setXlen(Number(id) as Xlen)}
            size="sm"
          />
        </div>

        {/* Single mode */}
        {mode === 'single' && (
          <div className="ed__single">
            {/* Input */}
            <div className="ed__input-section">
              <label className="ed__label">
                {direction === 'encode'
                  ? 'Enter RISC-V assembly instruction'
                  : 'Enter hex, binary, or decimal machine code'}
              </label>
              <input
                type="text"
                className="ed__input"
                value={singleInput}
                onChange={(e) => setSingleInput(e.target.value)}
                placeholder={direction === 'encode' ? 'add x1, x2, x3' : '0x003100B3'}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {/* Encode result */}
            {direction === 'encode' && singleEncResult && (
              <>
                {singleEncResult.success && singleEncResult.instruction && singleEncResult.encoded !== undefined && (
                  <div className="ed__result">
                    {/* Badges */}
                    <div className="ed__badges">
                      <span className="ed__badge ed__badge--format">{singleEncResult.instruction.format}</span>
                      <span className="ed__badge ed__badge--extension">{singleEncResult.instruction.extension}</span>
                      <span className="ed__badge ed__badge--category">{singleEncResult.instruction.category}</span>
                    </div>

                    {/* Output values */}
                    <div className="ed__outputs">
                      <div className="ed__output-row">
                        <span className="ed__output-label">Hex</span>
                        <code className="ed__output-value">{toHex(singleEncResult.encoded)}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard(toHex(singleEncResult.encoded!))} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                      <div className="ed__output-row">
                        <span className="ed__output-label">Binary</span>
                        <code className="ed__output-value">{toBinary(singleEncResult.encoded)}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard(toBinary(singleEncResult.encoded!))} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                      <div className="ed__output-row">
                        <span className="ed__output-label">Decimal</span>
                        <code className="ed__output-value">{(singleEncResult.encoded >>> 0).toString()}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard((singleEncResult.encoded! >>> 0).toString())} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Encoding visualization */}
                    <div className="ed__visualization">
                      <EncodingVisualization
                        encoding={getConcreteEncoding(singleEncResult.encoded, singleEncResult.instruction.encoding)}
                        encodingFields={singleEncResult.instruction.encodingFields}
                        mnemonic={singleEncResult.instruction.mnemonic}
                      />
                    </div>

                    {/* Description */}
                    <div className="ed__detail">
                      <div className="ed__detail-section">
                        <h4 className="ed__detail-heading">Description</h4>
                        <p className="ed__detail-text">{singleEncResult.instruction.description}</p>
                      </div>
                      {singleEncResult.instruction.pseudocode && (
                        <div className="ed__detail-section">
                          <h4 className="ed__detail-heading">Pseudocode</h4>
                          <code className="ed__detail-code">{singleEncResult.instruction.pseudocode}</code>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!singleEncResult.success && singleEncResult.error && (
                  <div className="ed__error">
                    <span className="ed__error-icon">!</span>
                    <span className="ed__error-text">{singleEncResult.error}</span>
                  </div>
                )}
              </>
            )}

            {/* Decode result */}
            {direction === 'decode' && singleDecResult && (
              <>
                {singleDecResult.result && singleDecResult.value !== undefined && (
                  <div className="ed__result">
                    {/* Badges */}
                    <div className="ed__badges">
                      <span className="ed__badge ed__badge--format">{singleDecResult.result.instruction.format}</span>
                      <span className="ed__badge ed__badge--extension">{singleDecResult.result.instruction.extension}</span>
                      <span className="ed__badge ed__badge--category">{singleDecResult.result.instruction.category}</span>
                    </div>

                    {/* Output values */}
                    <div className="ed__outputs">
                      <div className="ed__output-row">
                        <span className="ed__output-label">Assembly</span>
                        <code className="ed__output-value">{singleDecResult.result.assemblyText}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard(singleDecResult.result!.assemblyText)} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                      <div className="ed__output-row">
                        <span className="ed__output-label">Hex</span>
                        <code className="ed__output-value">{toHex(singleDecResult.value)}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard(toHex(singleDecResult.value!))} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                      <div className="ed__output-row">
                        <span className="ed__output-label">Binary</span>
                        <code className="ed__output-value">{toBinary(singleDecResult.value)}</code>
                        <button className="ed__copy-btn" onClick={() => copyToClipboard(toBinary(singleDecResult.value!))} title="Copy">
                          <CopyIcon size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Encoding visualization */}
                    <div className="ed__visualization">
                      <EncodingVisualization
                        encoding={getConcreteEncoding(singleDecResult.value, singleDecResult.result.instruction.encoding)}
                        encodingFields={singleDecResult.result.instruction.encodingFields}
                        mnemonic={singleDecResult.result.instruction.mnemonic}
                      />
                    </div>

                    {/* Description */}
                    <div className="ed__detail">
                      <div className="ed__detail-section">
                        <h4 className="ed__detail-heading">Description</h4>
                        <p className="ed__detail-text">{singleDecResult.result.instruction.description}</p>
                      </div>
                      {singleDecResult.result.instruction.pseudocode && (
                        <div className="ed__detail-section">
                          <h4 className="ed__detail-heading">Pseudocode</h4>
                          <code className="ed__detail-code">{singleDecResult.result.instruction.pseudocode}</code>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {singleDecResult.error && (
                  <div className="ed__error">
                    <span className="ed__error-icon">!</span>
                    <span className="ed__error-text">{singleDecResult.error}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Bulk mode */}
        {mode === 'bulk' && (
          <div className="ed__bulk">
            {/* Input */}
            <div className="ed__input-section">
              <label className="ed__label">
                {direction === 'encode'
                  ? 'Enter assembly instructions (one per line)'
                  : 'Enter machine code values (hex, binary, or decimal; one per line or separated by commas/spaces)'}
              </label>
              <textarea
                className="ed__textarea"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={direction === 'encode'
                  ? 'add x1, x2, x3\nlw x5, 8(x10)\naddi x1, x0, 42'
                  : '0x003100B3\n0x00852283\n0x02A00093'}
                rows={6}
                spellCheck={false}
              />
            </div>

            {/* Bulk encode results */}
            {direction === 'encode' && bulkEncRows.length > 0 && (
              <div className="ed__bulk-results">
                <div className="ed__bulk-header">
                  <span className="ed__bulk-count">
                    {bulkEncRows.filter(r => r.result.success).length}/{bulkEncRows.length} encoded
                  </span>
                  <button
                    className="ed__bulk-copy-btn"
                    onClick={() => copyToClipboard(bulkEncRows.filter(r => r.result.success).map(r => toHex(r.result.encoded!)).join('\n'))}
                  >
                    <CopyIcon size={14} /> Copy All Hex
                  </button>
                </div>
                <div className="ed__bulk-table-wrapper">
                  <table className="ed__bulk-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Assembly</th>
                        <th>Hex</th>
                        <th>Binary</th>
                        <th>Format</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEncRows.map((row, idx) => (
                        <tr key={idx} className={!row.result.success ? 'ed__bulk-row--error' : ''}>
                          <td className="ed__bulk-cell--num">{idx + 1}</td>
                          <td className="ed__bulk-cell--asm">{row.line}</td>
                          {row.result.success ? (
                            <>
                              <td className="ed__bulk-cell--mono">
                                <span className="ed__bulk-cell-content">
                                  {toHex(row.result.encoded!)}
                                  <button className="ed__bulk-cell-copy" onClick={() => copyToClipboard(toHex(row.result.encoded!))} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td className="ed__bulk-cell--mono ed__bulk-cell--binary">
                                <span className="ed__bulk-cell-content">
                                  {toBinary(row.result.encoded!)}
                                  <button className="ed__bulk-cell-copy" onClick={() => copyToClipboard(toBinary(row.result.encoded!))} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td>{row.result.instruction?.format}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="ed__bulk-cell--error">{row.result.error}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bulk decode results */}
            {direction === 'decode' && bulkDecRows.length > 0 && (
              <div className="ed__bulk-results">
                <div className="ed__bulk-header">
                  <span className="ed__bulk-count">
                    {bulkDecRows.filter(r => r.result).length}/{bulkDecRows.length} decoded
                  </span>
                  <button
                    className="ed__bulk-copy-btn"
                    onClick={() => copyToClipboard(bulkDecRows.filter(r => r.result).map(r => r.result!.assemblyText).join('\n'))}
                  >
                    <CopyIcon size={14} /> Copy All Assembly
                  </button>
                </div>
                <div className="ed__bulk-table-wrapper">
                  <table className="ed__bulk-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Input</th>
                        <th>Assembly</th>
                        <th>Format</th>
                        <th>Extension</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkDecRows.map((row, idx) => (
                        <tr key={idx} className={!row.result ? 'ed__bulk-row--error' : ''}>
                          <td className="ed__bulk-cell--num">{idx + 1}</td>
                          <td className="ed__bulk-cell--mono">{row.line}</td>
                          {row.result ? (
                            <>
                              <td className="ed__bulk-cell--asm">
                                <span className="ed__bulk-cell-content">
                                  {row.result.assemblyText}
                                  <button className="ed__bulk-cell-copy" onClick={() => copyToClipboard(row.result!.assemblyText)} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td>{row.result.instruction.format}</td>
                              <td>{row.result.instruction.extension}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="ed__bulk-cell--error">{row.error}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default EncoderDecoder;
