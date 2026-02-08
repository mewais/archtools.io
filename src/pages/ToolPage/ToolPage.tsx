import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ToolPage.css';

interface ToolPageProps {
  title: string;
  description: string;
  keywords?: string[];
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const ToolPage: React.FC<ToolPageProps> = ({ title, description, keywords, fullWidth, children }) => {
  // Update document title and meta tags for SEO
  useEffect(() => {
    // Set page title
    const prevTitle = document.title;
    document.title = `${title} - archtools.io`;

    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    const prevDescription = metaDescription?.getAttribute('content') || '';
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    }

    // Update or create meta keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (keywords && keywords.length > 0) {
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute('content', keywords.join(', '));
    }

    // Add structured data (JSON-LD)
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': title,
      'description': description,
      'url': window.location.href,
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Any',
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD'
      }
    };

    let scriptTag = document.querySelector('script[data-tool-schema]');
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.setAttribute('type', 'application/ld+json');
      scriptTag.setAttribute('data-tool-schema', 'true');
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(structuredData);

    // Cleanup on unmount
    return () => {
      document.title = prevTitle;
      if (metaDescription) {
        metaDescription.setAttribute('content', prevDescription);
      }
      if (scriptTag) {
        scriptTag.remove();
      }
    };
  }, [title, description, keywords]);

  return (
    <main className={`tool-page${fullWidth ? ' tool-page--full-width' : ''}`}>
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
