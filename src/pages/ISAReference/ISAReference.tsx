import React, { useState, useMemo } from 'react';
import ToolPage from '../ToolPage';
import Grid from '../../components/Grid';
import FilterPanel from './components/FilterPanel';
import FilterDrawer from './components/FilterDrawer';
import MobileFilterButton from './components/MobileFilterButton';
import InstructionList from './components/InstructionList';
import InstructionDetail from './components/InstructionDetail';
import { useMediaQuery } from '../../hooks';
import type { GridColumn, FilterConfig, Instruction, Pseudoinstruction } from '../../types';
import instructionsData from '../../data/instructions.json';
import pseudoinstructionsData from '../../data/pseudoinstructions.json';
import './ISAReference.css';

const ISAReference: React.FC = () => {
  // Detect if we're on desktop (>= 1280px) for responsive layout
  // Higher breakpoint than usual because PageLayout sidebars reduce available width
  const isDesktop = useMediaQuery('(min-width: 1280px)');

  const [filters, setFilters] = useState<FilterConfig>({
    type: {
      all: true,
      instructions: false,
      pseudoinstructions: false,
    },
    extensions: [],
    formats: [],
    categories: [],
    searchQuery: '',
  });

  const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const handleFiltersChange = (newFilters: FilterConfig) => {
    setFilters(newFilters);
  };

  const handleSelectInstruction = (id: string, _type: 'instruction' | 'pseudoinstruction') => {
    setSelectedInstructionId(id);
  };

  // Get the selected instruction data
  const selectedInstruction = useMemo(() => {
    if (!selectedInstructionId) return null;

    // Parse the ID to determine type and find the instruction
    if (selectedInstructionId.startsWith('inst-')) {
      const instructions = instructionsData as Instruction[];
      // Extract mnemonic and extension from ID: "inst-{mnemonic}-{extension}"
      const parts = selectedInstructionId.replace('inst-', '').split('-');
      if (parts.length >= 2) {
        const extension = parts[parts.length - 1];
        const mnemonic = parts.slice(0, -1).join('-');
        return instructions.find(i => i.mnemonic === mnemonic && i.extension === extension) || null;
      }
    } else if (selectedInstructionId.startsWith('pseudo-')) {
      // Handle pseudoinstructions
      const pseudoinstructions = pseudoinstructionsData as Pseudoinstruction[];
      // Extract index from ID: "pseudo-{index}"
      const index = parseInt(selectedInstructionId.replace('pseudo-', ''), 10);
      if (!isNaN(index) && index >= 0 && index < pseudoinstructions.length) {
        return pseudoinstructions[index];
      }
    }
    return null;
  }, [selectedInstructionId]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!filters.type.all) {
      if (filters.type.instructions) count++;
      if (filters.type.pseudoinstructions) count++;
    }
    count += filters.extensions.length;
    count += filters.formats.length;
    count += filters.categories.length;
    return count;
  }, [filters]);

  // Calculate instruction counts for filters
  const instructionCounts = useMemo(() => {
    const instructions = instructionsData as Instruction[];
    const pseudoinstructions = pseudoinstructionsData as Pseudoinstruction[];

    const extensions: Record<string, number> = {};
    const formats: Record<string, number> = {};
    const categories: Record<string, number> = {};

    // Count instructions by extension, format, and category
    instructions.forEach(instruction => {
      if (instruction.extension) {
        extensions[instruction.extension] = (extensions[instruction.extension] || 0) + 1;
      }
      if (instruction.format) {
        formats[instruction.format] = (formats[instruction.format] || 0) + 1;
      }
      if (instruction.category) {
        categories[instruction.category] = (categories[instruction.category] || 0) + 1;
      }
    });

    // Count pseudoinstructions
    pseudoinstructions.forEach(pseudo => {
      if (pseudo.requiredExtensions) {
        pseudo.requiredExtensions.forEach(ext => {
          extensions[ext] = (extensions[ext] || 0) + 1;
        });
      }
    });

    return { extensions, formats, categories };
  }, []);

  const filterPanelContent = (
    <FilterPanel
      filters={filters}
      onFiltersChange={handleFiltersChange}
      instructionCounts={instructionCounts}
    />
  );

  const filterPanel = (
    <div className="isa-reference__filter-panel">
      <div className="isa-reference__section-header">
        <h3>Filters</h3>
      </div>
      {filterPanelContent}
    </div>
  );

  const instructionList = (
    <div className="isa-reference__instruction-list">
      <div className="isa-reference__section-header">
        <h3>Instructions</h3>
      </div>
      <InstructionList
        filters={filters}
        searchQuery={filters.searchQuery}
        selectedInstructionId={selectedInstructionId}
        onSelectInstruction={handleSelectInstruction}
      />
    </div>
  );

  const instructionDetail = (
    <div className="isa-reference__instruction-detail">
      <div className="isa-reference__section-header">
        <h3>Details</h3>
      </div>
      <InstructionDetail
        instruction={selectedInstruction}
        isPseudoinstruction={selectedInstructionId?.startsWith('pseudo-')}
      />
    </div>
  );

  // Configure columns based on screen size
  // Desktop (>= 1280px): 3 columns (filter: 2, list: 3, detail: 7)
  // Tablet/Mobile (< 1280px): 2 columns (list: 3, detail: 9) - filter in drawer
  const columns: GridColumn[] = isDesktop
    ? [
        {
          id: 'filter-panel',
          content: filterPanel,
          span: 2,
        },
        {
          id: 'instruction-list',
          content: instructionList,
          span: 3,
        },
        {
          id: 'instruction-detail',
          content: instructionDetail,
          span: 7,
        },
      ]
    : [
        {
          id: 'instruction-list',
          content: instructionList,
          span: 3,
        },
        {
          id: 'instruction-detail',
          content: instructionDetail,
          span: 9,
        },
      ];

  return (
    <ToolPage
      title="RISC-V ISA Reference"
      description="Interactive instruction set reference for RISC-V. Browse and search 1300+ instructions across RV32I, RV64I, M, A, F, D, C, V, B, and more extensions."
      fullWidth
    >
      <div className="isa-reference">
        <Grid columns={columns} layout="horizontal" gap="md" mobileHeight="split" />

        {/* Show mobile filter button only on tablet/mobile */}
        {!isDesktop && (
          <MobileFilterButton
            onClick={() => setIsFilterDrawerOpen(true)}
            activeFilterCount={activeFilterCount}
          />
        )}

        {/* Show filter drawer only on tablet/mobile */}
        {!isDesktop && (
          <FilterDrawer
            isOpen={isFilterDrawerOpen}
            onClose={() => setIsFilterDrawerOpen(false)}
          >
            {filterPanelContent}
          </FilterDrawer>
        )}
      </div>
    </ToolPage>
  );
};

export default ISAReference;
