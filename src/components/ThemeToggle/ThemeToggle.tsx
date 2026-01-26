import React from 'react';
import { SunIcon, MoonIcon } from '../Icons';
import type { Theme } from '../../types';
import './ThemeToggle.css';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, className = '' }) => {
  return (
    <button
      className={`theme-toggle ${className}`}
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="theme-toggle__icon theme-toggle__icon--sun">
        <SunIcon size={20} />
      </span>
      <span className="theme-toggle__icon theme-toggle__icon--moon">
        <MoonIcon size={20} />
      </span>
      <span
        className="theme-toggle__slider"
        style={{ transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}
      />
    </button>
  );
};

export default ThemeToggle;
