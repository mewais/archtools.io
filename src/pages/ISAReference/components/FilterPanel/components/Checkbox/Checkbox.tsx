import React, { useEffect, useRef } from 'react';
import type { CheckboxProps } from '../../../../../../types';
import './Checkbox.css';

const Checkbox: React.FC<CheckboxProps> = ({
  id,
  label,
  checked,
  indeterminate = false,
  disabled = false,
  count,
  onChange,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange = (event?: React.MouseEvent | React.KeyboardEvent) => {
    if (!disabled) {
      // Prevent event bubbling to parent elements
      if (event) {
        event.stopPropagation();
      }
      onChange(!checked);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handleChange(event);
    }
  };

  const handleClick = (event: React.MouseEvent) => {
    // Don't preventDefault - let the click work normally
    event.stopPropagation();
    handleChange(event);
  };

  return (
    <div
      className={`checkbox ${disabled ? 'checkbox--disabled' : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="checkbox__input-wrapper">
        <input
          ref={inputRef}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={() => {}} // Controlled by parent div
          className="checkbox__input"
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className={`checkbox__box ${checked ? 'checkbox__box--checked' : ''} ${indeterminate ? 'checkbox__box--indeterminate' : ''}`}>
          {indeterminate ? (
            <svg className="checkbox__icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : checked ? (
            <svg className="checkbox__icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
      </div>
      <span className="checkbox__label">
        {label}
        {count !== undefined && <span className="checkbox__count">{count}</span>}
      </span>
    </div>
  );
};

export default Checkbox;
