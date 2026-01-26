import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle';
import { GithubIcon } from '../Icons';
import type { Theme } from '../../types';
import './Header.css';

interface HeaderProps {
  theme: Theme;
  onThemeToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle }) => {
  return (
    <header className="header">
      <div className="header__container">
        <Link to="/" className="header__logo">
          <span className="header__logo-text">arch</span>
          <span className="header__logo-accent">tools</span>
        </Link>

        <nav className="header__nav">
          <a
            href="https://github.com/archtools"
            target="_blank"
            rel="noopener noreferrer"
            className="header__link"
            aria-label="GitHub"
          >
            <GithubIcon size={22} />
          </a>
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </nav>
      </div>
    </header>
  );
};

export default Header;
