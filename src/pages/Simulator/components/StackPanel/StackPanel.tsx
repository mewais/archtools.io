import React, { useMemo } from 'react';
import ExpandablePanel from '../../../../components/ExpandablePanel';
import StackVisualizer from '../../../../components/StackVisualizer';
import type { StackEntry } from '../../../../components/StackVisualizer';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import { useLayout } from '../../contexts/LayoutContext';
import './StackPanel.css';

export interface StackPanelProps {
  className?: string;
}

/**
 * StackPanel - Visualizes stack memory with frame pointers
 *
 * Features:
 * - Uses existing StackVisualizer component
 * - SP/FP pointer indicators
 * - Stack frame highlighting
 * - Watchpoint support (TODO: implement editing)
 * - Hand-editing (TODO: implement)
 */
const StackPanel: React.FC<StackPanelProps> = ({ className = '' }) => {
  const {
    readRegister,
    readMemoryRange,
    writeMemory,
    memoryWatchpoints,
    addMemoryWatchpoint,
    removeMemoryWatchpoint,
    registerWidth,
  } = useSimulatorContext();
  const { minimizedPanels, expandedPanel, toggleExpand, toggleMinimize } = useLayout();
  const isMinimized = minimizedPanels.has('stack');
  const isExpanded = expandedPanel === 'stack';

  // Get SP and FP from registers
  // x2 = sp, x8 = s0/fp
  const sp = useMemo(() => Number(readRegister(2)), [readRegister]);
  const fp = useMemo(() => Number(readRegister(8)), [readRegister]);

  // Stack grows downward in RISC-V
  // Show from current SP up to maximum memory address (typically 0x7FFFFFFC for user stack)
  const stackEntries = useMemo((): StackEntry[] => {
    const entries: StackEntry[] = [];
    const wordSize = registerWidth / 8; // 4 bytes for RV32I, 8 bytes for RV64I

    // Start from SP and go up to a reasonable max stack address
    // RISC-V user stack typically starts near 0x7FFFFFFC and grows down
    const maxStackAddr = 0x7FFFFFFC; // Typical max user stack address
    const startAddr = sp; // Start at current SP (top of stack)
    const endAddr = Math.min(sp + 256, maxStackAddr); // Show up to 64 entries or max address

    for (let addr = startAddr; addr <= endAddr; addr += wordSize) {
      // Read word (4 or 8 bytes depending on ISA)
      const bytes = readMemoryRange(BigInt(addr), wordSize);
      const view = new DataView(bytes.buffer);
      const value = wordSize === 8 ? Number(view.getBigUint64(0, true)) : view.getUint32(0, true); // Little-endian

      // Determine entry type based on position relative to SP/FP
      let type: 'args' | 'saved' | 'local' | 'return' | 'empty' = 'empty';
      let label: string | undefined;

      if (addr === sp) {
        type = 'local';
        label = 'SP';
      } else if (addr === fp) {
        type = 'saved';
        label = 'FP';
      } else if (addr < sp) {
        type = 'local';
      } else if (addr > sp && addr <= sp + 32) {
        type = 'saved';
      } else if (addr > sp + 32) {
        type = 'args';
      }

      entries.push({
        address: addr,
        value: value,
        label,
        type,
      });
    }

    return entries;
  }, [sp, fp, readMemoryRange, registerWidth]);

  return (
    <ExpandablePanel
      title="Stack"
      showTitle={true}
      isExpanded={isExpanded}
      isMinimized={isMinimized}
      onToggleExpand={() => toggleExpand('stack')}
      onToggleMinimize={() => toggleMinimize('stack')}
      className={`stack-panel ${className}`}
    >
      <div className="stack-panel__content">
        {/* Stack visualization */}
        <StackVisualizer
          entries={stackEntries}
          sp={sp}
          fp={fp}
          showAddresses={true}
          maxHeight={600}
          entryWidth={registerWidth}
          onValueChange={(address, value) => writeMemory(BigInt(address), value)}
          watchpoints={new Set(Array.from(memoryWatchpoints.keys()).map(Number))}
          onToggleWatchpoint={(address) => {
            const addr = BigInt(address);
            if (memoryWatchpoints.has(addr)) {
              removeMemoryWatchpoint(addr);
            } else {
              addMemoryWatchpoint(addr, 'access', 4);
            }
          }}
        />
      </div>
    </ExpandablePanel>
  );
};

export default StackPanel;
