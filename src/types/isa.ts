// ISA Reference Types

export interface InstructionEncodingField {
  name: string;
  startBit: number;
  endBit: number;
  value: string;
  description: string;
  category: string;
}

export interface Instruction {
  mnemonic: string;
  category: string;
  format: string;
  encoding: string;
  description: string;
  operands: string[];
  operandTypes: string[];
  extension: string;
  pseudocode: string;
  example?: string;
  expansion?: string; // Only for compressed instructions
  encodingFields?: InstructionEncodingField[];
}

export interface Pseudoinstruction {
  pseudoinstruction: string;
  baseInstructions: string[];
  description: string;
  requiredExtensions: string[];
  mnemonic: string;
  format: string;
  extension?: string;
}

export interface ISAFilters {
  searchQuery: string;
  extensions: string[];
  formats: string[];
  categories: string[];
  type: 'all' | 'instructions' | 'pseudoinstructions';
}

// Filter Panel Component Types
export interface FilterConfig {
  type: {
    all: boolean;
    instructions: boolean;
    pseudoinstructions: boolean;
  };
  extensions: string[];
  formats: string[];
  categories: string[];
  searchQuery: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  items: FilterItem[];
}

export interface FilterItem {
  id: string;
  label: string;
  count?: number;
}

export interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  count?: number;
  onChange: (checked: boolean) => void;
  className?: string;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export interface FilterSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export interface ActiveFiltersProps {
  activeCount: number;
  filters: Array<{ id: string; label: string; type: string }>;
  onClear: () => void;
  onRemove: (id: string, type: string) => void;
  className?: string;
}

export interface FilterPanelProps {
  filters: FilterConfig;
  onFiltersChange: (filters: FilterConfig) => void;
  instructionCounts?: {
    extensions: Record<string, number>;
    formats: Record<string, number>;
    categories: Record<string, number>;
  };
  className?: string;
}

// Instruction List Component Types
export type InstructionListItem = (Instruction & { type: 'instruction'; id: string }) |
  (Pseudoinstruction & { type: 'pseudoinstruction'; id: string });

export interface InstructionListProps {
  filters: FilterConfig;
  searchQuery: string;
  selectedInstructionId: string | null;
  onSelectInstruction: (id: string, type: 'instruction' | 'pseudoinstruction') => void;
  className?: string;
}

export interface InstructionItemProps {
  instruction: Instruction | Pseudoinstruction;
  selected: boolean;
  searchQuery: string;
  onClick: (instruction: Instruction | Pseudoinstruction, type: 'instruction' | 'pseudoinstruction') => void;
  type: 'instruction' | 'pseudoinstruction';
}

export interface VirtualListProps {
  items: InstructionListItem[];
  itemHeight: number;
  renderItem: (
    item: InstructionListItem,
    index: number,
    onItemClick: (instruction: Instruction | Pseudoinstruction, type: 'instruction' | 'pseudoinstruction') => void,
    selectedId: string | null
  ) => React.ReactNode;
  onItemClick: (instruction: Instruction | Pseudoinstruction, type: 'instruction' | 'pseudoinstruction') => void;
  selectedId: string | null;
  className?: string;
}

// Instruction Detail Component Types
export interface BadgeProps {
  text: string;
  variant: 'extension' | 'category' | 'format' | 'pseudo';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface CodeBlockProps {
  code: string;
  language?: 'pseudocode' | 'asm' | 'plain';
  title?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export interface EncodingVisualizationProps {
  encoding: string;
  encodingFields?: InstructionEncodingField[];
  mnemonic?: string;
  className?: string;
}

export interface InstructionHeaderProps {
  mnemonic: string;
  extension: string;
  category: string;
  format?: string;
  isPseudoinstruction?: boolean;
  className?: string;
}

export interface InstructionDetailProps {
  instruction: Instruction | Pseudoinstruction | null;
  isPseudoinstruction?: boolean;
  className?: string;
}
