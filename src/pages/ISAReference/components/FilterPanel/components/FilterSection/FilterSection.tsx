import React from 'react';
import type { FilterSectionProps } from '../../../../../../types';
import './FilterSection.css';

const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  expanded,
  onToggle,
  children,
  className = '',
}) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onToggle();
  };

  return (
    <div className={`filter-section ${className}`}>
      <button
        type="button"
        className="filter-section__header"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        aria-controls={`filter-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <h4 className="filter-section__title">{title}</h4>
        <svg
          className={`filter-section__icon ${expanded ? 'filter-section__icon--expanded' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 8L10 12L14 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        id={`filter-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
        className={`filter-section__content ${expanded ? 'filter-section__content--expanded' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="filter-section__content-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

export default FilterSection;
