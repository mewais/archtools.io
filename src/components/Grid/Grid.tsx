import React from 'react';
import type { GridProps } from '../../types';
import './Grid.css';

const Grid: React.FC<GridProps> = ({
  header,
  columns,
  layout = 'horizontal',
  gap = 'md',
  mobileHeight = 'auto',
  className = '',
}) => {
  const gridClasses = [
    'grid',
    `grid--${layout}`,
    `grid--gap-${gap}`,
    mobileHeight === 'split' ? 'grid--mobile-split' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={gridClasses}>
      {header && <div className="grid__header">{header}</div>}

      <div className="grid__content">
        {columns.map((column) => (
          <div
            key={column.id}
            className={`grid__column ${column.span ? `grid__column--span-${column.span}` : ''}`}
            style={column.span ? { '--column-span': column.span } as React.CSSProperties : undefined}
          >
            {column.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Grid;
