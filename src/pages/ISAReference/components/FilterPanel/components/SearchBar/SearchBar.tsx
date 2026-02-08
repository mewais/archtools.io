import React, { useState, useEffect, useCallback } from 'react';
import type { SearchBarProps } from '../../../../../../types';
import './SearchBar.css';

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search by name or opcode...',
  className = '',
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localValue, value, onChange]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(event.target.value);
  };

  const handleClear = useCallback(() => {
    setLocalValue('');
    onClear();
  }, [onClear]);

  const handleClearClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    handleClear();
  }, [handleClear]);

  const handleClearTouch = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    handleClear();
  }, [handleClear]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div className={`search-bar ${className}`}>
      <div className="search-bar__icon-wrapper">
        <svg className="search-bar__icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="search-bar__input"
        aria-label="Search instructions"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClearClick}
          onTouchEnd={handleClearTouch}
          className="search-bar__clear"
          aria-label="Clear search"
        >
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default SearchBar;
