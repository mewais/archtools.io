import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { VirtualListProps } from '../../../../../../types';
import './VirtualList.css';

const VirtualList: React.FC<VirtualListProps> = ({
  items,
  itemHeight,
  renderItem,
  onItemClick,
  selectedId,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + 2
  );

  // Total height of the list
  const totalHeight = items.length * itemHeight;

  // Offset for the visible items
  const offsetY = startIndex * itemHeight;

  // Visible items
  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={`virtual-list ${className}`}
      onScroll={handleScroll}
    >
      <div
        className="virtual-list__content"
        style={{ height: `${totalHeight}px` }}
      >
        <div
          className="virtual-list__items"
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = startIndex + index;
            return renderItem(item, actualIndex, onItemClick, selectedId);
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualList;
