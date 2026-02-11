import React from 'react';
import { Card } from '../../components';
import { HexIcon, FloatIcon, BinaryViewerIcon, BitwiseIcon, ChecksumIcon, CacheIcon, SpeedupIcon, BandwidthIcon, FLOPSIcon, BookIcon, PlayIcon, SignalIcon, ABIIcon, SyscallIcon } from '../../components/Icons';
import './Home.css';

const tools = {
  numerical: [
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
      title: 'Hex Viewer & Diff',
      description: 'View binary files as hex, integers, floats, or ASCII. Convert formats, swap endianness, diff files.',
      href: '/hex-viewer',
      icon: <BinaryViewerIcon size={28} />,
      tags: ['hex dump', 'binary', 'endian', 'diff'],
    },
    {
      id: 'bitwise-calc',
      title: 'Bitwise Calculator',
      description: 'Perform AND, OR, XOR, NOT, shifts, and rotations. Visualize bit manipulation in binary and hex.',
      href: '/bitwise-calc',
      icon: <BitwiseIcon size={28} />,
      tags: ['AND', 'OR', 'XOR', 'shift'],
    },
    {
      id: 'crc-calc',
      title: 'CRC & Checksum Calculator',
      description: 'Compute CRC32, CRC16, CRC8, MD5, SHA-256, and more. Supports text, hex, and custom polynomials.',
      href: '/crc-calc',
      icon: <ChecksumIcon size={28} />,
      tags: ['CRC32', 'checksum', 'hash'],
    },
  ],
  architecture: [
    {
      id: 'amdahls-law',
      title: "Amdahl's Law Calculator",
      description: "Calculate theoretical speedup from parallelization. Visualize diminishing returns and efficiency.",
      href: '/amdahls-law',
      icon: <SpeedupIcon size={28} />,
      tags: ['speedup', 'parallel', 'performance'],
    },
    {
      id: 'flops-calc',
      title: 'FLOPS Calculator',
      description: 'Compute peak floating-point performance from cores, clock, FP units, and vector width.',
      href: '/flops-calc',
      icon: <FLOPSIcon size={28} />,
      tags: ['GFLOPS', 'TFLOPS', 'performance'],
    },
    {
      id: 'cache-config',
      title: 'Cache Configuration',
      description: 'Calculate cache parameters: tag bits, index bits, offset bits, total size, and more.',
      href: '/cache-config',
      icon: <CacheIcon size={28} />,
      tags: ['cache', 'memory', 'architecture'],
    },
    {
      id: 'bandwidth-calc',
      title: 'Memory Bandwidth Calculator',
      description: 'Compute peak memory bandwidth from clock, bus width, channels, and DDR rate. Supports DDR4/5, HBM, GDDR.',
      href: '/bandwidth-calc',
      icon: <BandwidthIcon size={28} />,
      tags: ['DDR5', 'HBM', 'bandwidth'],
    },
  ],
  system: [
    {
      id: 'signal-reference',
      title: 'Signal Reference',
      description: 'Interactive Unix/Linux signal reference. Browse all standard signals with numbers, default actions, and usage notes.',
      href: '/signal-reference',
      icon: <SignalIcon size={28} />,
      tags: ['POSIX', 'signals', 'Linux'],
    },
    {
      id: 'abi-reference',
      title: 'ABI / Calling Convention',
      description: 'Compare calling conventions across x86-64, AArch64, RISC-V, and i386. Register roles, argument passing, and stack rules.',
      href: '/abi-reference',
      icon: <ABIIcon size={28} />,
      tags: ['ABI', 'registers', 'calling convention'],
    },
    {
      id: 'syscalls-reference',
      title: 'Linux Syscalls Reference',
      description: 'Browse ~470 Linux system calls with per-architecture numbers, parameters, and notes for x86-64, ARM64, RISC-V, i386, and MIPS.',
      href: '/syscalls-reference',
      icon: <SyscallIcon size={28} />,
      tags: ['syscalls', 'Linux', 'kernel'],
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

      {/* Numerical Tools */}
      <section className="home__section">
        <div className="home__section-header">
          <h2 className="home__section-title">Numerical Tools</h2>
          <p className="home__section-description">
            Convert, visualize, and manipulate numbers, hex, floats, and binary data
          </p>
        </div>
        <div className="home__grid">
          {tools.numerical.map((tool) => (
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

      {/* Architecture Tools */}
      <section className="home__section">
        <div className="home__section-header">
          <h2 className="home__section-title">Architecture Tools</h2>
          <p className="home__section-description">
            Cache configuration, performance analysis, and system design utilities
          </p>
        </div>
        <div className="home__grid">
          {tools.architecture.map((tool) => (
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

      {/* System Tools */}
      <section className="home__section">
        <div className="home__section-header">
          <h2 className="home__section-title">System Tools</h2>
          <p className="home__section-description">
            Signal references, ABI conventions, and system-level programming utilities
          </p>
        </div>
        <div className="home__grid">
          {tools.system.map((tool) => (
            <Card
              key={tool.id}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
              href={tool.href}
              category="system"
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
            Instruction set reference and assembly simulator for RISC-V
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


    </main>
  );
};

export default Home;
