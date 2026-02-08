import React, { useState, useMemo, useCallback } from 'react';
import type { FilterPanelProps, FilterGroup } from '../../../../types';
import SearchBar from './components/SearchBar';
import Checkbox from './components/Checkbox';
import FilterSection from './components/FilterSection';
import ActiveFilters from './components/ActiveFilters';
import './FilterPanel.css';

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  instructionCounts,
  className = '',
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const isDesktop = window.innerWidth >= 1280;
    return isDesktop ? new Set(['type', 'extensions', 'formats', 'categories']) : new Set();
  });

  const extensionGroups: FilterGroup[] = useMemo(() => [
    {
      id: 'base-integer',
      label: 'Base Integer',
      items: [
        { id: 'RV32I', label: 'RV32I', count: instructionCounts?.extensions?.['RV32I'] },
        { id: 'RV64I', label: 'RV64I', count: instructionCounts?.extensions?.['RV64I'] },
      ],
    },
    {
      id: 'multiply-divide',
      label: 'Multiply/Divide',
      items: [
        { id: 'RV32M', label: 'RV32M', count: instructionCounts?.extensions?.['RV32M'] },
        { id: 'RV64M', label: 'RV64M', count: instructionCounts?.extensions?.['RV64M'] },
      ],
    },
    {
      id: 'atomic',
      label: 'Atomic',
      items: [
        { id: 'RV32A', label: 'RV32A', count: instructionCounts?.extensions?.['RV32A'] },
        { id: 'RV64A', label: 'RV64A', count: instructionCounts?.extensions?.['RV64A'] },
      ],
    },
    {
      id: 'floating-point',
      label: 'Floating-Point',
      items: [
        { id: 'RV32F', label: 'RV32F', count: instructionCounts?.extensions?.['RV32F'] },
        { id: 'RV64F', label: 'RV64F', count: instructionCounts?.extensions?.['RV64F'] },
        { id: 'RV32D', label: 'RV32D', count: instructionCounts?.extensions?.['RV32D'] },
        { id: 'RV64D', label: 'RV64D', count: instructionCounts?.extensions?.['RV64D'] },
        { id: 'RV32Q', label: 'RV32Q', count: instructionCounts?.extensions?.['RV32Q'] },
        { id: 'RV64Q', label: 'RV64Q', count: instructionCounts?.extensions?.['RV64Q'] },
        { id: 'RV32Zfh', label: 'RV32Zfh', count: instructionCounts?.extensions?.['RV32Zfh'] },
        { id: 'RV64Zfh', label: 'RV64Zfh', count: instructionCounts?.extensions?.['RV64Zfh'] },
      ],
    },
    {
      id: 'compressed',
      label: 'Compressed',
      items: [
        { id: 'RV32C', label: 'RV32C', count: instructionCounts?.extensions?.['RV32C'] },
        { id: 'RV64C', label: 'RV64C', count: instructionCounts?.extensions?.['RV64C'] },
      ],
    },
    {
      id: 'vector',
      label: 'Vector',
      items: [
        { id: 'RV32V', label: 'RV32V', count: instructionCounts?.extensions?.['RV32V'] },
        { id: 'RV64V', label: 'RV64V', count: instructionCounts?.extensions?.['RV64V'] },
      ],
    },
    {
      id: 'bit-manipulation',
      label: 'Bit Manipulation',
      items: [
        { id: 'RV32B', label: 'RV32B', count: instructionCounts?.extensions?.['RV32B'] },
        { id: 'RV64B', label: 'RV64B', count: instructionCounts?.extensions?.['RV64B'] },
      ],
    },
    {
      id: 'other',
      label: 'Other',
      items: [
        { id: 'RV32Zawrs', label: 'RV32Zawrs', count: instructionCounts?.extensions?.['RV32Zawrs'] },
        { id: 'RV64Zawrs', label: 'RV64Zawrs', count: instructionCounts?.extensions?.['RV64Zawrs'] },
        { id: 'RV32Zicsr', label: 'RV32Zicsr', count: instructionCounts?.extensions?.['RV32Zicsr'] },
        { id: 'RV64Zicsr', label: 'RV64Zicsr', count: instructionCounts?.extensions?.['RV64Zicsr'] },
        { id: 'RV32Zifencei', label: 'RV32Zifencei', count: instructionCounts?.extensions?.['RV32Zifencei'] },
        { id: 'RV64Zifencei', label: 'RV64Zifencei', count: instructionCounts?.extensions?.['RV64Zifencei'] },
      ],
    },
  ], [instructionCounts]);

  const formatGroups: FilterGroup[] = useMemo(() => [
    {
      id: 'standard',
      label: 'Standard',
      items: [
        { id: 'R-Type', label: 'R-Type', count: instructionCounts?.formats?.['R-Type'] },
        { id: 'I-Type', label: 'I-Type', count: instructionCounts?.formats?.['I-Type'] },
        { id: 'S-Type', label: 'S-Type', count: instructionCounts?.formats?.['S-Type'] },
        { id: 'B-Type', label: 'B-Type', count: instructionCounts?.formats?.['B-Type'] },
        { id: 'U-Type', label: 'U-Type', count: instructionCounts?.formats?.['U-Type'] },
        { id: 'J-Type', label: 'J-Type', count: instructionCounts?.formats?.['J-Type'] },
      ],
    },
    {
      id: 'compressed',
      label: 'Compressed',
      items: [
        { id: 'CR', label: 'CR', count: instructionCounts?.formats?.['CR'] },
        { id: 'CI', label: 'CI', count: instructionCounts?.formats?.['CI'] },
        { id: 'CL', label: 'CL', count: instructionCounts?.formats?.['CL'] },
        { id: 'CS', label: 'CS', count: instructionCounts?.formats?.['CS'] },
        { id: 'CA', label: 'CA', count: instructionCounts?.formats?.['CA'] },
        { id: 'CB', label: 'CB', count: instructionCounts?.formats?.['CB'] },
        { id: 'CJ', label: 'CJ', count: instructionCounts?.formats?.['CJ'] },
        { id: 'CIW', label: 'CIW', count: instructionCounts?.formats?.['CIW'] },
        { id: 'CSS', label: 'CSS', count: instructionCounts?.formats?.['CSS'] },
        { id: 'CM', label: 'CM', count: instructionCounts?.formats?.['CM'] },
      ],
    },
  ], [instructionCounts]);

  const categories = useMemo(() => [
    { id: 'Arithmetic', label: 'Arithmetic', count: instructionCounts?.categories?.['Arithmetic'] },
    { id: 'Load/Store', label: 'Load/Store', count: instructionCounts?.categories?.['Load/Store'] },
    { id: 'Control Transfer', label: 'Control Transfer', count: instructionCounts?.categories?.['Control Transfer'] },
    { id: 'Logical', label: 'Logical', count: instructionCounts?.categories?.['Logical'] },
    { id: 'Shift', label: 'Shift', count: instructionCounts?.categories?.['Shift'] },
    { id: 'System', label: 'System', count: instructionCounts?.categories?.['System'] },
    { id: 'Floating-Point', label: 'Floating-Point', count: instructionCounts?.categories?.['Floating-Point'] },
    { id: 'Vector', label: 'Vector', count: instructionCounts?.categories?.['Vector'] },
    { id: 'Mask', label: 'Mask', count: instructionCounts?.categories?.['Mask'] },
    { id: 'Configuration', label: 'Configuration', count: instructionCounts?.categories?.['Configuration'] },
    { id: 'Reduction', label: 'Reduction', count: instructionCounts?.categories?.['Reduction'] },
    { id: 'Permutation', label: 'Permutation', count: instructionCounts?.categories?.['Permutation'] },
    { id: 'Comparison', label: 'Comparison', count: instructionCounts?.categories?.['Comparison'] },
    { id: 'Fixed-Point', label: 'Fixed-Point', count: instructionCounts?.categories?.['Fixed-Point'] },
  ], [instructionCounts]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleTypeChange = useCallback((type: 'all' | 'instructions' | 'pseudoinstructions') => {
    onFiltersChange({
      ...filters,
      type: {
        all: type === 'all',
        instructions: type === 'instructions',
        pseudoinstructions: type === 'pseudoinstructions',
      },
    });
  }, [filters, onFiltersChange]);

  const handleExtensionToggle = useCallback((extensionId: string) => {
    const newExtensions = filters.extensions.includes(extensionId)
      ? filters.extensions.filter(id => id !== extensionId)
      : [...filters.extensions, extensionId];

    onFiltersChange({
      ...filters,
      extensions: newExtensions,
    });
  }, [filters, onFiltersChange]);

  const handleFormatToggle = useCallback((formatId: string) => {
    const newFormats = filters.formats.includes(formatId)
      ? filters.formats.filter(id => id !== formatId)
      : [...filters.formats, formatId];

    onFiltersChange({
      ...filters,
      formats: newFormats,
    });
  }, [filters, onFiltersChange]);

  const handleCategoryToggle = useCallback((categoryId: string) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter(id => id !== categoryId)
      : [...filters.categories, categoryId];

    onFiltersChange({
      ...filters,
      categories: newCategories,
    });
  }, [filters, onFiltersChange]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({
      ...filters,
      searchQuery: value,
    });
  }, [filters, onFiltersChange]);

  const handleSearchClear = useCallback(() => {
    onFiltersChange({
      ...filters,
      searchQuery: '',
    });
  }, [filters, onFiltersChange]);

  const handleGroupToggle = useCallback((group: FilterGroup, type: 'extensions' | 'formats') => {
    const groupItemIds = group.items.map(item => item.id);
    const currentItems = type === 'extensions' ? filters.extensions : filters.formats;
    const allSelected = groupItemIds.every(id => currentItems.includes(id));

    let newItems: string[];
    if (allSelected) {
      newItems = currentItems.filter(id => !groupItemIds.includes(id));
    } else {
      const missingItems = groupItemIds.filter(id => !currentItems.includes(id));
      newItems = [...currentItems, ...missingItems];
    }

    onFiltersChange({
      ...filters,
      [type]: newItems,
    });
  }, [filters, onFiltersChange]);

  const activeFilters = useMemo(() => {
    const active: Array<{ id: string; label: string; type: string }> = [];

    if (!filters.type.all) {
      if (filters.type.instructions) {
        active.push({ id: 'instructions', label: 'Instructions', type: 'type' });
      }
      if (filters.type.pseudoinstructions) {
        active.push({ id: 'pseudoinstructions', label: 'Pseudoinstructions', type: 'type' });
      }
    }

    filters.extensions.forEach(ext => {
      active.push({ id: ext, label: ext, type: 'extensions' });
    });

    filters.formats.forEach(fmt => {
      active.push({ id: fmt, label: fmt, type: 'formats' });
    });

    filters.categories.forEach(cat => {
      active.push({ id: cat, label: cat, type: 'categories' });
    });

    return active;
  }, [filters]);

  const handleClearAllFilters = useCallback(() => {
    onFiltersChange({
      type: { all: true, instructions: false, pseudoinstructions: false },
      extensions: [],
      formats: [],
      categories: [],
      searchQuery: '',
    });
  }, [onFiltersChange]);

  const handleRemoveFilter = useCallback((id: string, type: string) => {
    if (type === 'type') {
      onFiltersChange({
        ...filters,
        type: { all: true, instructions: false, pseudoinstructions: false },
      });
    } else if (type === 'extensions') {
      onFiltersChange({
        ...filters,
        extensions: filters.extensions.filter(ext => ext !== id),
      });
    } else if (type === 'formats') {
      onFiltersChange({
        ...filters,
        formats: filters.formats.filter(fmt => fmt !== id),
      });
    } else if (type === 'categories') {
      onFiltersChange({
        ...filters,
        categories: filters.categories.filter(cat => cat !== id),
      });
    }
  }, [filters, onFiltersChange]);

  const isGroupIndeterminate = useCallback((group: FilterGroup, type: 'extensions' | 'formats') => {
    const groupItemIds = group.items.map(item => item.id);
    const currentItems = type === 'extensions' ? filters.extensions : filters.formats;
    const selectedCount = groupItemIds.filter(id => currentItems.includes(id)).length;
    return selectedCount > 0 && selectedCount < groupItemIds.length;
  }, [filters]);

  const isGroupChecked = useCallback((group: FilterGroup, type: 'extensions' | 'formats') => {
    const groupItemIds = group.items.map(item => item.id);
    const currentItems = type === 'extensions' ? filters.extensions : filters.formats;
    return groupItemIds.every(id => currentItems.includes(id));
  }, [filters]);

  return (
    <div className={`filter-panel ${className}`}>
      <SearchBar
        value={filters.searchQuery}
        onChange={handleSearchChange}
        onClear={handleSearchClear}
      />

      <ActiveFilters
        activeCount={activeFilters.length}
        filters={activeFilters}
        onClear={handleClearAllFilters}
        onRemove={handleRemoveFilter}
      />

      <div className="filter-panel__sections">
        <FilterSection
          title="Type"
          expanded={expandedSections.has('type')}
          onToggle={() => toggleSection('type')}
        >
          <div className="filter-panel__group">
            <Checkbox
              id="type-all"
              label="All"
              checked={filters.type.all}
              onChange={() => handleTypeChange('all')}
            />
            <Checkbox
              id="type-instructions"
              label="Instructions"
              checked={filters.type.instructions}
              onChange={() => handleTypeChange('instructions')}
            />
            <Checkbox
              id="type-pseudoinstructions"
              label="Pseudoinstructions"
              checked={filters.type.pseudoinstructions}
              onChange={() => handleTypeChange('pseudoinstructions')}
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Extensions"
          expanded={expandedSections.has('extensions')}
          onToggle={() => toggleSection('extensions')}
        >
          <div className="filter-panel__groups">
            {extensionGroups.map((group) => (
              <div key={group.id} className="filter-panel__group">
                <Checkbox
                  id={`group-${group.id}`}
                  label={group.label}
                  checked={isGroupChecked(group, 'extensions')}
                  indeterminate={isGroupIndeterminate(group, 'extensions')}
                  onChange={() => handleGroupToggle(group, 'extensions')}
                />
                <div className="filter-panel__group-items">
                  {group.items.map((item) => (
                    <Checkbox
                      key={item.id}
                      id={`ext-${item.id}`}
                      label={item.label}
                      checked={filters.extensions.includes(item.id)}
                      count={item.count}
                      onChange={() => handleExtensionToggle(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FilterSection>

        <FilterSection
          title="Formats"
          expanded={expandedSections.has('formats')}
          onToggle={() => toggleSection('formats')}
        >
          <div className="filter-panel__groups">
            {formatGroups.map((group) => (
              <div key={group.id} className="filter-panel__group">
                <Checkbox
                  id={`group-${group.id}`}
                  label={group.label}
                  checked={isGroupChecked(group, 'formats')}
                  indeterminate={isGroupIndeterminate(group, 'formats')}
                  onChange={() => handleGroupToggle(group, 'formats')}
                />
                <div className="filter-panel__group-items">
                  {group.items.map((item) => (
                    <Checkbox
                      key={item.id}
                      id={`fmt-${item.id}`}
                      label={item.label}
                      checked={filters.formats.includes(item.id)}
                      count={item.count}
                      onChange={() => handleFormatToggle(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FilterSection>

        <FilterSection
          title="Categories"
          expanded={expandedSections.has('categories')}
          onToggle={() => toggleSection('categories')}
        >
          <div className="filter-panel__group">
            {categories.map((category) => (
              <Checkbox
                key={category.id}
                id={`cat-${category.id}`}
                label={category.label}
                checked={filters.categories.includes(category.id)}
                count={category.count}
                onChange={() => handleCategoryToggle(category.id)}
              />
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
};

export default FilterPanel;
