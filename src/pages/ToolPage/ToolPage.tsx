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
    const pageUrl = `https://archtools.io${window.location.pathname}`;

    // Set page title
    const prevTitle = document.title;
    document.title = `${title} - archtools.io`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
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

    // Update canonical URL for this page
    const canonical = document.querySelector('link[rel="canonical"]');
    const prevCanonical = canonical?.getAttribute('href') || '';
    if (canonical) {
      canonical.setAttribute('href', pageUrl);
    }

    // Update Open Graph URL and title
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const prevOgUrl = ogUrl?.getAttribute('content') || '';
    if (ogUrl) ogUrl.setAttribute('content', pageUrl);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const prevOgTitle = ogTitle?.getAttribute('content') || '';
    if (ogTitle) ogTitle.setAttribute('content', `${title} - archtools.io`);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    const prevOgDesc = ogDesc?.getAttribute('content') || '';
    if (ogDesc) ogDesc.setAttribute('content', description);

    // Update Twitter URL and title
    const twUrl = document.querySelector('meta[name="twitter:url"]');
    const prevTwUrl = twUrl?.getAttribute('content') || '';
    if (twUrl) twUrl.setAttribute('content', pageUrl);

    const twTitle = document.querySelector('meta[name="twitter:title"]');
    const prevTwTitle = twTitle?.getAttribute('content') || '';
    if (twTitle) twTitle.setAttribute('content', `${title} - archtools.io`);

    const twDesc = document.querySelector('meta[name="twitter:description"]');
    const prevTwDesc = twDesc?.getAttribute('content') || '';
    if (twDesc) twDesc.setAttribute('content', description);

    // Add structured data (JSON-LD)
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': title,
      'description': description,
      'url': pageUrl,
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
      if (metaDescription) metaDescription.setAttribute('content', prevDescription);
      if (canonical) canonical.setAttribute('href', prevCanonical);
      if (ogUrl) ogUrl.setAttribute('content', prevOgUrl);
      if (ogTitle) ogTitle.setAttribute('content', prevOgTitle);
      if (ogDesc) ogDesc.setAttribute('content', prevOgDesc);
      if (twUrl) twUrl.setAttribute('content', prevTwUrl);
      if (twTitle) twTitle.setAttribute('content', prevTwTitle);
      if (twDesc) twDesc.setAttribute('content', prevTwDesc);
      if (scriptTag) scriptTag.remove();
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
