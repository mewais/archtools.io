import React from 'react';
import AdUnit from '../AdUnit';
import { AD_SLOTS } from '../../config/adsense';
import './PageLayout.css';

interface PageLayoutProps {
  children: React.ReactNode;
  showMobileBanner?: boolean;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  showMobileBanner = true,
}) => {
  return (
    <div className="page-layout">
      <aside className="page-layout__sidebar page-layout__sidebar--left">
        <div className="page-layout__ad-sticky">
          <AdUnit slot={AD_SLOTS.leftSidebar} format="vertical" />
        </div>
      </aside>

      <main className="page-layout__content">
        {children}
      </main>

      <aside className="page-layout__sidebar page-layout__sidebar--right">
        <div className="page-layout__ad-sticky">
          <AdUnit slot={AD_SLOTS.rightSidebar} format="vertical" />
        </div>
      </aside>

      {showMobileBanner && (
        <div className="page-layout__mobile-banner">
          <AdUnit slot={AD_SLOTS.mobileBanner} format="horizontal" />
        </div>
      )}
    </div>
  );
};

export default PageLayout;
