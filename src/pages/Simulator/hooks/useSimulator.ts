import { useEffect, useCallback } from 'react';
import { useSimulatorContext } from '../contexts/SimulatorContext';

/**
 * Custom hook for simulator operations
 * Provides high-level simulator control with keyboard shortcuts
 */
export const useSimulator = () => {
  const context = useSimulatorContext();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // F5 - Run
      if (e.key === 'F5') {
        e.preventDefault();
        context.run();
      }

      // F10 - Step
      if (e.key === 'F10') {
        e.preventDefault();
        context.step();
      }

      // F6 - Pause
      if (e.key === 'F6') {
        e.preventDefault();
        context.pause();
      }

      // Ctrl+R - Reset
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        context.reset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [context]);

  return context;
};

/**
 * Hook to format register values
 */
export const useRegisterFormatter = () => {
  const formatHex = useCallback((value: bigint, bits: number = 32): string => {
    const hexDigits = bits / 4;
    const hexValue = value.toString(16).toUpperCase().padStart(hexDigits, '0');
    return `0x${hexValue}`;
  }, []);

  const formatDecimal = useCallback((value: bigint): string => {
    return value.toString(10);
  }, []);

  const formatBinary = useCallback((value: bigint, bits: number = 32): string => {
    const binValue = value.toString(2).padStart(bits, '0');
    return `0b${binValue}`;
  }, []);

  return {
    formatHex,
    formatDecimal,
    formatBinary,
  };
};

/**
 * Hook to get ABI register names
 */
export const useRegisterNames = () => {
  // RISC-V ABI register names
  const abiNames = [
    'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
    's0/fp', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5',
    'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7',
    's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6',
  ];

  const getRegisterName = useCallback((index: number): string => {
    if (index < 0 || index >= 32) return `x${index}`;
    return abiNames[index];
  }, []);

  const getFullRegisterName = useCallback((index: number): string => {
    if (index < 0 || index >= 32) return `x${index}`;
    return `x${index} (${abiNames[index]})`;
  }, []);

  return {
    abiNames,
    getRegisterName,
    getFullRegisterName,
  };
};

/**
 * Hook to parse assembly text into binary
 * TODO: Implement full RISC-V assembler
 */
export const useAssembler = () => {
  const assemble = useCallback((_text: string): Uint8Array | null => {
    // TODO: Implement RISC-V assembly parser and encoder
    // For now, return null to indicate not implemented
    console.warn('Assembly parsing not yet implemented');
    return null;
  }, []);

  const disassemble = useCallback((_binary: Uint8Array): string => {
    // TODO: Implement RISC-V disassembler
    console.warn('Disassembly not yet implemented');
    return '';
  }, []);

  return {
    assemble,
    disassemble,
  };
};
