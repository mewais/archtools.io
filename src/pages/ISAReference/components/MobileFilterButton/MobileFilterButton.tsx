import React from 'react';
import './MobileFilterButton.css';

export interface MobileFilterButtonProps {
  onClick: () => void;
  activeFilterCount?: number;
  className?: string;
}

const MobileFilterButton: React.FC<MobileFilterButtonProps> = ({
  onClick,
  activeFilterCount = 0,
  className = '',
}) => {
  return (
    <button
      className={`mobile-filter-button ${className}`}
      onClick={onClick}
      aria-label="Open filters"
      type="button"
    >
      <svg
        className="mobile-filter-button__icon"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 6h18M3 12h12M3 18h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="mobile-filter-button__label">Filters</span>
      {activeFilterCount > 0 && (
        <span className="mobile-filter-button__badge" aria-label={`${activeFilterCount} active filters`}>
          {activeFilterCount}
        </span>
      )}
    </button>
  );
};

export default MobileFilterButton;
