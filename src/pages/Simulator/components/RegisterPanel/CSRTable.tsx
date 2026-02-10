import React, { useState, useMemo } from 'react';
import { getApplicableCSRs, type ISAVariant, type CSRDefinition } from '../../types/ISAVariant';
import './CSRTable.css';

export interface CSRTableProps {
  isaVariant: ISAVariant;
  csrValues: Map<number, bigint>;
  onValueChange?: (address: number, value: bigint) => void;  // Reserved for future use
  watchpoints?: Set<number>;
  onToggleWatchpoint?: (address: number) => void;
}

/**
 * CSRTable - Control and Status Register Viewer
 *
 * Features:
 * - Search by name or description
 * - Categorized display with collapsible sections
 * - Shows address, name, value, access mode
 * - Watchpoint support
 * - Dynamically shows only applicable CSRs based on ISA variant
 */
const CSRTable: React.FC<CSRTableProps> = ({
  isaVariant,
  csrValues,
  onValueChange: _onValueChange,  // Reserved for future use
  watchpoints = new Set(),
  onToggleWatchpoint,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Trap Setup'])
  );

  // Get applicable CSRs based on ISA variant
  const applicableCSRs = useMemo(() => getApplicableCSRs(isaVariant), [isaVariant]);

  // Group CSRs by category
  const csrsByCategory = useMemo(() => {
    const grouped = new Map<string, CSRDefinition[]>();
    applicableCSRs.forEach(csr => {
      if (!grouped.has(csr.category)) {
        grouped.set(csr.category, []);
      }
      grouped.get(csr.category)!.push(csr);
    });
    return grouped;
  }, [applicableCSRs]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div className="csr-table">
      {/* Categories */}
      <div className="csr-table__categories">
        {Array.from(csrsByCategory.entries()).map(([category, csrs]) => (
          <div
            key={category}
            className={`csr-category ${
              expandedCategories.has(category) ? 'csr-category--expanded' : ''
            }`}
          >
            {/* Category header */}
            <div
              className="csr-category__header"
              onClick={() => toggleCategory(category)}
            >
              <span className="csr-category__icon">
                {expandedCategories.has(category) ? '▼' : '▶'}
              </span>
              <span className="csr-category__title">{category}</span>
              <span className="csr-category__count">({csrs.length})</span>
            </div>

            {/* Category content */}
            {expandedCategories.has(category) && (
              <div className="csr-category__content">
                {csrs.map(csr => {
                  const value = csrValues.get(csr.address) || 0n;
                  const hexValue = `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
                  const isWatching = watchpoints.has(csr.address);
                  const isReadOnly = csr.access === 'RO';

                  return (
                    <div key={csr.address} className="csr-item">
                      {/* Watchpoint bubble */}
                      <div
                        className={`watchpoint-bubble ${
                          isWatching ? 'watchpoint-bubble--active' : ''
                        } ${isReadOnly ? 'watchpoint-bubble--readonly' : ''}`}
                        onClick={() => {
                          if (!isReadOnly) {
                            onToggleWatchpoint?.(csr.address);
                          }
                        }}
                        title={
                          isReadOnly
                            ? 'Read-only CSR - watchpoints not available'
                            : isWatching
                            ? 'Remove watchpoint'
                            : 'Add watchpoint'
                        }
                        role="button"
                        tabIndex={0}
                      />

                      {/* CSR name */}
                      <span className="csr-item__name">{csr.name}</span>

                      {/* CSR value */}
                      <span className="csr-item__value">{hexValue}</span>

                      {/* Access mode badge */}
                      <span
                        className={`csr-item__access csr-item__access--${csr.access.toLowerCase()}`}
                      >
                        {csr.access}
                      </span>

                      {/* Description */}
                      <span className="csr-item__description">{csr.description}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {applicableCSRs.length === 0 && (
        <div className="csr-table__empty">
          No CSRs available for current ISA configuration
        </div>
      )}
    </div>
  );
};

export default CSRTable;
