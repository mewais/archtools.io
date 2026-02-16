import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

const NotFound: React.FC = () => {
  return (
    <div className="not-found">
      <h1 className="not-found__code">404</h1>
      <p className="not-found__message">Page not found</p>
      <p className="not-found__hint">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="not-found__link">Back to All Tools</Link>
    </div>
  );
};

export default NotFound;
