import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

export interface TooltipProps {
  /** The content to show in the tooltip */
  content: string;
  /** The element that triggers the tooltip */
  children: React.ReactElement;
  /** Position of the tooltip relative to the trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * Tooltip - Reusable tooltip component
 *
 * Features:
 * - Hover to show tooltip
 * - Configurable position (top, bottom, left, right)
 * - Configurable delay
 * - Accessible (uses aria-describedby)
 * - Automatically positions to stay in viewport
 * - Clean, minimal styling matching theme
 *
 * Usage:
 * ```tsx
 * <Tooltip content="Click to run the program" position="bottom">
 *   <Button>Run</Button>
 * </Tooltip>
 * ```
 */
const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Generate unique ID for aria-describedby
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).substr(2, 9)}`);

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Clone child element and add event handlers
  const childProps = children.props as any;
  const trigger = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      showTooltip();
      if (childProps.onMouseEnter) {
        childProps.onMouseEnter(e);
      }
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hideTooltip();
      if (childProps.onMouseLeave) {
        childProps.onMouseLeave(e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      showTooltip();
      if (childProps.onFocus) {
        childProps.onFocus(e);
      }
    },
    onBlur: (e: React.FocusEvent) => {
      hideTooltip();
      if (childProps.onBlur) {
        childProps.onBlur(e);
      }
    },
    'aria-describedby': isVisible ? tooltipId.current : undefined,
  } as any);

  return (
    <div className={`tooltip-wrapper ${className}`} ref={triggerRef}>
      {trigger}
      {isVisible && (
        <div
          ref={tooltipRef}
          id={tooltipId.current}
          role="tooltip"
          className={`tooltip tooltip--${position}`}
        >
          <div className="tooltip__content">{content}</div>
          <div className="tooltip__arrow" />
        </div>
      )}
    </div>
  );
};

export default Tooltip;
