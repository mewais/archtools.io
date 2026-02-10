/* tslint:disable */
/* eslint-disable */
/**
 * Initialize WASM module with panic hook
 */
export function init(): void;
/**
 * JavaScript-friendly simulator interface with data-driven instruction support
 */
export class RiscVSimulator {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get cycle count
   */
  getCycles(): bigint;
  /**
   * Check if simulator is running
   */
  isRunning(): boolean;
  /**
   * Get execution history
   */
  getHistory(count: number): any;
  /**
   * Read memory byte
   */
  readMemory(addr: bigint): number;
  /**
   * Get all important CSRs as JSON object
   */
  getAllCSRs(): any;
  /**
   * Load program into memory
   */
  loadProgram(addr: bigint, data: Uint8Array): void;
  /**
   * Write memory byte
   */
  writeMemory(addr: bigint, value: number): void;
  /**
   * Read integer register (masked to XLEN bits)
   */
  readRegister(index: number): bigint;
  /**
   * Set breakpoint at address
   */
  setBreakpoint(pc: bigint): void;
  /**
   * Set memory watchpoint
   */
  setWatchpoint(addr: bigint, watch_type: string, size: number): void;
  /**
   * Write integer register
   */
  writeRegister(index: number, value: bigint): void;
  /**
   * Get all breakpoints
   */
  getBreakpoints(): any;
  /**
   * Get vector CSR state (vl, sew, lmul, vta, vma, vlmax, vlen)
   */
  getVectorCSRs(): any;
  /**
   * Get all memory pages as JSON
   */
  getMemoryPages(): any;
  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void;
  /**
   * Get all integer registers as JSON array (masked to XLEN bits)
   */
  getAllRegisters(): any;
  /**
   * Read memory range as Uint8Array
   */
  readMemoryRange(addr: bigint, size: number): Uint8Array;
  /**
   * Remove breakpoint at address
   */
  removeBreakpoint(pc: bigint): boolean;
  /**
   * Remove memory watchpoint
   */
  removeWatchpoint(addr: bigint): boolean;
  /**
   * Read floating-point register as raw 64-bit value
   */
  readFloatRegister(index: number): bigint;
  /**
   * Get last executed instruction info
   */
  getLastInstruction(): any;
  /**
   * Write floating-point register as raw 64-bit value
   */
  writeFloatRegister(index: number, value: bigint): void;
  /**
   * Get instruction count
   */
  getInstructionCount(): bigint;
  /**
   * Get all floating-point registers as JSON array
   */
  getAllFloatRegisters(): any;
  /**
   * Get all vector registers as array of arrays (32 registers, each with elements based on SEW)
   * Each element is returned as a BigInt for JavaScript compatibility
   */
  getAllVectorRegisters(): any;
  /**
   * Get number of instructions in the database
   */
  getInstructionDatabaseCount(): number;
  /**
   * Create new RV32 simulator with instruction database
   *
   * # Arguments
   * * `instructions_json` - JSON string containing instruction definitions
   */
  constructor(instructions_json: string);
  /**
   * Run until breakpoint, halt, or max cycles
   *
   * Returns the number of instructions executed
   */
  run(max_cycles?: bigint | null): bigint;
  /**
   * Execute single instruction
   *
   * Returns JSON with execution details including:
   * - mnemonic: instruction name
   * - assembly: formatted assembly string
   * - pc: program counter before execution
   * - pc_changed: whether PC was explicitly changed
   * - register_writes: array of {index, value}
   * - memory_accesses: array of {addr, size, is_write, value}
   */
  step(): any;
  /**
   * Pause execution
   */
  pause(): void;
  /**
   * Reset simulator (keeps instruction database)
   */
  reset(): void;
  /**
   * Get PC
   */
  getPC(): bigint;
  /**
   * Set PC
   */
  setPC(pc: bigint): void;
  /**
   * Get XLEN (32 or 64)
   */
  getXlen(): number;
  /**
   * Create new RV64 simulator with instruction database
   */
  static newRv64(instructions_json: string): RiscVSimulator;
  /**
   * Read CSR by address
   */
  readCSR(addr: number): bigint;
  /**
   * Decode instruction at address without executing
   */
  decodeAt(addr: bigint): any;
  /**
   * Get CPU state snapshot as JSON
   */
  getState(): any;
  /**
   * Check if simulator is halted
   */
  isHalted(): boolean;
  /**
   * Write CSR by address
   */
  writeCSR(addr: number, value: bigint): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_riscvsimulator_free: (a: number, b: number) => void;
  readonly init: () => void;
  readonly riscvsimulator_clearBreakpoints: (a: number) => void;
  readonly riscvsimulator_decodeAt: (a: number, b: number, c: bigint) => void;
  readonly riscvsimulator_getAllCSRs: (a: number, b: number) => void;
  readonly riscvsimulator_getAllFloatRegisters: (a: number, b: number) => void;
  readonly riscvsimulator_getAllRegisters: (a: number, b: number) => void;
  readonly riscvsimulator_getAllVectorRegisters: (a: number, b: number) => void;
  readonly riscvsimulator_getBreakpoints: (a: number, b: number) => void;
  readonly riscvsimulator_getCycles: (a: number) => bigint;
  readonly riscvsimulator_getHistory: (a: number, b: number, c: number) => void;
  readonly riscvsimulator_getInstructionCount: (a: number) => bigint;
  readonly riscvsimulator_getInstructionDatabaseCount: (a: number) => number;
  readonly riscvsimulator_getLastInstruction: (a: number, b: number) => void;
  readonly riscvsimulator_getMemoryPages: (a: number, b: number) => void;
  readonly riscvsimulator_getPC: (a: number) => bigint;
  readonly riscvsimulator_getState: (a: number, b: number) => void;
  readonly riscvsimulator_getVectorCSRs: (a: number, b: number) => void;
  readonly riscvsimulator_getXlen: (a: number) => number;
  readonly riscvsimulator_isHalted: (a: number) => number;
  readonly riscvsimulator_isRunning: (a: number) => number;
  readonly riscvsimulator_loadProgram: (a: number, b: number, c: bigint, d: number, e: number) => void;
  readonly riscvsimulator_new: (a: number, b: number, c: number) => void;
  readonly riscvsimulator_newRv64: (a: number, b: number, c: number) => void;
  readonly riscvsimulator_pause: (a: number) => void;
  readonly riscvsimulator_readCSR: (a: number, b: number) => bigint;
  readonly riscvsimulator_readFloatRegister: (a: number, b: number) => bigint;
  readonly riscvsimulator_readMemory: (a: number, b: number, c: bigint) => void;
  readonly riscvsimulator_readMemoryRange: (a: number, b: number, c: bigint, d: number) => void;
  readonly riscvsimulator_readRegister: (a: number, b: number) => bigint;
  readonly riscvsimulator_removeBreakpoint: (a: number, b: bigint) => number;
  readonly riscvsimulator_removeWatchpoint: (a: number, b: bigint) => number;
  readonly riscvsimulator_reset: (a: number) => void;
  readonly riscvsimulator_run: (a: number, b: number, c: number, d: bigint) => void;
  readonly riscvsimulator_setBreakpoint: (a: number, b: bigint) => void;
  readonly riscvsimulator_setPC: (a: number, b: bigint) => void;
  readonly riscvsimulator_setWatchpoint: (a: number, b: number, c: bigint, d: number, e: number, f: number) => void;
  readonly riscvsimulator_step: (a: number, b: number) => void;
  readonly riscvsimulator_writeCSR: (a: number, b: number, c: bigint) => void;
  readonly riscvsimulator_writeFloatRegister: (a: number, b: number, c: bigint) => void;
  readonly riscvsimulator_writeMemory: (a: number, b: number, c: bigint, d: number) => void;
  readonly riscvsimulator_writeRegister: (a: number, b: number, c: bigint) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
