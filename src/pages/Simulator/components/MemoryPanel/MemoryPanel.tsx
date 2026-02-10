import React, { useState, useMemo, useCallback } from 'react';
import ExpandablePanel from '../../../../components/ExpandablePanel';
import Button from '../../../../components/Button';
import Tooltip from '../../../../components/Tooltip';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import { useLayout } from '../../contexts/LayoutContext';
import './MemoryPanel.css';

export interface MemoryPanelProps {
  className?: string;
}

const BYTES_PER_ROW = 16;
const DEFAULT_ROWS = 64; // 64 rows x 16 bytes = 1024 bytes (1KB)

/**
 * MemoryPanel - Displays and edits memory contents
 *
 * Features:
 * - Address range inputs (start/end)
 * - Navigation buttons (Prev/Next/Reset)
 * - Hex dump display
 * - ASCII column
 * - Watchpoint toggles
 * - Hand-editing
 * - Load/save memory dump files
 */
const MemoryPanel: React.FC<MemoryPanelProps> = ({ className = '' }) => {
  const {
    readMemoryRange,
    writeMemory,
    memoryWatchpoints,
    toggleMemoryWatchpoint,
  } = useSimulatorContext();
  const { minimizedPanels, expandedPanel, toggleExpand, toggleMinimize } = useLayout();
  const isMinimized = minimizedPanels.has('memory');
  const isExpanded = expandedPanel === 'memory';

  const [startAddress, setStartAddress] = useState<bigint>(0n);
  const [rows] = useState<number>(DEFAULT_ROWS);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [memoryRevision, setMemoryRevision] = useState<number>(0);
  // Track edited addresses so we can clear them on reset
  const [editedAddresses, setEditedAddresses] = useState<Set<bigint>>(new Set());

  // Read memory data
  const memoryData = useMemo(() => {
    const length = rows * BYTES_PER_ROW;
    return readMemoryRange(startAddress, length);
  }, [startAddress, rows, readMemoryRange, memoryRevision]);

  // Navigate to previous page
  const handlePrevPage = useCallback(() => {
    const offset = BigInt(rows * BYTES_PER_ROW);
    setStartAddress(prev => prev > offset ? prev - offset : 0n);
  }, [rows]);

  // Navigate to next page
  const handleNextPage = useCallback(() => {
    const offset = BigInt(rows * BYTES_PER_ROW);
    setStartAddress(prev => prev + offset);
  }, [rows]);

  // Reset to start and clear edited memory
  const handleReset = useCallback(() => {
    // Clear all edited memory addresses back to zero
    editedAddresses.forEach(address => {
      writeMemory(address, 0);
    });

    // Clear the tracking set
    setEditedAddresses(new Set());

    // Reset view to address 0x0
    setStartAddress(0n);

    // Clear any pending edits
    setEditingCell(null);
    setEditValue('');

    // Trigger memory refresh
    setMemoryRevision(prev => prev + 1);
  }, [editedAddresses, writeMemory]);

  // Handle address input change
  const handleAddressChange = (value: string) => {
    try {
      const addr = value.startsWith('0x') ? BigInt(value) : BigInt(`0x${value}`);
      setStartAddress(addr);
    } catch (err) {
      console.error('Invalid address:', err);
    }
  };

  // Check if address has watchpoint
  const hasWatchpoint = useCallback((address: bigint): boolean => {
    return memoryWatchpoints.has(address);
  }, [memoryWatchpoints]);

  // Handle watchpoint toggle
  const handleWatchpointToggle = (address: bigint) => {
    toggleMemoryWatchpoint(address);
  };

  // Handle edit start
  const handleEditStart = (row: number, col: number, value: number) => {
    setEditingCell({ row, col });
    setEditValue(value.toString(16).toUpperCase().padStart(2, '0'));
  };

  // Handle edit save
  const handleEditSave = (row: number, col: number) => {
    try {
      const value = parseInt(editValue, 16);
      if (value >= 0 && value <= 255) {
        const address = startAddress + BigInt(row * BYTES_PER_ROW + col);
        writeMemory(address, value);

        // Track this address so we can clear it on reset
        setEditedAddresses(prev => {
          const newSet = new Set(prev);
          newSet.add(address);
          return newSet;
        });

        // Increment revision to trigger memory re-read
        setMemoryRevision(prev => prev + 1);
      }
      setEditingCell(null);
      setEditValue('');
    } catch (err) {
      console.error('Invalid byte value:', err);
      setEditingCell(null);
    }
  };

  // Handle edit cancel
  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle edit key press
  const handleEditKeyPress = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === 'Enter') {
      handleEditSave(row, col);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  // Convert byte to ASCII character (printable only)
  const toASCII = (byte: number): string => {
    return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
  };

  // Format address
  const formatAddress = (addr: bigint): string => {
    return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`;
  };

  // Format byte
  const formatByte = (byte: number): string => {
    return byte.toString(16).toUpperCase().padStart(2, '0');
  };

  // Load memory dump from file
  const handleLoadFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bin,.hex,.dump';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const data = new Uint8Array(arrayBuffer);

          // Track loaded addresses for reset functionality
          const newAddresses = new Set<bigint>();

          // Write to memory starting at current address
          data.forEach((byte, index) => {
            const address = startAddress + BigInt(index);
            writeMemory(address, byte);
            newAddresses.add(address);
          });

          // Add loaded addresses to tracked set
          setEditedAddresses(prev => {
            const newSet = new Set(prev);
            newAddresses.forEach(addr => newSet.add(addr));
            return newSet;
          });

          // Increment revision to trigger memory re-read
          setMemoryRevision(prev => prev + 1);
        };
        reader.readAsArrayBuffer(file);
      }
    };
    input.click();
  }, [startAddress, writeMemory]);

  // Save memory dump to file
  const handleSaveFile = useCallback(() => {
    const blob = new Blob([new Uint8Array(memoryData)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory_${formatAddress(startAddress)}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  }, [memoryData, startAddress]);

  // Render memory rows
  const renderMemoryRows = () => {
    const rowElements = [];

    for (let row = 0; row < rows; row++) {
      const rowAddress = startAddress + BigInt(row * BYTES_PER_ROW);
      const watching = hasWatchpoint(rowAddress);

      rowElements.push(
        <tr key={row} className="memory-panel__row">
          {/* Watchpoint - yellow bubble on left */}
          <td className="memory-panel__cell memory-panel__cell--watch">
            <div
              className={`memory-panel__watch-bubble ${watching ? 'memory-panel__watch-bubble--active' : ''}`}
              onClick={() => handleWatchpointToggle(rowAddress)}
              title={watching ? 'Remove watchpoint' : 'Add watchpoint'}
              role="button"
              tabIndex={0}
            />
          </td>

          {/* Address */}
          <td className="memory-panel__cell memory-panel__cell--address">
            {formatAddress(rowAddress)}
          </td>

          {/* Hex bytes */}
          {Array.from({ length: BYTES_PER_ROW }).map((_, col) => {
            const index = row * BYTES_PER_ROW + col;
            const byte = memoryData[index] || 0;
            const isEditing = editingCell?.row === row && editingCell?.col === col;

            return (
              <td
                key={col}
                className="memory-panel__cell memory-panel__cell--byte"
                onClick={() => !isEditing && handleEditStart(row, col, byte)}
              >
                {isEditing ? (
                  <input
                    type="text"
                    className="memory-panel__input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditSave(row, col)}
                    onKeyDown={(e) => handleEditKeyPress(e, row, col)}
                    maxLength={2}
                    autoFocus
                  />
                ) : (
                  <span className="memory-panel__byte-value">
                    {formatByte(byte)}
                  </span>
                )}
              </td>
            );
          })}

          {/* ASCII */}
          <td className="memory-panel__cell memory-panel__cell--ascii">
            {Array.from({ length: BYTES_PER_ROW }).map((_, col) => {
              const index = row * BYTES_PER_ROW + col;
              const byte = memoryData[index] || 0;
              return toASCII(byte);
            }).join('')}
          </td>
        </tr>
      );
    }

    return rowElements;
  };

  return (
    <ExpandablePanel
      title="Memory"
      isExpanded={isExpanded}
      isMinimized={isMinimized}
      onToggleExpand={() => toggleExpand('memory')}
      onToggleMinimize={() => toggleMinimize('memory')}
      className={`memory-panel ${className}`}
    >
      <div className="memory-panel__content">
        {/* Address controls - compact single row */}
        <div className="memory-panel__controls">
          <div className="memory-panel__address-group">
            <label className="memory-panel__label">Start:</label>
            <input
              type="text"
              className="memory-panel__address-input"
              value={formatAddress(startAddress)}
              onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="0x00000000"
            />
          </div>

          <div className="memory-panel__actions">
            <Tooltip content="Previous page" position="bottom">
              <Button variant="ghost" size="sm" onClick={handlePrevPage} aria-label="Previous page">
                ◀
              </Button>
            </Tooltip>
            <Tooltip content="Next page" position="bottom">
              <Button variant="ghost" size="sm" onClick={handleNextPage} aria-label="Next page">
                ▶
              </Button>
            </Tooltip>
            <Tooltip content="Reset to 0x0" position="bottom">
              <Button variant="ghost" size="sm" onClick={handleReset} aria-label="Reset to 0x0">
                ⟲
              </Button>
            </Tooltip>
            <div className="memory-panel__divider" />
            <Tooltip content="Load memory dump" position="bottom">
              <Button variant="ghost" size="sm" onClick={handleLoadFile} aria-label="Load memory dump">
                📁
              </Button>
            </Tooltip>
            <Tooltip content="Save memory dump" position="bottom">
              <Button variant="ghost" size="sm" onClick={handleSaveFile} aria-label="Save memory dump">
                💾
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Memory table */}
        <div className="memory-panel__table-wrapper">
          <table className="memory-panel__table">
            <thead className="memory-panel__thead">
              <tr>
                <th className="memory-panel__header memory-panel__header--watch"></th>
                <th className="memory-panel__header memory-panel__header--address">Address</th>
                {Array.from({ length: BYTES_PER_ROW }).map((_, i) => (
                  <th key={i} className="memory-panel__header memory-panel__header--byte">
                    {i.toString(16).toUpperCase()}
                  </th>
                ))}
                <th className="memory-panel__header">ASCII</th>
              </tr>
            </thead>
            <tbody className="memory-panel__tbody">
              {renderMemoryRows()}
            </tbody>
          </table>
        </div>
      </div>
    </ExpandablePanel>
  );
};

export default MemoryPanel;
