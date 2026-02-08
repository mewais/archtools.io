import React from 'react';
import InstructionHeader from './components/InstructionHeader';
import CodeBlock from './components/CodeBlock';
import EncodingVisualization from './components/EncodingVisualization';
import Badge from './components/Badge';
import type { Instruction, Pseudoinstruction } from '../../../../types';
import './InstructionDetail.css';

export interface InstructionDetailProps {
  instruction: Instruction | Pseudoinstruction | null;
  isPseudoinstruction?: boolean;
  className?: string;
}

/**
 * Helper function to get operand descriptions
 */
function getOperandDescription(operand: string): string {
  const descriptions: Record<string, string> = {
    'rd': 'Destination register',
    'rs1': 'Source register 1',
    'rs2': 'Source register 2',
    'rs3': 'Source register 3',
    'imm': 'Immediate value',
    'offset': 'Memory address offset',
    'shamt': 'Shift amount',
    'csr': 'Control and status register',
    'zimm': 'Zero-extended immediate',
    'aqrl': 'Acquire and release bits',
    'pred': 'Predecessor set',
    'succ': 'Successor set',
    'rm': 'Rounding mode',
  };
  return descriptions[operand] || 'Operand';
}

const InstructionDetail: React.FC<InstructionDetailProps> = ({
  instruction,
  isPseudoinstruction = false,
  className = ''
}) => {
  // Empty state
  if (!instruction) {
    return (
      <div className={`instruction-detail instruction-detail--empty ${className}`}>
        <div className="instruction-detail__empty-state">
          <div className="instruction-detail__empty-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="8" y="8" width="48" height="48" rx="8" stroke="currentColor" strokeWidth="2" fill="none"/>
              <line x1="20" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="20" y1="32" x2="38" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="20" y1="40" x2="42" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 className="instruction-detail__empty-title">No Instruction Selected</h3>
          <p className="instruction-detail__empty-message">
            Select an instruction from the list to view its details, encoding, and examples.
          </p>
        </div>
      </div>
    );
  }

  // Type guard to check if this is a pseudoinstruction
  const isPseudo = isPseudoinstruction || 'pseudoinstruction' in instruction;
  const pseudoInstr = isPseudo ? instruction as Pseudoinstruction : null;
  const regularInstr = !isPseudo ? instruction as Instruction : null;

  // Render pseudoinstruction
  if (isPseudo && pseudoInstr) {
    return (
      <div className={`instruction-detail ${className}`}>
        {/* Header */}
        <section className="instruction-detail__section">
          <InstructionHeader
            mnemonic={pseudoInstr.mnemonic}
            format={pseudoInstr.format}
          />
        </section>

        {/* Instruction Syntax */}
        <section className="instruction-detail__section">
          <h3 className="instruction-detail__section-title">Instruction</h3>
          <CodeBlock
            code={pseudoInstr.pseudoinstruction}
            language="asm"
            showLineNumbers={false}
          />
        </section>

        {/* Description */}
        {pseudoInstr.description && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Description</h3>
            <p className="instruction-detail__description">{pseudoInstr.description}</p>
          </section>
        )}

        {/* Expansion */}
        {pseudoInstr.baseInstructions && pseudoInstr.baseInstructions.length > 0 && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Expansion</h3>
            <CodeBlock
              code={pseudoInstr.baseInstructions.join('\n')}
              language="asm"
              showLineNumbers={false}
            />
          </section>
        )}

        {/* Required Extensions */}
        {pseudoInstr.requiredExtensions && pseudoInstr.requiredExtensions.length > 0 && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Required Extensions</h3>
            <div className="instruction-detail__badges">
              {pseudoInstr.requiredExtensions.map((ext, index) => (
                <Badge
                  key={index}
                  text={ext}
                  variant="extension"
                  size="md"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Render regular instruction
  if (regularInstr) {
    return (
      <div className={`instruction-detail ${className}`}>
        {/* Header */}
        <section className="instruction-detail__section">
          <InstructionHeader
            mnemonic={regularInstr.mnemonic}
            extension={regularInstr.extension}
            category={regularInstr.category}
            format={regularInstr.format}
          />
        </section>

        {/* Format & Encoding */}
        {regularInstr.encoding && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Encoding</h3>
            <div className="instruction-detail__format-text">
              <span className="instruction-detail__format-label">Format: </span>
              <span className="instruction-detail__format-value">{regularInstr.format || 'Unknown'}</span>
            </div>
            <EncodingVisualization
              encoding={regularInstr.encoding}
              encodingFields={regularInstr.encodingFields}
              mnemonic={regularInstr.mnemonic}
            />
          </section>
        )}

        {/* Description */}
        {regularInstr.description && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Description</h3>
            <p className="instruction-detail__description">{regularInstr.description}</p>
          </section>
        )}

        {/* Operands */}
        {regularInstr.operands && regularInstr.operands.length > 0 && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Operands</h3>
            <div className="instruction-detail__operands">
              {regularInstr.operands.map((operand, index) => (
                <div key={index} className="instruction-detail__operand">
                  <div className="instruction-detail__operand-header">
                    <span className="instruction-detail__operand-name">{operand}</span>
                    {regularInstr.operandTypes && regularInstr.operandTypes[index] && (
                      <span className="instruction-detail__operand-type">
                        {regularInstr.operandTypes[index]}
                      </span>
                    )}
                  </div>
                  <p className="instruction-detail__operand-description">
                    {getOperandDescription(operand)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pseudocode */}
        {regularInstr.pseudocode && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Pseudocode</h3>
            <CodeBlock
              code={regularInstr.pseudocode}
              language="pseudocode"
              showLineNumbers={false}
            />
          </section>
        )}

        {/* Example */}
        {regularInstr.example && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Example</h3>
            <CodeBlock
              code={regularInstr.example}
              language="asm"
              title="Assembly Example"
              showLineNumbers={false}
            />
          </section>
        )}

        {/* Expansion (for compressed instructions) */}
        {regularInstr.expansion && (
          <section className="instruction-detail__section">
            <h3 className="instruction-detail__section-title">Decompressed Form</h3>
            <CodeBlock
              code={regularInstr.expansion}
              language="asm"
              showLineNumbers={false}
            />
          </section>
        )}
      </div>
    );
  }

  // Fallback for unexpected state
  return null;
};

export default InstructionDetail;
