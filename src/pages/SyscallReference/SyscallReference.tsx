import React, { useState, useMemo, useCallback, useRef } from 'react';
import ToolPage from '../ToolPage';
import { TabSelector, Button, Tooltip } from '../../components';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import syscalls from '../../data/syscalls.json';
import './SyscallReference.css';

type SyscallCategory = 'filesystem' | 'process' | 'memory' | 'network'
  | 'signal' | 'ipc' | 'time' | 'security' | 'system' | 'misc';

interface SyscallParam {
  name: string;
  type: string;
  description: string;
}

interface Syscall {
  name: string;
  description: string;
  category: SyscallCategory;
  numbers: {
    x86_64: number | null;
    i386: number | null;
    arm64: number | null;
    riscv: number | null;
    mips_o32: number | null;
    mips_n64: number | null;
  };
  signature: string;
  returnType: string;
  returnDescription: string;
  parameters: SyscallParam[];
  deprecated: boolean;
  replacement: string | null;
  notes: string;
  relatedSyscalls: string[];
}

const CATEGORIES: { id: SyscallCategory; label: string }[] = [
  { id: 'filesystem', label: 'FS' },
  { id: 'process', label: 'Process' },
  { id: 'memory', label: 'Memory' },
  { id: 'network', label: 'Network' },
  { id: 'signal', label: 'Signal' },
  { id: 'ipc', label: 'IPC' },
  { id: 'time', label: 'Time' },
  { id: 'security', label: 'Security' },
  { id: 'system', label: 'System' },
  { id: 'misc', label: 'Misc' },
];

const CATEGORY_LABELS: Record<SyscallCategory, string> = {
  filesystem: 'File System',
  process: 'Process',
  memory: 'Memory',
  network: 'Network',
  signal: 'Signals',
  ipc: 'IPC',
  time: 'Time',
  security: 'Security',
  system: 'System',
  misc: 'Misc',
};

const archTabs = [
  { id: 'x86-64', label: 'x86-64' },
  { id: 'arm64', label: 'ARM64' },
  { id: 'riscv', label: 'RISC-V' },
  { id: 'i386', label: 'i386' },
  { id: 'mips', label: 'MIPS' },
];

const mipsAbiTabs = [
  { id: 'o32', label: 'o32' },
  { id: 'n64', label: 'n64' },
];

/* Syscall calling-convention registers per architecture (arg0 … arg5).
 * Verified against kernel entry code: the register convention is uniform
 * for ALL syscalls on a given architecture — no per-syscall exceptions. */
const SYSCALL_REGS: Record<string, { nr: string; args: string[] }> = {
  'x86-64':   { nr: 'rax',  args: ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'] },
  'i386':     { nr: 'eax',  args: ['ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp'] },
  'arm64':    { nr: 'x8',   args: ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'] },
  'riscv':    { nr: 'a7',   args: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'] },
  'mips-o32': { nr: 'v0',   args: ['a0', 'a1', 'a2', 'a3', 'stack', 'stack'] },
  'mips-n64': { nr: 'v0',   args: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'] },
};

const getRegsForArch = (arch: string, mipsAbi: string) =>
  SYSCALL_REGS[arch === 'mips' ? `mips-${mipsAbi}` : arch];

const deprecatedFilterTabs = [
  { id: 'any', label: 'Any' },
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const getSyscallNumber = (s: Syscall, arch: string, mipsAbi: string): number | null => {
  switch (arch) {
    case 'x86-64': return s.numbers.x86_64;
    case 'arm64': return s.numbers.arm64;
    case 'riscv': return s.numbers.riscv;
    case 'i386': return s.numbers.i386;
    case 'mips': return mipsAbi === 'n64' ? s.numbers.mips_n64 : s.numbers.mips_o32;
    default: return s.numbers.x86_64;
  }
};

const allSyscalls = syscalls as Syscall[];

const SyscallReference: React.FC = () => {
  const [search, setSearch] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<Set<SyscallCategory>>(new Set());
  const [deprecatedFilter, setDeprecatedFilter] = useState('any');
  const [archMode, setArchMode] = useState('x86-64');
  const [mipsAbi, setMipsAbi] = useState('o32');
  const [expandedSyscall, setExpandedSyscall] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 768px)');

  const toggleCategory = (cat: SyscallCategory) => {
    setCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allSyscalls
      .filter(s => {
        if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q) && !s.signature.toLowerCase().includes(q)) return false;
        if (categoryFilters.size > 0 && !categoryFilters.has(s.category)) return false;
        if (deprecatedFilter === 'yes' && !s.deprecated) return false;
        if (deprecatedFilter === 'no' && s.deprecated) return false;
        return true;
      })
      .sort((a, b) => {
        const numA = getSyscallNumber(a, archMode, mipsAbi);
        const numB = getSyscallNumber(b, archMode, mipsAbi);
        if (numA === null && numB === null) return a.name.localeCompare(b.name);
        if (numA === null) return 1;
        if (numB === null) return -1;
        return numA - numB;
      });
  }, [search, categoryFilters, deprecatedFilter, archMode, mipsAbi]);

  const toggleExpand = (name: string) => {
    setExpandedSyscall(prev => prev === name ? null : name);
  };

  const scrollToSyscall = useCallback((name: string) => {
    setExpandedSyscall(name);
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector(`[data-syscall="${name}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const renderCategoryBadge = (category: SyscallCategory) => (
    <Tooltip content={CATEGORY_LABELS[category]}>
      <span className={`sc__cat-badge sc__cat-badge--${category}`}>
        {CATEGORIES.find(c => c.id === category)?.label}
      </span>
    </Tooltip>
  );

  const renderDeprecatedBadge = () => (
    <Tooltip content="This syscall is deprecated. See expanded view for replacement.">
      <span className="sc__deprecated-badge">Depr</span>
    </Tooltip>
  );

  const renderFilters = () => (
    <div className="sc__filters">
      <div className="sc__filter-group sc__filter-group--category">
        <span className="sc__filter-label">Category</span>
        <div className="sc__filter-chips">
          {CATEGORIES.map(c => (
            <Button
              key={c.id}
              variant="secondary"
              size="sm"
              className={`sc__chip ${categoryFilters.has(c.id) ? 'sc__chip--active' : ''}`}
              onClick={() => toggleCategory(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="sc__filter-group sc__filter-group--deprecated">
        <span className="sc__filter-label">Deprecated</span>
        <TabSelector size="sm" tabs={deprecatedFilterTabs} activeTab={deprecatedFilter} onTabChange={setDeprecatedFilter} />
      </div>
    </div>
  );

  const renderExpandedContent = (s: Syscall) => {
    const num = getSyscallNumber(s, archMode, mipsAbi);
    const regs = getRegsForArch(archMode, mipsAbi);
    return (
      <div className="sc__expanded">
        {/* On tablet/mobile, show hidden metadata */}
        {!isDesktop && (
          <div className="sc__expanded-meta">
            {num !== null && (
              <div className="sc__expanded-meta-item">
                <span className="sc__expanded-label">#</span>
                <span className="sc__expanded-value">{num}</span>
              </div>
            )}
            {s.deprecated && (
              <div className="sc__expanded-meta-item">
                <span className="sc__deprecated-badge">Deprecated</span>
              </div>
            )}
            <div className="sc__expanded-meta-item">
              <span className="sc__expanded-label">Params</span>
              <span className="sc__expanded-value">{s.parameters.length}</span>
            </div>
          </div>
        )}

        {/* Signature */}
        <code className="sc__signature">{s.signature}</code>

        {/* Parameters */}
        {s.parameters.length > 0 && (
          <div className="sc__params">
            <span className="sc__section-label">Parameters</span>
            <div className="sc__params-table">
              {s.parameters.map((p, i) => (
                <div key={p.name} className="sc__param-row">
                  {regs && <code className="sc__param-reg">{regs.args[i]}</code>}
                  <code className="sc__param-type">{p.type}</code>
                  <code className="sc__param-name">{p.name}</code>
                  <span className="sc__param-desc">{p.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Return */}
        <div className="sc__return">
          <span className="sc__section-label">Returns: <code>{s.returnType}</code></span>
          <p className="sc__return-desc">{s.returnDescription}</p>
        </div>

        {/* Deprecated notice */}
        {s.deprecated && (
          <div className="sc__deprecated-notice">
            <span className="sc__deprecated-icon">!</span>
            <span>
              Deprecated
              {s.replacement && (
                <> — replaced by: <button className="sc__link-btn" onClick={e => { e.stopPropagation(); scrollToSyscall(s.replacement!); }}>{s.replacement}</button></>
              )}
            </span>
          </div>
        )}

        {/* Notes */}
        {s.notes && (
          <div className="sc__notes">
            <span className="sc__section-label">Notes</span>
            <p className="sc__notes-text">{s.notes}</p>
          </div>
        )}

        {/* Related syscalls */}
        {s.relatedSyscalls.length > 0 && (
          <div className="sc__related">
            <span className="sc__section-label">Related</span>
            <div className="sc__related-list">
              {s.relatedSyscalls.map(name => (
                <button
                  key={name}
                  className="sc__related-badge"
                  onClick={e => { e.stopPropagation(); scrollToSyscall(name); }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Desktop table view
  const renderDesktopTable = () => (
    <div className="sc__table-wrap">
      <table className="sc__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>#</th>
            <th>Category</th>
            <th>Depr</th>
            <th>Params</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => {
            const num = getSyscallNumber(s, archMode, mipsAbi);
            return (
              <React.Fragment key={s.name}>
                <tr
                  className={`sc__row ${expandedSyscall === s.name ? 'sc__row--expanded' : ''} ${num === null ? 'sc__row--unavailable' : ''}`}
                  onClick={() => toggleExpand(s.name)}
                  data-syscall={s.name}
                >
                  <td className="sc__name-cell">{s.name}</td>
                  <td className="sc__num-cell">{num !== null ? num : '—'}</td>
                  <td>{renderCategoryBadge(s.category)}</td>
                  <td className="sc__icon-cell">{s.deprecated && renderDeprecatedBadge()}</td>
                  <td className="sc__param-count-cell">{s.parameters.length}</td>
                  <td className="sc__desc-cell">{s.description}</td>
                </tr>
                {expandedSyscall === s.name && (
                  <tr className="sc__expanded-tr">
                    <td colSpan={6}>{renderExpandedContent(s)}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // Tablet table view
  const renderTabletTable = () => (
    <div className="sc__table-wrap">
      <table className="sc__table sc__table--tablet">
        <thead>
          <tr>
            <th>Name</th>
            <th>#</th>
            <th>Category</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => {
            const num = getSyscallNumber(s, archMode, mipsAbi);
            return (
              <React.Fragment key={s.name}>
                <tr
                  className={`sc__row ${expandedSyscall === s.name ? 'sc__row--expanded' : ''} ${num === null ? 'sc__row--unavailable' : ''}`}
                  onClick={() => toggleExpand(s.name)}
                  data-syscall={s.name}
                >
                  <td className="sc__name-cell">{s.name}</td>
                  <td className="sc__num-cell">{num !== null ? num : '—'}</td>
                  <td>{renderCategoryBadge(s.category)}</td>
                  <td className="sc__desc-cell">{s.description}</td>
                </tr>
                {expandedSyscall === s.name && (
                  <tr className="sc__expanded-tr">
                    <td colSpan={4}>{renderExpandedContent(s)}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // Mobile card list
  const renderMobileCards = () => (
    <div className="sc__cards">
      {filtered.map(s => {
        const num = getSyscallNumber(s, archMode, mipsAbi);
        return (
          <div
            key={s.name}
            className={`sc__card sc__card--${s.category} ${expandedSyscall === s.name ? 'sc__card--expanded' : ''} ${num === null ? 'sc__card--unavailable' : ''}`}
            onClick={() => toggleExpand(s.name)}
            data-syscall={s.name}
          >
            <div className="sc__card-header">
              {renderCategoryBadge(s.category)}
              <span className="sc__card-name">{s.name}</span>
              {num !== null && <span className="sc__card-number">#{num}</span>}
              {num === null && <span className="sc__card-number sc__card-number--na">—</span>}
              {s.deprecated && <span className="sc__deprecated-badge">Depr</span>}
            </div>
            <p className="sc__card-desc">{s.description}</p>
            {expandedSyscall === s.name && renderExpandedContent(s)}
          </div>
        );
      })}
    </div>
  );

  return (
    <ToolPage
      title="Linux Syscalls Reference"
      description="Interactive Linux system call reference. Browse ~470 syscalls with per-architecture numbers, parameters, return types, and educational notes for x86-64, ARM64, RISC-V, i386, and MIPS."
      keywords={[
        'linux syscalls',
        'system calls',
        'syscall table',
        'syscall reference',
        'x86-64 syscalls',
        'arm64 syscalls',
        'risc-v syscalls',
        'mips syscalls',
        'syscall numbers',
        'linux kernel',
        'system call interface',
        'syscall parameters',
      ]}
    >
      <div className="sc" ref={tableRef}>
        {/* Architecture tabs */}
        <div className="sc__arch-bar">
          <TabSelector size="sm" tabs={archTabs} activeTab={archMode} onTabChange={setArchMode} />
          {archMode === 'mips' && (
            <div className="sc__mips-abi">
              <TabSelector size="sm" tabs={mipsAbiTabs} activeTab={mipsAbi} onTabChange={setMipsAbi} />
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="sc__toolbar">
          <input
            type="text"
            className="sc__search"
            placeholder="Search syscalls..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {!isDesktop && (
            <Button
              variant={isTablet ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterDrawerOpen(!filterDrawerOpen)}
              className="sc__filter-trigger"
            >
              {isTablet ? 'Filter ▾' : '⚙ Filter'}
            </Button>
          )}
        </div>

        {/* Desktop filters inline */}
        {isDesktop && renderFilters()}

        {/* Tablet/Mobile filter drawer */}
        {!isDesktop && filterDrawerOpen && (
          <>
            <div className="sc__drawer-backdrop" onClick={() => setFilterDrawerOpen(false)} />
            <div className="sc__drawer">
              <div className="sc__drawer-header">
                <span className="sc__drawer-title">Filters</span>
                <Button variant="ghost" size="sm" onClick={() => setFilterDrawerOpen(false)}>✕</Button>
              </div>
              {renderFilters()}
            </div>
          </>
        )}

        {/* Count */}
        <div className="sc__count">
          Showing {filtered.length} of {allSyscalls.length} syscalls
        </div>

        {/* Content */}
        {isDesktop && renderDesktopTable()}
        {!isDesktop && isTablet && renderTabletTable()}
        {!isTablet && renderMobileCards()}
      </div>
    </ToolPage>
  );
};

export default SyscallReference;
