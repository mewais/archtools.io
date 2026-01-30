import React from 'react';
import { Card } from '../../components';
import { HexIcon, FloatIcon, BinaryViewerIcon, SwapIcon, CacheIcon, BookIcon, PlayIcon } from '../../components/Icons';
import './Home.css';

const tools = {
  general: [
    {
      id: 'hex-int',
      title: 'Hex-Integer Converter',
      description: 'Convert between hexadecimal and decimal integers. Supports signed/unsigned, different bit widths.',
      href: '/hex-int',
      icon: <HexIcon size={28} />,
      tags: ['hex', 'decimal', 'binary'],
    },
    {
      id: 'hex-float',
      title: 'Hex-Float Converter',
      description: 'Convert between hex and floating-point. Supports FP64, FP32, FP16, BF16, FP8 (E4M3, E5M2), and more.',
      href: '/hex-float',
      icon: <FloatIcon size={28} />,
      tags: ['IEEE 754', 'float', 'half', 'bfloat16'],
    },
    {
      id: 'hex-viewer',
      title: 'Hex Viewer & Converter',
      description: 'View binary files as hex, integers, floats, or ASCII. Convert formats, swap endianness, diff files.',
      href: '/hex-viewer',
      icon: <BinaryViewerIcon size={28} />,
      tags: ['hex dump', 'binary', 'endian', 'diff'],
    },
    {
      id: 'endian',
      title: 'Endian Swapper',
      description: 'Swap byte order between big-endian and little-endian. Visualize byte arrangement.',
      href: '/endian',
      icon: <SwapIcon size={28} />,
      tags: ['little-endian', 'big-endian', 'byte order'],
    },
    {
      id: 'cache-config',
      title: 'Cache Configuration',
      description: 'Calculate cache parameters: tag bits, index bits, offset bits, total size, and more.',
      href: '/cache-config',
      icon: <CacheIcon size={28} />,
      tags: ['cache', 'memory', 'architecture'],
    },
  ],
  riscv: [
    {
      id: 'isa-reference',
      title: 'ISA Reference',
      description: 'Interactive RISC-V instruction set reference. Browse 350+ instructions across all extensions.',
      href: '/isa-reference',
      icon: <BookIcon size={28} />,
      tags: ['RISC-V', 'instructions', 'encoding'],
    },
    {
      id: 'simulator',
      title: 'Functional Simulator',
      description: 'Step-by-step RISC-V assembly execution with real-time register and memory visualization.',
      href: '/simulator',
      icon: <PlayIcon size={28} />,
      tags: ['RISC-V', 'assembly', 'debugger'],
    },
  ],
};

const Home: React.FC = () => {
  return (
    <main className="home">
      {/* Hero Section */}
      <section className="home__hero">
        <div className="home__hero-content">
          <h1 className="home__title">
            Developer tools that{' '}
            <span className="home__title-accent">just work</span>
          </h1>
          <p className="home__subtitle">
            Free, fast, and no-nonsense utilities for programmers and computer architects.
          </p>
        </div>
        <div className="home__hero-decoration" aria-hidden="true">
          <div className="home__hero-grid">
            {Array.from({ length: 64 }).map((_, i) => (
              <div key={i} className="home__hero-cell" style={{ animationDelay: `${i * 0.02}s` }} />
            ))}
          </div>
        </div>
      </section>

      {/* General Tools */}
      <section className="home__section">
        <div className="home__section-header">
          <h2 className="home__section-title">General Tools</h2>
          <p className="home__section-description">
            Everyday utilities for working with numbers, memory, and data representation
          </p>
        </div>
        <div className="home__grid">
          {tools.general.map((tool) => (
            <Card
              key={tool.id}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
              href={tool.href}
              category="general"
              tags={tool.tags}
            />
          ))}
        </div>
      </section>

      {/* RISC-V Tools */}
      <section className="home__section">
        <div className="home__section-header">
          <h2 className="home__section-title">RISC-V Tools</h2>
          <p className="home__section-description">
            Specialized tools for RISC-V development and computer architecture education
          </p>
        </div>
        <div className="home__grid">
          {tools.riscv.map((tool) => (
            <Card
              key={tool.id}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
              href={tool.href}
              category="riscv"
              tags={tool.tags}
            />
          ))}
        </div>
      </section>

      {/* Coming Soon Teaser */}
      <section className="home__section home__section--muted">
        <div className="home__coming-soon">
          <h3>More tools coming soon</h3>
          <p>
            GEMM visualizer, instruction encoders, pipeline diagrams, and more.
            <br />
            <a href="https://github.com/archtools" target="_blank" rel="noopener noreferrer">
              Follow us on GitHub
            </a>
            {' '}to stay updated.
          </p>
        </div>
      </section>
    </main>
  );
};

export default Home;
