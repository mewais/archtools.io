/**
 * RISC-V Assembler for Architect.io
 *
 * Converts RISC-V assembly text to machine code binary.
 * Data-driven implementation using instructions.json and pseudoinstructions.json.
 * Supports all RISC-V extensions and common pseudo-instructions.
 * Supports data section directives (.data, .text, .word, .dword/.quad, .half, .byte, .float, .double, .equ, .align, .space)
 *
 * @module Assembler
 */

import instructionsData from '../../../data/instructions.json';
import pseudoinstructionsData from '../../../data/pseudoinstructions.json';
import type { Instruction } from '../../../types';

/**
 * Pseudo-instruction definition from pseudoinstructions.json
 */
interface PseudoInstructionDef {
  mnemonic: string;
  pseudoinstruction: string;
  format: string;
  baseInstructions: string[];
  description: string;
  requiredExtensions: string[];
}

/**
 * Default base address for data section
 * Changed from 0x10000000 to 0x2000 to fit within WASM memory bounds
 */
const DEFAULT_DATA_BASE_ADDRESS = 0x2000n;

/**
 * XLEN (register width) for the target architecture
 */
export type Xlen = 32 | 64;

/**
 * Current assembly section type
 */
type SectionType = 'text' | 'data';

/**
 * Parsed directive information
 */
interface ParsedDirective {
  directive: string;
  args: string[];
}

/**
 * Result of assembly operation
 */
export interface AssemblyResult {
  /** Assembled binary machine code (text section) */
  binary: Uint8Array;
  /** Assembled data section binary */
  dataBinary: Uint8Array;
  /** Base address for text section */
  textBaseAddress: bigint;
  /** Base address for data section */
  dataBaseAddress: bigint;
  /** Maps source line numbers (1-indexed) to memory addresses (first address for each line) */
  lineToAddress: Map<number, bigint>;
  /** Maps ALL memory addresses to source line numbers (includes expanded pseudo-instructions) */
  addressToLine: Map<bigint, number>;
  /** Maps data labels to their addresses */
  dataLabels: Map<string, bigint>;
  /** Error messages encountered during assembly */
  errors: string[];
  /** Whether assembly completed successfully */
  success: boolean;
}

/**
 * Parsed operand value
 */
export interface ParsedOperand {
  type: 'register' | 'fp_register' | 'vector_register' | 'csr' | 'immediate' | 'label' | 'memory' | 'rounding_mode' | 'vtype_field';
  value: number | string;
  offset?: number; // For memory operands like 4(sp)
  base?: number;   // Base register for memory operands
  baseType?: 'int' | 'fp' | 'vector'; // Type of base register for memory operands
  vtypeField?: 'sew' | 'lmul' | 'ta' | 'ma'; // Type of vtype field for vector instructions
}

/**
 * Parsed instruction line
 */
interface ParsedLine {
  lineNumber: number;
  label?: string;
  mnemonic?: string;
  operands: ParsedOperand[];
  originalText: string;
  directive?: ParsedDirective;
  section?: SectionType;
}

/**
 * ABI register name to number mapping for integer registers (x0-x31)
 */
export const REGISTER_MAP: Record<string, number> = {
  // x0-x31 numeric names
  ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`x${i}`, i])),
  // ABI names
  zero: 0, ra: 1, sp: 2, gp: 3, tp: 4,
  t0: 5, t1: 6, t2: 7,
  s0: 8, fp: 8, s1: 9,
  a0: 10, a1: 11, a2: 12, a3: 13, a4: 14, a5: 15, a6: 16, a7: 17,
  s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23, s8: 24, s9: 25, s10: 26, s11: 27,
  t3: 28, t4: 29, t5: 30, t6: 31,
};

/**
 * Floating-point register name to number mapping (f0-f31)
 */
export const FP_REGISTER_MAP: Record<string, number> = {
  // f0-f31 numeric names
  ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`f${i}`, i])),
  // FP ABI names
  ft0: 0, ft1: 1, ft2: 2, ft3: 3, ft4: 4, ft5: 5, ft6: 6, ft7: 7,   // Temporaries
  fs0: 8, fs1: 9,                                                      // Saved registers
  fa0: 10, fa1: 11,                                                    // Arguments/return values
  fa2: 12, fa3: 13, fa4: 14, fa5: 15, fa6: 16, fa7: 17,               // Arguments
  fs2: 18, fs3: 19, fs4: 20, fs5: 21, fs6: 22, fs7: 23,               // Saved registers
  fs8: 24, fs9: 25, fs10: 26, fs11: 27,                                // Saved registers
  ft8: 28, ft9: 29, ft10: 30, ft11: 31,                                // Temporaries
};

/**
 * Vector register name to number mapping (v0-v31)
 */
const VECTOR_REGISTER_MAP: Record<string, number> = {
  ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, i])),
};

/**
 * CSR name to number mapping (common CSRs)
 */
export const CSR_MAP: Record<string, number> = {
  // User-level CSRs
  fflags: 0x001, frm: 0x002, fcsr: 0x003,
  cycle: 0xC00, time: 0xC01, instret: 0xC02,
  cycleh: 0xC80, timeh: 0xC81, instreth: 0xC82,
  // Supervisor-level CSRs
  sstatus: 0x100, sie: 0x104, stvec: 0x105,
  scounteren: 0x106, sscratch: 0x140, sepc: 0x141,
  scause: 0x142, stval: 0x143, sip: 0x144, satp: 0x180,
  // Machine-level CSRs
  mstatus: 0x300, misa: 0x301, medeleg: 0x302, mideleg: 0x303,
  mie: 0x304, mtvec: 0x305, mcounteren: 0x306,
  mscratch: 0x340, mepc: 0x341, mcause: 0x342, mtval: 0x343, mip: 0x344,
  mvendorid: 0xF11, marchid: 0xF12, mimpid: 0xF13, mhartid: 0xF14,
};

/**
 * Rounding mode modifier suffixes and their encoding values
 * Used for FP instructions: FADD.S.RNE, FCVT.W.S.RTZ, etc.
 */
export const ROUNDING_MODE_MAP: Record<string, number> = {
  RNE: 0,  // Round to Nearest, ties to Even
  RTZ: 1,  // Round towards Zero
  RDN: 2,  // Round Down (towards -inf)
  RUP: 3,  // Round Up (towards +inf)
  RMM: 4,  // Round to Nearest, ties to Max Magnitude
  DYN: 7,  // Dynamic (use frm CSR)
};

/**
 * Vector type (vtype) field mappings for VSETVLI/VSETIVLI/VSETVL instructions
 * These symbolic names are combined to form the vtype immediate value
 */
interface VtypeFieldInfo {
  field: 'sew' | 'lmul' | 'ta' | 'ma';
  value: number;
}

const VTYPE_FIELD_MAP: Record<string, VtypeFieldInfo> = {
  // SEW (Selected Element Width) - encoded in bits [5:3] of vtype
  E8:   { field: 'sew', value: 0 },   // 8-bit elements
  E16:  { field: 'sew', value: 1 },   // 16-bit elements
  E32:  { field: 'sew', value: 2 },   // 32-bit elements
  E64:  { field: 'sew', value: 3 },   // 64-bit elements

  // LMUL (Length Multiplier) - encoded in bits [2:0] of vtype
  M1:   { field: 'lmul', value: 0 },  // LMUL = 1
  M2:   { field: 'lmul', value: 1 },  // LMUL = 2
  M4:   { field: 'lmul', value: 2 },  // LMUL = 4
  M8:   { field: 'lmul', value: 3 },  // LMUL = 8
  MF8:  { field: 'lmul', value: 5 },  // LMUL = 1/8
  MF4:  { field: 'lmul', value: 6 },  // LMUL = 1/4
  MF2:  { field: 'lmul', value: 7 },  // LMUL = 1/2

  // VTA (Vector Tail Agnostic) - encoded in bit [6] of vtype
  TU:   { field: 'ta', value: 0 },    // Tail Undisturbed
  TA:   { field: 'ta', value: 1 },    // Tail Agnostic

  // VMA (Vector Mask Agnostic) - encoded in bit [7] of vtype
  MU:   { field: 'ma', value: 0 },    // Mask Undisturbed
  MA:   { field: 'ma', value: 1 },    // Mask Agnostic
};

/**
 * Encode vtype fields into a single immediate value
 * vtype[2:0] = vlmul, vtype[5:3] = vsew, vtype[6] = vta, vtype[7] = vma
 */
function encodeVtype(sew: number, lmul: number, ta: number, ma: number): number {
  return (ma << 7) | (ta << 6) | (sew << 3) | lmul;
}

/**
 * Atomic ordering modifier suffixes and their encoding values
 * Used for atomic instructions: LR.W.AQ, SC.W.RL, AMOSWAP.W.AQRL, etc.
 */
const ATOMIC_ORDERING_MAP: Record<string, { aq: number; rl: number }> = {
  AQ: { aq: 1, rl: 0 },     // Acquire only
  RL: { aq: 0, rl: 1 },     // Release only
  AQRL: { aq: 1, rl: 1 },   // Both acquire and release
};

/**
 * Parse instruction mnemonic to extract base mnemonic and modifiers
 *
 * @param mnemonic - Full mnemonic like "FADD.S.RNE" or "LR.W.AQ"
 * @returns Object with baseMnemonic and modifier values
 */
export function parseModifiers(mnemonic: string): {
  baseMnemonic: string;
  rm?: number;
  aq?: number;
  rl?: number;
} {
  const upper = mnemonic.toUpperCase();
  const parts = upper.split('.');

  // Check for rounding mode suffix (last part)
  const lastPart = parts[parts.length - 1];
  if (lastPart in ROUNDING_MODE_MAP) {
    return {
      baseMnemonic: parts.slice(0, -1).join('.'),
      rm: ROUNDING_MODE_MAP[lastPart],
    };
  }

  // Check for atomic ordering suffix (last part)
  if (lastPart in ATOMIC_ORDERING_MAP) {
    const ordering = ATOMIC_ORDERING_MAP[lastPart];
    return {
      baseMnemonic: parts.slice(0, -1).join('.'),
      aq: ordering.aq,
      rl: ordering.rl,
    };
  }

  // No modifier found
  return { baseMnemonic: upper };
}

/**
 * Instruction lookup table (mnemonic -> instruction definition)
 * Stores ALL instructions from all extensions for comprehensive support
 */
export const INSTRUCTION_MAP: Map<string, Instruction> = new Map();

/**
 * Extension-specific instruction map
 * Maps "mnemonic:extension" -> instruction definition
 * Used for instructions that have different encodings per extension (e.g., REV8, ZEXT.H)
 */
export const INSTRUCTION_BY_EXT_MAP: Map<string, Instruction> = new Map();

// Build instruction lookup tables on module load - include ALL instructions
for (const instr of instructionsData as Instruction[]) {
  const key = instr.mnemonic.toUpperCase();
  const extKey = `${key}:${instr.extension}`;

  // Store in extension-specific map (don't overwrite - first occurrence wins)
  // This handles duplicates in instructions.json (e.g., two RV64I SLLI entries)
  if (!INSTRUCTION_BY_EXT_MAP.has(extKey)) {
    INSTRUCTION_BY_EXT_MAP.set(extKey, instr);
  }

  // Store in main map (prefer RV32 for broader compatibility)
  if (!INSTRUCTION_MAP.has(key) || instr.extension.startsWith('RV32')) {
    INSTRUCTION_MAP.set(key, instr);
  }
}

/**
 * Thread-local XLEN for the current assembly operation.
 * Defaults to 32 for backwards compatibility.
 */
let currentXlen: Xlen = 32;

/**
 * Look up an instruction, preferring the correct variant for current XLEN.
 * For XLEN=64, tries RV64I/RV64M/etc. first, then falls back to RV32.
 * For XLEN=32, tries RV32I/RV32M/etc. first.
 *
 * @param mnemonic - Instruction mnemonic (case-insensitive)
 * @returns Instruction definition or undefined if not found
 */
export function lookupInstruction(mnemonic: string, xlen?: Xlen): Instruction | undefined {
  const effectiveXlen = xlen ?? currentXlen;
  const key = mnemonic.toUpperCase();

  if (effectiveXlen === 64) {
    // For RV64, prefer RV64 variants for instructions that have different encodings
    // Try common RV64 extensions in priority order
    for (const ext of ['RV64I', 'RV64M', 'RV64A', 'RV64F', 'RV64D', 'RV64B', 'RV64C', 'RV64V', 'RV64Zfh']) {
      const extInstr = INSTRUCTION_BY_EXT_MAP.get(`${key}:${ext}`);
      if (extInstr) return extInstr;
    }
    // Then try RV32 variants (many instructions are the same)
    for (const ext of ['RV32I', 'RV32M', 'RV32A', 'RV32F', 'RV32D', 'RV32B', 'RV32C', 'RV32V', 'RV32Zfh']) {
      const extInstr = INSTRUCTION_BY_EXT_MAP.get(`${key}:${ext}`);
      if (extInstr) return extInstr;
    }
  } else {
    // For RV32, prefer RV32 variants
    for (const ext of ['RV32I', 'RV32M', 'RV32A', 'RV32F', 'RV32D', 'RV32B', 'RV32C', 'RV32V', 'RV32Zfh']) {
      const extInstr = INSTRUCTION_BY_EXT_MAP.get(`${key}:${ext}`);
      if (extInstr) return extInstr;
    }
  }

  // Final fallback to the default map
  return INSTRUCTION_MAP.get(key);
}

/**
 * Pseudo-instruction lookup table
 * Maps mnemonic -> array of definitions (multiple can exist for different operand counts)
 */
const PSEUDOINSTRUCTION_MAP: Map<string, PseudoInstructionDef[]> = new Map();

// Build pseudo-instruction lookup table
for (const pseudo of pseudoinstructionsData as PseudoInstructionDef[]) {
  const key = pseudo.mnemonic.toUpperCase();
  if (!PSEUDOINSTRUCTION_MAP.has(key)) {
    PSEUDOINSTRUCTION_MAP.set(key, []);
  }
  PSEUDOINSTRUCTION_MAP.get(key)!.push(pseudo);
}

// ============================================================================
// DATA-DRIVEN ENCODING HELPERS
// ============================================================================

/**
 * Get the base encoding from an instruction's encoding field.
 * Replace 'x' with '0' and parse as binary.
 *
 * @param encoding - 32-bit encoding pattern string with 'x' for variable bits
 * @returns Base encoding value
 */
export function getBaseEncoding(encoding: string): number {
  return parseInt(encoding.replace(/x/gi, '0'), 2);
}

/**
 * Set bits in a value at a specific position
 *
 * @param base - Base value to modify
 * @param value - Value to insert
 * @param startBit - Start bit position (inclusive)
 * @param endBit - End bit position (inclusive)
 * @returns Modified value
 */
export function setBits(base: number, value: number, startBit: number, endBit: number): number {
  const width = endBit - startBit + 1;
  const mask = ((1 << width) - 1) << startBit;
  return (base & ~mask) | ((value << startBit) & mask);
}

/**
 * Set bits in a value at a specific position, preserving any fixed bits in the field value.
 * This handles cases like SRAI where the immediate field has value "0100000xxxxx" -
 * we need to preserve the "0100000" part and only set the "xxxxx" part.
 *
 * @param base - Base value to modify
 * @param value - Value to insert (only the variable bits)
 * @param startBit - Start bit position (inclusive)
 * @param endBit - End bit position (inclusive)
 * @param fieldValue - Field value pattern (e.g., "0100000xxxxx" or "xxxxx")
 * @returns Modified value
 */
export function setBitsPreservingFixed(
  base: number,
  value: number,
  startBit: number,
  endBit: number,
  fieldValue: string
): number {
  // If the field value has no 'x', it's entirely fixed - nothing to set
  if (!fieldValue.includes('x') && !fieldValue.includes('X')) {
    return base;
  }

  // If the field value is all 'x', use the simple setBits
  if (!/[01]/.test(fieldValue)) {
    return setBits(base, value, startBit, endBit);
  }

  // Field has mixed fixed and variable bits
  // We need to set only the variable bits (marked with 'x')
  // The field value is MSB-first, so reverse it to match bit positions
  const reversedFieldValue = fieldValue.split('').reverse().join('');

  let result = base;
  let valueBitIndex = 0;

  for (let i = 0; i < reversedFieldValue.length; i++) {
    const bitPos = startBit + i;
    const fieldChar = reversedFieldValue[i];

    if (fieldChar === 'x' || fieldChar === 'X') {
      // Variable bit - set it from value
      const bitValue = (value >> valueBitIndex) & 1;
      if (bitValue) {
        result |= (1 << bitPos);
      } else {
        result &= ~(1 << bitPos);
      }
      valueBitIndex++;
    }
    // For '0' or '1', keep the bit as it is in base (already set by getBaseEncoding)
  }

  return result;
}

/**
 * Extract bits from an immediate value based on field name pattern.
 * Handles patterns like "imm[11:0]", "imm[10:5]", "imm[12]", "imm[4:1]"
 *
 * For U-type instructions (imm[31:12]), the user provides the value that goes
 * directly into the upper 20 bits, so we don't shift - just mask.
 *
 * @param imm - Full immediate value
 * @param fieldName - Field name like "imm[11:0]" or "imm[12]"
 * @returns Extracted bits
 */
export function extractImmediateBits(imm: number, fieldName: string): number {
  // Match patterns like imm[11:0], imm[12], offset[31:12], symbol[11:0]
  const match = fieldName.match(/(?:imm|offset|symbol|shamt)\[(\d+)(?::(\d+))?\]/i);
  if (match) {
    const highBit = parseInt(match[1]);
    const lowBit = match[2] !== undefined ? parseInt(match[2]) : highBit;
    const width = highBit - lowBit + 1;

    // For U-type immediates (imm[31:12]), the user provides the upper 20-bit value directly
    // Don't shift, just mask to the field width
    if (lowBit === 12 && highBit === 31) {
      return imm & ((1 << width) - 1);
    }

    return (imm >> lowBit) & ((1 << width) - 1);
  }
  return imm;
}

/**
 * Data-driven instruction encoder.
 * Uses encodingFields from instructions.json to encode any instruction.
 *
 * @param instr - Instruction definition
 * @param operandValues - Map of operand names to values (rd, rs1, rs2, imm, etc.)
 * @returns Encoded instruction
 */
export function encodeInstructionDataDriven(
  instr: Instruction,
  operandValues: Record<string, number>
): number {
  // Start with base encoding (fixed bits)
  let encoded = getBaseEncoding(instr.encoding);

  if (!instr.encodingFields) {
    return encoded;
  }

  for (const field of instr.encodingFields) {
    // Skip fixed fields (opcode, funct3, funct7, etc. where value doesn't contain 'x')
    if (!field.value.includes('x')) {
      continue;
    }

    let value = 0;
    const category = field.category;
    const fieldName = field.name;

    // Skip funct and opcode categories entirely - they're already correctly set by getBaseEncoding
    // This avoids issues with incorrect 'xx' patterns in some encodingFields
    // EXCEPT for special cases where we need to encode values in these fields
    if (category === 'funct' || category === 'opcode') {
      // Special case 1: R4-type fused multiply-add instructions have rs3 in bits 27-31
      // The funct7 field in instructions.json incorrectly covers bits 25-31 as "xxxxxxx"
      // We need to encode rs3 in bits 27-31 only
      if (fieldName === 'funct7' && 'rs3' in operandValues && field.value === 'xxxxxxx' &&
          field.startBit === 25 && field.endBit === 31) {
        // Encode rs3 in bits 27-31 (shift left by 2 to skip fmt bits 25-26)
        // This effectively puts rs3 value in bits 27-31 and leaves bits 25-26 as 0 (fmt=00 for .S/.D)
        value = (operandValues.rs3 ?? 0) << 2;
        // Don't continue - process this field
      }
      // Special case 2: FP instructions use funct3 (bits 12-14) for rounding mode
      // When rm is specified in operandValues, encode it into funct3
      else if (fieldName === 'funct3' && 'rm' in operandValues &&
               field.startBit === 12 && field.endBit === 14 && field.value.includes('x')) {
        value = operandValues.rm;
        // Don't continue - process this field
      }
      else {
        continue;
      }
    }

    if (value === 0) { // Only evaluate switch if value wasn't set above
      switch (category) {
        case 'rd':
          value = operandValues.rd ?? 0;
          break;
        case 'rs1':
          // For vector VI instructions (e.g., VADD.VI), the immediate is encoded in the rs1 field position
          // The assembler puts the value in 'imm', so we fall back to imm if rs1 is not set
          value = operandValues.rs1 ?? operandValues.imm ?? 0;
          break;
        case 'rs2':
          value = operandValues.rs2 ?? 0;
          break;
        case 'rs3':
          value = operandValues.rs3 ?? 0;
          break;
        case 'immediate':
        case 'offset':
          // Extract appropriate bits from the full immediate
          value = extractImmediateBits(operandValues.imm ?? 0, fieldName);
          break;
        case 'csr':
          value = operandValues.csr ?? 0;
          break;
        case 'shamt':
          value = operandValues.shamt ?? operandValues.imm ?? 0;
          break;
        case 'rm':
          value = operandValues.rm ?? 7; // Default dynamic rounding
          break;
        case 'aq':
          value = operandValues.aq ?? 0;
          break;
        case 'rl':
          value = operandValues.rl ?? 0;
          break;
        case 'vm':
          value = operandValues.vm ?? 1; // Default unmasked
          break;
        default:
          // For other categories, try to use the field name as key
          if (fieldName in operandValues) {
            value = operandValues[fieldName];
          }
          break;
      }
    }

    // Use setBitsPreservingFixed for fields with mixed fixed and variable bits
    // (e.g., SRAI has imm field "0100000xxxxx", C.SRAI has rd field "01xxx")
    // EXCEPT for funct/opcode fields which often have inaccurate patterns in encodingFields
    if (/[01]/.test(field.value) && /x/i.test(field.value) &&
        category !== 'funct' && category !== 'opcode') {
      // Field with both fixed and variable bits - preserve them
      encoded = setBitsPreservingFixed(encoded, value, field.startBit, field.endBit, field.value);
    } else {
      // Regular field - set all bits in range
      encoded = setBits(encoded, value, field.startBit, field.endBit);
    }
  }

  return encoded;
}

// ============================================================================
// PARSING HELPERS
// ============================================================================

/**
 * Parse an integer register operand and return its number (0-31)
 *
 * @param regStr - Register string like "x5", "t0", "sp"
 * @returns Register number or -1 if invalid
 */
function parseRegister(regStr: string): number {
  const normalized = regStr.toLowerCase().trim();
  if (normalized in REGISTER_MAP) {
    return REGISTER_MAP[normalized];
  }
  return -1;
}

/**
 * Parse a floating-point register operand and return its number (0-31)
 *
 * @param regStr - Register string like "f5", "ft0", "fa0"
 * @returns Register number or -1 if invalid
 */
function parseFPRegister(regStr: string): number {
  const normalized = regStr.toLowerCase().trim();
  if (normalized in FP_REGISTER_MAP) {
    return FP_REGISTER_MAP[normalized];
  }
  return -1;
}

/**
 * Parse a vector register operand and return its number (0-31)
 *
 * @param regStr - Register string like "v0", "v15", "v31"
 * @returns Register number or -1 if invalid
 */
function parseVectorRegister(regStr: string): number {
  const normalized = regStr.toLowerCase().trim();
  if (normalized in VECTOR_REGISTER_MAP) {
    return VECTOR_REGISTER_MAP[normalized];
  }
  return -1;
}

/**
 * Parse a CSR name or number and return its number
 *
 * @param csrStr - CSR string like "mstatus", "0x300", "768"
 * @param allowNumeric - Whether to allow numeric CSR values (default false to avoid
 *                       catching immediates; set true only for actual CSR instruction operands)
 * @returns CSR number or -1 if invalid
 */
function parseCSR(csrStr: string, allowNumeric: boolean = false): number {
  const normalized = csrStr.toLowerCase().trim();

  // Check named CSRs first
  if (normalized in CSR_MAP) {
    return CSR_MAP[normalized];
  }

  // Only parse numeric CSRs if explicitly allowed (for actual CSR instructions)
  if (allowNumeric) {
    // Try parsing as number (hex or decimal)
    if (normalized.startsWith('0x')) {
      const val = parseInt(normalized, 16);
      if (!isNaN(val) && val >= 0 && val <= 0xFFF) {
        return val;
      }
    } else {
      const val = parseInt(normalized, 10);
      if (!isNaN(val) && val >= 0 && val <= 0xFFF) {
        return val;
      }
    }
  }

  return -1;
}

/**
 * Parse an immediate value (decimal, hex, binary, or character literal)
 *
 * @param immStr - Immediate string like "42", "0x2A", "0b101010", "'A'"
 * @param constants - Map of constant names to values (from .equ directives)
 * @returns Parsed number or NaN if invalid
 */
function parseImmediateValue(immStr: string, constants: Map<string, number> = new Map()): number {
  const trimmed = immStr.trim();

  // Check if it's a constant reference
  if (constants.has(trimmed)) {
    return constants.get(trimmed)!;
  }

  // Character literal like 'A' or '\n'
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const charContent = trimmed.slice(1, -1);
    if (charContent.length === 1) {
      return charContent.charCodeAt(0);
    } else if (charContent.startsWith('\\')) {
      // Escape sequences
      switch (charContent[1]) {
        case 'n': return 10; // newline
        case 'r': return 13; // carriage return
        case 't': return 9;  // tab
        case '0': return 0;  // null
        case '\\': return 92; // backslash
        case "'": return 39;  // single quote
        default: return charContent.charCodeAt(1);
      }
    }
  }

  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    // Use BigInt for parsing to preserve precision for 64-bit values
    // Then convert to Number (may lose precision for values > 2^53)
    try {
      const bigVal = BigInt(trimmed);
      // For values that fit in safe integer range, return directly
      if (bigVal >= BigInt(Number.MIN_SAFE_INTEGER) && bigVal <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(bigVal);
      }
      // For large values, store the BigInt precision in a way we can recover
      // Use a trick: return a negative number that encodes we have a BigInt
      // Actually, just return the Number and handle precision in expand64BitLI
      // But first, store the original string for later retrieval
      // Actually the cleanest approach: just return Number(bigVal) and handle
      // the 64-bit case specially by re-parsing from the original string
      return Number(bigVal);
    } catch {
      return parseInt(trimmed, 16);
    }
  }
  if (trimmed.startsWith('0b') || trimmed.startsWith('0B')) {
    return parseInt(trimmed.slice(2), 2);
  }
  return parseInt(trimmed, 10);
}

/**
 * Parse an immediate value (decimal, hex, or binary)
 *
 * @param immStr - Immediate string like "42", "0x2A", "0b101010"
 * @returns Parsed number or NaN if invalid
 */
function parseImmediate(immStr: string): number {
  return parseImmediateValue(immStr);
}

/**
 * Check if a string is a valid label reference (not a number)
 */
function isLabel(str: string): boolean {
  const trimmed = str.trim();
  // Labels start with letter or underscore, not a digit
  return /^[a-zA-Z_]/.test(trimmed);
}

/**
 * Parse a single operand string
 * Handles integer, FP, vector registers, CSRs, memory operands, labels, and immediates
 */
export function parseOperand(operandStr: string): ParsedOperand {
  const trimmed = operandStr.trim();

  // Atomic instruction format: (rs1) - register in parentheses without offset
  // Used by LR.W/LR.D/SC.W/SC.D/AMO* instructions
  const atomicMatch = trimmed.match(/^\(\s*(\w+)\s*\)$/);
  if (atomicMatch) {
    const baseRegStr = atomicMatch[1];
    const intReg = parseRegister(baseRegStr);
    if (intReg !== -1) {
      return { type: 'memory', value: 0, offset: 0, base: intReg, baseType: 'int' };
    }
  }

  // Memory operand: offset(base) like "4(sp)", "0(x2)", "8(f0)", "0xFF(t0)" for FP loads/stores
  // Supports decimal, hex (0x), and binary (0b) offsets
  const memMatch = trimmed.match(/^(-?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+))\s*\(\s*(\w+)\s*\)$/);
  if (memMatch) {
    const offset = parseImmediate(memMatch[1]);
    const baseRegStr = memMatch[2];

    // Try integer register first (most common)
    const intReg = parseRegister(baseRegStr);
    if (intReg !== -1) {
      return { type: 'memory', value: offset, offset, base: intReg, baseType: 'int' };
    }

    // Try FP register
    const fpReg = parseFPRegister(baseRegStr);
    if (fpReg !== -1) {
      return { type: 'memory', value: offset, offset, base: fpReg, baseType: 'fp' };
    }
  }

  // Integer register operand (x0-x31, ABI names)
  const regNum = parseRegister(trimmed);
  if (regNum !== -1) {
    return { type: 'register', value: regNum };
  }

  // FP register operand (f0-f31, FP ABI names)
  const fpRegNum = parseFPRegister(trimmed);
  if (fpRegNum !== -1) {
    return { type: 'fp_register', value: fpRegNum };
  }

  // Vector register operand (v0-v31)
  const vecRegNum = parseVectorRegister(trimmed);
  if (vecRegNum !== -1) {
    return { type: 'vector_register', value: vecRegNum };
  }

  // CSR operand (named or numeric)
  const csrNum = parseCSR(trimmed);
  if (csrNum !== -1) {
    return { type: 'csr', value: csrNum };
  }

  // Rounding mode operand (for FP instructions)
  // Must check BEFORE labels since rounding mode names like "rtz" would match label pattern
  const rmUpper = trimmed.toUpperCase();
  if (rmUpper in ROUNDING_MODE_MAP) {
    return { type: 'rounding_mode', value: ROUNDING_MODE_MAP[rmUpper as keyof typeof ROUNDING_MODE_MAP] };
  }

  // Vector type field operand (for VSETVLI/VSETIVLI instructions)
  // Must check BEFORE labels since vtype names like "e32", "m1", "ta", "ma" would match label pattern
  if (rmUpper in VTYPE_FIELD_MAP) {
    const vtypeInfo = VTYPE_FIELD_MAP[rmUpper];
    return { type: 'vtype_field', value: vtypeInfo.value, vtypeField: vtypeInfo.field };
  }

  // Label reference (for branches/jumps)
  if (isLabel(trimmed)) {
    return { type: 'label', value: trimmed };
  }

  // Immediate value
  // For large hex values (64-bit), store the original string to preserve precision
  // since JavaScript Numbers can't accurately represent values > 2^53
  if ((trimmed.startsWith('0x') || trimmed.startsWith('0X')) && trimmed.length > 10) {
    // Potentially a large 64-bit value - store as string for precision
    return { type: 'immediate', value: trimmed };
  }
  const immVal = parseImmediate(trimmed);
  return { type: 'immediate', value: immVal };
}

/**
 * Parse a directive line and extract the directive and its arguments
 *
 * @param line - The directive line (starting with .)
 * @returns Parsed directive or null if not a valid directive
 */
function parseDirective(line: string): ParsedDirective | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('.')) {
    return null;
  }

  // Split into directive name and arguments
  const spaceIndex = trimmed.indexOf(' ');
  let directiveName: string;
  let argsStr: string;

  if (spaceIndex === -1) {
    directiveName = trimmed.slice(1).toLowerCase();
    argsStr = '';
  } else {
    directiveName = trimmed.slice(1, spaceIndex).toLowerCase();
    argsStr = trimmed.slice(spaceIndex + 1).trim();
  }

  // Parse arguments based on directive type
  let args: string[] = [];
  if (argsStr) {
    // Handle comma-separated values for .word, .half, .byte
    // But also handle .equ which has NAME, value format
    args = argsStr.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);
  }

  return { directive: directiveName, args };
}

/**
 * Parse assembly source into structured lines
 */
function parseSource(text: string): ParsedLine[] {
  const lines = text.split('\n');
  const result: ParsedLine[] = [];
  let currentSection: SectionType = 'text';

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    let line = lines[i];

    // Remove comments (everything after #)
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) {
      line = line.slice(0, commentIndex);
    }

    // Trim whitespace
    line = line.trim();

    // Skip empty lines
    if (!line) {
      result.push({ lineNumber, operands: [], originalText: lines[i], section: currentSection });
      continue;
    }

    const parsed: ParsedLine = {
      lineNumber,
      operands: [],
      originalText: lines[i],
      section: currentSection,
    };

    // Check for label (ends with colon)
    const labelMatch = line.match(/^(\w+):\s*(.*)/);
    if (labelMatch) {
      parsed.label = labelMatch[1];
      line = labelMatch[2].trim();
    }

    // Skip if only a label
    if (!line) {
      result.push(parsed);
      continue;
    }

    // Check for directives
    if (line.startsWith('.')) {
      const directive = parseDirective(line);
      if (directive) {
        parsed.directive = directive;

        // Update current section for section directives
        if (directive.directive === 'text') {
          currentSection = 'text';
          parsed.section = 'text';
        } else if (directive.directive === 'data') {
          currentSection = 'data';
          parsed.section = 'data';
        }
      }
      result.push(parsed);
      continue;
    }

    // Parse mnemonic and operands
    const parts = line.split(/\s+/);
    parsed.mnemonic = parts[0].toUpperCase();

    // Join remaining parts and split by comma
    const operandsStr = parts.slice(1).join(' ');
    if (operandsStr.trim()) {
      const operandParts = operandsStr.split(',');
      parsed.operands = operandParts.map(parseOperand);
    }

    result.push(parsed);
  }

  return result;
}

/**
 * Helper to check if format is a compressed format
 */
function isCompressedFormat(format: string): boolean {
  const compressedFormats = ['CR-Type', 'CI-Type', 'CSS-Type', 'CIW-Type', 'CL-Type', 'CS-Type', 'CA-Type', 'CB-Type', 'CJ-Type', 'C-Type'];
  return compressedFormats.includes(format);
}

/**
 * Get instruction size in bytes (2 for compressed, 4 for standard)
 */
function getInstructionSize(mnemonic: string): number {
  const instr = lookupInstruction(mnemonic);
  if (instr && isCompressedFormat(instr.format)) {
    return 2; // 16-bit compressed instruction
  }
  return 4; // 32-bit standard instruction
}

/**
 * Calculate the size in bytes that a data directive will emit
 */
function getDataDirectiveSize(
  directive: ParsedDirective,
  currentAddress: bigint,
  constants: Map<string, number>
): number {
  switch (directive.directive) {
    case 'word':
    case 'float':
      return directive.args.length * 4;
    case 'dword':
    case 'quad':
    case 'double':
      return directive.args.length * 8;
    case 'half':
      return directive.args.length * 2;
    case 'byte':
      return directive.args.length * 1;
    case 'space': {
      const size = directive.args.length > 0 ? parseImmediateValue(directive.args[0], constants) : 0;
      return Math.max(0, size);
    }
    case 'align': {
      const power = directive.args.length > 0 ? parseImmediateValue(directive.args[0], constants) : 0;
      const alignment = Math.pow(2, power);
      const currentOffset = Number(currentAddress);
      const misalignment = currentOffset % alignment;
      return misalignment === 0 ? 0 : alignment - misalignment;
    }
    case 'string':
    case 'asciz': {
      // Count characters including null terminator
      let totalLen = 0;
      for (const arg of directive.args) {
        // Remove surrounding quotes if present
        let str = arg;
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
          str = str.slice(1, -1);
        }
        // Approximate length (escape sequences count as 1)
        totalLen += str.replace(/\\./g, 'X').length + 1; // +1 for null terminator
      }
      return totalLen;
    }
    case 'ascii': {
      // Same as asciz but without null terminator
      let totalLen = 0;
      for (const arg of directive.args) {
        let str = arg;
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
          str = str.slice(1, -1);
        }
        totalLen += str.replace(/\\./g, 'X').length;
      }
      return totalLen;
    }
    default:
      return 0;
  }
}

// ============================================================================
// PSEUDO-INSTRUCTION HANDLING
// ============================================================================

/**
 * Check if a mnemonic is a known pseudo-instruction
 */
function isPseudoInstruction(mnemonic: string): boolean {
  const upperMnemonic = mnemonic.toUpperCase();
  // LI is special - always handle it specially because its expansion varies by immediate size
  if (upperMnemonic === 'LI') {
    return true;
  }
  return PSEUDOINSTRUCTION_MAP.has(upperMnemonic);
}

/**
 * Parse operand names from pseudoinstruction format string
 * e.g., "mv rd, rs" -> ["rd", "rs"]
 */
function parsePseudoOperandNames(formatStr: string): string[] {
  // Remove the mnemonic and parse operands
  const parts = formatStr.split(/\s+/);
  if (parts.length < 2) return [];

  const operandsStr = parts.slice(1).join(' ');
  return operandsStr.split(',').map(op => op.trim());
}

/**
 * Parse and substitute a base instruction string from pseudo-instruction
 *
 * @param baseInstr - Base instruction template like "addi rd, rs, 0" or "auipc rd, symbol[31:12]"
 * @param operandMap - Map of operand names to actual values
 * @param symbolOffset - Offset for symbol resolution (PC-relative)
 * @returns Parsed instruction ready for encoding
 */
function parseBaseInstruction(
  baseInstr: string,
  operandMap: Record<string, ParsedOperand>,
  symbolOffset: number
): { mnemonic: string; operands: ParsedOperand[] } | null {
  // Parse base instruction - format: "mnemonic op1, op2, op3"
  const parts = baseInstr.trim().split(/\s+/);
  const mnemonic = parts[0].toUpperCase();

  // Handle instructions with no operands
  if (parts.length === 1) {
    return { mnemonic, operands: [] };
  }

  const operandsStr = parts.slice(1).join(' ');
  const operandParts = operandsStr.split(',').map(op => op.trim());
  const operands: ParsedOperand[] = [];

  for (const part of operandParts) {
    // Check for memory operand format: symbol[11:0](rd) or offset(rs1)
    const memWithSymbolMatch = part.match(/^(\w+)\[(\d+):(\d+)\]\((\w+)\)$/);
    if (memWithSymbolMatch) {
      // First group is symbol name (used for pattern matching, not directly used)
      const highBit = parseInt(memWithSymbolMatch[2]);
      const lowBit = parseInt(memWithSymbolMatch[3]);

      // Extract bits from symbol offset
      const width = highBit - lowBit + 1;
      const extractedValue = (symbolOffset >> lowBit) & ((1 << width) - 1);

      // Get base register
      const baseName = memWithSymbolMatch[4];
      let baseReg = 0;
      if (baseName in operandMap) {
        baseReg = operandMap[baseName].value as number;
      } else {
        // Try as literal register
        const regVal = parseRegister(baseName);
        baseReg = regVal !== -1 ? regVal : 0;
      }

      operands.push({
        type: 'memory',
        value: extractedValue,
        offset: extractedValue,
        base: baseReg,
        baseType: 'int',
      });
      continue;
    }

    // Check for symbol with bit extraction: symbol[31:12] or offset[11:0]
    const symbolBitMatch = part.match(/^(\w+)\[(\d+):(\d+)\]$/);
    if (symbolBitMatch) {
      // First group is symbol name (used for pattern matching, not directly used)
      const highBit = parseInt(symbolBitMatch[2]);
      const lowBit = parseInt(symbolBitMatch[3]);

      // Extract bits from symbol offset
      const width = highBit - lowBit + 1;
      let extractedValue: number;

      // For [31:12] extraction (upper bits for AUIPC/LUI), we need to adjust
      // for sign extension of the lower 12 bits. When the ADDI uses the lower
      // 12 bits, they are sign-extended. If bit 11 is set (value >= 0x800),
      // the sign-extended value is negative, so we need to add 1 to the upper
      // bits to compensate.
      if (highBit === 31 && lowBit === 12) {
        extractedValue = ((symbolOffset + 0x800) >> 12) & ((1 << width) - 1);
      } else {
        extractedValue = (symbolOffset >> lowBit) & ((1 << width) - 1);
      }

      operands.push({ type: 'immediate', value: extractedValue });
      continue;
    }

    // Check for GOT symbol patterns (simplified - treat as regular symbol)
    const gotMatch = part.match(/^(\w+)@GOT\[(\d+):(\d+)\]$/);
    if (gotMatch) {
      const highBit = parseInt(gotMatch[2]);
      const lowBit = parseInt(gotMatch[3]);
      const width = highBit - lowBit + 1;
      let extractedValue: number;
      if (highBit === 31 && lowBit === 12) {
        extractedValue = ((symbolOffset + 0x800) >> 12) & ((1 << width) - 1);
      } else {
        extractedValue = (symbolOffset >> lowBit) & ((1 << width) - 1);
      }
      operands.push({ type: 'immediate', value: extractedValue });
      continue;
    }

    // Check for literal register (x0, x1, etc.)
    const literalRegMatch = part.match(/^x(\d+)$/i);
    if (literalRegMatch) {
      operands.push({ type: 'register', value: parseInt(literalRegMatch[1]) });
      continue;
    }

    // Check for operand substitution (rd, rs, rt, etc.)
    if (part in operandMap) {
      operands.push(operandMap[part]);
      continue;
    }

    // Check for arithmetic expressions (e.g., "32 - 8", "i-1")
    const arithMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (arithMatch) {
      const result = parseInt(arithMatch[1]) - parseInt(arithMatch[2]);
      operands.push({ type: 'immediate', value: result });
      continue;
    }

    // Check for "i-1" style (variable minus constant)
    const varArithMatch = part.match(/^(\w+)-(\d+)$/);
    if (varArithMatch && varArithMatch[1] in operandMap) {
      const varOp = operandMap[varArithMatch[1]];
      const subValue = parseInt(varArithMatch[2]);
      if (varOp.type === 'immediate') {
        operands.push({ type: 'immediate', value: (varOp.value as number) - subValue });
        continue;
      }
    }

    // Try to parse as a literal value
    const immVal = parseImmediate(part);
    if (!isNaN(immVal)) {
      operands.push({ type: 'immediate', value: immVal });
      continue;
    }

    // Last resort: try as register or pass through
    const regVal = parseRegister(part);
    if (regVal !== -1) {
      operands.push({ type: 'register', value: regVal });
    } else {
      // Unknown - treat as label or immediate
      operands.push({ type: 'immediate', value: 0 });
    }
  }

  return { mnemonic, operands };
}

/**
 * Find the best matching pseudo-instruction definition based on operand count and types
 *
 * For symbol-based pseudo-instructions (like "lw rd, symbol"), only match if the
 * second operand is actually a label, not a memory operand like "4(sp)".
 */
function findPseudoInstructionDef(
  mnemonic: string,
  operandCount: number,
  operands: ParsedOperand[] = []
): PseudoInstructionDef | null {
  const defs = PSEUDOINSTRUCTION_MAP.get(mnemonic.toUpperCase());
  if (!defs || defs.length === 0) return null;

  // Find definition that best matches operand count and types
  // Parse the pseudoinstruction format to count expected operands
  let fallbackDef: PseudoInstructionDef | null = null;

  for (const def of defs) {
    const expectedOperands = parsePseudoOperandNames(def.pseudoinstruction);
    if (expectedOperands.length === operandCount) {
      // Check if this is a symbol-based pseudo-instruction (e.g., "lw rd, symbol")
      // If so, only match if the last operand is a label, not a memory operand
      const lastExpected = expectedOperands[expectedOperands.length - 1]?.toLowerCase();
      if (lastExpected === 'symbol' || lastExpected === 'offset') {
        const lastActual = operands[operands.length - 1];
        // If we have a memory operand (like "4(sp)"), this is NOT a symbol-based pseudo-instruction
        if (lastActual?.type === 'memory') {
          continue; // Skip this pseudo-instruction definition
        }
      }

      // Prefer RV32 definitions over RV64
      if (def.requiredExtensions.some(ext => ext.startsWith('RV32'))) {
        return def;
      }
      // Keep the first matching definition as fallback
      if (!fallbackDef) {
        fallbackDef = def;
      }
    }
  }

  // Return fallback definition if no RV32 match was found
  return fallbackDef;
}

/**
 * Expand pseudo-instructions into real instructions using data from pseudoinstructions.json
 * Returns array of machine code words
 */
function expandPseudoInstruction(
  mnemonic: string,
  operands: ParsedOperand[],
  labels: Map<string, bigint>,
  currentAddress: bigint,
  constants: Map<string, number> = new Map()
): number[] {
  const upperMnemonic = mnemonic.toUpperCase();

  // Helper to resolve immediate values that might be constants
  // Returns the immediate value. For 64-bit values, may lose precision - use resolveImmediateBigInt for those
  const resolveImmediate = (operand: ParsedOperand | undefined): number => {
    if (!operand) return 0;
    if (operand.type === 'immediate') {
      const val = operand.value;
      if (typeof val === 'string') {
        // Check if it's a constant reference
        if (constants.has(val)) {
          return constants.get(val)!;
        }
        // It's a hex string stored for precision - parse with BigInt
        if (val.startsWith('0x') || val.startsWith('0X')) {
          return Number(BigInt(val));
        }
        return parseFloat(val);
      }
      return val as number;
    }
    if (operand.type === 'label' && typeof operand.value === 'string') {
      // Check if it's a constant
      if (constants.has(operand.value)) {
        return constants.get(operand.value)!;
      }
    }
    return 0;
  };

  // Helper to resolve immediate values to BigInt for 64-bit precision
  const resolveImmediateBigInt = (operand: ParsedOperand | undefined): bigint => {
    if (!operand) return 0n;
    if (operand.type === 'immediate') {
      const val = operand.value;
      if (typeof val === 'string') {
        // Check if it's a constant reference
        if (constants.has(val)) {
          return BigInt(constants.get(val)!);
        }
        // It's a hex string - parse with BigInt for full precision
        if (val.startsWith('0x') || val.startsWith('0X')) {
          return BigInt(val);
        }
        return BigInt(Math.floor(parseFloat(val)));
      }
      return BigInt(val);
    }
    if (operand.type === 'label' && typeof operand.value === 'string') {
      // Check if it's a constant
      if (constants.has(operand.value)) {
        return BigInt(constants.get(operand.value)!);
      }
    }
    return 0n;
  };

  // Helper to resolve label to offset
  const resolveLabel = (operand: ParsedOperand | undefined): number => {
    if (!operand) return 0;
    if (operand.type === 'label') {
      const labelName = operand.value as string;
      const targetAddr = labels.get(labelName) ?? currentAddress;
      return Number(targetAddr - currentAddress);
    }
    if (operand.type === 'immediate') {
      return resolveImmediate(operand);
    }
    return 0;
  };

  // =========================================================================
  // SPECIAL CASE: FENCE - Uses ordering bits, not registers
  // fence iorw, iorw = 0x0FF0000F (default fence on all memory/IO)
  // =========================================================================
  if (upperMnemonic === 'FENCE') {
    // FENCE encoding: fm=0, pred=bits[27:24], succ=bits[23:20], rs1=0, funct3=000, rd=0, opcode=0001111
    // Bits: i=3, o=2, r=1, w=0
    const parseFenceOrdering = (str: string): number => {
      let result = 0;
      const upper = str.toUpperCase();
      if (upper.includes('I')) result |= 0b1000; // bit 3
      if (upper.includes('O')) result |= 0b0100; // bit 2
      if (upper.includes('R')) result |= 0b0010; // bit 1
      if (upper.includes('W')) result |= 0b0001; // bit 0
      return result;
    };

    let pred = 0b1111; // Default: iorw
    let succ = 0b1111; // Default: iorw

    // Parse operands if provided (operands are parsed as labels since iorw, rw, etc. match label pattern)
    if (operands.length >= 2) {
      // First operand is predecessor, second is successor
      if (operands[0].type === 'label') {
        pred = parseFenceOrdering(operands[0].value as string);
      }
      if (operands[1].type === 'label') {
        succ = parseFenceOrdering(operands[1].value as string);
      }
    } else if (operands.length === 1 && operands[0].type === 'label') {
      // Single operand - use for both pred and succ
      pred = succ = parseFenceOrdering(operands[0].value as string);
    }

    // Build FENCE encoding: pred in bits [27:24], succ in bits [23:20], opcode = 0x0F
    const encoded = (pred << 24) | (succ << 20) | 0x0F;
    return [encoded];
  }

  // =========================================================================
  // HELPER: Expand 64-bit LI to instruction sequence
  // For values that don't fit in 32 bits, we need multiple instructions
  // =========================================================================
  function expand64BitLI(rd: number, immBigInt: bigint): number[] {
    const result: number[] = [];

    // Handle negative values by masking to 64 bits
    let val = immBigInt;
    if (val < 0n) {
      val = val & 0xFFFFFFFFFFFFFFFFn; // Mask to 64 bits
    }

    // Strategy: Load upper 32 bits, shift left 32, then add lower 32 bits
    const upper32 = Number((val >> 32n) & 0xFFFFFFFFn);
    const lower32 = Number(val & 0xFFFFFFFFn);

    const luiInstr = lookupInstruction('LUI');
    const addiInstr = lookupInstruction('ADDI');
    const slliInstr = lookupInstruction('SLLI');
    const addInstr = lookupInstruction('ADD');

    if (!luiInstr || !addiInstr || !slliInstr || !addInstr) {
      return [0];
    }

    // If upper 32 bits are zero, just load lower 32 bits
    if (upper32 === 0) {
      // Just load the lower 32 bits
      const upperLower = ((lower32 + 0x800) | 0) >> 12;
      const lowerLower = lower32 - (upperLower << 12);

      if (upperLower !== 0) {
        result.push(encodeInstructionDataDriven(luiInstr, { rd, imm: upperLower }));
        if (lowerLower !== 0) {
          result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: rd, imm: lowerLower }));
        }
      } else {
        result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: 0, imm: lowerLower }));
      }
      return result;
    }

    // Load upper 32 bits into rd
    // Handle as signed 32-bit value
    let signedUpper32 = upper32;
    if (signedUpper32 > 0x7FFFFFFF) {
      signedUpper32 = signedUpper32 - 0x100000000;
    }

    let lui32Upper = ((signedUpper32 + 0x800) | 0) >> 12;
    let addi32Lower = signedUpper32 - (lui32Upper << 12);

    // Ensure addi32Lower is in range
    if (addi32Lower > 2047) {
      addi32Lower = addi32Lower - 4096;
      lui32Upper += 1;
    } else if (addi32Lower < -2048) {
      addi32Lower = addi32Lower + 4096;
      lui32Upper -= 1;
    }

    if (lui32Upper !== 0) {
      result.push(encodeInstructionDataDriven(luiInstr, { rd, imm: lui32Upper & 0xFFFFF }));
      if (addi32Lower !== 0) {
        result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: rd, imm: addi32Lower }));
      }
    } else if (addi32Lower !== 0) {
      result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: 0, imm: addi32Lower }));
    } else {
      // Upper 32 bits are 0, just proceed with shift of 0
      result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: 0, imm: 0 }));
    }

    // Shift left by 32 (SLLI with shamt=32)
    result.push(encodeInstructionDataDriven(slliInstr, { rd, rs1: rd, shamt: 32, imm: 32 }));

    // Now add the lower 32 bits
    // We need a temp register - use the same rd as temp by doing addi + add sequence
    // Actually, for simplicity, load lower32 into rd using lui+addi, then add

    // Handle lower 32 bits as signed
    let signedLower32 = lower32;
    if (signedLower32 > 0x7FFFFFFF) {
      signedLower32 = signedLower32 - 0x100000000;
    }

    // Use ADDIW for lower 32 bits if available (sign-extends properly)
    // Or we can construct and add
    // Simpler approach: encode lower 32 in steps using ORI/ADDI

    // For now, use lui + addi + add pattern with a workaround:
    // We'll use addi with small chunks
    if (lower32 === 0) {
      // Nothing more to do
      return result;
    }

    // Split lower32 into chunks we can add
    // Use addiw if lower32 fits in 32-bit signed
    const addiWInstr = lookupInstruction('ADDIW');
    if (addiWInstr && signedLower32 >= -2048 && signedLower32 <= 2047) {
      // Simple case: lower fits in 12-bit immediate
      // But we need to OR it in, not add to shifted value...
      // Actually for lower32, we need to add it to the shifted upper value
      // Since shifted value has all zeros in lower 32 bits, ORI or ADDI work the same
      const oriInstr = lookupInstruction('ORI');
      if (oriInstr && signedLower32 >= 0) {
        result.push(encodeInstructionDataDriven(oriInstr, { rd, rs1: rd, imm: signedLower32 & 0xFFF }));
      } else {
        result.push(encodeInstructionDataDriven(addiInstr, { rd, rs1: rd, imm: signedLower32 }));
      }
    } else {
      // Need lui+addi for lower32, then add to rd
      // But we can't clobber rd... need to use a different approach
      // Use t6 (x31) as temp if available
      const tempReg = 31; // t6

      let lui32LowerUpper = ((signedLower32 + 0x800) | 0) >> 12;
      let addi32LowerLower = signedLower32 - (lui32LowerUpper << 12);

      if (addi32LowerLower > 2047) {
        addi32LowerLower = addi32LowerLower - 4096;
        lui32LowerUpper += 1;
      } else if (addi32LowerLower < -2048) {
        addi32LowerLower = addi32LowerLower + 4096;
        lui32LowerUpper -= 1;
      }

      if (lui32LowerUpper !== 0) {
        result.push(encodeInstructionDataDriven(luiInstr, { rd: tempReg, imm: lui32LowerUpper & 0xFFFFF }));
        if (addi32LowerLower !== 0) {
          result.push(encodeInstructionDataDriven(addiInstr, { rd: tempReg, rs1: tempReg, imm: addi32LowerLower }));
        }
      } else {
        result.push(encodeInstructionDataDriven(addiInstr, { rd: tempReg, rs1: 0, imm: addi32LowerLower }));
      }

      // Zero-extend the lower 32 bits using SLLI+SRLI to clear upper bits in temp
      // (only needed if signedLower32 was negative)
      if (signedLower32 < 0) {
        // Zero-extend: shift left 32, then logical right 32
        result.push(encodeInstructionDataDriven(slliInstr, { rd: tempReg, rs1: tempReg, shamt: 32, imm: 32 }));
        const srliInstr = lookupInstruction('SRLI');
        if (srliInstr) {
          result.push(encodeInstructionDataDriven(srliInstr, { rd: tempReg, rs1: tempReg, shamt: 32, imm: 32 }));
        }
      }

      // Add temp to rd
      result.push(encodeInstructionDataDriven(addInstr, { rd, rs1: rd, rs2: tempReg }));
    }

    return result;
  }

  // =========================================================================
  // SPECIAL CASE: LI - Variable length expansion
  // LI is special because it expands to 1 or 2 instructions depending on immediate size
  // =========================================================================
  if (upperMnemonic === 'LI') {
    if (operands.length >= 2) {
      const rd = operands[0].type === 'register' ? operands[0].value as number : 0;

      // For RV64, check if this is a 64-bit value using BigInt for precision
      if (currentXlen === 64) {
        const immBig = resolveImmediateBigInt(operands[1]);
        // Check if value requires 64-bit handling (outside 32-bit signed range)
        if (immBig > 0x7FFFFFFFn || immBig < -0x80000000n) {
          // 64-bit immediate: need extended sequence
          return expand64BitLI(rd, immBig);
        }
      }

      let imm = resolveImmediate(operands[1]);

      // Convert to 32-bit signed representation for proper handling
      // JavaScript treats 0xFFFFFFFF as 4294967295, but we need -1 for RISC-V
      if (imm > 0x7FFFFFFF && imm <= 0xFFFFFFFF) {
        imm = imm - 0x100000000; // Convert unsigned 32-bit to signed
      }

      // Handle signed 12-bit immediate (fits in addi)
      if (imm >= -2048 && imm <= 2047) {
        const addiInstr = lookupInstruction('ADDI');
        if (addiInstr) {
          return [encodeInstructionDataDriven(addiInstr, { rd, rs1: 0, imm })];
        }
      }

      // For larger immediates, use lui + addi
      // Use bitwise operations to ensure proper 32-bit handling
      let upper = ((imm + 0x800) | 0) >> 12; // | 0 forces 32-bit signed
      // Force lower to 32-bit signed to handle cases like 0x7FFFFFFF - 0x80000000 = 0xFFFFFFFF = -1
      let lower = (imm - (upper << 12)) | 0;

      // Ensure lower is in the correct 12-bit signed range
      if (lower > 2047) {
        lower = lower - 4096;
        upper += 1;
      } else if (lower < -2048) {
        lower = lower + 4096;
        upper -= 1;
      }

      const luiInstr = lookupInstruction('LUI');
      const addiInstr = lookupInstruction('ADDI');
      if (luiInstr && addiInstr) {
        const luiCode = encodeInstructionDataDriven(luiInstr, { rd, imm: upper });
        if (lower !== 0) {
          const addiCode = encodeInstructionDataDriven(addiInstr, { rd, rs1: rd, imm: lower });
          return [luiCode, addiCode];
        }
        return [luiCode];
      }
    }
    return [0];
  }

  // =========================================================================
  // DATA-DRIVEN PSEUDO-INSTRUCTION EXPANSION
  // =========================================================================
  const pseudoDef = findPseudoInstructionDef(upperMnemonic, operands.length, operands);
  if (pseudoDef) {
    // Build operand map from pseudo-instruction format
    const expectedOperandNames = parsePseudoOperandNames(pseudoDef.pseudoinstruction);
    const operandMap: Record<string, ParsedOperand> = {};

    for (let i = 0; i < expectedOperandNames.length && i < operands.length; i++) {
      operandMap[expectedOperandNames[i]] = operands[i];
    }

    // Calculate symbol offset for PC-relative pseudo-instructions
    let symbolOffset = 0;

    // Check if any operand is a label/symbol that needs resolution
    for (const op of operands) {
      if (op.type === 'label') {
        const labelName = op.value as string;
        const targetAddr = labels.get(labelName) ?? currentAddress;
        symbolOffset = Number(targetAddr - currentAddress);
        break;
      }
      if (op.type === 'immediate') {
        // Could be an offset/immediate value
        symbolOffset = op.value as number;
      }
    }

    // For instructions that use offset as the operand name
    if ('offset' in operandMap && operandMap['offset'].type === 'label') {
      symbolOffset = resolveLabel(operandMap['offset']);
    }

    // Expand each base instruction
    const results: number[] = [];
    let localAddress = currentAddress;

    for (const baseInstrStr of pseudoDef.baseInstructions) {
      const parsed = parseBaseInstruction(baseInstrStr, operandMap, symbolOffset);
      if (!parsed) {
        results.push(0);
        continue;
      }

      const baseInstr = lookupInstruction(parsed.mnemonic);
      if (!baseInstr) {
        results.push(0);
        continue;
      }

      // Build operand values for encoding
      const opValues: Record<string, number> = {};

      // Map operands based on instruction's operand definitions
      const instrOperands = baseInstr.operands ?? [];
      for (let i = 0; i < instrOperands.length && i < parsed.operands.length; i++) {
        const opName = instrOperands[i].toLowerCase();
        const opValue = parsed.operands[i];

        if (opName === 'rd' || opName === 'vd' || opName === 'vs3') {
          // vs3 (vector store source) uses the same bit field as rd/vd (bits 7-11)
          opValues.rd = (opValue.type === 'register' || opValue.type === 'fp_register' || opValue.type === 'vector_register')
            ? opValue.value as number : 0;
        } else if (opName === 'rs1' || opName === 'vs1') {
          if (opValue.type === 'memory') {
            opValues.rs1 = opValue.base ?? 0;
            opValues.imm = opValue.offset ?? 0;
          } else {
            opValues.rs1 = (opValue.type === 'register' || opValue.type === 'fp_register' || opValue.type === 'vector_register')
              ? opValue.value as number : 0;
          }
        } else if (opName === 'rs2' || opName === 'vs2') {
          opValues.rs2 = (opValue.type === 'register' || opValue.type === 'fp_register' || opValue.type === 'vector_register')
            ? opValue.value as number : 0;
        } else if (opName === 'rs3') {
          // rs3 is used by R4-type fused multiply-add instructions (bits 27-31)
          opValues.rs3 = (opValue.type === 'register' || opValue.type === 'fp_register' || opValue.type === 'vector_register')
            ? opValue.value as number : 0;
        } else if (opName === 'imm' || opName === 'offset' || opName === 'shamt') {
          if (opValue.type === 'memory') {
            opValues.imm = opValue.offset ?? 0;
            // Also set rs1 from base if not already set
            if (!('rs1' in opValues)) {
              opValues.rs1 = opValue.base ?? 0;
            }
          } else if (opValue.type === 'label') {
            // Resolve label relative to current position in expansion
            const labelName = opValue.value as string;
            const targetAddr = labels.get(labelName) ?? localAddress;
            opValues.imm = Number(targetAddr - localAddress);
          } else {
            opValues.imm = opValue.value as number;
          }
        } else if (opName === 'csr') {
          opValues.csr = opValue.type === 'csr' ? opValue.value as number :
                         opValue.type === 'immediate' ? opValue.value as number : 0;
        }
      }

      const encoded = encodeInstructionDataDriven(baseInstr, opValues);
      results.push(encoded);
      localAddress += 4n;
    }

    return results;
  }

  // Not a pseudo-instruction
  return [0];
}

// ============================================================================
// MAIN INSTRUCTION ENCODING
// ============================================================================

/**
 * Helper to extract register value from operand (handles both int and FP)
 */
export function getRegisterValue(operand: ParsedOperand | undefined): number {
  if (!operand) return 0;
  if (operand.type === 'register' || operand.type === 'fp_register' || operand.type === 'vector_register') {
    return operand.value as number;
  }
  return 0;
}

/**
 * Encode a single instruction using data-driven approach
 * Handles all RISC-V instruction formats
 */
function encodeInstruction(
  line: ParsedLine,
  labels: Map<string, bigint>,
  currentAddress: bigint,
  constants: Map<string, number> = new Map()
): number {
  if (!line.mnemonic) {
    return 0;
  }

  const fullMnemonic = line.mnemonic.toUpperCase();
  const operands = line.operands;

  // Parse modifiers from mnemonic (e.g., FADD.S.RNE -> baseMnemonic: FADD.S, rm: 0)
  const { baseMnemonic, rm, aq, rl } = parseModifiers(fullMnemonic);

  // Try to find instruction with full mnemonic first, then base mnemonic
  let instr = lookupInstruction(fullMnemonic);
  let usedBaseMnemonic = false;
  if (!instr && baseMnemonic !== fullMnemonic) {
    instr = lookupInstruction(baseMnemonic);
    usedBaseMnemonic = true;
  }

  // Prefer native instructions over pseudo-instructions
  // This ensures that native bit manipulation instructions (like SEXT.B, ZEXT.H) are used
  // instead of their pseudo-instruction equivalents when the B extension is available
  if (!instr) {
    // No native instruction found - try pseudo-instruction (with base mnemonic)
    const pseudoResult = expandPseudoInstruction(baseMnemonic, operands, labels, currentAddress, constants);
    if (pseudoResult[0] !== 0) {
      return pseudoResult[0]; // Return first instruction of expansion
    }
    return 0; // Unknown instruction
  }

  // Special case: FENCE needs to parse pred/succ operands
  if (baseMnemonic === 'FENCE') {
    const parseFenceOrdering = (str: string): number => {
      let result = 0;
      const upper = str.toUpperCase();
      if (upper.includes('I')) result |= 0b1000; // bit 3
      if (upper.includes('O')) result |= 0b0100; // bit 2
      if (upper.includes('R')) result |= 0b0010; // bit 1
      if (upper.includes('W')) result |= 0b0001; // bit 0
      return result;
    };

    let pred = 0b1111; // Default: iorw
    let succ = 0b1111; // Default: iorw

    if (operands.length >= 2) {
      if (operands[0].type === 'label') {
        pred = parseFenceOrdering(operands[0].value as string);
      }
      if (operands[1].type === 'label') {
        succ = parseFenceOrdering(operands[1].value as string);
      }
    } else if (operands.length === 1 && operands[0].type === 'label') {
      pred = succ = parseFenceOrdering(operands[0].value as string);
    }

    // FENCE encoding: pred in bits [27:24], succ in bits [23:20], opcode = 0x0F
    return (pred << 24) | (succ << 20) | 0x0F;
  }

  // Native instruction found - use it
  // Build operand values map for data-driven encoding
  const opValues: Record<string, number> = {};
  const instrOperands = instr.operands ?? [];

  for (let i = 0; i < instrOperands.length && i < operands.length; i++) {
    const opName = instrOperands[i].toLowerCase();
    const opValue = operands[i];

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
      // Handle 'rs' operand name (used in instructions like SEXT.B, SEXT.H, REV8, ZEXT.H, etc.)
      // These instructions have operands ["rd", "rs"] but encoding expects rs1
      opValues.rs1 = getRegisterValue(opValue);
    } else if (opName === 'rs2') {
      if (opValue.type === 'memory') {
        // For stores: rs2 is source data, memory provides rs1 and imm
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
      } else if (opValue.type === 'label') {
        const labelName = opValue.value as string;
        const targetAddr = labels.get(labelName) ?? currentAddress;
        opValues.imm = Number(targetAddr - currentAddress);
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
      // Vector destination (vd) or store source (vs3) - both use rd encoding position (bits 7-11)
      opValues.rd = getRegisterValue(opValue);
    } else if (opName === 'vs1') {
      // Vector source register 1 - maps to rs1 encoding position
      opValues.rs1 = getRegisterValue(opValue);
    } else if (opName === 'vs2') {
      // Vector source register 2 - maps to rs2 encoding position
      opValues.rs2 = getRegisterValue(opValue);
    }
  }

  // Check for rounding mode operand that may be present as an extra operand
  // FP instructions like FADD.S can have optional rounding mode: fadd.s rd, rs1, rs2, rtz
  for (const op of operands) {
    if (op.type === 'rounding_mode' && !('rm' in opValues)) {
      opValues.rm = op.value as number;
      break;
    }
  }

  // Handle special instruction categories that need operand reordering

  // For atomic instructions (LR, SC, AMO*), operands have special format:
  // LR.W/LR.D: rd, (rs1) - only 2 operands, last is memory
  // SC.W/SC.D and AMO*: rd, rs2, (rs1) - 3 operands, last is memory
  const isAtomic = baseMnemonic.startsWith('LR.') || baseMnemonic.startsWith('SC.') || baseMnemonic.startsWith('AMO');
  if (isAtomic && operands.length >= 2) {
    // First operand is always rd
    opValues.rd = getRegisterValue(operands[0]);

    if (operands.length === 2) {
      // LR format: rd, (rs1)
      if (operands[1]?.type === 'memory') {
        opValues.rs1 = operands[1].base ?? 0;
      }
    } else if (operands.length >= 3) {
      // SC/AMO format: rd, rs2, (rs1)
      opValues.rs2 = getRegisterValue(operands[1]);
      if (operands[2]?.type === 'memory') {
        opValues.rs1 = operands[2].base ?? 0;
      }
    }
  }
  // For stores (S-type), operands are: rs2, offset(rs1)
  // This includes integer stores and FP stores (FSW, FSD, FSH, FSQ)
  else if (instr.format === 'S-type' ||
    ['FSW', 'FSD', 'FSH', 'FSQ'].includes(instr.mnemonic)) {
    if (operands.length >= 2) {
      // First operand is rs2 (data to store)
      opValues.rs2 = getRegisterValue(operands[0]);
      // Second operand is memory (offset and base)
      if (operands[1]?.type === 'memory') {
        opValues.rs1 = operands[1].base ?? 0;
        opValues.imm = operands[1].offset ?? 0;
      }
    }
  }
  // For loads (I-type with memory), operands are: rd, offset(rs1)
  // This includes integer loads (category "Load") and FP loads (FLW, FLD, FLH, FLQ)
  else if (instr.category === 'Load' ||
    ['FLW', 'FLD', 'FLH', 'FLQ'].includes(instr.mnemonic)) {
    if (operands.length >= 2) {
      opValues.rd = getRegisterValue(operands[0]);
      if (operands[1]?.type === 'memory') {
        opValues.rs1 = operands[1].base ?? 0;
        opValues.imm = operands[1].offset ?? 0;
      }
    }
  }

  // Apply modifiers parsed from mnemonic suffix
  // Only apply if modifiers were extracted (usedBaseMnemonic is true)
  if (usedBaseMnemonic) {
    if (rm !== undefined) {
      opValues.rm = rm;
    }
    if (aq !== undefined) {
      opValues.aq = aq;
    }
    if (rl !== undefined) {
      opValues.rl = rl;
    }
  }

  // For FP instructions, default rm to 7 (DYN - dynamic rounding from frm CSR) if not specified
  // This is the RISC-V standard behavior for FP operations without explicit rounding mode
  // Only apply to actual FP instructions that use rounding mode (not AMO/LR/SC which also have funct3)
  if (!('rm' in opValues)) {
    // Check if this instruction has an explicit 'rm' field with category 'rm'
    const hasExplicitRm = instr.encodingFields?.some(f => f.name === 'rm' && f.category === 'rm');
    // Or check if it's a FP arithmetic/conversion instruction (mnemonic starts with F and has variable funct3)
    const isFpWithRounding = baseMnemonic.startsWith('F') &&
      !baseMnemonic.startsWith('FENCE') &&
      !baseMnemonic.startsWith('FMV') &&
      !baseMnemonic.startsWith('FCLASS') &&
      !baseMnemonic.startsWith('FEQ') &&
      !baseMnemonic.startsWith('FLT') &&
      !baseMnemonic.startsWith('FLE') &&
      instr.encodingFields?.some(f => f.name === 'funct3' && f.startBit === 12 && f.endBit === 14 && f.value.includes('x'));
    if (hasExplicitRm || isFpWithRounding) {
      opValues.rm = 7; // DYN - use frm CSR
    }
  }

  // Handle VSETVLI/VSETIVLI/VSETVL - vector configuration instructions
  // Assembly syntax: vsetvli rd, rs1, e32, m1, ta, ma (multiple vtype field operands)
  // But instructions.json has operands: ["imm", "rs1", "rd"]
  // We need to: collect vtype fields → encode into single imm, fix operand mapping
  if (baseMnemonic === 'VSETVLI' || baseMnemonic === 'VSETIVLI') {
    // Collect vtype field values from operands
    let sew = 0, lmul = 0, ta = 0, ma = 0;
    let rdOperand: ParsedOperand | undefined;
    let rs1OrUimmOperand: ParsedOperand | undefined;

    for (const op of operands) {
      if (op.type === 'vtype_field') {
        switch (op.vtypeField) {
          case 'sew': sew = op.value as number; break;
          case 'lmul': lmul = op.value as number; break;
          case 'ta': ta = op.value as number; break;
          case 'ma': ma = op.value as number; break;
        }
      } else if (op.type === 'register') {
        // First register is rd, second is rs1 (for VSETVLI)
        if (!rdOperand) {
          rdOperand = op;
        } else if (!rs1OrUimmOperand) {
          rs1OrUimmOperand = op;
        }
      } else if (op.type === 'immediate') {
        // For VSETIVLI, second operand is uimm (immediate for AVL)
        if (rdOperand && !rs1OrUimmOperand) {
          rs1OrUimmOperand = op;
        }
      }
    }

    // Encode vtype from collected fields
    const vtype = encodeVtype(sew, lmul, ta, ma);

    // Set operand values correctly
    opValues.rd = rdOperand ? getRegisterValue(rdOperand) : 0;
    opValues.imm = vtype;

    if (baseMnemonic === 'VSETVLI') {
      // VSETVLI: rs1 is AVL source register
      opValues.rs1 = rs1OrUimmOperand ? getRegisterValue(rs1OrUimmOperand) : 0;
    } else {
      // VSETIVLI: rs1 field holds uimm (5-bit immediate for AVL)
      opValues.rs1 = rs1OrUimmOperand?.type === 'immediate' ? (rs1OrUimmOperand.value as number) & 0x1F : 0;
    }
  }
  // VSETVL: vsetvl rd, rs1, rs2 - rs2 contains vtype, no vtype fields in assembly
  else if (baseMnemonic === 'VSETVL') {
    if (operands.length >= 3) {
      opValues.rd = getRegisterValue(operands[0]);
      opValues.rs1 = getRegisterValue(operands[1]);
      opValues.rs2 = getRegisterValue(operands[2]);
    }
  }

  return encodeInstructionDataDriven(instr, opValues);
}

// ============================================================================
// LABEL COLLECTION (FIRST PASS)
// ============================================================================

/**
 * First pass: collect all labels, constants, and their addresses
 * Handles both text and data sections
 */
function collectLabels(
  parsedLines: ParsedLine[],
  textBaseAddress: bigint,
  dataBaseAddress: bigint
): { labels: Map<string, bigint>; constants: Map<string, number> } {
  const labels = new Map<string, bigint>();
  const constants = new Map<string, number>();

  let currentTextAddress = textBaseAddress;
  let currentDataAddress = dataBaseAddress;
  let currentSection: SectionType = 'text';

  // First pass to collect .equ constants (they can be used before definition)
  for (const line of parsedLines) {
    if (line.directive?.directive === 'equ' && line.directive.args.length >= 2) {
      const name = line.directive.args[0];
      const valueStr = line.directive.args.slice(1).join(',').trim();
      const value = parseImmediateValue(valueStr, constants);
      if (!isNaN(value)) {
        constants.set(name, value);
      }
    }
  }

  // Second pass to collect labels
  for (const line of parsedLines) {
    // Handle section changes
    if (line.directive) {
      if (line.directive.directive === 'text') {
        currentSection = 'text';
      } else if (line.directive.directive === 'data') {
        currentSection = 'data';
      }
    }

    const currentAddress = currentSection === 'text' ? currentTextAddress : currentDataAddress;

    // Record label at current address
    if (line.label) {
      labels.set(line.label, currentAddress);
    }

    // Update address based on content
    if (currentSection === 'text') {
      // Only instructions increment the text address
      if (line.mnemonic) {
        const mnemonic = line.mnemonic.toUpperCase();

        // Check if this instruction has operands that require pseudo-instruction expansion
        // (e.g., load/store with symbol instead of memory operand)
        const needsPseudoForOperands = (() => {
          const loadStoreWithSymbol = new Set([
            'LB', 'LH', 'LW', 'LD', 'LBU', 'LHU', 'LWU',
            'SB', 'SH', 'SW', 'SD',
            'FLW', 'FLD', 'FLH', 'FLQ',
            'FSW', 'FSD', 'FSH', 'FSQ'
          ]);

          if (loadStoreWithSymbol.has(mnemonic)) {
            const lastOp = line.operands[line.operands.length - 1];
            if (lastOp && lastOp.type !== 'memory') {
              return true;
            }
          }
          return false;
        })();

        // Try native instruction first (matching second pass logic)
        const nativeInstr = lookupInstruction(mnemonic);
        if (nativeInstr && !needsPseudoForOperands) {
          // Native instruction exists - use its size
          currentTextAddress += BigInt(getInstructionSize(mnemonic));
        } else if (isPseudoInstruction(mnemonic)) {
          // No native instruction or need pseudo for operands, try pseudo-instruction expansion
          const expansion = expandPseudoInstruction(mnemonic, line.operands, labels, currentTextAddress, constants);
          if (expansion.length > 0 && expansion[0] !== 0) {
            currentTextAddress += BigInt(expansion.length * 4);
          } else {
            // Fallback to regular instruction size
            currentTextAddress += BigInt(getInstructionSize(mnemonic));
          }
        } else {
          // Regular instruction - check if compressed
          currentTextAddress += BigInt(getInstructionSize(mnemonic));
        }
      }
    } else {
      // Data section - increment address based on data directives
      if (line.directive) {
        const directiveSize = getDataDirectiveSize(line.directive, currentDataAddress, constants);
        currentDataAddress += BigInt(directiveSize);
      }
    }
  }

  return { labels, constants };
}

// ============================================================================
// DATA DIRECTIVE EMISSION
// ============================================================================

/**
 * Convert a 32-bit word to little-endian bytes
 */
function wordToBytes(word: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = word & 0xFF;
  bytes[1] = (word >> 8) & 0xFF;
  bytes[2] = (word >> 16) & 0xFF;
  bytes[3] = (word >> 24) & 0xFF;
  return bytes;
}

/**
 * Convert a 16-bit halfword to little-endian bytes
 */
function halfwordToBytes(halfword: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[0] = halfword & 0xFF;
  bytes[1] = (halfword >> 8) & 0xFF;
  return bytes;
}

/**
 * Emit bytes for a data directive
 *
 * @param directive - The parsed directive
 * @param constants - Map of constant names to values
 * @param errors - Array to collect error messages
 * @param lineNumber - Source line number for error reporting
 * @returns Array of bytes to emit
 */
function emitDataDirective(
  directive: ParsedDirective,
  currentAddress: bigint,
  constants: Map<string, number>,
  errors: string[],
  lineNumber: number
): number[] {
  const bytes: number[] = [];

  switch (directive.directive) {
    case 'word': {
      // Emit 32-bit words
      for (const arg of directive.args) {
        const value = parseImmediateValue(arg, constants);
        if (isNaN(value)) {
          errors.push(`Line ${lineNumber}: Invalid .word value '${arg}'`);
          bytes.push(0, 0, 0, 0);
        } else {
          // Little-endian byte order
          bytes.push(value & 0xFF);
          bytes.push((value >> 8) & 0xFF);
          bytes.push((value >> 16) & 0xFF);
          bytes.push((value >> 24) & 0xFF);
        }
      }
      break;
    }

    case 'dword':
    case 'quad': {
      // Emit 64-bit doublewords (use BigInt for full precision)
      for (const arg of directive.args) {
        try {
          const trimmed = arg.trim();
          let value: bigint;
          if (trimmed.toLowerCase().startsWith('0x')) {
            value = BigInt(trimmed);
          } else if (trimmed.toLowerCase().startsWith('0b')) {
            value = BigInt(trimmed);
          } else if (trimmed.startsWith('-')) {
            value = BigInt(trimmed);
          } else {
            value = BigInt(trimmed);
          }
          // Little-endian byte order (8 bytes)
          bytes.push(Number(value & 0xFFn));
          bytes.push(Number((value >> 8n) & 0xFFn));
          bytes.push(Number((value >> 16n) & 0xFFn));
          bytes.push(Number((value >> 24n) & 0xFFn));
          bytes.push(Number((value >> 32n) & 0xFFn));
          bytes.push(Number((value >> 40n) & 0xFFn));
          bytes.push(Number((value >> 48n) & 0xFFn));
          bytes.push(Number((value >> 56n) & 0xFFn));
        } catch {
          errors.push(`Line ${lineNumber}: Invalid .dword value '${arg}'`);
          bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
        }
      }
      break;
    }

    case 'half': {
      // Emit 16-bit halfwords
      for (const arg of directive.args) {
        const value = parseImmediateValue(arg, constants);
        if (isNaN(value)) {
          errors.push(`Line ${lineNumber}: Invalid .half value '${arg}'`);
          bytes.push(0, 0);
        } else {
          // Little-endian byte order
          bytes.push(value & 0xFF);
          bytes.push((value >> 8) & 0xFF);
        }
      }
      break;
    }

    case 'byte': {
      // Emit 8-bit bytes
      for (const arg of directive.args) {
        const value = parseImmediateValue(arg, constants);
        if (isNaN(value)) {
          errors.push(`Line ${lineNumber}: Invalid .byte value '${arg}'`);
          bytes.push(0);
        } else {
          bytes.push(value & 0xFF);
        }
      }
      break;
    }

    case 'float': {
      // Emit 32-bit IEEE 754 single-precision floats
      for (const arg of directive.args) {
        const value = parseFloat(arg);
        if (isNaN(value)) {
          errors.push(`Line ${lineNumber}: Invalid .float value '${arg}'`);
          bytes.push(0, 0, 0, 0);
        } else {
          // Convert to IEEE 754 binary32 representation
          const buffer = new ArrayBuffer(4);
          const view = new DataView(buffer);
          view.setFloat32(0, value, true); // Little-endian
          bytes.push(view.getUint8(0));
          bytes.push(view.getUint8(1));
          bytes.push(view.getUint8(2));
          bytes.push(view.getUint8(3));
        }
      }
      break;
    }

    case 'double': {
      // Emit 64-bit IEEE 754 double-precision floats
      for (const arg of directive.args) {
        const value = parseFloat(arg);
        if (isNaN(value)) {
          errors.push(`Line ${lineNumber}: Invalid .double value '${arg}'`);
          bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
        } else {
          // Convert to IEEE 754 binary64 representation
          const buffer = new ArrayBuffer(8);
          const view = new DataView(buffer);
          view.setFloat64(0, value, true); // Little-endian
          for (let i = 0; i < 8; i++) {
            bytes.push(view.getUint8(i));
          }
        }
      }
      break;
    }

    case 'space': {
      // Reserve n bytes (zero-filled)
      const size = directive.args.length > 0 ? parseImmediateValue(directive.args[0], constants) : 0;
      if (isNaN(size) || size < 0) {
        errors.push(`Line ${lineNumber}: Invalid .space size '${directive.args[0]}'`);
      } else {
        for (let i = 0; i < size; i++) {
          bytes.push(0);
        }
      }
      break;
    }

    case 'align': {
      // Align to 2^n byte boundary
      const power = directive.args.length > 0 ? parseImmediateValue(directive.args[0], constants) : 0;
      if (isNaN(power) || power < 0) {
        errors.push(`Line ${lineNumber}: Invalid .align power '${directive.args[0]}'`);
      } else {
        const alignment = Math.pow(2, power);
        const currentOffset = Number(currentAddress);
        const misalignment = currentOffset % alignment;
        if (misalignment !== 0) {
          const paddingNeeded = alignment - misalignment;
          for (let i = 0; i < paddingNeeded; i++) {
            bytes.push(0);
          }
        }
      }
      break;
    }

    case 'string':
    case 'asciz': {
      // Emit null-terminated string
      for (const arg of directive.args) {
        let str = arg;
        // Remove surrounding quotes if present
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
          str = str.slice(1, -1);
        }
        // Process escape sequences and emit characters
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '\\' && i + 1 < str.length) {
            i++;
            switch (str[i]) {
              case 'n': bytes.push(10); break;
              case 'r': bytes.push(13); break;
              case 't': bytes.push(9); break;
              case '0': bytes.push(0); break;
              case '\\': bytes.push(92); break;
              case '"': bytes.push(34); break;
              case "'": bytes.push(39); break;
              default: bytes.push(str.charCodeAt(i));
            }
          } else {
            bytes.push(str.charCodeAt(i));
          }
        }
        // Null terminator
        bytes.push(0);
      }
      break;
    }

    case 'ascii': {
      // Emit string without null terminator
      for (const arg of directive.args) {
        let str = arg;
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
          str = str.slice(1, -1);
        }
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '\\' && i + 1 < str.length) {
            i++;
            switch (str[i]) {
              case 'n': bytes.push(10); break;
              case 'r': bytes.push(13); break;
              case 't': bytes.push(9); break;
              case '0': bytes.push(0); break;
              case '\\': bytes.push(92); break;
              case '"': bytes.push(34); break;
              case "'": bytes.push(39); break;
              default: bytes.push(str.charCodeAt(i));
            }
          } else {
            bytes.push(str.charCodeAt(i));
          }
        }
      }
      break;
    }

    // Directives that don't emit bytes
    case 'text':
    case 'data':
    case 'globl':
    case 'global':
    case 'equ':
    case 'set':
    case 'section':
    case 'type':
    case 'size':
      // These are handled elsewhere or ignored
      break;

    default:
      // Unknown directive - ignore with warning
      break;
  }

  return bytes;
}

// ============================================================================
// MAIN ASSEMBLE FUNCTION
// ============================================================================

/**
 * Assemble RISC-V assembly text into machine code
 *
 * @param text - Assembly source text
 * @param baseAddress - Base address for text section (default: 0x00000000)
 * @param dataBaseAddress - Base address for data section (default: 0x2000)
 * @returns Assembly result with binary, data binary, line mappings, and errors
 *
 * @example
 * ```typescript
 * const result = assemble(`
 *   .data
 *   numbers:
 *     .word 1, 2, 3, 4, 5
 *   message:
 *     .asciz "Hello"
 *
 *   .text
 *   main:
 *     la a0, numbers
 *     lw a1, 0(a0)
 *     ret
 * `);
 *
 * if (result.success) {
 *   console.log('Text binary size:', result.binary.length);
 *   console.log('Data binary size:', result.dataBinary.length);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export function assemble(
  text: string,
  baseAddress: bigint = 0n,
  dataBaseAddress: bigint = DEFAULT_DATA_BASE_ADDRESS,
  xlen: Xlen = 32
): AssemblyResult {
  // Set the current XLEN for instruction lookup
  currentXlen = xlen;

  const errors: string[] = [];
  const lineToAddress = new Map<number, bigint>();
  const addressToLine = new Map<bigint, number>(); // Maps ALL addresses to lines (including expanded pseudo-instructions)
  const dataLabels = new Map<string, bigint>();
  const textByteList: number[] = []; // Store bytes for text section
  const dataByteList: number[] = []; // Store bytes for data section

  // Parse source
  const parsedLines = parseSource(text);

  // First pass: collect labels and constants
  const { labels, constants } = collectLabels(parsedLines, baseAddress, dataBaseAddress);

  // Separate data labels for export
  for (const [labelName, labelAddr] of labels) {
    if (labelAddr >= dataBaseAddress) {
      dataLabels.set(labelName, labelAddr);
    }
  }

  // Second pass: encode instructions and emit data
  let currentTextAddress = baseAddress;
  let currentDataAddress = dataBaseAddress;
  let currentSection: SectionType = 'text';

  for (const line of parsedLines) {
    // Handle section changes
    if (line.directive) {
      if (line.directive.directive === 'text') {
        currentSection = 'text';
        continue;
      } else if (line.directive.directive === 'data') {
        currentSection = 'data';
        continue;
      }
    }

    if (currentSection === 'text') {
      // Text section: encode instructions
      if (!line.mnemonic) {
        continue;
      }

      // Record line to address mapping (first address for this line)
      lineToAddress.set(line.lineNumber, currentTextAddress);

      // Encode the instruction
      const fullMnemonic = line.mnemonic.toUpperCase();
      const { baseMnemonic } = parseModifiers(fullMnemonic);

      let handled = false;

      // Check if this instruction has operands that require pseudo-instruction expansion
      // (e.g., load/store with symbol instead of memory operand)
      const needsPseudoForOperands = (() => {
        // Load/store instructions that can have symbol operands need pseudo expansion
        const loadStoreWithSymbol = new Set([
          'LB', 'LH', 'LW', 'LD', 'LBU', 'LHU', 'LWU',
          'SB', 'SH', 'SW', 'SD',
          'FLW', 'FLD', 'FLH', 'FLQ',
          'FSW', 'FSD', 'FSH', 'FSQ'
        ]);

        if (loadStoreWithSymbol.has(baseMnemonic)) {
          // Check if last operand is NOT a memory type (offset(base))
          // Native load/store requires memory operand, pseudo uses symbol/label/immediate
          const lastOp = line.operands[line.operands.length - 1];
          if (lastOp && lastOp.type !== 'memory') {
            return true; // Need pseudo-expansion for non-memory operand
          }
        }
        return false;
      })();

      // Try native instruction first (using XLEN-aware lookup)
      // This ensures native B-extension instructions (SEXT.B, etc.) are used
      // instead of their pseudo-instruction equivalents
      // BUT skip native for load/store with symbol operands
      // Check both full mnemonic and base mnemonic (for modifier suffixes like .RNE, .AQ)
      const nativeInstr = lookupInstruction(fullMnemonic) ?? lookupInstruction(baseMnemonic);
      if (nativeInstr && !needsPseudoForOperands) {
        const isCompressed = isCompressedFormat(nativeInstr.format);
        const encoded = encodeInstruction(line, labels, currentTextAddress, constants);

        if (encoded !== 0) {
          handled = true;
          addressToLine.set(currentTextAddress, line.lineNumber);
          if (isCompressed) {
            const bytes = halfwordToBytes(encoded);
            textByteList.push(...bytes);
            currentTextAddress += 2n;
          } else {
            const bytes = wordToBytes(encoded);
            textByteList.push(...bytes);
            currentTextAddress += 4n;
          }
        }
        // If encoding failed (returned 0), fall through to pseudo-instruction
      }

      // Try pseudo-instruction expansion if native encoding failed or doesn't exist
      // Use baseMnemonic for pseudo-instruction lookup (modifiers don't apply to pseudos)
      if (!handled && isPseudoInstruction(baseMnemonic)) {
        const expanded = expandPseudoInstruction(baseMnemonic, line.operands, labels, currentTextAddress, constants);
        // Check if expansion succeeded (non-zero or NOP)
        if (expanded.length > 0 && (expanded[0] !== 0 || baseMnemonic === 'NOP')) {
          handled = true;
          for (const instr of expanded) {
            // Record address to line mapping for EACH expanded instruction
            addressToLine.set(currentTextAddress, line.lineNumber);
            // Pseudo-instructions always expand to 32-bit instructions
            const bytes = wordToBytes(instr);
            textByteList.push(...bytes);
            currentTextAddress += 4n;
          }
        }
        // If expansion failed (returned [0]), fall through to error
      }

      if (!handled) {
        // Neither native encoding nor pseudo-expansion worked
        if (!INSTRUCTION_MAP.has(fullMnemonic) && !INSTRUCTION_MAP.has(baseMnemonic) && !isPseudoInstruction(baseMnemonic)) {
          errors.push(`Line ${line.lineNumber}: Unknown instruction '${line.mnemonic}'`);
        } else {
          errors.push(`Line ${line.lineNumber}: Failed to encode instruction '${line.mnemonic}'`);
        }
      }
    } else {
      // Data section: emit data
      if (line.directive) {
        const emittedBytes = emitDataDirective(
          line.directive,
          currentDataAddress,
          constants,
          errors,
          line.lineNumber
        );
        dataByteList.push(...emittedBytes);
        currentDataAddress += BigInt(emittedBytes.length);
      }
    }
  }

  // Convert to Uint8Array
  const binary = new Uint8Array(textByteList);
  const dataBinary = new Uint8Array(dataByteList);

  return {
    binary,
    dataBinary,
    textBaseAddress: baseAddress,
    dataBaseAddress,
    lineToAddress,
    addressToLine,
    dataLabels,
    errors,
    success: errors.length === 0,
  };
}

// ============================================================================
// DISASSEMBLY (for debugging)
// ============================================================================

/**
 * Rich decode result with structured data for visualization
 */
export interface DecodeResult {
  instruction: Instruction;
  assemblyText: string;
  operands: Record<string, number>;
}

/**
 * Decode a single 32-bit instruction word into structured data.
 * Returns the matched instruction, formatted assembly text, and extracted operand values.
 *
 * @param word - 32-bit instruction word
 * @param xlen - Register width (32 or 64), defaults to 32
 * @returns DecodeResult or null if no match
 */
export function decodeWord(word: number, xlen: Xlen = 32): DecodeResult | null {
  const rd = (word >> 7) & 0x1F;
  const rs1 = (word >> 15) & 0x1F;
  const rs2 = (word >> 20) & 0x1F;
  const funct7 = (word >> 25) & 0x7F;

  // Iterate ALL instructions from the extension-specific map (all 1300+ entries).
  // Priority order: current XLEN variants first, then generic extensions, then other XLEN.
  const preferred: [string, Instruction][] = [];
  const generic: [string, Instruction][] = [];
  const fallbacks: [string, Instruction][] = [];
  const xlenPrefix = xlen === 64 ? 'RV64' : 'RV32';
  const otherPrefix = xlen === 64 ? 'RV32' : 'RV64';

  for (const [extKey, instr] of INSTRUCTION_BY_EXT_MAP) {
    const mnemonic = extKey.split(':')[0];
    if (instr.extension.startsWith(xlenPrefix)) {
      preferred.push([mnemonic, instr]);
    } else if (instr.extension.startsWith(otherPrefix)) {
      fallbacks.push([mnemonic, instr]);
    } else {
      generic.push([mnemonic, instr]);
    }
  }

  const allEntries = [...preferred, ...generic, ...fallbacks];

  const is16bit = (word >>> 16) === 0 && (word & 0x3) !== 0x3;

  for (const [mnemonic, instr] of allEntries) {
    if (!instr.encodingFields) continue;
    // Match instruction width: 16-bit encodings only for 16-bit words, 32-bit for 32-bit
    const instrIs16bit = instr.encoding.length === 16;
    if (instrIs16bit !== is16bit) continue;

    let matches = true;
    for (const field of instr.encodingFields) {
      if (field.value.includes('x')) continue;

      const fieldValue = parseInt(field.value, 2);
      const width = field.endBit - field.startBit + 1;
      const mask = ((1 << width) - 1);
      const extractedValue = (word >> field.startBit) & mask;

      if (extractedValue !== fieldValue) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const format = instr.format.toLowerCase();
      const operands: Record<string, number> = {};
      let assemblyText = '';

      if (format === 'r-type') {
        operands.rd = rd;
        operands.rs1 = rs1;
        operands.rs2 = rs2;
        assemblyText = `${mnemonic.toLowerCase()} x${rd}, x${rs1}, x${rs2}`;
      } else if (format === 'i-type') {
        const imm = (word >> 20) & 0xFFF;
        const signedImm = imm >= 0x800 ? imm - 0x1000 : imm;
        operands.rd = rd;
        operands.rs1 = rs1;
        operands.imm = signedImm;

        if (instr.category === 'Load') {
          assemblyText = `${mnemonic.toLowerCase()} x${rd}, ${signedImm}(x${rs1})`;
        } else if (mnemonic.toUpperCase() === 'JALR') {
          assemblyText = `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${signedImm}`;
        } else if (mnemonic.toUpperCase().includes('SL') || mnemonic.toUpperCase().includes('SR')) {
          const shamt = imm & (xlen === 64 ? 0x3F : 0x1F);
          operands.imm = shamt;
          assemblyText = `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${shamt}`;
        } else {
          assemblyText = `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${signedImm}`;
        }
      } else if (format === 's-type') {
        const imm_11_5 = funct7;
        const imm_4_0 = rd;
        const imm = (imm_11_5 << 5) | imm_4_0;
        const signedImm = imm >= 0x800 ? imm - 0x1000 : imm;
        operands.rs1 = rs1;
        operands.rs2 = rs2;
        operands.imm = signedImm;
        assemblyText = `${mnemonic.toLowerCase()} x${rs2}, ${signedImm}(x${rs1})`;
      } else if (format === 'b-type') {
        const bit12 = (word >> 31) & 0x1;
        const bits10_5 = (word >> 25) & 0x3F;
        const bits4_1 = (word >> 8) & 0xF;
        const bit11 = (word >> 7) & 0x1;
        const imm = (bit12 << 12) | (bit11 << 11) | (bits10_5 << 5) | (bits4_1 << 1);
        const signedImm = imm >= 0x1000 ? imm - 0x2000 : imm;
        operands.rs1 = rs1;
        operands.rs2 = rs2;
        operands.imm = signedImm;
        assemblyText = `${mnemonic.toLowerCase()} x${rs1}, x${rs2}, ${signedImm}`;
      } else if (format === 'u-type') {
        const imm20 = (word >> 12) & 0xFFFFF;
        operands.rd = rd;
        operands.imm = imm20;
        assemblyText = `${mnemonic.toLowerCase()} x${rd}, 0x${imm20.toString(16)}`;
      } else if (format === 'j-type') {
        const bit20 = (word >> 31) & 0x1;
        const bits10_1 = (word >> 21) & 0x3FF;
        const bit11 = (word >> 20) & 0x1;
        const bits19_12 = (word >> 12) & 0xFF;
        const imm = (bit20 << 20) | (bits19_12 << 12) | (bit11 << 11) | (bits10_1 << 1);
        const signedImm = imm >= 0x100000 ? imm - 0x200000 : imm;
        operands.rd = rd;
        operands.imm = signedImm;
        assemblyText = `${mnemonic.toLowerCase()} x${rd}, ${signedImm}`;
      } else if (format === 'r4-type') {
        const rs3 = (word >> 27) & 0x1F;
        operands.rd = rd;
        operands.rs1 = rs1;
        operands.rs2 = rs2;
        operands.rs3 = rs3;
        assemblyText = `${mnemonic.toLowerCase()} f${rd}, f${rs1}, f${rs2}, f${rs3}`;
      } else {
        assemblyText = mnemonic.toLowerCase();
      }

      return { instruction: instr, assemblyText, operands };
    }
  }

  return null;
}

/**
 * Disassemble a single 32-bit instruction word
 *
 * @param word - 32-bit instruction word
 * @returns Disassembled instruction string or null if invalid
 */
export function disassembleWord(word: number): string | null {
  // Extract common fields used in disassembly formatting
  const rd = (word >> 7) & 0x1F;
  const rs1 = (word >> 15) & 0x1F;
  const rs2 = (word >> 20) & 0x1F;
  const funct7 = (word >> 25) & 0x7F;

  // Find matching instruction by checking encoding fields
  for (const [mnemonic, instr] of INSTRUCTION_MAP) {
    if (!instr.encodingFields) continue;

    // Check if all fixed fields match
    let matches = true;
    for (const field of instr.encodingFields) {
      if (field.value.includes('x')) continue; // Skip variable fields

      const fieldValue = parseInt(field.value, 2);
      const width = field.endBit - field.startBit + 1;
      const mask = ((1 << width) - 1);
      const extractedValue = (word >> field.startBit) & mask;

      if (extractedValue !== fieldValue) {
        matches = false;
        break;
      }
    }

    if (matches) {
      // Format disassembly based on instruction format
      const format = instr.format.toLowerCase();

      if (format === 'r-type') {
        return `${mnemonic.toLowerCase()} x${rd}, x${rs1}, x${rs2}`;
      } else if (format === 'i-type') {
        const imm = (word >> 20) & 0xFFF;
        const signedImm = imm >= 0x800 ? imm - 0x1000 : imm;

        if (instr.category === 'Load') {
          return `${mnemonic.toLowerCase()} x${rd}, ${signedImm}(x${rs1})`;
        } else if (mnemonic.toUpperCase() === 'JALR') {
          return `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${signedImm}`;
        } else if (mnemonic.toUpperCase().includes('SL') || mnemonic.toUpperCase().includes('SR')) {
          // Shift instructions - shamt is lower 5 bits
          const shamt = imm & 0x1F;
          return `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${shamt}`;
        }
        return `${mnemonic.toLowerCase()} x${rd}, x${rs1}, ${signedImm}`;
      } else if (format === 's-type') {
        const imm_11_5 = funct7;
        const imm_4_0 = rd;
        const imm = (imm_11_5 << 5) | imm_4_0;
        const signedImm = imm >= 0x800 ? imm - 0x1000 : imm;
        return `${mnemonic.toLowerCase()} x${rs2}, ${signedImm}(x${rs1})`;
      } else if (format === 'b-type') {
        const bit12 = (word >> 31) & 0x1;
        const bits10_5 = (word >> 25) & 0x3F;
        const bits4_1 = (word >> 8) & 0xF;
        const bit11 = (word >> 7) & 0x1;
        const imm = (bit12 << 12) | (bit11 << 11) | (bits10_5 << 5) | (bits4_1 << 1);
        const signedImm = imm >= 0x1000 ? imm - 0x2000 : imm;
        return `${mnemonic.toLowerCase()} x${rs1}, x${rs2}, ${signedImm}`;
      } else if (format === 'u-type') {
        const imm20 = (word >> 12) & 0xFFFFF;
        return `${mnemonic.toLowerCase()} x${rd}, 0x${imm20.toString(16)}`;
      } else if (format === 'j-type') {
        const bit20 = (word >> 31) & 0x1;
        const bits10_1 = (word >> 21) & 0x3FF;
        const bit11 = (word >> 20) & 0x1;
        const bits19_12 = (word >> 12) & 0xFF;
        const imm = (bit20 << 20) | (bits19_12 << 12) | (bit11 << 11) | (bits10_1 << 1);
        const signedImm = imm >= 0x100000 ? imm - 0x200000 : imm;
        return `${mnemonic.toLowerCase()} x${rd}, ${signedImm}`;
      }

      // Default fallback
      return mnemonic.toLowerCase();
    }
  }

  return null;
}
