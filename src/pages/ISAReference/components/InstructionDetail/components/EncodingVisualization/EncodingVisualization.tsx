import React from 'react';
import type { InstructionEncodingField } from '../../../../../../types';
import './EncodingVisualization.css';

export interface EncodingVisualizationProps {
  encoding: string;
  encodingFields?: InstructionEncodingField[];
  mnemonic?: string;
  highlightFields?: string[]; // Field names to highlight
  animateFields?: boolean; // Enable field animation
  animationStep?: number; // For sequential animation (0-based index)
  compact?: boolean; // Hide legend section, show only bit-aligned field boxes
  className?: string;
}

/**
 * Detects if an instruction is compressed (16-bit) based on encoding length
 */
function isCompressedInstruction(encoding: string): boolean {
  return encoding.length === 16;
}

/**
 * Converts binary string to hexadecimal, handling variable bits
 */
function binaryToHex(binary: string): string {
  // Check if binary contains variable bits
  if (binary.includes('x')) {
    // Calculate how many hex digits we need
    const hexDigits = Math.ceil(binary.length / 4);
    return '0x' + '?'.repeat(hexDigits);
  }

  // Convert to hex
  const value = parseInt(binary, 2);
  const hexDigits = Math.ceil(binary.length / 4);
  return '0x' + value.toString(16).toUpperCase().padStart(hexDigits, '0');
}

/**
 * Extracts binary value for a field from the encoding string
 */
function extractFieldBinary(encoding: string, startBit: number, endBit: number, isCompressed: boolean): string {
  const totalBits = isCompressed ? 16 : 32;
  const binaryArray = encoding.split('');

  // Encoding is MSB first, so we need to calculate positions correctly
  let result = '';
  for (let bit = endBit; bit >= startBit; bit--) {
    const index = totalBits - 1 - bit;
    result += binaryArray[index] || 'x';
  }

  return result;
}

/**
 * Internal field type with computed color for visualization
 */
interface VisualizationField extends InstructionEncodingField {
  color: string;
  hexValue: string;
}

/**
 * Maps field categories from JSON to CSS color classes
 */
function getCategoryColor(category: string): string {
  const colorMap: Record<string, string> = {
    'opcode': 'opcode',
    'rd': 'rd',
    'rs1': 'rs1',
    'rs2': 'rs2',
    'rs3': 'rs1', // Use same color as rs1
    'funct': 'funct',
    'funct3': 'funct',
    'funct7': 'funct',
    'funct2': 'funct',
    'immediate': 'immediate',
    'imm': 'immediate',
    'shamt': 'immediate',
    'csr': 'immediate',
    'rm': 'funct'
  };

  return colorMap[category.toLowerCase()] || 'immediate';
}

const EncodingVisualization: React.FC<EncodingVisualizationProps> = ({
  encoding,
  encodingFields,
  mnemonic,
  highlightFields = [],
  animateFields = false,
  animationStep,
  compact = false,
  className = ''
}) => {
  const isCompressed = isCompressedInstruction(encoding);
  const bitCount = isCompressed ? 16 : 32;

  // Check if a field should be highlighted
  const isFieldHighlighted = (fieldName: string): boolean => {
    return highlightFields.includes(fieldName);
  };

  // Check if a field should be animated (for sequential animation)
  const isFieldAnimated = (index: number): boolean => {
    return animateFields && (animationStep === undefined || animationStep === index);
  };

  // Handle missing encodingFields
  if (!encodingFields || encodingFields.length === 0) {
    return (
      <div className={`encoding-visualization ${className}`}>
        <div className="encoding-visualization__empty">
          <p>No encoding field information available for this instruction.</p>
        </div>
      </div>
    );
  }

  // Convert encoding fields to visualization fields with colors and hex values
  const visualizationFields: VisualizationField[] = encodingFields.map(field => {
    const binary = extractFieldBinary(encoding, field.startBit, field.endBit, isCompressed);
    return {
      ...field,
      color: getCategoryColor(field.category),
      hexValue: binaryToHex(binary)
    };
  });

  return (
    <div
      className={`encoding-visualization ${className}`}
      role="figure"
      aria-label={`Binary encoding visualization for ${mnemonic || 'instruction'}`}
    >
      {/* Binary Display */}
      <div className="encoding-visualization__binary" role="table" aria-label="Binary instruction encoding">
        <div
          className="encoding-visualization__bit-labels"
          role="row"
          style={{ gridTemplateColumns: `repeat(${bitCount}, 1fr)` }}
        >
          {Array.from({ length: bitCount }, (_, i) => {
            const bitPosition = (bitCount - 1) - i; // Display MSB first
            return (
              <div key={i} className="encoding-visualization__bit-label" role="columnheader">
                {bitPosition}
              </div>
            );
          })}
        </div>

        <div
          className="encoding-visualization__bit-values"
          role="row"
          style={{ gridTemplateColumns: `repeat(${bitCount}, 1fr)` }}
        >
          {Array.from({ length: bitCount }, (_, i) => {
            const bitPos = (bitCount - 1) - i;
            const encodingChar = encoding[i] || 'x';
            const field = visualizationFields.find(f => bitPos >= f.startBit && bitPos <= f.endBit);

            const isHighlighted = field && isFieldHighlighted(field.name);
            const highlightClass = isHighlighted ? 'encoding-visualization__bit--highlighted' : '';

            return (
              <div
                key={i}
                className={`encoding-visualization__bit ${field ? `encoding-visualization__bit--${field.color}` : ''} ${highlightClass}`}
                role="cell"
                title={field ? `${field.name}: ${field.description}` : `Bit ${bitPos}`}
              >
                {encodingChar === 'x' ? '?' : encodingChar}
              </div>
            );
          })}
        </div>

        {/* Field Boxes Positioned Under Bits */}
        <div
          className="encoding-visualization__field-boxes"
          role="row"
          style={{ gridTemplateColumns: `repeat(${bitCount}, 1fr)` }}
        >
          {visualizationFields.map((field, index) => {
            const span = field.endBit - field.startBit + 1;
            // Calculate grid position for MSB-first display
            // Bit 31 (or 15 for compressed) is leftmost (column 1), bit 0 is rightmost
            // For a field at bits [startBit:endBit], where endBit > startBit:
            // - The field starts at endBit (higher bit, leftmost position)
            // - The field ends at startBit (lower bit, rightmost position)
            // Grid columns are 1-indexed, and end is EXCLUSIVE in CSS Grid
            const startColumn = bitCount - field.endBit;
            const endColumn = bitCount - field.startBit + 1;
            const gridColumn = `${startColumn} / ${endColumn}`;

            // Determine size class based on span
            const sizeClass = span === 1 ? 'single' : span <= 3 ? 'narrow' : span >= 12 ? 'wide' : 'normal';
            const isNarrow = span <= 3;
            const isHighlighted = isFieldHighlighted(field.name);
            const isAnimated = isFieldAnimated(index);
            const highlightClass = isHighlighted ? 'encoding-visualization__field-box--highlighted' : '';
            const animationClass = isAnimated ? 'encoding-visualization__field-box--animated' : '';

            return (
              <div
                key={`${field.name}-${index}`}
                className={`encoding-visualization__field-box encoding-visualization__field-box--${field.color} encoding-visualization__field-box--${sizeClass} ${highlightClass} ${animationClass}`}
                style={{
                  gridColumn: gridColumn,
                  gridRow: '1' // Force all field boxes into the same row
                }}
                title={`${field.name} [${field.endBit}:${field.startBit}]: ${field.description} = ${field.hexValue}`}
              >
                <div className="encoding-visualization__field-box-name">{isNarrow ? field.name.slice(0, 3) : field.name}</div>
                <div className="encoding-visualization__field-box-value">{field.hexValue}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fields Legend - Hidden in compact mode */}
      {!compact && (
        <div className="encoding-visualization__legend" role="region" aria-label="Instruction field definitions">
          {visualizationFields.map((field, index) => {
            const span = field.endBit - field.startBit + 1;
            const sizeClass = span === 1 ? 'single' : span <= 3 ? 'narrow' : span >= 12 ? 'wide' : 'normal';
            const isHighlighted = isFieldHighlighted(field.name);
            const isAnimated = isFieldAnimated(index);
            const highlightClass = isHighlighted ? 'encoding-visualization__field--highlighted' : '';
            const animationClass = isAnimated ? 'encoding-visualization__field--animated' : '';

            return (
              <div
                key={`${field.name}-${index}`}
                className={`encoding-visualization__field encoding-visualization__field--${field.color} encoding-visualization__field--${sizeClass} ${highlightClass} ${animationClass}`}
              >
                <div className="encoding-visualization__field-name">{field.name}</div>
                <div className="encoding-visualization__field-range">
                  [{field.endBit}:{field.startBit}]
                </div>
                <div className="encoding-visualization__field-value">{field.hexValue}</div>
                <div className="encoding-visualization__field-description">{field.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EncodingVisualization;
