import React, { useMemo, useState, useCallback } from 'react';
import type { InstructionListProps, Instruction, Pseudoinstruction, FilterConfig, InstructionListItem } from '../../../../types';
import InstructionItem from './components/InstructionItem';
import VirtualList from './components/VirtualList';
import instructionsData from '../../../../data/instructions.json';
import pseudoinstructionsData from '../../../../data/pseudoinstructions.json';
import './InstructionList.css';

// Filter instructions based on FilterConfig
const filterInstructions = (
  instructions: Instruction[],
  pseudoinstructions: Pseudoinstruction[],
  filters: FilterConfig,
  searchQuery: string
): InstructionListItem[] => {
  let items: InstructionListItem[] = [];

  // Type filter
  if (filters.type.all || filters.type.instructions) {
    items.push(
      ...instructions.map(i => ({
        ...i,
        type: 'instruction' as const,
        id: `inst-${i.mnemonic}-${i.extension}`,
      }))
    );
  }

  if (filters.type.all || filters.type.pseudoinstructions) {
    items.push(
      ...pseudoinstructions.map((p, index) => ({
        ...p,
        type: 'pseudoinstruction' as const,
        id: `pseudo-${index}`,
      }))
    );
  }

  // Extension filter
  if (filters.extensions.length > 0) {
    items = items.filter(item => {
      if (item.type === 'instruction') {
        return filters.extensions.includes(item.extension);
      } else {
        return item.requiredExtensions.some(ext => filters.extensions.includes(ext));
      }
    });
  }

  // Format filter
  if (filters.formats.length > 0) {
    items = items.filter(item => {
      if (item.type === 'instruction') {
        return filters.formats.some(f => item.format?.toLowerCase().includes(f.toLowerCase()));
      }
      return true; // Pseudoinstructions don't have formats
    });
  }

  // Category filter
  if (filters.categories.length > 0) {
    items = items.filter(item => {
      if (item.type === 'instruction') {
        return filters.categories.some(c =>
          item.category?.toLowerCase().includes(c.toLowerCase())
        );
      }
      return true; // Pseudoinstructions don't have categories
    });
  }

  // Search query (fuzzy match on mnemonic and encoding)
  if (searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    items = items.filter(item => {
      const mnemonic = item.type === 'instruction'
        ? item.mnemonic.toLowerCase()
        : item.pseudoinstruction.toLowerCase();

      const encoding = item.type === 'instruction' ? item.encoding.toLowerCase() : '';
      const description = item.description?.toLowerCase() || '';

      return (
        mnemonic.includes(query) ||
        encoding.includes(query) ||
        description.includes(query)
      );
    });
  }

  // Sort by mnemonic
  items.sort((a, b) => {
    const mnemonicA = a.type === 'instruction' ? a.mnemonic : a.pseudoinstruction;
    const mnemonicB = b.type === 'instruction' ? b.mnemonic : b.pseudoinstruction;
    return mnemonicA.localeCompare(mnemonicB);
  });

  return items;
};

const InstructionList: React.FC<InstructionListProps> = ({
  filters,
  searchQuery,
  selectedInstructionId,
  onSelectInstruction,
  className = '',
}) => {
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Load and filter instructions
  const instructions = useMemo(() => instructionsData as Instruction[], []);
  const pseudoinstructions = useMemo(() => pseudoinstructionsData as Pseudoinstruction[], []);

  const filteredItems = useMemo(() => {
    return filterInstructions(instructions, pseudoinstructions, filters, searchQuery);
  }, [instructions, pseudoinstructions, filters, searchQuery]);

  const totalCount = instructions.length + pseudoinstructions.length;
  const filteredCount = filteredItems.length;

  // Determine item height based on screen size
  const getItemHeight = () => {
    if (window.innerWidth < 768) return 72; // Mobile
    if (window.innerWidth < 1280) return 76; // Tablet
    return 80; // Desktop
  };

  const [itemHeight] = useState(getItemHeight());

  // Render single instruction item
  const renderItem = useCallback(
    (
      item: InstructionListItem,
      _index: number,
      onItemClick: (instruction: Instruction | Pseudoinstruction, type: 'instruction' | 'pseudoinstruction') => void,
      selectedId: string | null
    ) => {
      const isSelected = selectedId === item.id;

      return (
        <InstructionItem
          key={item.id}
          instruction={item}
          selected={isSelected}
          searchQuery={searchQuery}
          onClick={onItemClick}
          type={item.type}
        />
      );
    },
    [searchQuery]
  );

  // Handle instruction click
  const handleItemClick = useCallback(
    (instruction: Instruction | Pseudoinstruction, type: 'instruction' | 'pseudoinstruction') => {
      const item = filteredItems.find(i => {
        if (i.type !== type) return false;

        if (type === 'instruction') {
          const instItem = i as Instruction;
          const instClick = instruction as Instruction;
          return instItem.mnemonic === instClick.mnemonic &&
                 instItem.extension === instClick.extension;
        } else {
          const pseudoItem = i as Pseudoinstruction;
          const pseudoClick = instruction as Pseudoinstruction;
          return pseudoItem.pseudoinstruction === pseudoClick.pseudoinstruction;
        }
      });

      if (item) {
        onSelectInstruction(item.id, type);
      }
    },
    [filteredItems, onSelectInstruction]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`instruction-list ${className}`}>
        <div className="instruction-list__header">
          <span className="instruction-list__count">Loading instructions...</span>
        </div>
        <div className="instruction-list__empty">
          <p>Loading instruction data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`instruction-list ${className}`}>
        <div className="instruction-list__header">
          <span className="instruction-list__count instruction-list__count--error">Error</span>
        </div>
        <div className="instruction-list__empty">
          <p>Failed to load instruction data.</p>
          <p className="instruction-list__error-detail">{error}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredCount === 0) {
    return (
      <div className={`instruction-list ${className}`}>
        <div className="instruction-list__header">
          <span className="instruction-list__count">
            Showing 0 of {totalCount} {totalCount === 1 ? 'instruction' : 'instructions'}
          </span>
        </div>
        <div className="instruction-list__empty">
          <p>No instructions match your filters.</p>
          <p className="instruction-list__empty-hint">
            Try adjusting or clearing filters to see more results.
          </p>
        </div>
      </div>
    );
  }

  // Normal state with results
  return (
    <div className={`instruction-list ${className}`}>
      <div className="instruction-list__header">
        <span className="instruction-list__count">
          Showing {filteredCount} of {totalCount} {totalCount === 1 ? 'instruction' : 'instructions'}
        </span>
      </div>
      <VirtualList
        items={filteredItems}
        itemHeight={itemHeight}
        renderItem={renderItem}
        onItemClick={handleItemClick}
        selectedId={selectedInstructionId}
      />
    </div>
  );
};

export default InstructionList;
