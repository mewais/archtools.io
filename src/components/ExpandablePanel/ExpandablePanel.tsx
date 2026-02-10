import React, { useEffect, useRef } from 'react';
import './ExpandablePanel.css';

export interface ExpandablePanelProps {
  title: string;
  children: React.ReactNode;
  isExpanded?: boolean;
  isMinimized?: boolean;
  onExpand?: () => void;
  onMinimize?: () => void;
  onToggleExpand?: () => void;
  onToggleMinimize?: () => void;
  className?: string;
  defaultMinimized?: boolean;
  showExpandButton?: boolean;
  showMinimizeButton?: boolean;
  showTitle?: boolean; // Show title text (default: true, false hides visually but keeps for accessibility)
  headerActions?: React.ReactNode; // Additional header actions (e.g., control buttons)
}

/**
 * ExpandablePanel - Higher-Order Component that wraps any content
 * with expand/minimize functionality
 *
 * Features:
 * - Expand button opens panel in overlay mode (90vw x 85vh)
 * - Minimize button collapses panel content
 * - Smooth transitions
 * - Backdrop with click-to-close when expanded
 * - Responsive design with touch-friendly targets
 *
 * Usage:
 * <ExpandablePanel
 *   title="Register View"
 *   onExpand={() => handleExpand('registers')}
 *   onMinimize={() => handleMinimize('registers')}
 * >
 *   <RegisterPanel />
 * </ExpandablePanel>
 */
const ExpandablePanel: React.FC<ExpandablePanelProps> = ({
  title,
  children,
  isExpanded = false,
  isMinimized = false,
  onExpand,
  onMinimize,
  onToggleExpand,
  onToggleMinimize,
  className = '',
  defaultMinimized = false,
  showExpandButton = true,
  showMinimizeButton = true,
  showTitle = true,
  headerActions,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localMinimized, setLocalMinimized] = React.useState(defaultMinimized);

  // Use controlled or uncontrolled minimize state
  const minimized = onToggleMinimize !== undefined ? isMinimized : localMinimized;

  // Handle expand button click
  const handleExpandClick = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else if (onExpand) {
      onExpand();
    }
  };

  // Handle minimize button click
  const handleMinimizeClick = () => {
    if (onToggleMinimize) {
      onToggleMinimize();
    } else if (onMinimize) {
      onMinimize();
    } else {
      setLocalMinimized(!minimized);
    }
  };

  // Handle backdrop click (close expanded panel)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && isExpanded) {
      if (onToggleExpand) {
        onToggleExpand();
      } else if (onExpand) {
        onExpand(); // Toggle off
      }
    }
  };

  // Handle escape key to close expanded panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        if (onToggleExpand) {
          onToggleExpand();
        } else if (onExpand) {
          onExpand();
        }
      }
    };

    if (isExpanded) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when expanded
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isExpanded, onToggleExpand, onExpand]);

  // Panel content
  const panelContent = (
    <div
      ref={panelRef}
      className={`expandable-panel ${minimized ? 'expandable-panel--minimized' : ''} ${isExpanded ? 'expandable-panel--expanded' : ''} ${className}`}
      role="region"
      aria-label={title}
      aria-expanded={!minimized}
    >
      {/* Title bar */}
      <div className="expandable-panel__header">
        <h3 className={`expandable-panel__title ${!showTitle && !minimized ? 'expandable-panel__title--hidden' : ''}`}>
          {title}
        </h3>

        {/* Additional header actions (centered) */}
        {headerActions && (
          <div className="expandable-panel__custom-actions">
            {headerActions}
          </div>
        )}

        {/* Panel control buttons (right) */}
        <div className="expandable-panel__header-actions">
          {/* Minimize button */}
          {showMinimizeButton && (
            <button
              className="expandable-panel__button expandable-panel__button--minimize"
              onClick={handleMinimizeClick}
              aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
              title={minimized ? 'Expand' : 'Minimize'}
              type="button"
            >
              {minimized ? '\u25BC' : '\u25B2'}
            </button>
          )}

          {/* Expand button */}
          {showExpandButton && (
            <button
              className="expandable-panel__button expandable-panel__button--expand"
              onClick={handleExpandClick}
              aria-label={isExpanded ? 'Close overlay' : 'Open in overlay'}
              title={isExpanded ? 'Close' : 'Expand'}
              type="button"
            >
              {isExpanded ? '\u2715' : '\u25A1'}
            </button>
          )}
        </div>
      </div>

      {/* Panel content (hidden when minimized) */}
      {!minimized && (
        <div className="expandable-panel__content">
          {children}
        </div>
      )}
    </div>
  );

  // Render with backdrop if expanded
  if (isExpanded) {
    return (
      <div
        className="expandable-panel__backdrop"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`expandable-panel-title-${title}`}
      >
        {panelContent}
      </div>
    );
  }

  // Normal render
  return panelContent;
};

export default ExpandablePanel;
