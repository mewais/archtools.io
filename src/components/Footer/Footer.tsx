import React from 'react';
import { HeartIcon } from '../Icons';
import './Footer.css';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__container">
        <p className="footer__text">
          Built with <HeartIcon size={16} /> for developers and architects
        </p>
        <p className="footer__copyright">
          {currentYear} archtools.io
        </p>
      </div>
    </footer>
  );
};

export default Footer;
