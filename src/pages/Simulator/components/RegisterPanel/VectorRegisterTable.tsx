import React, { useState } from 'react';
import type { VectorConfig } from '../../types/ISAVariant';
import './VectorRegisterTable.css';

/**
 * ABI names for vector registers
 * v0-v7: temporary (vt0-vt7)
 * v8-v15: saved (vs0-vs7)
 * v16-v23: temporary (vt8-vt15)
 * v24-v31: saved (vs8-vs15)
 */
const VECTOR_ABI_NAMES = [
  'vt0', 'vt1', 'vt2', 'vt3', 'vt4', 'vt5', 'vt6', 'vt7',
  'vs0', 'vs1', 'vs2', 'vs3', 'vs4', 'vs5', 'vs6', 'vs7',
  'vt8', 'vt9', 'vt10', 'vt11', 'vt12', 'vt13', 'vt14', 'vt15',
  'vs8', 'vs9', 'vs10', 'vs11', 'vs12', 'vs13', 'vs14', 'vs15',
];

export interface VectorRegisterTableProps {
  registers: bigint[][];  // 32 vector registers, each with multiple elements
  vectorConfig: VectorConfig;
  csrState: {
    sew: 8 | 16 | 32 | 64;  // Selected element width
    lmul: number;            // Length multiplier
    vl: number;              // Vector length
    vstart: number;          // Start index
  };
  watchpoints?: Set<number>;  // Register-level watchpoints
  elementWatchpoints?: Map<number, Set<number>>;  // Map of register -> set of element indices
  onToggleWatchpoint?: (index: number) => void;  // Toggle register-level watchpoint
  onToggleElementWatchpoint?: (regIndex: number, elemIndex: number) => void;  // Toggle element watchpoint
}

/**
 * VectorRegisterTable - Vector Register File Viewer
 *
 * Features:
 * - Display 32 vector registers (v0-v31)
 * - v0 shown as mask register with bit visualization
 * - Expandable/collapsible register view
 * - CSR state display (SEW, LMUL, vl, VLMAX, vstart)
 * - Element highlighting based on vl
 * - Watchpoint support
 */
const VectorRegisterTable: React.FC<VectorRegisterTableProps> = ({
  registers,
  vectorConfig,
  csrState,
  watchpoints = new Set(),
  elementWatchpoints = new Map(),
  onToggleWatchpoint,
  onToggleElementWatchpoint,
}) => {
  const [expandedRegisters, setExpandedRegisters] = useState<Set<number>>(
    new Set([0]) // Expand v0 (mask register) by default
  );

  /**
   * Toggle register expansion
   */
  const toggleRegister = (index: number) => {
    const newExpanded = new Set(expandedRegisters);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRegisters(newExpanded);
  };

  /**
   * Calculate VLMAX (maximum vector length)
   */
  const vlmax = Math.floor((vectorConfig.VLEN / csrState.sew) * csrState.lmul);

  /**
   * Get number of elements per register based on SEW
   */
  const elementsPerRegister = vectorConfig.VLEN / csrState.sew;

  return (
    <div className="vector-register-table">
      {/* CSR State Display */}
      <div className="vector-register-table__csr-state">
        <div className="vector-csr-state__row">
          <div className="vector-csr-state__item">
            <span className="vector-csr-state__label">SEW:</span>
            <span className="vector-csr-state__value">{csrState.sew}</span>
          </div>
          <div className="vector-csr-state__item">
            <span className="vector-csr-state__label">LMUL:</span>
            <span className="vector-csr-state__value">{csrState.lmul}</span>
          </div>
          <div className="vector-csr-state__item">
            <span className="vector-csr-state__label">vl:</span>
            <span className="vector-csr-state__value">{csrState.vl}</span>
          </div>
          <div className="vector-csr-state__item">
            <span className="vector-csr-state__label">VLMAX:</span>
            <span className="vector-csr-state__value">{vlmax}</span>
          </div>
        </div>
        <div className="vector-csr-state__hardware">
          Hardware: VLEN={vectorConfig.VLEN} ELEN={vectorConfig.ELEN} vstart={csrState.vstart}
        </div>
      </div>

      {/* Vector Registers */}
      <div className="vector-register-table__registers">
        {registers.map((regElements, index) => {
          const isExpanded = expandedRegisters.has(index);
          const isRegisterWatched = watchpoints.has(index);
          const elementCount = Math.min(regElements.length, elementsPerRegister);

          // Calculate active element count (based on vl)
          const activeElementCount = Math.min(csrState.vl, elementCount);

          // Get watched elements for this register
          const watchedElements = elementWatchpoints.get(index) || new Set<number>();
          const watchedActiveElements = (Array.from(watchedElements) as number[]).filter(i => i < activeElementCount).length;

          // Determine watchpoint status: none, partial, or full
          const hasPartialWatch = watchedActiveElements > 0 && watchedActiveElements < activeElementCount;
          const hasFullWatch = isRegisterWatched || watchedActiveElements === activeElementCount;

          return (
            <div
              key={index}
              className={`vector-register ${
                isExpanded ? 'vector-register--expanded' : ''
              }`}
            >
              {/* Register Header */}
              <div className="vector-register__header">
                {/* Watchpoint bubble - FIRST */}
                <div
                  className={`watchpoint-bubble ${
                    hasFullWatch
                      ? 'watchpoint-bubble--active'
                      : hasPartialWatch
                      ? 'watchpoint-bubble--partial'
                      : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatchpoint?.(index);
                  }}
                  title={
                    hasFullWatch
                      ? `Remove watchpoint (all ${activeElementCount} active elements)`
                      : hasPartialWatch
                      ? `Partial watch (${watchedActiveElements}/${activeElementCount} elements) - click to watch all`
                      : `Add watchpoint (all ${activeElementCount} active elements)`
                  }
                  role="button"
                  tabIndex={0}
                />

                {/* Expand/collapse icon - SECOND */}
                <span
                  className="vector-register__expand-icon"
                  onClick={() => toggleRegister(index)}
                >
                  {isExpanded ? '▼' : '▶'}
                </span>

                {/* Register name - THIRD */}
                <span
                  className="vector-register__name"
                  onClick={() => toggleRegister(index)}
                >
                  v{index}
                </span>

                {/* ABI alias name */}
                <span
                  className="vector-register__alias"
                  onClick={() => toggleRegister(index)}
                >
                  {VECTOR_ABI_NAMES[index]}
                </span>

                {/* Mask badge for v0 */}
                {index === 0 && (
                  <span
                    className="vector-register__mask-badge"
                    onClick={() => toggleRegister(index)}
                  >
                    mask
                  </span>
                )}

                {/* Element count */}
                <span
                  className="vector-register__element-count"
                  onClick={() => toggleRegister(index)}
                >
                  {elementCount} elements
                </span>
              </div>

              {/* Register Content (when expanded) */}
              {isExpanded && (
                <div className="vector-register__content">
                  {index === 0 ? (
                    // Special mask register view (bit visualization in equal rows)
                    (() => {
                      const bits = regElements.slice(0, elementCount);
                      const totalBits = bits.length;

                      // Calculate EQUAL distribution: aim for 12-16 bits per row for better visual balance
                      const targetBitsPerRow = 14;
                      const numRows = Math.max(1, Math.ceil(totalBits / targetBitsPerRow));
                      const baseBitsPerRow = Math.floor(totalBits / numRows);
                      const extraBits = totalBits % numRows;

                      // Create rows with equal distribution (some rows get +1 bit)
                      const rows: bigint[][] = [];
                      let currentIndex = 0;
                      for (let i = 0; i < numRows; i++) {
                        const rowSize = baseBitsPerRow + (i < extraBits ? 1 : 0);
                        rows.push(bits.slice(currentIndex, currentIndex + rowSize));
                        currentIndex += rowSize;
                      }

                      return (
                        <div className="vector-mask">
                          {rows.map((row, rowIndex) => (
                            <div key={rowIndex} className="vector-mask__row">
                              {row.map((bit, bitIndex) => {
                                const globalIndex = rows.slice(0, rowIndex).reduce((sum, r) => sum + r.length, 0) + bitIndex;
                                return (
                                  <div
                                    key={globalIndex}
                                    className={`vector-mask__bit ${
                                      bit ? 'vector-mask__bit--1' : 'vector-mask__bit--0'
                                    }`}
                                    title={`Bit ${globalIndex}: ${Number(bit)}`}
                                  >
                                    {Number(bit)}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    // Regular vector register elements (list format for individual watchpoints)
                    <div className="vector-elements-list">
                      {regElements.slice(0, elementCount).map((element, i) => {
                        const isActive = i < csrState.vl;
                        const isStarted = i >= csrState.vstart;
                        const isElementWatched = watchedElements.has(i) || isRegisterWatched;

                        return (
                          <div
                            key={i}
                            className={`vector-element-row ${
                              isActive ? 'vector-element-row--active' : 'vector-element-row--inactive'
                            } ${
                              !isStarted ? 'vector-element-row--before-vstart' : ''
                            }`}
                          >
                            {/* Element watchpoint */}
                            <div
                              className="vector-element-row__watchpoint"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isActive && onToggleElementWatchpoint) {
                                  onToggleElementWatchpoint(index, i);
                                }
                              }}
                              title={
                                !isActive
                                  ? 'Element inactive - cannot set watchpoint'
                                  : isElementWatched
                                  ? 'Remove element watchpoint'
                                  : 'Add element watchpoint'
                              }
                            >
                              <div
                                className={`watchpoint-bubble-small ${
                                  isElementWatched ? 'watchpoint-bubble-small--active' : ''
                                } ${!isActive ? 'watchpoint-bubble-small--disabled' : ''}`}
                              />
                            </div>

                            {/* Element index */}
                            <div className="vector-element-row__index">[{i}]</div>

                            {/* Element value */}
                            <div className="vector-element-row__value">
                              {isActive
                                ? `0x${element.toString(16).toUpperCase().padStart(csrState.sew / 4, '0')}`
                                : '---'}
                            </div>

                            {/* Element status */}
                            <div className="vector-element-row__status">
                              {isActive ? (isStarted ? 'active' : 'pre-vstart') : 'inactive'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VectorRegisterTable;
