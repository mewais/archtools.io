import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Header, Footer, AdBlockDetector } from './components';
import {
  Home,
  HexInt,
  HexFloat,
  HexViewer,
  Endian,
  CacheConfig,
  ISAReference,
  Simulator,
} from './pages';
import type { Theme } from './types';
import './styles/theme.css';
import './App.css';

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first
    const saved = localStorage.getItem('archtools-theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    // Fall back to system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('archtools-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <Router>
      <div className="app">
        <Header theme={theme} onThemeToggle={toggleTheme} />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/hex-int" element={<HexInt />} />
          <Route path="/hex-float" element={<HexFloat />} />
          <Route path="/hex-viewer" element={<HexViewer />} />
          <Route path="/endian" element={<Endian />} />
          <Route path="/cache-config" element={<CacheConfig />} />
          <Route path="/isa-reference" element={<ISAReference />} />
          <Route path="/simulator" element={<Simulator />} />
        </Routes>

        <Footer />
        <AdBlockDetector />
      </div>
    </Router>
  );
}

export default App;
