import React, { useEffect, useRef } from 'react';
import './FilterDrawer.css';

export interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="filter-drawer__backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={drawerRef}
        className={`filter-drawer ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="filter-drawer__header">
          <h2 className="filter-drawer__title">Filters</h2>
          <button
            className="filter-drawer__close"
            onClick={onClose}
            aria-label="Close filters"
            type="button"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="filter-drawer__content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default FilterDrawer;
