import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Header, Footer, AdBlockDetector, PageLayout } from './components';
import {
  Home,
  HexInt,
  HexFloat,
  HexViewer,
  BitwiseCalc,
  CRCCalc,
  AmdahlsLaw,
  BandwidthCalc,
  FLOPSCalc,
  CacheConfig,
  ISAReference,
  Simulator,
  SignalReference,
  ABIReference,
  SyscallReference,
  NotFound,
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

        <PageLayout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/hex-int" element={<HexInt />} />
            <Route path="/hex-float" element={<HexFloat />} />
            <Route path="/hex-viewer" element={<HexViewer />} />
            <Route path="/bitwise-calc" element={<BitwiseCalc />} />
            <Route path="/crc-calc" element={<CRCCalc />} />
            <Route path="/amdahls-law" element={<AmdahlsLaw />} />
            <Route path="/bandwidth-calc" element={<BandwidthCalc />} />
            <Route path="/flops-calc" element={<FLOPSCalc />} />
            <Route path="/cache-config" element={<CacheConfig />} />
            <Route path="/isa-reference" element={<ISAReference />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/signal-reference" element={<SignalReference />} />
            <Route path="/abi-reference" element={<ABIReference />} />
            <Route path="/syscalls-reference" element={<SyscallReference />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageLayout>

        <Footer />
        <AdBlockDetector />
      </div>
    </Router>
  );
}

export default App;
