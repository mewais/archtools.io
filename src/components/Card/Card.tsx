import React from 'react';
import { Link } from 'react-router-dom';
import type { CardProps } from '../../types';
import './Card.css';

const Card: React.FC<CardProps> = ({
  title,
  description,
  icon,
  href,
  category,
  tags = [],
  className = '',
}) => {
  return (
    <Link to={href} className={`tool-card tool-card--${category} ${className}`}>
      <div className="tool-card__icon">
        {icon}
      </div>
      <div className="tool-card__content">
        <h3 className="tool-card__title">{title}</h3>
        <p className="tool-card__description">{description}</p>
        {tags.length > 0 && (
          <div className="tool-card__tags">
            {tags.map((tag) => (
              <span key={tag} className="tool-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="tool-card__arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </Link>
  );
};

export default Card;
