/**
 * ISA Variant Type Definitions and Utilities
 *
 * Defines RISC-V ISA base architectures, extensions, and helper functions
 * for determining register widths and enabled features.
 */

/**
 * Base RISC-V ISA variants
 */
export type BaseISA = 'RV32I' | 'RV64I';

/**
 * RISC-V ISA Extensions
 */
export type Extension =
  | 'G'       // General (IMAFD - common combination)
  | 'B'       // Bit Manipulation (Zba, Zbb, Zbc, Zbs)
  | 'M'       // Integer Multiplication and Division
  | 'A'       // Atomic Instructions
  | 'F'       // Single-Precision Floating-Point
  | 'D'       // Double-Precision Floating-Point
  | 'Q'       // Quad-Precision Floating-Point
  | 'C'       // Compressed Instructions
  | 'V'       // Vector Extension
  | 'Zfh'     // Half-Precision Floating-Point
  | 'Zicond'  // Integer Conditional Operations
  | 'Zba'     // Address Generation
  | 'Zbb'     // Basic Bit Manipulation
  | 'Zbc'     // Carry-less Multiplication
  | 'Zbs'     // Single-Bit Instructions
  | 'Zicsr'   // Control and Status Registers
  | 'Zifencei'// Instruction Fence
  | 'Zawrs';  // Wait-on-Reservation-Set

/**
 * Extension categories for UI organization
 */
export type ExtensionCategory = 'core' | 'floating-point' | 'vector' | 'bit-manipulation' | 'system';

/**
 * Extension metadata for UI display
 */
export interface ExtensionInfo {
  code: Extension;
  name: string;
  description: string;
  category: ExtensionCategory;
  instructionCount: { rv32?: number; rv64?: number };
  dependencies: Extension[];
}

/**
 * Vector extension configuration
 */
export interface VectorConfig {
  VLEN: 128 | 256 | 512 | 1024;  // Vector register length in bits
  ELEN: 32 | 64;                  // Maximum element width
}

/**
 * Complete ISA variant configuration
 */
export interface ISAVariant {
  base: BaseISA;
  extensions: Extension[];
  vectorConfig?: VectorConfig;  // Optional, only when V extension enabled
}

/**
 * Extension dependency requirements
 * Key: Extension that has dependencies
 * Value: Array of required extensions
 */
export const EXTENSION_DEPENDENCIES: Record<Extension, Extension[]> = {
  'G': [],          // G is a bundle, not a dependent (enables M, A, F, D, Zicsr, Zifencei)
  'B': [],          // B is a bundle, not a dependent (enables Zba, Zbb, Zbc, Zbs)
  'M': [],
  'A': [],
  'F': [],
  'D': ['F'],       // D requires F
  'Q': ['D'],       // Q requires D (and transitively F)
  'C': [],
  'V': [],
  'Zfh': ['F'],     // Zfh requires F
  'Zicond': [],
  'Zba': [],
  'Zbb': [],
  'Zbc': [],
  'Zbs': [],
  'Zicsr': [],
  'Zifencei': [],
  'Zawrs': [],
};

/**
 * Extension information for UI display
 */
export const EXTENSION_INFO: Record<Extension, ExtensionInfo> = {
  // Core Extensions
  'G': {
    code: 'G',
    name: 'General (IMAFDZicsr_Zifencei)',
    description: 'Common combination: Integer Multiply, Atomic, Single & Double Floating-Point, CSR, and Instruction Fence',
    category: 'core',
    instructionCount: { rv32: 0, rv64: 0 }, // G is a combination, individual extensions add instructions
    dependencies: [], // G is a bundle that enables M, A, F, D, Zicsr, Zifencei (not a dependent)
  },
  'M': {
    code: 'M',
    name: 'Integer Multiply & Divide',
    description: 'Hardware multiplication and division operations',
    category: 'core',
    instructionCount: { rv32: 8, rv64: 13 },
    dependencies: [],
  },
  'A': {
    code: 'A',
    name: 'Atomic Instructions',
    description: 'Atomic read-modify-write operations for synchronization',
    category: 'core',
    instructionCount: { rv32: 11, rv64: 22 },
    dependencies: [],
  },
  'C': {
    code: 'C',
    name: 'Compressed Instructions',
    description: '16-bit compressed instruction format for code density',
    category: 'core',
    instructionCount: { rv32: 37, rv64: 37 },
    dependencies: [],
  },

  // Floating-Point Extensions
  'F': {
    code: 'F',
    name: 'Single-Precision Float (32-bit)',
    description: 'IEEE 754 single-precision floating-point operations',
    category: 'floating-point',
    instructionCount: { rv32: 26, rv64: 30 },
    dependencies: [],
  },
  'D': {
    code: 'D',
    name: 'Double-Precision Float (64-bit)',
    description: 'IEEE 754 double-precision floating-point operations',
    category: 'floating-point',
    instructionCount: { rv32: 26, rv64: 32 },
    dependencies: ['F'],
  },
  'Q': {
    code: 'Q',
    name: 'Quad-Precision Float (128-bit)',
    description: 'IEEE 754 quad-precision floating-point operations',
    category: 'floating-point',
    instructionCount: { rv32: 28, rv64: 32 },
    dependencies: ['D'],
  },
  'Zfh': {
    code: 'Zfh',
    name: 'Half-Precision Float (16-bit)',
    description: 'IEEE 754 half-precision floating-point operations',
    category: 'floating-point',
    instructionCount: { rv32: 32, rv64: 36 },
    dependencies: ['F'],
  },

  // Vector Extension
  'V': {
    code: 'V',
    name: 'Vector Operations',
    description: 'SIMD vector processing for data parallelism',
    category: 'vector',
    instructionCount: { rv32: 375, rv64: 375 },
    dependencies: [],
  },

  // Bit Manipulation
  'B': {
    code: 'B',
    name: 'Bit Manipulation (Zba+Zbb+Zbc+Zbs)',
    description: 'Complete bit manipulation bundle',
    category: 'bit-manipulation',
    instructionCount: { rv32: 0, rv64: 0 }, // B is a combination, individual extensions add instructions
    dependencies: [], // B is a bundle that enables Zba, Zbb, Zbc, Zbs (not a dependent)
  },
  'Zba': {
    code: 'Zba',
    name: 'Address Generation',
    description: 'Bit manipulation for address calculation',
    category: 'bit-manipulation',
    instructionCount: { rv32: 4, rv64: 9 },
    dependencies: [],
  },
  'Zbb': {
    code: 'Zbb',
    name: 'Basic Bit Manipulation',
    description: 'Common bit manipulation operations',
    category: 'bit-manipulation',
    instructionCount: { rv32: 36, rv64: 36 },
    dependencies: [],
  },
  'Zbc': {
    code: 'Zbc',
    name: 'Carry-less Multiply',
    description: 'Carry-less multiplication for cryptography',
    category: 'bit-manipulation',
    instructionCount: { rv32: 6, rv64: 6 },
    dependencies: [],
  },
  'Zbs': {
    code: 'Zbs',
    name: 'Single-Bit Instructions',
    description: 'Single-bit set, clear, and test operations',
    category: 'bit-manipulation',
    instructionCount: { rv32: 5, rv64: 5 },
    dependencies: [],
  },

  // System Extensions
  'Zicsr': {
    code: 'Zicsr',
    name: 'Control & Status Registers',
    description: 'CSR read/write instructions',
    category: 'system',
    instructionCount: { rv32: 6, rv64: 6 },
    dependencies: [],
  },
  'Zifencei': {
    code: 'Zifencei',
    name: 'Instruction Fence',
    description: 'Synchronize instruction and data streams',
    category: 'system',
    instructionCount: { rv32: 1, rv64: 1 },
    dependencies: [],
  },
  'Zawrs': {
    code: 'Zawrs',
    name: 'Wait-on-Reservation-Set',
    description: 'Energy-efficient waiting for synchronization',
    category: 'system',
    instructionCount: { rv32: 2, rv64: 2 },
    dependencies: [],
  },
  'Zicond': {
    code: 'Zicond',
    name: 'Integer Conditional Operations',
    description: 'Conditional move and select instructions',
    category: 'system',
    instructionCount: { rv32: 2, rv64: 2 },
    dependencies: [],
  },
};

/**
 * Get extensions by category
 */
export function getExtensionsByCategory(category: ExtensionCategory): Extension[] {
  return Object.values(EXTENSION_INFO)
    .filter(info => info.category === category)
    .map(info => info.code);
}

/**
 * Get all extensions that depend on a given extension
 * @param ext Extension to check
 * @returns Array of extensions that depend on ext
 */
export function getDependentExtensions(ext: Extension): Extension[] {
  const dependents: Extension[] = [];
  Object.entries(EXTENSION_DEPENDENCIES).forEach(([key, deps]) => {
    if (deps.includes(ext)) {
      dependents.push(key as Extension);
    }
  });
  return dependents;
}

/**
 * Get all transitive dependencies for an extension
 * @param ext Extension to check
 * @returns Array of all required extensions (including transitive)
 */
export function getAllDependencies(ext: Extension): Extension[] {
  const deps = new Set<Extension>();
  const queue = [...EXTENSION_DEPENDENCIES[ext]];

  while (queue.length > 0) {
    const dep = queue.shift()!;
    if (!deps.has(dep)) {
      deps.add(dep);
      queue.push(...EXTENSION_DEPENDENCIES[dep]);
    }
  }

  return Array.from(deps);
}

/**
 * Calculate total instruction count for an ISA variant
 * @param variant ISA variant
 * @returns Total instruction count
 */
export function getTotalInstructionCount(variant: ISAVariant): number {
  const baseCount = variant.base === 'RV32I' ? 42 : 57;
  const extensionCount = variant.extensions.reduce((sum, ext) => {
    const info = EXTENSION_INFO[ext];
    const count = variant.base === 'RV32I' ? info.instructionCount.rv32 : info.instructionCount.rv64;
    return sum + (count || 0);
  }, 0);

  return baseCount + extensionCount;
}

/**
 * Get the integer register width based on base ISA
 * @param base Base ISA variant
 * @returns Register width in bits (32 or 64)
 */
export function getRegisterWidth(base: BaseISA): 32 | 64 {
  return base === 'RV32I' ? 32 : 64;
}

/**
 * Get the floating-point register width based on enabled extensions
 * @param extensions Array of enabled extensions
 * @returns Register width in bits (32, 64, 128) or null if no FP
 */
export function getFloatRegisterWidth(extensions: Extension[]): 32 | 64 | 128 | null {
  if (extensions.includes('Q')) return 128;
  if (extensions.includes('D')) return 64;
  if (extensions.includes('F')) return 32;
  // Note: Zfh (half-precision) uses 32-bit registers with NaN-boxing
  if (extensions.includes('Zfh')) return 32;
  return null;
}

/**
 * Check if floating-point extensions are enabled
 * @param extensions Array of enabled extensions
 * @returns True if any FP extension is enabled
 */
export function hasFloatingPoint(extensions: Extension[]): boolean {
  return extensions.some(ext => ['F', 'D', 'Q', 'Zfh'].includes(ext));
}

/**
 * Check if vector extension is enabled
 * @param extensions Array of enabled extensions
 * @returns True if vector extension is enabled
 */
export function hasVector(extensions: Extension[]): boolean {
  return extensions.includes('V');
}

/**
 * Check if CSR registers should be visible
 * CSRs are needed for FP and Vector extensions
 * @param extensions Array of enabled extensions
 * @returns True if CSRs should be visible
 */
export function hasCSRs(extensions: Extension[]): boolean {
  return hasFloatingPoint(extensions) || hasVector(extensions);
}

/**
 * Validate extension dependencies
 * @param extensions Array of extensions to validate
 * @returns Validation result with success flag and error messages
 */
export function validateExtensions(extensions: Extension[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const extensionSet = new Set(extensions);

  // Check each extension's dependencies
  for (const ext of extensions) {
    const deps = EXTENSION_DEPENDENCIES[ext];
    for (const dep of deps) {
      if (!extensionSet.has(dep)) {
        errors.push(`Extension '${ext}' requires '${dep}' to be enabled`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


/**
 * Format ISA variant as a string (e.g., "RV32G" or "RV32IMC")
 * Intelligently replaces bundle components with shorthand (G, B)
 * @param variant ISA variant
 * @returns Formatted string
 */
export function formatISAVariant(variant: ISAVariant): string {
  // Base is RV32 or RV64 (without the I)
  const basePrefix = variant.base === 'RV32I' ? 'RV32' : 'RV64';
  let extensions = new Set(variant.extensions);

  // Bundle definitions
  const gComponents = ['M', 'A', 'F', 'D', 'Zicsr', 'Zifencei'];
  const bComponents = ['Zba', 'Zbb', 'Zbc', 'Zbs'];

  // Check if all G components are present (regardless of whether G itself is selected)
  const hasAllG = gComponents.every(ext => extensions.has(ext as Extension));
  if (hasAllG) {
    // Remove G components and add G
    gComponents.forEach(ext => extensions.delete(ext as Extension));
    extensions.add('G' as Extension);
  }

  // Check if all B components are present (regardless of whether B itself is selected)
  const hasAllB = bComponents.every(ext => extensions.has(ext as Extension));
  if (hasAllB) {
    // Remove B components and add B
    bComponents.forEach(ext => extensions.delete(ext as Extension));
    extensions.add('B' as Extension);
  }

  // If no extensions, return base with "I" (e.g., RV32I)
  if (extensions.size === 0) {
    return `${basePrefix}I`;
  }

  // Sort extensions: G first if present, then other single letters, then Z* extensions
  const sorted = Array.from(extensions).sort((a, b) => {
    // G always comes first
    if (a === 'G') return -1;
    if (b === 'G') return 1;

    const aIsSingle = a.length === 1;
    const bIsSingle = b.length === 1;

    // Single letters before Z* extensions
    if (aIsSingle && !bIsSingle) return -1;
    if (!aIsSingle && bIsSingle) return 1;

    // Alphabetical within each group
    return a.localeCompare(b);
  });

  return `${basePrefix}${sorted.join('')}`;
}

/**
 * Get extension display name
 * @param extension Extension code
 * @returns Human-readable name
 */
export function getExtensionName(extension: Extension): string {
  return EXTENSION_INFO[extension]?.name || extension;
}

/**
 * Default vector config for education
 */
export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  VLEN: 256,  // Good balance for education
  ELEN: 64,   // Support up to 64-bit elements
};

/**
 * CSR Definition
 */
export interface CSRDefinition {
  address: number;
  name: string;
  category: 'Trap Setup' | 'Trap Handling' | 'Counters' | 'Floating-Point' | 'Vector' | 'Information';
  access: 'RO' | 'RW';
  description: string;
  requiredExtensions?: Extension[];
}

/**
 * Mandatory CSRs (always present)
 */
export const MANDATORY_CSRS: CSRDefinition[] = [
  { address: 0x300, name: 'mstatus', category: 'Trap Setup', access: 'RW', description: 'Machine status register' },
  { address: 0x301, name: 'misa', category: 'Information', access: 'RO', description: 'ISA and extensions' },
  { address: 0x304, name: 'mie', category: 'Trap Setup', access: 'RW', description: 'Machine interrupt-enable' },
  { address: 0x305, name: 'mtvec', category: 'Trap Setup', access: 'RW', description: 'Machine trap-handler base address' },
  { address: 0x340, name: 'mscratch', category: 'Trap Handling', access: 'RW', description: 'Scratch register for machine trap handlers' },
  { address: 0x341, name: 'mepc', category: 'Trap Handling', access: 'RW', description: 'Machine exception program counter' },
  { address: 0x342, name: 'mcause', category: 'Trap Handling', access: 'RW', description: 'Machine trap cause' },
  { address: 0x343, name: 'mtval', category: 'Trap Handling', access: 'RW', description: 'Machine bad address or instruction' },
  { address: 0xB00, name: 'mcycle', category: 'Counters', access: 'RW', description: 'Machine cycle counter' },
  { address: 0xB02, name: 'minstret', category: 'Counters', access: 'RW', description: 'Machine instructions-retired counter' },
  { address: 0xC00, name: 'cycle', category: 'Counters', access: 'RO', description: 'Cycle counter for RDCYCLE instruction' },
  { address: 0xC01, name: 'time', category: 'Counters', access: 'RO', description: 'Timer for RDTIME instruction' },
  { address: 0xC02, name: 'instret', category: 'Counters', access: 'RO', description: 'Instructions-retired counter' },
];

/**
 * Floating-point CSRs
 */
export const FP_CSRS: CSRDefinition[] = [
  { address: 0x001, name: 'fflags', category: 'Floating-Point', access: 'RW', description: 'Floating-point accrued exceptions', requiredExtensions: ['F'] },
  { address: 0x002, name: 'frm', category: 'Floating-Point', access: 'RW', description: 'Floating-point dynamic rounding mode', requiredExtensions: ['F'] },
  { address: 0x003, name: 'fcsr', category: 'Floating-Point', access: 'RW', description: 'Floating-point control and status', requiredExtensions: ['F'] },
];

/**
 * Vector CSRs
 */
export const VECTOR_CSRS: CSRDefinition[] = [
  { address: 0x008, name: 'vstart', category: 'Vector', access: 'RW', description: 'Vector start position', requiredExtensions: ['V'] },
  { address: 0x009, name: 'vxsat', category: 'Vector', access: 'RW', description: 'Fixed-point saturate flag', requiredExtensions: ['V'] },
  { address: 0x00A, name: 'vxrm', category: 'Vector', access: 'RW', description: 'Fixed-point rounding mode', requiredExtensions: ['V'] },
  { address: 0xC20, name: 'vl', category: 'Vector', access: 'RO', description: 'Vector length', requiredExtensions: ['V'] },
  { address: 0xC21, name: 'vtype', category: 'Vector', access: 'RO', description: 'Vector data type register', requiredExtensions: ['V'] },
  { address: 0xC22, name: 'vlenb', category: 'Vector', access: 'RO', description: 'Vector register length in bytes', requiredExtensions: ['V'] },
];

/**
 * Get all applicable CSRs for an ISA variant
 * @param variant ISA variant
 * @returns Array of applicable CSR definitions
 */
export function getApplicableCSRs(variant: ISAVariant): CSRDefinition[] {
  const csrs: CSRDefinition[] = [...MANDATORY_CSRS];

  if (hasFloatingPoint(variant.extensions)) {
    csrs.push(...FP_CSRS);
  }

  if (hasVector(variant.extensions)) {
    csrs.push(...VECTOR_CSRS);
  }

  return csrs;
}
