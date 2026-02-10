import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { RiscVSimulator } from '../../../../tools/risc-v-simulator/pkg/risc_v_simulator';
import type { ISAVariant } from '../types/ISAVariant';
import { assemble } from '../assembler/Assembler';
import type { Xlen } from '../assembler/Assembler';
import instructionsData from '../../../data/instructions.json';

/**
 * Extended simulator interface for optional FP/CSR methods
 * These methods may not be available in all WASM builds
 */
interface ExtendedSimulator extends RiscVSimulator {
  // These methods may or may not exist in WASM builds
  // readFloatRegister, writeFloatRegister, getAllFloatRegisters are in base class
  // readCSR, writeCSR, getAllCSRs are in base class
  // We extend to allow additional optional methods in the future
}
import {
  getRegisterWidth,
  getFloatRegisterWidth,
  hasFloatingPoint as checkHasFloatingPoint,
  hasVector as checkHasVector,
  hasCSRs as checkHasCSRs,
} from '../types/ISAVariant';

/**
 * Simulator execution state
 */
export type SimulatorState = 'idle' | 'running' | 'paused' | 'error' | 'halted';

/**
 * Register types supported by the simulator
 */
export type RegisterType = 'integer' | 'float' | 'vector' | 'csr';

/**
 * Breakpoint information
 */
export interface Breakpoint {
  address: bigint;
  enabled: boolean;
}

/**
 * Memory watchpoint information
 */
export interface Watchpoint {
  address: bigint;
  type: 'read' | 'write' | 'access';
  size: number;
  enabled: boolean;
}

/**
 * Register watchpoint information
 */
export interface RegisterWatchpoint {
  index: number;
  type: RegisterType;
  enabled: boolean;
}

/**
 * Execution step result - matches the StepResult struct from Rust WASM
 * Note: Errors are thrown as exceptions, not returned in the result
 */
export interface StepResult {
  mnemonic: string;
  assembly: string;
  category: string;
  pc: number;           // PC before execution (number, not bigint, from WASM)
  pc_after: number;     // PC after execution
  pc_changed: boolean;  // Whether PC was explicitly changed (branch/jump)
  register_writes: { index: number; value: number }[];
  memory_accesses: { addr: number; size: number; is_write: boolean; value: number }[];
  instruction_length: number;
}

/**
 * Simulator context state
 */
export interface SimulatorContextType {
  // Simulator instance
  simulator: RiscVSimulator | null;
  initializeSimulator: (is64bit?: boolean) => Promise<void>;

  // ISA variant configuration
  isaVariant: ISAVariant;
  setISAVariant: (variant: ISAVariant) => void;
  registerWidth: 32 | 64;
  floatRegisterWidth: 32 | 64 | 128 | null;
  hasFloatingPoint: boolean;
  hasVector: boolean;
  hasCSRs: boolean;

  // Execution state
  state: SimulatorState;
  pc: bigint;
  cycles: bigint;
  instructionCount: bigint;

  // Control methods
  run: () => void;
  step: () => void;
  pause: () => void;
  reset: () => void;

  // Program management
  loadProgram: (address: bigint, data: Uint8Array) => void;
  loadProgramFromText: (text: string, baseAddress?: bigint) => void;

  // Breakpoints
  breakpoints: Map<bigint, Breakpoint>;
  addBreakpoint: (address: bigint) => void;
  removeBreakpoint: (address: bigint) => void;
  toggleBreakpoint: (address: bigint) => void;
  clearBreakpoints: () => void;

  // Memory watchpoints
  memoryWatchpoints: Map<bigint, Watchpoint>;
  addMemoryWatchpoint: (address: bigint, type: 'read' | 'write' | 'access', size: number) => void;
  removeMemoryWatchpoint: (address: bigint) => void;
  toggleMemoryWatchpoint: (address: bigint) => void;

  // Register watchpoints
  registerWatchpoints: Map<string, RegisterWatchpoint>;
  addRegisterWatchpoint: (index: number, type: RegisterType) => void;
  removeRegisterWatchpoint: (index: number, type: RegisterType) => void;
  toggleRegisterWatchpoint: (index: number, type: RegisterType) => void;

  // Register access
  readRegister: (index: number) => bigint;
  writeRegister: (index: number, value: bigint) => void;
  getAllRegisters: () => bigint[];

  // Float register access
  readFloatRegister: (index: number) => bigint;
  writeFloatRegister: (index: number, value: bigint) => void;
  getAllFloatRegisters: () => bigint[];

  // Vector register access
  getAllVectorRegisters: () => bigint[][];
  getVectorCSRs: () => {
    vl: number;
    sew: number;
    lmul: number;
    lmul_log2: number;
    vta: boolean;
    vma: boolean;
    vlmax: number;
    vlen: number;
    vstart: number;
  };

  // CSR access
  readCSR: (addr: number) => bigint;
  writeCSR: (addr: number, value: bigint) => void;
  getAllCSRs: () => Map<number, bigint>;

  // Memory access
  readMemory: (address: bigint) => number;
  writeMemory: (address: bigint, value: number) => void;
  readMemoryRange: (startAddress: bigint, length: number) => Uint8Array;

  // Error handling
  error: string | null;
  clearError: () => void;

  // Assembly errors for display in UI
  assemblyErrors: string[];
  clearAssemblyErrors: () => void;

  // Last step result
  lastStep: StepResult | null;

  // Step counter - increments on every step, useful as a dependency to force re-renders
  stepCount: number;

  // Line <-> Address mappings for breakpoints and PC highlighting
  // Maps source line number (1-indexed) to memory address
  lineToAddress: Map<number, bigint>;
  // Maps memory address to source line number
  addressToLine: Map<bigint, number>;
}

const SimulatorContext = createContext<SimulatorContextType | undefined>(undefined);

/**
 * Simulator context provider
 */
export const SimulatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [simulator, setSimulator] = useState<RiscVSimulator | null>(null);
  const [state, setState] = useState<SimulatorState>('idle');
  const [pc, setPC] = useState<bigint>(0n);
  const [cycles, setCycles] = useState<bigint>(0n);
  const [instructionCount, setInstructionCount] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);
  const [lastStep, setLastStep] = useState<StepResult | null>(null);
  const [stepCount, setStepCount] = useState<number>(0);

  const [breakpoints, setBreakpoints] = useState<Map<bigint, Breakpoint>>(new Map());
  const [memoryWatchpoints, setMemoryWatchpoints] = useState<Map<bigint, Watchpoint>>(new Map());
  const [registerWatchpoints, setRegisterWatchpoints] = useState<Map<string, RegisterWatchpoint>>(new Map());

  // Line <-> Address mappings for breakpoints and PC highlighting
  const [lineToAddress, setLineToAddress] = useState<Map<number, bigint>>(new Map());
  const [addressToLine, setAddressToLine] = useState<Map<bigint, number>>(new Map());

  // ISA variant configuration
  const [isaVariant, setISAVariantState] = useState<ISAVariant>({
    base: 'RV32I',
    extensions: [],
  });

  const runIntervalRef = useRef<number | null>(null);
  const pauseRef = useRef<() => void>(() => {});
  const simulatorRef = useRef<RiscVSimulator | null>(null);
  const breakpointsRef = useRef<Map<bigint, Breakpoint>>(new Map());
  const xlenRef = useRef<Xlen>(32);

  // Guard against concurrent WASM access (causes "recursive use of an object detected")
  const isExecutingRef = useRef<boolean>(false);
  // Guard against React StrictMode double initialization
  const isInitializingRef = useRef<boolean>(false);

  // Keep refs in sync with state (for use in interval callbacks)
  useEffect(() => {
    simulatorRef.current = simulator;
  }, [simulator]);

  useEffect(() => {
    breakpointsRef.current = breakpoints;
  }, [breakpoints]);

  // Derived ISA properties
  const registerWidth = useMemo(() => getRegisterWidth(isaVariant.base), [isaVariant.base]);

  // Keep xlenRef in sync with registerWidth (for use in callbacks without dependencies)
  useEffect(() => {
    xlenRef.current = registerWidth as Xlen;
  }, [registerWidth]);
  const floatRegisterWidth = useMemo(() => getFloatRegisterWidth(isaVariant.extensions), [isaVariant.extensions]);
  const hasFloatingPoint = useMemo(() => checkHasFloatingPoint(isaVariant.extensions), [isaVariant.extensions]);
  const hasVector = useMemo(() => checkHasVector(isaVariant.extensions), [isaVariant.extensions]);
  const hasCSRs = useMemo(() => checkHasCSRs(isaVariant.extensions), [isaVariant.extensions]);

  // Initialize WASM simulator
  const initializeSimulator = useCallback(async (is64bit = false) => {
    // Guard against React StrictMode double initialization and concurrent calls
    if (isInitializingRef.current) {
      console.log('Initialization already in progress, skipping...');
      return;
    }
    isInitializingRef.current = true;

    try {
      console.log('Initializing WASM simulator...');
      // Dynamically import WASM module
      const wasmModule = await import('../../../../tools/risc-v-simulator/pkg/risc_v_simulator');
      await wasmModule.default(); // Initialize WASM

      // Convert instructions data to JSON string for WASM
      const instructionsJson = JSON.stringify(instructionsData);

      // Create simulator instance with instruction database
      const sim = is64bit
        ? wasmModule.RiscVSimulator.newRv64(instructionsJson)
        : new wasmModule.RiscVSimulator(instructionsJson);

      setSimulator(sim);
      simulatorRef.current = sim; // Also update ref immediately
      setState('idle');
      setPC(0n);
      setCycles(0n);
      setInstructionCount(0n);
      setError(null);
      setLastStep(null);

      console.log(`Simulator initialized successfully with ${sim.getInstructionDatabaseCount()} instructions (${is64bit ? 'RV64' : 'RV32'})`);
    } catch (err) {
      console.error('Failed to initialize simulator:', err);
      setError(`Failed to initialize simulator: ${err}`);
      setState('error');
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  // Set ISA variant and reinitialize simulator
  const setISAVariant = useCallback(async (variant: ISAVariant) => {
    // Pause execution if running
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }

    // Reinitialize simulator with correct bit width FIRST
    const is64bit = variant.base === 'RV64I';
    await initializeSimulator(is64bit);

    // THEN update variant (so React re-renders with simulator already ready)
    setISAVariantState(variant);
  }, [initializeSimulator]);

  // Update state from simulator
  const updateState = useCallback(() => {
    if (!simulator) return;

    try {
      setPC(simulator.getPC());
      setCycles(simulator.getCycles());
      setInstructionCount(simulator.getInstructionCount());
    } catch (err) {
      setError(`Failed to update state: ${err}`);
    }
  }, [simulator]);

  // Run simulator continuously
  // Uses refs inside interval callback to avoid stale closure issues
  const run = useCallback(() => {
    if (!simulatorRef.current || state === 'running') return;

    // Prevent starting run if a step is currently executing
    if (isExecutingRef.current) {
      console.warn('run: execution already in progress, waiting...');
      return;
    }

    setState('running');

    // Run in intervals to allow UI updates
    runIntervalRef.current = window.setInterval(() => {
      const sim = simulatorRef.current;
      if (!sim) {
        // Simulator was disposed, stop the interval
        if (runIntervalRef.current) {
          clearInterval(runIntervalRef.current);
          runIntervalRef.current = null;
        }
        setState('idle');
        return;
      }

      // Prevent concurrent WASM calls (causes "recursive use of an object detected")
      if (isExecutingRef.current) {
        return;
      }
      isExecutingRef.current = true;

      try {
        // Execute multiple steps per interval for performance
        for (let i = 0; i < 10; i++) {
          // Check for breakpoints BEFORE executing at this PC
          const currentPC = sim.getPC();
          const bp = breakpointsRef.current.get(currentPC);
          if (bp && bp.enabled) {
            // Update state and pause
            setPC(currentPC);
            setCycles(sim.getCycles());
            setInstructionCount(sim.getInstructionCount());
            // Use pauseRef to call latest pause function
            pauseRef.current();
            isExecutingRef.current = false;
            return;
          }

          const result = sim.step();
          if (result) {
            // Result is already a JavaScript object from serde_wasm_bindgen
            const stepResult = typeof result === 'string' ? JSON.parse(result) : result;
            setLastStep(stepResult);
          }
        }

        // Update state from simulator
        setPC(sim.getPC());
        setCycles(sim.getCycles());
        setInstructionCount(sim.getInstructionCount());
        // Increment step counter to force re-renders in components that depend on it
        setStepCount(prev => prev + 1);
      } catch (err) {
        const errorStr = String(err);

        // Always try to update state from simulator first, so UI shows actual PC where error occurred
        try {
          setPC(sim.getPC());
          setCycles(sim.getCycles());
          setInstructionCount(sim.getInstructionCount());
        } catch (stateErr) {
          console.warn('Failed to update state after error:', stateErr);
        }

        // Check if this is a breakpoint hit (thrown by WASM when stepping onto debugger breakpoint)
        if (errorStr.includes('Breakpoint at PC')) {
          console.log('Breakpoint hit during run, pausing');
          // Don't set error for debugger breakpoints - they're expected pauses
          pauseRef.current();
          isExecutingRef.current = false;
          return;
        }

        // Check if this is an EBREAK instruction (also a breakpoint, just from code)
        if (errorStr.includes('Breakpoint (EBREAK)') || errorStr.includes('EBREAK')) {
          console.log('EBREAK instruction hit during run, pausing');
          // Don't set error for EBREAK - it's an expected pause
          pauseRef.current();
          isExecutingRef.current = false;
          return;
        }

        // Check for ECALL - pause without error (system call)
        if (errorStr.includes('Environment Call') || errorStr.includes('ECALL')) {
          console.log('ECALL instruction hit during run, pausing');
          // Don't set error for ECALL - it's an expected pause
          pauseRef.current();
          isExecutingRef.current = false;
          return;
        }

        // Log memory access errors for debugging
        if (errorStr.includes('memory access out of bounds') || errorStr.includes('out of bounds')) {
          console.error('Memory access out of bounds during execution');
        }

        setError(`Execution error: ${errorStr}`);
        setState('error');
        if (runIntervalRef.current) {
          clearInterval(runIntervalRef.current);
          runIntervalRef.current = null;
        }
      } finally {
        isExecutingRef.current = false;
      }
    }, 16); // ~60 FPS
  }, [state]); // Only depends on state since we use refs for simulator/breakpoints/pause

  // Execute single step
  // NOTE: Uses simulatorRef.current for consistency with run() and loadProgramFromText()
  const step = useCallback(() => {
    const sim = simulatorRef.current;
    console.log('[step] called, simulator:', sim ? 'exists' : 'null');
    if (!sim) {
      console.warn('[step] simulator not initialized');
      return;
    }

    // Prevent concurrent WASM calls (causes "recursive use of an object detected")
    // This can happen if user rapidly clicks step button or if run() is active
    if (isExecutingRef.current) {
      console.warn('[step] execution already in progress, skipping');
      return;
    }
    isExecutingRef.current = true;

    try {
      const pcBefore = sim.getPC();
      console.log('[step] PC before step:', pcBefore.toString());

      console.log('[step] Executing step...');
      const result = sim.step();

      const pcAfter = sim.getPC();
      console.log('[step] PC after step:', pcAfter.toString());
      console.log('[step] Step result:', result);

      // WASM step() returns a StepResult object on success
      // Errors are thrown as exceptions (caught in catch block)
      if (result) {
        // Result is already a JavaScript object from serde_wasm_bindgen
        const stepResult = typeof result === 'string' ? JSON.parse(result) : result;
        console.log('[step] Setting lastStep:', stepResult);
        setLastStep(stepResult);
      }

      console.log('[step] Updating state...');
      // Update state directly from sim (not updateState which may have stale closure)
      setPC(sim.getPC());
      setCycles(sim.getCycles());
      setInstructionCount(sim.getInstructionCount());
      setState('paused');
      // Increment step counter to force re-renders in components that depend on it
      setStepCount(prev => prev + 1);
      console.log('[step] Done');
    } catch (err) {
      const errorStr = String(err);
      console.error('[step] Error:', errorStr);

      // Always try to update state from simulator first, so UI shows actual PC where error occurred
      try {
        setPC(sim.getPC());
        setCycles(sim.getCycles());
        setInstructionCount(sim.getInstructionCount());
      } catch (stateErr) {
        console.warn('[step] Failed to update state after error:', stateErr);
      }

      // Check if this is a debugger breakpoint hit (not really an error)
      if (errorStr.includes('Breakpoint at PC')) {
        console.log('[step] Breakpoint hit, pausing');
        setState('paused');
        // Don't set error for breakpoints - they're expected pauses
        return;
      }

      // Check if this is an EBREAK instruction
      if (errorStr.includes('Breakpoint (EBREAK)') || errorStr.includes('EBREAK')) {
        console.log('[step] EBREAK instruction hit, pausing');
        setState('paused');
        // Don't set error for EBREAK - it's an expected pause
        return;
      }

      // Check for ECALL - pause without error (system call)
      if (errorStr.includes('Environment Call') || errorStr.includes('ECALL')) {
        console.log('[step] ECALL instruction hit, pausing');
        setState('paused');
        // Don't set error for ECALL - it's an expected pause
        return;
      }

      setError(`Step error: ${errorStr}`);
      setState('error');
    } finally {
      isExecutingRef.current = false;
    }
  }, []); // No dependencies - uses refs for latest values

  // Pause execution
  const pause = useCallback(() => {
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }

    if (simulator) {
      try {
        simulator.pause();
        setState('paused');
        updateState();
      } catch (err) {
        console.error('Error during pause:', err);
        setState('paused'); // Still set to paused even if update fails
      }
    }
  }, [simulator, updateState]);

  // Keep pauseRef in sync with pause callback (for use in interval callbacks)
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  // Reset simulator
  const reset = useCallback(() => {
    if (!simulator) return;

    pause();

    // Wait for any pending execution to complete
    // Use setTimeout to allow the interval to be cleared first
    setTimeout(() => {
      try {
        simulator.reset();
        setState('idle');
        setPC(0n);
        setCycles(0n);
        setInstructionCount(0n);
        setError(null);
        setLastStep(null);
        setAssemblyErrors([]);  // Clear assembly errors on reset
        isExecutingRef.current = false; // Ensure execution flag is reset
      } catch (err) {
        setError(`Reset error: ${err}`);
        setState('error');
      }
    }, 0);
  }, [simulator, pause]);

  // Load program binary
  const loadProgram = useCallback((address: bigint, data: Uint8Array) => {
    if (!simulator) return;

    try {
      simulator.loadProgram(address, data);
      simulator.setPC(address);
      updateState();
      setState('idle');
      setError(null);
    } catch (err) {
      setError(`Load program error: ${err}`);
      setState('error');
    }
  }, [simulator, updateState]);

  // Assembly errors for display
  const [assemblyErrors, setAssemblyErrors] = useState<string[]>([]);

  // Clear assembly errors
  const clearAssemblyErrors = useCallback(() => {
    setAssemblyErrors([]);
  }, []);

  // Load program from assembly text using the TypeScript assembler
  // NOTE: Uses simulatorRef.current to always get the latest simulator instance,
  // which is critical when this is called immediately after setISAVariant()
  // (before React has re-rendered with the new simulator state).
  const loadProgramFromText = useCallback((text: string, baseAddress: bigint = 0n) => {
    // Use ref to get the latest simulator instance (not stale closure value)
    const sim = simulatorRef.current;
    console.log('loadProgramFromText called, simulator:', sim ? 'exists' : 'null');
    if (!sim) {
      console.error('loadProgramFromText: Simulator not initialized');
      setError('Simulator not initialized');
      return;
    }

    try {
      // Assemble the text (uses default data base address of 0x2000)
      // Pass XLEN so the assembler uses the correct instruction variants (RV32 vs RV64)
      console.log(`Assembling program for XLEN=${xlenRef.current}...`);
      const result = assemble(text, baseAddress, 0x2000n, xlenRef.current);

      if (!result.success) {
        console.error('Assembly failed:', result.errors);
        setAssemblyErrors(result.errors);
        setError(`Assembly failed with ${result.errors.length} error(s)`);
        setState('error');
        return;
      }

      // Clear any previous assembly errors
      setAssemblyErrors([]);

      console.log(`Assembly successful: ${result.binary.length} text bytes, ${result.dataBinary?.length || 0} data bytes`);

      // Store line <-> address mappings for breakpoints and PC highlighting
      setLineToAddress(result.lineToAddress);
      // Use the complete addressToLine mapping from assembler (includes all addresses from expanded pseudo-instructions)
      setAddressToLine(result.addressToLine);
      console.log(`Line mappings: ${result.lineToAddress.size} lines mapped, ${result.addressToLine.size} addresses mapped`);

      // Load the text section binary into the simulator
      sim.loadProgram(baseAddress, result.binary);
      console.log(`Loaded text section at 0x${baseAddress.toString(16)}`);

      // Load the data section binary into the simulator (if present)
      if (result.dataBinary && result.dataBinary.length > 0) {
        sim.loadProgram(result.dataBaseAddress, result.dataBinary);
        console.log(`Loaded data section: ${result.dataBinary.length} bytes at 0x${result.dataBaseAddress.toString(16)}`);
      }

      sim.setPC(baseAddress);
      // Manually update PC state since updateState uses simulator from closure
      setPC(sim.getPC());
      setCycles(sim.getCycles());
      setInstructionCount(sim.getInstructionCount());
      setState('idle');
      setError(null);

      console.log(`Program loaded successfully, PC set to 0x${baseAddress.toString(16)}`);
    } catch (err) {
      console.error('Assembly/load error:', err);
      setError(`Assembly error: ${err}`);
      setState('error');
    }
  }, []); // No dependencies needed - uses refs for latest values

  // Breakpoint management
  const addBreakpoint = useCallback((address: bigint) => {
    if (!simulator) return;

    simulator.setBreakpoint(address);
    setBreakpoints(prev => new Map(prev).set(address, { address, enabled: true }));
  }, [simulator]);

  const removeBreakpoint = useCallback((address: bigint) => {
    if (!simulator) return;

    simulator.removeBreakpoint(address);
    setBreakpoints(prev => {
      const next = new Map(prev);
      next.delete(address);
      return next;
    });
  }, [simulator]);

  const toggleBreakpoint = useCallback((address: bigint) => {
    if (!simulator) {
      console.warn('toggleBreakpoint: simulator not initialized');
      return;
    }

    // Use functional setState to access current breakpoints
    setBreakpoints(prev => {
      const bp = prev.get(address);
      const next = new Map(prev);

      try {
        if (bp) {
          // Remove breakpoint
          console.log(`Removing breakpoint at address ${address}`);
          const removed = simulator.removeBreakpoint(address);
          console.log(`Breakpoint removed: ${removed}`);
          next.delete(address);
        } else {
          // Add breakpoint
          console.log(`Adding breakpoint at address ${address}`);
          simulator.setBreakpoint(address);
          console.log(`Breakpoint added successfully`);
          next.set(address, { address, enabled: true });
        }
      } catch (err) {
        console.error('Breakpoint WASM error:', err);
        // Return previous state on error to prevent partial updates
        return prev;
      }

      console.log(`New breakpoint count: ${next.size}`);
      return next;
    });
  }, [simulator]);

  const clearBreakpoints = useCallback(() => {
    if (!simulator) return;

    simulator.clearBreakpoints();
    setBreakpoints(new Map());
  }, [simulator]);

  // Memory watchpoint management
  const addMemoryWatchpoint = useCallback((address: bigint, type: 'read' | 'write' | 'access', size: number) => {
    if (!simulator) return;

    simulator.setWatchpoint(address, type, size);
    setMemoryWatchpoints(prev => new Map(prev).set(address, { address, type, size, enabled: true }));
  }, [simulator]);

  const removeMemoryWatchpoint = useCallback((address: bigint) => {
    if (!simulator) return;

    simulator.removeWatchpoint(address);
    setMemoryWatchpoints(prev => {
      const next = new Map(prev);
      next.delete(address);
      return next;
    });
  }, [simulator]);

  const toggleMemoryWatchpoint = useCallback((address: bigint) => {
    const wp = memoryWatchpoints.get(address);
    if (wp && wp.enabled) {
      setMemoryWatchpoints(prev => new Map(prev).set(address, { ...wp, enabled: false }));
    } else if (wp) {
      setMemoryWatchpoints(prev => new Map(prev).set(address, { ...wp, enabled: true }));
    }
  }, [memoryWatchpoints]);

  // Register watchpoint management
  const getRegisterKey = (index: number, type: RegisterType) => `${type}-${index}`;

  const addRegisterWatchpoint = useCallback((index: number, type: RegisterType) => {
    const key = getRegisterKey(index, type);
    setRegisterWatchpoints(prev => new Map(prev).set(key, { index, type, enabled: true }));
  }, []);

  const removeRegisterWatchpoint = useCallback((index: number, type: RegisterType) => {
    const key = getRegisterKey(index, type);
    setRegisterWatchpoints(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const toggleRegisterWatchpoint = useCallback((index: number, type: RegisterType) => {
    const key = getRegisterKey(index, type);
    const wp = registerWatchpoints.get(key);
    if (wp) {
      removeRegisterWatchpoint(index, type);
    } else {
      addRegisterWatchpoint(index, type);
    }
  }, [registerWatchpoints, addRegisterWatchpoint, removeRegisterWatchpoint]);

  // Register access
  const readRegister = useCallback((index: number): bigint => {
    if (!simulator) return 0n;
    return simulator.readRegister(index);
  }, [simulator]);

  const writeRegister = useCallback((index: number, value: bigint) => {
    if (!simulator) return;
    simulator.writeRegister(index, value);
    updateState();
  }, [simulator, updateState]);

  const getAllRegisters = useCallback((): bigint[] => {
    if (!simulator) return Array(32).fill(0n);

    try {
      // WASM returns a JavaScript Array directly via serde_wasm_bindgen
      const regs = simulator.getAllRegisters();
      if (Array.isArray(regs)) {
        return regs.map(v => BigInt(v as number | bigint));
      }
      return Array(32).fill(0n);
    } catch (err) {
      console.error('getAllRegisters error:', err);
      return Array(32).fill(0n);
    }
  }, [simulator]);

  // Float register access
  // Note: These methods use optional chaining because FP support may not be available in all WASM builds
  const readFloatRegister = useCallback((index: number): bigint => {
    if (!simulator) return 0n;
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.readFloatRegister === 'function') {
        return ext.readFloatRegister(index);
      }
    } catch {
      // Method not available in this WASM build
    }
    return 0n;
  }, [simulator]);

  const writeFloatRegister = useCallback((index: number, value: bigint) => {
    if (!simulator) return;
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.writeFloatRegister === 'function') {
        ext.writeFloatRegister(index, value);
        updateState();
      }
    } catch {
      // Method not available in this WASM build
    }
  }, [simulator, updateState]);

  const getAllFloatRegisters = useCallback((): bigint[] => {
    if (!simulator) return Array(32).fill(0n);
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.getAllFloatRegisters === 'function') {
        const regs = ext.getAllFloatRegisters();
        if (Array.isArray(regs)) {
          return regs.map(v => BigInt(v as number | bigint));
        }
      }
    } catch {
      // Method not available in this WASM build
    }
    return Array(32).fill(0n);
  }, [simulator]);

  // Vector register access
  const getAllVectorRegisters = useCallback((): bigint[][] => {
    if (!simulator) return Array(32).fill(null).map(() => Array(8).fill(0n));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = simulator as any;
    try {
      if (typeof ext.getAllVectorRegisters === 'function') {
        const regs = ext.getAllVectorRegisters();
        if (Array.isArray(regs)) {
          return regs.map((reg: unknown[]) =>
            Array.isArray(reg) ? reg.map(v => BigInt(v as number | bigint)) : []
          );
        }
      }
    } catch {
      // Method not available in this WASM build
    }
    return Array(32).fill(null).map(() => Array(8).fill(0n));
  }, [simulator]);

  const getVectorCSRs = useCallback(() => {
    const defaultState = {
      vl: 0,
      sew: 32,
      lmul: 1,
      lmul_log2: 0,
      vta: false,
      vma: false,
      vlmax: 8,
      vlen: 256,
      vstart: 0,
    };
    if (!simulator) return defaultState;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = simulator as any;
    try {
      if (typeof ext.getVectorCSRs === 'function') {
        const csrs = ext.getVectorCSRs();
        if (csrs && typeof csrs === 'object') {
          return {
            vl: csrs.vl ?? 0,
            sew: csrs.sew ?? 32,
            lmul: csrs.lmul ?? 1,
            lmul_log2: csrs.lmul_log2 ?? 0,
            vta: csrs.vta ?? false,
            vma: csrs.vma ?? false,
            vlmax: csrs.vlmax ?? 8,
            vlen: csrs.vlen ?? 256,
            vstart: csrs.vstart ?? 0,
          };
        }
      }
    } catch {
      // Method not available in this WASM build
    }
    return defaultState;
  }, [simulator]);

  // CSR (Control and Status Register) access
  // Note: These methods use optional chaining because CSR support may not be available in all WASM builds
  const readCSR = useCallback((addr: number): bigint => {
    if (!simulator) return 0n;
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.readCSR === 'function') {
        return ext.readCSR(addr);
      }
    } catch {
      // Method not available in this WASM build
    }
    return 0n;
  }, [simulator]);

  const writeCSR = useCallback((addr: number, value: bigint) => {
    if (!simulator) return;
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.writeCSR === 'function') {
        ext.writeCSR(addr, value);
        updateState();
      }
    } catch {
      // Method not available in this WASM build
    }
  }, [simulator, updateState]);

  const getAllCSRs = useCallback((): Map<number, bigint> => {
    if (!simulator) return new Map();
    const ext = simulator as ExtendedSimulator;
    try {
      if (typeof ext.getAllCSRs === 'function') {
        const csrs = ext.getAllCSRs();
        const result = new Map<number, bigint>();
        if (csrs && typeof csrs === 'object') {
          for (const [key, value] of Object.entries(csrs)) {
            // Key is hex string like "0x300"
            const addr = parseInt(key, 16);
            result.set(addr, BigInt(value as string | number | bigint));
          }
        }
        return result;
      }
    } catch {
      // Method not available in this WASM build
    }
    return new Map();
  }, [simulator]);

  // Memory access
  const readMemory = useCallback((address: bigint): number => {
    if (!simulator) return 0;
    return simulator.readMemory(address);
  }, [simulator]);

  const writeMemory = useCallback((address: bigint, value: number) => {
    if (!simulator) return;
    simulator.writeMemory(address, value);
  }, [simulator]);

  const readMemoryRange = useCallback((startAddress: bigint, length: number): Uint8Array => {
    if (!simulator) return new Uint8Array(length);

    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = simulator.readMemory(startAddress + BigInt(i));
    }
    return data;
  }, [simulator]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (runIntervalRef.current) {
        clearInterval(runIntervalRef.current);
      }
    };
  }, []);

  const value: SimulatorContextType = {
    simulator,
    initializeSimulator,
    isaVariant,
    setISAVariant,
    registerWidth,
    floatRegisterWidth,
    hasFloatingPoint,
    hasVector,
    hasCSRs,
    state,
    pc,
    cycles,
    instructionCount,
    run,
    step,
    pause,
    reset,
    loadProgram,
    loadProgramFromText,
    breakpoints,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    clearBreakpoints,
    memoryWatchpoints,
    addMemoryWatchpoint,
    removeMemoryWatchpoint,
    toggleMemoryWatchpoint,
    registerWatchpoints,
    addRegisterWatchpoint,
    removeRegisterWatchpoint,
    toggleRegisterWatchpoint,
    readRegister,
    writeRegister,
    getAllRegisters,
    readFloatRegister,
    writeFloatRegister,
    getAllFloatRegisters,
    getAllVectorRegisters,
    getVectorCSRs,
    readCSR,
    writeCSR,
    getAllCSRs,
    readMemory,
    writeMemory,
    readMemoryRange,
    error,
    clearError,
    assemblyErrors,
    clearAssemblyErrors,
    lastStep,
    stepCount,
    lineToAddress,
    addressToLine,
  };

  return <SimulatorContext.Provider value={value}>{children}</SimulatorContext.Provider>;
};

/**
 * Hook to access simulator context
 */
export const useSimulatorContext = () => {
  const context = useContext(SimulatorContext);
  if (!context) {
    throw new Error('useSimulatorContext must be used within SimulatorProvider');
  }
  return context;
};
