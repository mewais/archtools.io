import React from 'react';
import type { InstructionItemProps } from '../../../../../../types';
import './InstructionItem.css';

// Helper function to get extension badge color
const getExtensionColor = (extension: string): string => {
  const ext = extension.toUpperCase();

  // Base extensions (I, M)
  if (ext.includes('I') || ext.includes('M')) {
    return 'primary';
  }
  // Floating point (F, D, Q, Zfh)
  if (ext.includes('F') || ext.includes('D') || ext.includes('Q') || ext.includes('ZFH')) {
    return 'success';
  }
  // Vector (V)
  if (ext.includes('V')) {
    return 'warning';
  }
  // Compressed (C)
  if (ext.includes('C')) {
    return 'info';
  }
  // Atomic (A)
  if (ext.includes('A')) {
    return 'purple';
  }
  // Bit manipulation (B)
  if (ext.includes('B')) {
    return 'orange';
  }

  return 'secondary';
};

// Helper function to highlight search matches
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} className="instruction-item__highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

const InstructionItem: React.FC<InstructionItemProps> = ({
  instruction,
  selected,
  searchQuery,
  onClick,
  type,
}) => {
  const handleClick = () => {
    onClick(instruction, type);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(instruction, type);
    }
  };

  // Extract display values based on type
  const mnemonic = type === 'instruction'
    ? (instruction as any).mnemonic
    : (instruction as any).mnemonic; // Use mnemonic field for consistency

  const format = type === 'instruction' ? (instruction as any).format : null;
  const category = type === 'instruction' ? (instruction as any).category : null;
  const extension = type === 'instruction'
    ? (instruction as any).extension
    : ((instruction as any).requiredExtensions?.[0] || 'Pseudo');

  const extensionColor = getExtensionColor(extension);

  return (
    <div
      className={`instruction-item ${selected ? 'instruction-item--selected' : ''} ${
        type === 'pseudoinstruction' ? 'instruction-item--pseudo' : ''
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-selected={selected}
    >
      <div className="instruction-item__header">
        <div className="instruction-item__mnemonic">
          {highlightText(mnemonic, searchQuery)}
        </div>
        <div className="instruction-item__badges-group">
          {type === 'pseudoinstruction' && (
            <div className="instruction-item__badge instruction-item__badge--pseudo">
              Pseudo
            </div>
          )}
          <div className={`instruction-item__badge instruction-item__badge--${extensionColor}`}>
            {extension}
          </div>
        </div>
      </div>

      {(format || category) && (
        <div className="instruction-item__meta">
          {format && <span className="instruction-item__format">{format}</span>}
          {format && category && <span className="instruction-item__separator">•</span>}
          {category && <span className="instruction-item__category">{category}</span>}
        </div>
      )}
    </div>
  );
};

export default InstructionItem;
