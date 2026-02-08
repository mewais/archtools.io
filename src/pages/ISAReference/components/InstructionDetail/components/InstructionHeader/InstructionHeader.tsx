import React from 'react';
import Badge from '../Badge';
import './InstructionHeader.css';

export interface InstructionHeaderProps {
  mnemonic: string;
  extension?: string;
  category?: string;
  format?: string;
  className?: string;
}

const InstructionHeader: React.FC<InstructionHeaderProps> = ({
  mnemonic,
  extension,
  category,
  format,
  className = ''
}) => {
  return (
    <div className={`instruction-header ${className}`}>
      <h2 className="instruction-header__mnemonic">{mnemonic}</h2>

      <div className="instruction-header__badges">
        {extension && <Badge text={extension} variant="extension" size="md" />}
        {category && <Badge text={category} variant="category" size="md" />}
        {format && <Badge text={format} variant="format" size="md" />}
      </div>
    </div>
  );
};

export default InstructionHeader;
