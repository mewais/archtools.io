import React from 'react';
import { Link } from 'react-router-dom';
import './ToolPage.css';

interface ToolPageProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

const ToolPage: React.FC<ToolPageProps> = ({ title, description, children }) => {
  return (
    <main className="tool-page">
      <div className="tool-page__header">
        <Link to="/" className="tool-page__back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M5 12L12 19M5 12L12 5"/>
          </svg>
          All Tools
        </Link>
        <h1 className="tool-page__title">{title}</h1>
        <p className="tool-page__description">{description}</p>
      </div>
      <div className="tool-page__content">
        {children || (
          <div className="tool-page__placeholder">
            <p>Tool implementation coming soon.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default ToolPage;
