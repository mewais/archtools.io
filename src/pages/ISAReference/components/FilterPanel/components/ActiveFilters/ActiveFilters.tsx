import React from 'react';
import type { ActiveFiltersProps } from '../../../../../../types';
import './ActiveFilters.css';

const ActiveFilters: React.FC<ActiveFiltersProps> = ({
  activeCount,
  filters,
  onClear,
  onRemove,
  className = '',
}) => {
  if (activeCount === 0) {
    return null;
  }

  const handleClearClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onClear();
  };

  const handleClearTouch = (event: React.TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onClear();
  };

  const handleRemoveClick = (id: string, type: string) => (event: React.MouseEvent) => {
    event.stopPropagation();
    onRemove(id, type);
  };

  const handleRemoveTouch = (id: string, type: string) => (event: React.TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove(id, type);
  };

  return (
    <div className={`active-filters ${className}`}>
      <div className="active-filters__header">
        <span className="active-filters__count">
          {activeCount} {activeCount === 1 ? 'Filter' : 'Filters'} Active
        </span>
        <button
          type="button"
          onClick={handleClearClick}
          onTouchEnd={handleClearTouch}
          className="active-filters__clear-all"
          aria-label="Clear all filters"
        >
          Clear All
        </button>
      </div>
      <div className="active-filters__list">
        {filters.map((filter) => (
          <div key={`${filter.type}-${filter.id}`} className="active-filters__chip">
            <span className="active-filters__chip-label">{filter.label}</span>
            <button
              type="button"
              onClick={handleRemoveClick(filter.id, filter.type)}
              onTouchEnd={handleRemoveTouch(filter.id, filter.type)}
              className="active-filters__chip-remove"
              aria-label={`Remove ${filter.label} filter`}
            >
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActiveFilters;
