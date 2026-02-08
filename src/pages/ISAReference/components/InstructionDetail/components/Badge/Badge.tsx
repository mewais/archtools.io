import React from 'react';
import './Badge.css';

export interface BadgeProps {
  text: string;
  variant: 'extension' | 'category' | 'format' | 'pseudo';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  text,
  variant,
  size = 'md',
  className = ''
}) => {
  return (
    <span
      className={`badge badge--${variant} badge--${size} ${className}`}
      role="status"
      aria-label={`${variant}: ${text}`}
    >
      {text}
    </span>
  );
};

export default Badge;
