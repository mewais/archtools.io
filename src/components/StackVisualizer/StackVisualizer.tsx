import React, { useState } from 'react';
import './StackVisualizer.css';

export interface StackEntry {
  address: number;
  value: string | number;
  label?: string;
  type?: 'args' | 'saved' | 'local' | 'return' | 'empty';
}

export interface StackVisualizerProps {
  entries: StackEntry[];
  sp?: number; // Stack pointer address
  fp?: number; // Frame pointer address
  animation?: 'push' | 'pop' | 'none';
  maxHeight?: number;
  showAddresses?: boolean;
  className?: string;
  onValueChange?: (address: number, newValue: number) => void;
  watchpoints?: Set<number>;
  onToggleWatchpoint?: (address: number) => void;
  entryWidth?: 32 | 64; // Bit width for value display (32-bit or 64-bit)
}

/**
 * Formats an address as hexadecimal with 0x prefix
 */
function formatAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Formats a value, handling both numbers and strings
 */
function formatValue(value: string | number, width: 32 | 64 = 32): string {
  if (typeof value === 'number') {
    const hexDigits = width / 4; // 8 digits for 32-bit, 16 for 64-bit
    return `0x${value.toString(16).toUpperCase().padStart(hexDigits, '0')}`;
  }
  return value;
}

/**
 * Maps stack entry types to CSS color classes
 */
function getTypeColor(type?: string): string {
  const colorMap: Record<string, string> = {
    'args': 'args',
    'saved': 'saved',
    'local': 'local',
    'return': 'return',
    'empty': 'empty',
  };

  return type ? colorMap[type] || 'default' : 'default';
}

const StackVisualizer: React.FC<StackVisualizerProps> = ({
  entries,
  sp,
  fp,
  animation = 'none',
  maxHeight = 600,
  showAddresses = true,
  className = '',
  onValueChange,
  watchpoints = new Set(),
  onToggleWatchpoint,
  entryWidth = 32,
}) => {
  const [editingAddress, setEditingAddress] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Sort entries by address (ascending - lower addresses at top, higher at bottom)
  // This makes stack push/pop happen at the top (SP position)
  const sortedEntries = [...entries].sort((a, b) => a.address - b.address);

  return (
    <div
      className={`stack-visualizer ${className}`}
      style={{ maxHeight: `${maxHeight}px` }}
      role="figure"
      aria-label="Stack memory visualization"
    >
      {/* Legend */}
      <div className="stack-visualizer__legend" role="region" aria-label="Stack section types">
        <div className="stack-visualizer__legend-items">
          <div className="stack-visualizer__legend-item">
            <div className="stack-visualizer__legend-color stack-visualizer__legend-color--args"></div>
            <span>Arguments</span>
          </div>
          <div className="stack-visualizer__legend-item">
            <div className="stack-visualizer__legend-color stack-visualizer__legend-color--saved"></div>
            <span>Saved Regs</span>
          </div>
          <div className="stack-visualizer__legend-item">
            <div className="stack-visualizer__legend-color stack-visualizer__legend-color--local"></div>
            <span>Local Vars</span>
          </div>
          <div className="stack-visualizer__legend-item">
            <div className="stack-visualizer__legend-color stack-visualizer__legend-color--return"></div>
            <span>Return Addr</span>
          </div>
        </div>
      </div>

      {/* Stack container */}
      <div className="stack-visualizer__container">
        {/* Stack entries */}
        <div className="stack-visualizer__entries">
          {sortedEntries.map((entry, index) => {
            const isSP = sp !== undefined && entry.address === sp;
            const isFP = fp !== undefined && entry.address === fp;
            const typeColor = getTypeColor(entry.type);
            const animationClass = animation !== 'none' ? `stack-visualizer__entry--${animation}` : '';
            const pointerClass = isSP || isFP ? 'stack-visualizer__entry--pointer' : '';
            const isEditing = editingAddress === entry.address;
            const isWatched = watchpoints.has(entry.address);

            const handleClick = () => {
              if (onValueChange) {
                setEditingAddress(entry.address);
                setEditValue(typeof entry.value === 'number' ? entry.value.toString(16).toUpperCase() : entry.value);
              }
            };

            const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                const numValue = parseInt(editValue, 16);
                if (!isNaN(numValue) && onValueChange) {
                  onValueChange(entry.address, numValue);
                }
                setEditingAddress(null);
              } else if (e.key === 'Escape') {
                setEditingAddress(null);
              }
            };

            const handleBlur = () => {
              setEditingAddress(null);
            };

            return (
              <div
                key={`${entry.address}-${index}`}
                className={`stack-visualizer__entry stack-visualizer__entry--${typeColor} ${animationClass} ${pointerClass}`}
                title={`${formatAddress(entry.address)}: ${entry.label || 'Stack entry'}`}
              >
                {/* Watchpoint bubble - first column */}
                <div className="stack-visualizer__cell--watch">
                  <div
                    className={`stack-visualizer__watch-bubble ${isWatched ? 'stack-visualizer__watch-bubble--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWatchpoint?.(entry.address);
                    }}
                    title={isWatched ? 'Remove watchpoint' : 'Add watchpoint'}
                  />
                </div>

                {/* Address column */}
                {showAddresses && (
                  <div className="stack-visualizer__address">
                    {formatAddress(entry.address)}
                  </div>
                )}

                {/* Value column */}
                <div className="stack-visualizer__value" onClick={handleClick}>
                  {isEditing ? (
                    <input
                      type="text"
                      className="stack-visualizer__input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleBlur}
                      autoFocus
                    />
                  ) : (
                    <span className="stack-visualizer__value-text">{formatValue(entry.value, entryWidth)}</span>
                  )}
                </div>

                {/* Pointer indicators - only show colored indicators, no duplicate labels */}
                {isSP && !isFP && (
                  <div className="stack-visualizer__pointer stack-visualizer__pointer--sp">
                    SP →
                  </div>
                )}
                {isFP && !isSP && (
                  <div className="stack-visualizer__pointer stack-visualizer__pointer--fp">
                    FP →
                  </div>
                )}
                {isSP && isFP && (
                  <div className="stack-visualizer__pointer stack-visualizer__pointer--both">
                    SP/FP →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StackVisualizer;
