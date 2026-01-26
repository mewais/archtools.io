import React, { useState, useEffect } from 'react';
import { HeartIcon, CloseIcon } from '../Icons';
import Button from '../Button';
import './AdBlockDetector.css';

const AdBlockDetector: React.FC = () => {
  const [adBlockDetected, setAdBlockDetected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed
    const wasDismissed = localStorage.getItem('archtools-support-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    // Simple ad-block detection
    const detectAdBlock = async () => {
      try {
        // Create a bait element that ad blockers typically block
        const bait = document.createElement('div');
        bait.className = 'ad ads adsbox ad-banner ad-wrapper';
        bait.style.cssText = 'position: absolute; top: -1px; left: -1px; width: 1px; height: 1px;';
        document.body.appendChild(bait);

        // Wait a moment for ad blockers to act
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if the element was hidden/removed
        const isBlocked = bait.offsetHeight === 0 ||
                          bait.offsetParent === null ||
                          getComputedStyle(bait).display === 'none';

        document.body.removeChild(bait);
        setAdBlockDetected(isBlocked);
      } catch {
        // If detection fails, don't show the banner
        setAdBlockDetected(false);
      }
    };

    detectAdBlock();
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('archtools-support-dismissed', 'true');
  };

  const handleSupport = () => {
    window.open('https://ko-fi.com/archtools', '_blank');
  };

  if (!adBlockDetected || dismissed) {
    return null;
  }

  return (
    <div className="adblock-banner">
      <div className="adblock-banner__content">
        <div className="adblock-banner__icon">
          <HeartIcon size={24} />
        </div>
        <div className="adblock-banner__text">
          <p className="adblock-banner__title">Enjoying these free tools?</p>
          <p className="adblock-banner__description">
            We noticed you're using an ad blocker (no judgment!). If you find these tools useful,
            consider supporting the project to help keep it free and maintained.
          </p>
        </div>
        <div className="adblock-banner__actions">
          <Button variant="primary" size="sm" onClick={handleSupport}>
            Support Project
          </Button>
          <button
            className="adblock-banner__dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdBlockDetector;
