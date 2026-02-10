import React, { useState, useMemo, useCallback } from 'react';
import ExpandablePanel from '../../../../components/ExpandablePanel';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useRegisterNames } from '../../hooks/useSimulator';
import FloatRegisterTable from './FloatRegisterTable';
import VectorRegisterTable from './VectorRegisterTable';
import CSRTable from './CSRTable';
import { IntegerRegisterIcon, FloatRegisterIcon, VectorRegisterIcon } from '../../../../components/Icons';
import type { RegisterType } from '../../contexts/SimulatorContext';
import './RegisterPanel.css';

export interface RegisterPanelProps {
  className?: string;
}

/**
 * RegisterPanel - Displays and edits CPU registers
 *
 * Features:
 * - TabSelector for register types (Integer, FP, Vector, CSR)
 * - Table display with register names and values
 * - Watchpoint toggles (eye icon)
 * - Hand-editing (click value to edit)
 * - Reads from WASM simulator state
 */
const RegisterPanel: React.FC<RegisterPanelProps> = ({ className = '' }) => {
  const {
    getAllRegisters,
    getAllFloatRegisters,
    getAllVectorRegisters,
    getVectorCSRs,
    getAllCSRs,
    writeRegister,
    registerWatchpoints,
    toggleRegisterWatchpoint,
    registerWidth,
    floatRegisterWidth,
    hasFloatingPoint,
    hasVector,
    hasCSRs,
    isaVariant,
    pc,
    lastStep,
  } = useSimulatorContext();
  const { minimizedPanels, expandedPanel, toggleExpand, toggleMinimize } = useLayout();
  const { getRegisterName } = useRegisterNames();
  const isMinimized = minimizedPanels.has('registers');
  const isExpanded = expandedPanel === 'registers';

  const [activeTab, setActiveTab] = useState<RegisterType>('integer');
  const [editingRegister, setEditingRegister] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [elementWatchpoints, setElementWatchpoints] = useState<Map<number, Set<number>>>(new Map());

  // Register tabs - dynamically constructed based on ISA variant
  const tabs = useMemo(() => {
    const tabList = [
      { id: 'integer', label: 'Integer RF', icon: <IntegerRegisterIcon size={20} /> },
    ];

    if (hasFloatingPoint) {
      tabList.push({ id: 'float', label: 'Float RF', icon: <FloatRegisterIcon size={20} /> });
    }

    if (hasVector) {
      tabList.push({ id: 'vector', label: 'Vector RF', icon: <VectorRegisterIcon size={20} /> });
    }

    if (hasCSRs) {
      tabList.push({ id: 'csr', label: 'CSRs', icon: <span>⚙️</span> });
    }

    return tabList;
  }, [hasFloatingPoint, hasVector, hasCSRs]);

  // Determine if tabs should be shown (only when more than one tab exists)
  const showTabs = tabs.length > 1;

  // Get all integer registers
  // Include pc and lastStep in dependencies to refresh after each step
  const registers = useMemo(() => getAllRegisters(), [getAllRegisters, pc, lastStep]);

  // Float registers from WASM simulator (with graceful fallback)
  // Include pc and lastStep in dependencies to refresh after each step
  const floatRegisters = useMemo(() => getAllFloatRegisters(), [getAllFloatRegisters, pc, lastStep]);

  // Vector registers from WASM simulator
  // Include pc and lastStep in dependencies to refresh after each step
  const vectorRegisters = useMemo(
    () => getAllVectorRegisters(),
    [getAllVectorRegisters, pc, lastStep]
  );

  // CSR values from WASM simulator (with graceful fallback)
  // Include pc and lastStep in dependencies to refresh after each step
  const csrValues = useMemo(() => getAllCSRs(), [getAllCSRs, pc, lastStep]);

  // Vector CSR state from WASM simulator
  // Include pc and lastStep in dependencies to refresh after each step
  const vectorCSRState = useMemo(() => {
    const csrs = getVectorCSRs();
    return {
      sew: csrs.sew as 8 | 16 | 32 | 64,
      lmul: csrs.lmul,
      vl: csrs.vl,
      vstart: csrs.vstart,
    };
  }, [getVectorCSRs, pc, lastStep]);

  // Get watchpoints for specific register type
  const getWatchpointsForType = useCallback(
    (type: RegisterType): Set<number> => {
      const watchpoints = new Set<number>();
      registerWatchpoints.forEach((_wp, key) => {
        if (key.startsWith(`${type}-`)) {
          const index = parseInt(key.split('-')[1]);
          watchpoints.add(index);
        }
      });
      return watchpoints;
    },
    [registerWatchpoints]
  );

  // Check if register has watchpoint
  const hasWatchpoint = useCallback(
    (index: number, type: RegisterType): boolean => {
      const key = `${type}-${index}`;
      return registerWatchpoints.has(key);
    },
    [registerWatchpoints]
  );

  // Handle watchpoint toggle
  const handleWatchpointToggle = (index: number) => {
    const isCurrentlyWatched = hasWatchpoint(index, activeTab);

    // Toggle the register watchpoint
    toggleRegisterWatchpoint(index, activeTab);

    // For vector registers, sync element watchpoints
    if (activeTab === 'vector' && isaVariant.vectorConfig) {
      const elementsPerRegister = isaVariant.vectorConfig.VLEN / vectorCSRState.sew;
      const activeElementCount = Math.min(vectorCSRState.vl, elementsPerRegister);

      setElementWatchpoints((prev) => {
        const newMap = new Map(prev);

        if (!isCurrentlyWatched) {
          // Turning watchpoint ON - watch all active elements
          const newSet = new Set<number>();
          for (let i = 0; i < activeElementCount; i++) {
            newSet.add(i);
          }
          newMap.set(index, newSet);
        } else {
          // Turning watchpoint OFF - clear all element watchpoints
          newMap.delete(index);
        }

        return newMap;
      });
    }
  };

  // Handle element watchpoint toggle
  const handleToggleElementWatchpoint = useCallback(
    (regIndex: number, elemIndex: number) => {
      setElementWatchpoints((prev) => {
        const newMap = new Map(prev);
        const elemSet = new Set<number>(newMap.get(regIndex) || new Set<number>());

        if (elemSet.has(elemIndex)) {
          // Remove element watchpoint
          elemSet.delete(elemIndex);
        } else {
          // Add element watchpoint
          elemSet.add(elemIndex);
        }

        if (elemSet.size === 0) {
          newMap.delete(regIndex);
        } else {
          newMap.set(regIndex, elemSet);
        }

        // Check if all active elements are now watched
        // If so, set the parent register watchpoint
        if (isaVariant.vectorConfig && activeTab === 'vector') {
          const elementsPerRegister = isaVariant.vectorConfig.VLEN / vectorCSRState.sew;
          const activeElementCount = Math.min(vectorCSRState.vl, elementsPerRegister);

          // Count watched active elements
          const watchedActiveElements = (Array.from(elemSet) as number[]).filter(i => i < activeElementCount).length;

          if (watchedActiveElements === activeElementCount && activeElementCount > 0) {
            // All active elements are watched - set parent watchpoint
            toggleRegisterWatchpoint(regIndex, 'vector');
          } else if (watchedActiveElements === 0) {
            // No elements watched - clear parent watchpoint if it exists
            if (hasWatchpoint(regIndex, 'vector')) {
              toggleRegisterWatchpoint(regIndex, 'vector');
            }
          }
        }

        return newMap;
      });
    },
    [isaVariant.vectorConfig, activeTab, vectorCSRState.sew, vectorCSRState.vl, toggleRegisterWatchpoint, hasWatchpoint]
  );

  // Handle edit start
  const handleEditStart = (index: number, value: bigint) => {
    setEditingRegister(index);
    setEditValue(`0x${value.toString(16).toUpperCase()}`);
  };

  // Handle edit save
  const handleEditSave = (index: number) => {
    try {
      // Parse hex or decimal value
      let value: bigint;
      if (editValue.startsWith('0x') || editValue.startsWith('0X')) {
        value = BigInt(editValue);
      } else {
        value = BigInt(editValue);
      }

      writeRegister(index, value);
      setEditingRegister(null);
      setEditValue('');
    } catch (err) {
      console.error('Invalid register value:', err);
      setEditingRegister(null);
    }
  };

  // Handle edit cancel
  const handleEditCancel = () => {
    setEditingRegister(null);
    setEditValue('');
  };

  // Handle edit key press
  const handleEditKeyPress = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      handleEditSave(index);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  // Format register value based on register width
  const formatValue = (value: bigint): string => {
    const hexDigits = registerWidth / 4; // 8 digits for 32-bit, 16 for 64-bit
    return `0x${value.toString(16).toUpperCase().padStart(hexDigits, '0')}`;
  };

  // Render content - all tabs are always rendered, hidden via CSS
  const renderContent = () => {
    return (
      <>
        {/* Integer RF Tab */}
        <div
          className={`register-panel__tab-content ${
            activeTab === 'integer' ? 'register-panel__tab-content--active' : ''
          }`}
          role="tabpanel"
          aria-hidden={activeTab !== 'integer'}
          id="integer-tab-panel"
          aria-labelledby="integer-tab"
        >
          <div className="register-panel__table-wrapper">
            <table className="register-panel__table">
              <thead className="register-panel__thead">
                <tr>
                  <th className="register-panel__header register-panel__header--watch"></th>
                  <th className="register-panel__header">#</th>
                  <th className="register-panel__header">Name</th>
                  <th className="register-panel__header">Value</th>
                </tr>
              </thead>
              <tbody className="register-panel__tbody">
                {registers.map((value, index) => {
                  const isEditing = editingRegister === index;
                  const watching = hasWatchpoint(index, 'integer');

                  return (
                    <tr key={index} className="register-panel__row">
                      {/* Watchpoint toggle - yellow bubble on left */}
                      <td className="register-panel__cell register-panel__cell--watch">
                        <div
                          className={`register-panel__watch-bubble ${
                            watching ? 'register-panel__watch-bubble--active' : ''
                          }`}
                          onClick={() => handleWatchpointToggle(index)}
                          title={watching ? 'Remove watchpoint' : 'Add watchpoint'}
                          role="button"
                          tabIndex={0}
                        />
                      </td>

                      {/* Register number */}
                      <td className="register-panel__cell register-panel__cell--index">
                        x{index}
                      </td>

                      {/* ABI name */}
                      <td className="register-panel__cell register-panel__cell--name">
                        {getRegisterName(index)}
                      </td>

                      {/* Value (editable) */}
                      <td
                        className="register-panel__cell register-panel__cell--value"
                        onClick={() => !isEditing && handleEditStart(index, value)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            className="register-panel__input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleEditSave(index)}
                            onKeyDown={(e) => handleEditKeyPress(e, index)}
                            autoFocus
                          />
                        ) : (
                          <span className="register-panel__value-text">
                            {formatValue(value)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Float RF Tab */}
        {hasFloatingPoint && (
          <div
            className={`register-panel__tab-content ${
              activeTab === 'float' ? 'register-panel__tab-content--active' : ''
            }`}
            role="tabpanel"
            aria-hidden={activeTab !== 'float'}
            id="float-tab-panel"
            aria-labelledby="float-tab"
          >
            <FloatRegisterTable
              registers={floatRegisters}
              registerWidth={floatRegisterWidth}
              isaVariant={isaVariant}
              watchpoints={getWatchpointsForType('float')}
              onToggleWatchpoint={(index) => toggleRegisterWatchpoint(index, 'float')}
            />
          </div>
        )}

        {/* Vector RF Tab */}
        {hasVector && (
          <div
            className={`register-panel__tab-content ${
              activeTab === 'vector' ? 'register-panel__tab-content--active' : ''
            }`}
            role="tabpanel"
            aria-hidden={activeTab !== 'vector'}
            id="vector-tab-panel"
            aria-labelledby="vector-tab"
          >
            {isaVariant.vectorConfig ? (
              <VectorRegisterTable
                registers={vectorRegisters}
                vectorConfig={isaVariant.vectorConfig}
                csrState={vectorCSRState}
                watchpoints={getWatchpointsForType('vector')}
                elementWatchpoints={elementWatchpoints}
                onToggleWatchpoint={handleWatchpointToggle}
                onToggleElementWatchpoint={handleToggleElementWatchpoint}
              />
            ) : (
              <div className="register-panel__placeholder">
                Vector extension not configured
              </div>
            )}
          </div>
        )}

        {/* CSR Tab */}
        {hasCSRs && (
          <div
            className={`register-panel__tab-content ${
              activeTab === 'csr' ? 'register-panel__tab-content--active' : ''
            }`}
            role="tabpanel"
            aria-hidden={activeTab !== 'csr'}
            id="csr-tab-panel"
            aria-labelledby="csr-tab"
          >
            <CSRTable
              isaVariant={isaVariant}
              csrValues={csrValues}
              watchpoints={getWatchpointsForType('csr')}
              onToggleWatchpoint={(address) => toggleRegisterWatchpoint(address, 'csr')}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <ExpandablePanel
      title="Registers"
      showTitle={!showTabs}
      isExpanded={isExpanded}
      isMinimized={isMinimized}
      onToggleExpand={() => toggleExpand('registers')}
      onToggleMinimize={() => toggleMinimize('registers')}
      className={`register-panel ${className}`}
      headerActions={
        showTabs ? (
          <div className="register-panel__tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`register-panel__tab ${
                  activeTab === tab.id ? 'register-panel__tab--active' : ''
                }`}
                onClick={() => setActiveTab(tab.id as RegisterType)}
                aria-label={tab.label}
                title={tab.label}
              >
                {tab.icon}
                <span className="register-panel__tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="register-panel__content">{renderContent()}</div>
    </ExpandablePanel>
  );
};

export default RegisterPanel;
