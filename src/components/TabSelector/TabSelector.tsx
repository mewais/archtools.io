import React from 'react';
import type { TabSelectorProps } from '../../types';
import './TabSelector.css';

const TabSelector: React.FC<TabSelectorProps> = ({
  tabs,
  activeTab,
  onTabChange,
  size = 'md',
  className = '',
}) => {
  return (
    <div className={`tab-selector tab-selector--${size} ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            className={`tab-selector__tab ${isActive ? 'tab-selector__tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.icon && <span className="tab-selector__icon">{tab.icon}</span>}
            <span className="tab-selector__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default TabSelector;
