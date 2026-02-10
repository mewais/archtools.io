import React, { useMemo, useState, useEffect } from 'react';
import ExpandablePanel from '../../../../components/ExpandablePanel';
import EncodingVisualization from '../../../ISAReference/components/InstructionDetail/components/EncodingVisualization';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import { useLayout } from '../../contexts/LayoutContext';
import './PCDecodePanel.css';

/**
 * Interface for decoded instruction from WASM simulator
 */
interface DecodedInstruction {
  raw: number;
  mnemonic: string;
  category: string;
  format: string;
  extension: string;
  length: number;
  rd?: number;
  rs1?: number;
  rs2?: number;
  rs3?: number;
  imm?: number;
  csr?: number;
  rm?: number;
  aq?: boolean;
  rl?: boolean;
  pseudocode: string;
  description: string;
}

export interface PCDecodePanelProps {
  className?: string;
}

/**
 * PCDecodePanel - Displays current PC, instruction mnemonic, and binary decode
 *
 * Features:
 * - Shows current program counter (PC)
 * - Displays instruction mnemonic
 * - Uses EncodingVisualization component for binary decode
 * - Compact design
 */
const PCDecodePanel: React.FC<PCDecodePanelProps> = ({ className = '' }) => {
  const { pc, simulator, addressToLine } = useSimulatorContext();
  const { minimizedPanels, expandedPanel, toggleExpand, toggleMinimize } = useLayout();
  const isMinimized = minimizedPanels.has('pc-decode');
  const isExpanded = expandedPanel === 'pc-decode';

  // State for decoded instruction
  const [decodedInstruction, setDecodedInstruction] = useState<DecodedInstruction | null>(null);

  // Decode instruction at current PC whenever PC changes or program is reloaded
  // Note: addressToLine is included as a dependency to re-decode when a new program is loaded
  // (the PC might stay at 0 but the instruction at that address changes)
  useEffect(() => {
    if (!simulator) {
      setDecodedInstruction(null);
      return;
    }

    try {
      // Call decodeAt method from WASM simulator
      const decoded = simulator.decodeAt(pc);
      if (decoded) {
        setDecodedInstruction(decoded as DecodedInstruction);
      } else {
        setDecodedInstruction(null);
      }
    } catch (err) {
      // Could not decode instruction at this address (e.g., no program loaded)
      console.debug('Could not decode instruction at PC:', err);
      setDecodedInstruction(null);
    }
  }, [simulator, pc, addressToLine]);

  // Format PC address
  const formattedPC = useMemo(() => {
    return `0x${pc.toString(16).toUpperCase().padStart(8, '0')}`;
  }, [pc]);

  // Get instruction details from decoded instruction (at current PC)
  const mnemonic = decodedInstruction?.mnemonic || 'N/A';

  // Construct operands string from decodedInstruction fields based on format
  // This ensures we show the instruction ABOUT TO BE executed, not the one just executed
  const operands = useMemo(() => {
    if (!decodedInstruction) return '';

    const { format, rd, rs1, rs2, rs3, imm, csr, rm } = decodedInstruction;

    switch (format) {
      case 'R-type': {
        // R-type can have different operand combinations:
        // - rd, rs1, rs2 (standard ALU ops like ADD, SUB)
        // - rd, rs1 (single-source ops like FCVT.S.W, FCVT.S.WU, FMV.W.X, FSQRT)
        // - rd, rs1, rs2, rs3 (R4-type like FMADD)
        const parts: string[] = [];
        if (rd !== undefined) parts.push(`x${rd}`);
        if (rs1 !== undefined) parts.push(`x${rs1}`);
        if (rs2 !== undefined) parts.push(`x${rs2}`);
        if (rs3 !== undefined) parts.push(`x${rs3}`);
        // Include rounding mode if present and not dynamic (7)
        if (rm !== undefined && rm !== 7) {
          const rmNames = ['rne', 'rtz', 'rdn', 'rup', 'rmm', '?', '?', 'dyn'];
          parts.push(rmNames[rm] || `rm${rm}`);
        }
        return parts.join(', ');
      }
      case 'R4-type': {
        // R4-type: rd, rs1, rs2, rs3 (FMADD, FMSUB, FNMSUB, FNMADD)
        const parts: string[] = [];
        if (rd !== undefined) parts.push(`f${rd}`);
        if (rs1 !== undefined) parts.push(`f${rs1}`);
        if (rs2 !== undefined) parts.push(`f${rs2}`);
        if (rs3 !== undefined) parts.push(`f${rs3}`);
        // Include rounding mode if present and not dynamic (7)
        if (rm !== undefined && rm !== 7) {
          const rmNames = ['rne', 'rtz', 'rdn', 'rup', 'rmm', '?', '?', 'dyn'];
          parts.push(rmNames[rm] || `rm${rm}`);
        }
        return parts.join(', ');
      }
      case 'I-type':
        // rd, rs1, imm (e.g., "x1, x2, 10") or rd, imm(rs1) for loads
        if (rd !== undefined && rs1 !== undefined && imm !== undefined) {
          // Check if this is a load instruction (category contains 'load')
          if (decodedInstruction.category?.toLowerCase().includes('load')) {
            return `x${rd}, ${imm}(x${rs1})`;
          }
          return `x${rd}, x${rs1}, ${imm}`;
        }
        return '';
      case 'S-type':
        // rs2, imm(rs1) (e.g., "x2, 8(x1)")
        return rs1 !== undefined && rs2 !== undefined && imm !== undefined
          ? `x${rs2}, ${imm}(x${rs1})`
          : '';
      case 'B-type':
        // rs1, rs2, imm (e.g., "x1, x2, 16")
        return rs1 !== undefined && rs2 !== undefined && imm !== undefined
          ? `x${rs1}, x${rs2}, ${imm}`
          : '';
      case 'U-type':
        // rd, imm (e.g., "x1, 0x12345")
        return rd !== undefined && imm !== undefined
          ? `x${rd}, 0x${(imm >>> 0).toString(16)}`
          : '';
      case 'J-type':
        // rd, imm (e.g., "x1, 1000")
        return rd !== undefined && imm !== undefined
          ? `x${rd}, ${imm}`
          : '';
      case 'CSR':
        // CSR instructions: rd, csr, rs1 or rd, csr, imm
        if (rd !== undefined && csr !== undefined) {
          if (rs1 !== undefined) {
            return `x${rd}, 0x${csr.toString(16)}, x${rs1}`;
          } else if (imm !== undefined) {
            return `x${rd}, 0x${csr.toString(16)}, ${imm}`;
          }
        }
        return '';
      default: {
        // Generic fallback: list all available operands
        const parts: string[] = [];
        if (rd !== undefined) parts.push(`x${rd}`);
        if (rs1 !== undefined) parts.push(`x${rs1}`);
        if (rs2 !== undefined) parts.push(`x${rs2}`);
        if (rs3 !== undefined) parts.push(`x${rs3}`);
        if (imm !== undefined) parts.push(`${imm}`);
        return parts.join(', ');
      }
    }
  }, [decodedInstruction]);

  // Get actual instruction binary from decoded instruction
  const instruction = decodedInstruction
    ? (decodedInstruction.raw >>> 0).toString(2).padStart(32, '0')
    : '00000000000000000000000000000000';

  // Parse encoding fields based on instruction format from decoded instruction
  const encodingFields = useMemo(() => {
    if (!decodedInstruction || instruction.length !== 32) {
      return [];
    }

    const format = decodedInstruction.format;
    const { rd, rs1, rs2 } = decodedInstruction;

    // Generate encoding fields based on RISC-V instruction format
    switch (format) {
      case 'R-type':
      case 'R4-type': {
        // For R-type/R4-type, some instructions may not have rs2 as an operand
        // (e.g., FCVT.S.WU where rs2 position is used for a fixed selector)
        const fields = [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'rd', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: rd !== undefined ? `Destination register (x${rd})` : 'Destination register', category: 'rd' },
          { name: 'funct3', startBit: 12, endBit: 14, value: instruction.substring(17, 20), description: 'Function code 3', category: 'funct' },
          { name: 'rs1', startBit: 15, endBit: 19, value: instruction.substring(12, 17), description: rs1 !== undefined ? `Source register 1 (x${rs1})` : 'Source register 1', category: 'rs1' },
        ];

        // Only show rs2 if it's an actual operand, otherwise show the fixed encoding value
        if (rs2 !== undefined) {
          fields.push({ name: 'rs2', startBit: 20, endBit: 24, value: instruction.substring(7, 12), description: `Source register 2 (x${rs2})`, category: 'rs2' });
        } else {
          // Fixed encoding bits in rs2 position (e.g., selector for FCVT instructions)
          fields.push({ name: 'selector', startBit: 20, endBit: 24, value: instruction.substring(7, 12), description: 'Fixed encoding', category: 'funct' });
        }

        fields.push({ name: 'funct7', startBit: 25, endBit: 31, value: instruction.substring(0, 7), description: 'Function code 7', category: 'funct' });
        return fields;
      }
      case 'I-type':
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'rd', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: `Destination register (x${decodedInstruction.rd ?? '?'})`, category: 'rd' },
          { name: 'funct3', startBit: 12, endBit: 14, value: instruction.substring(17, 20), description: 'Function code 3', category: 'funct' },
          { name: 'rs1', startBit: 15, endBit: 19, value: instruction.substring(12, 17), description: `Source register 1 (x${decodedInstruction.rs1 ?? '?'})`, category: 'rs1' },
          { name: 'imm[11:0]', startBit: 20, endBit: 31, value: instruction.substring(0, 12), description: `Immediate value (${decodedInstruction.imm ?? '?'})`, category: 'imm' },
        ];
      case 'S-type':
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'imm[4:0]', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: 'Immediate bits [4:0]', category: 'imm' },
          { name: 'funct3', startBit: 12, endBit: 14, value: instruction.substring(17, 20), description: 'Function code 3', category: 'funct' },
          { name: 'rs1', startBit: 15, endBit: 19, value: instruction.substring(12, 17), description: `Source register 1 (x${decodedInstruction.rs1 ?? '?'})`, category: 'rs1' },
          { name: 'rs2', startBit: 20, endBit: 24, value: instruction.substring(7, 12), description: `Source register 2 (x${decodedInstruction.rs2 ?? '?'})`, category: 'rs2' },
          { name: 'imm[11:5]', startBit: 25, endBit: 31, value: instruction.substring(0, 7), description: 'Immediate bits [11:5]', category: 'imm' },
        ];
      case 'B-type':
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'imm[11]', startBit: 7, endBit: 7, value: instruction.substring(24, 25), description: 'Immediate bit 11', category: 'imm' },
          { name: 'imm[4:1]', startBit: 8, endBit: 11, value: instruction.substring(20, 24), description: 'Immediate bits [4:1]', category: 'imm' },
          { name: 'funct3', startBit: 12, endBit: 14, value: instruction.substring(17, 20), description: 'Function code 3', category: 'funct' },
          { name: 'rs1', startBit: 15, endBit: 19, value: instruction.substring(12, 17), description: `Source register 1 (x${decodedInstruction.rs1 ?? '?'})`, category: 'rs1' },
          { name: 'rs2', startBit: 20, endBit: 24, value: instruction.substring(7, 12), description: `Source register 2 (x${decodedInstruction.rs2 ?? '?'})`, category: 'rs2' },
          { name: 'imm[10:5]', startBit: 25, endBit: 30, value: instruction.substring(1, 7), description: 'Immediate bits [10:5]', category: 'imm' },
          { name: 'imm[12]', startBit: 31, endBit: 31, value: instruction.substring(0, 1), description: 'Immediate bit 12 (sign)', category: 'imm' },
        ];
      case 'U-type':
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'rd', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: `Destination register (x${decodedInstruction.rd ?? '?'})`, category: 'rd' },
          { name: 'imm[31:12]', startBit: 12, endBit: 31, value: instruction.substring(0, 20), description: `Upper immediate (${decodedInstruction.imm ?? '?'})`, category: 'imm' },
        ];
      case 'J-type':
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'rd', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: `Destination register (x${decodedInstruction.rd ?? '?'})`, category: 'rd' },
          { name: 'imm[19:12]', startBit: 12, endBit: 19, value: instruction.substring(12, 20), description: 'Immediate bits [19:12]', category: 'imm' },
          { name: 'imm[11]', startBit: 20, endBit: 20, value: instruction.substring(11, 12), description: 'Immediate bit 11', category: 'imm' },
          { name: 'imm[10:1]', startBit: 21, endBit: 30, value: instruction.substring(1, 11), description: 'Immediate bits [10:1]', category: 'imm' },
          { name: 'imm[20]', startBit: 31, endBit: 31, value: instruction.substring(0, 1), description: 'Immediate bit 20 (sign)', category: 'imm' },
        ];
      default:
        // Fallback to basic R-type format display
        return [
          { name: 'opcode', startBit: 0, endBit: 6, value: instruction.substring(25, 32), description: 'Opcode', category: 'opcode' },
          { name: 'rd', startBit: 7, endBit: 11, value: instruction.substring(20, 25), description: 'Destination register', category: 'rd' },
          { name: 'funct3', startBit: 12, endBit: 14, value: instruction.substring(17, 20), description: 'Function code 3', category: 'funct' },
          { name: 'rs1', startBit: 15, endBit: 19, value: instruction.substring(12, 17), description: 'Source register 1', category: 'rs1' },
          { name: 'rs2', startBit: 20, endBit: 24, value: instruction.substring(7, 12), description: 'Source register 2', category: 'rs2' },
          { name: 'funct7', startBit: 25, endBit: 31, value: instruction.substring(0, 7), description: 'Function code 7', category: 'funct' },
        ];
    }
  }, [instruction, decodedInstruction]);

  return (
    <ExpandablePanel
      title="Instruction Decode"
      isExpanded={isExpanded}
      isMinimized={isMinimized}
      onToggleExpand={() => toggleExpand('pc-decode')}
      onToggleMinimize={() => toggleMinimize('pc-decode')}
      className={`pc-decode-panel ${className}`}
    >
      <div className="pc-decode-panel__content">
        {/* PC & Instruction Header - Combined Row */}
        <div className="pc-decode-panel__header">
          <div className="pc-decode-panel__header-item">
            <span className="pc-decode-panel__label">PC:</span>
            <span className="pc-decode-panel__value pc-decode-panel__value--pc">
              {formattedPC}
            </span>
          </div>
          <div className="pc-decode-panel__header-item">
            <span className="pc-decode-panel__label">Inst:</span>
            <span className="pc-decode-panel__value pc-decode-panel__value--mnemonic">
              {mnemonic}
              {operands && <span className="pc-decode-panel__operands"> {operands}</span>}
            </span>
          </div>
        </div>

        {/* Binary Encoding Visualization - Compact mode (no legend) */}
        <div className="pc-decode-panel__encoding">
          <EncodingVisualization
            encoding={instruction}
            encodingFields={encodingFields}
            mnemonic={mnemonic}
            compact={true}
          />
        </div>
      </div>
    </ExpandablePanel>
  );
};

export default PCDecodePanel;
