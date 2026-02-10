import React, { useState, useMemo } from 'react';
import ToolPage from '../ToolPage';
import { TabSelector, Button, Tooltip } from '../../components';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import signals from '../../data/signals.json';
import './SignalReference.css';

type Action = 'Term' | 'Core' | 'Ign' | 'Stop' | 'Cont';
type Category = 'process' | 'terminal' | 'error' | 'timer' | 'io' | 'user' | 'realtime';

interface Signal {
  name: string;
  number: number;
  mipsNumber: number;
  action: Action;
  catchable: boolean;
  blockable: boolean;
  posix: boolean;
  description: string;
  usage: string;
  category: Category;
}

const ACTIONS: Action[] = ['Term', 'Core', 'Ign', 'Stop', 'Cont'];
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'process', label: 'Process' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'error', label: 'Error' },
  { id: 'timer', label: 'Timer' },
  { id: 'io', label: 'I/O' },
  { id: 'user', label: 'User' },
  { id: 'realtime', label: 'RT' },
];

const ACTION_TOOLTIPS: Record<Action, string> = {
  Term: 'Terminate: Process is killed without a core dump',
  Core: 'Core dump: Process is killed and a core dump is generated',
  Ign: 'Ignore: Signal is silently discarded by default',
  Stop: 'Stop: Process is suspended (frozen)',
  Cont: 'Continue: Resumes a stopped process',
};

const archTabs = [
  { id: 'x86-64', label: 'x86-64' },
  { id: 'arm64', label: 'ARM64' },
  { id: 'riscv', label: 'RISC-V' },
  { id: 'i386', label: 'i386' },
  { id: 'mips', label: 'MIPS' },
];

const catchFilterTabs = [
  { id: 'any', label: 'Any' },
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const CheckIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3 3 7-7" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const getSignalNumber = (s: Signal, arch: string): number =>
  arch === 'mips' ? s.mipsNumber : s.number;

const SignalReference: React.FC = () => {
  const [search, setSearch] = useState('');
  const [actionFilters, setActionFilters] = useState<Set<Action>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<Category>>(new Set());
  const [catchFilter, setCatchFilter] = useState('any');
  const [blockFilter, setBlockFilter] = useState('any');
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [archMode, setArchMode] = useState('x86-64');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 768px)');

  const toggleAction = (action: Action) => {
    setActionFilters(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  };

  const toggleCategory = (cat: Category) => {
    setCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (signals as Signal[]).filter(s => {
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q) && !s.usage.toLowerCase().includes(q)) return false;
      if (actionFilters.size > 0 && !actionFilters.has(s.action)) return false;
      if (categoryFilters.size > 0 && !categoryFilters.has(s.category)) return false;
      if (catchFilter === 'yes' && !s.catchable) return false;
      if (catchFilter === 'no' && s.catchable) return false;
      if (blockFilter === 'yes' && !s.blockable) return false;
      if (blockFilter === 'no' && s.blockable) return false;
      return true;
    });
  }, [search, actionFilters, categoryFilters, catchFilter, blockFilter]);

  const toggleExpand = (name: string) => {
    setExpandedSignal(prev => prev === name ? null : name);
  };

  const renderActionBadge = (action: Action) => (
    <Tooltip content={ACTION_TOOLTIPS[action]}>
      <span className={`sig__action-badge sig__action-badge--${action.toLowerCase()}`}>
        {action}
      </span>
    </Tooltip>
  );

  const renderFilters = () => (
    <div className="sig__filters">
      <div className="sig__filter-group">
        <span className="sig__filter-label">Action</span>
        <div className="sig__filter-chips">
          {ACTIONS.map(a => (
            <Button
              key={a}
              variant="secondary"
              size="sm"
              className={`sig__chip ${actionFilters.has(a) ? 'sig__chip--active' : ''}`}
              onClick={() => toggleAction(a)}
            >
              {a}
            </Button>
          ))}
        </div>
      </div>
      <div className="sig__filter-group">
        <span className="sig__filter-label">Category</span>
        <div className="sig__filter-chips">
          {CATEGORIES.map(c => (
            <Button
              key={c.id}
              variant="secondary"
              size="sm"
              className={`sig__chip ${categoryFilters.has(c.id) ? 'sig__chip--active' : ''}`}
              onClick={() => toggleCategory(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="sig__filter-group">
        <span className="sig__filter-label">Catchable</span>
        <TabSelector size="sm" tabs={catchFilterTabs} activeTab={catchFilter} onTabChange={setCatchFilter} />
      </div>
      <div className="sig__filter-group">
        <span className="sig__filter-label">Blockable</span>
        <TabSelector size="sm" tabs={catchFilterTabs} activeTab={blockFilter} onTabChange={setBlockFilter} />
      </div>
    </div>
  );

  const renderExpandedContent = (s: Signal) => (
    <div className="sig__expanded">
      {!isDesktop && (
        <div className="sig__expanded-meta">
          {s.number !== s.mipsNumber && (
            <div className="sig__expanded-row">
              <span className="sig__expanded-label">{archMode === 'mips' ? 'Standard #' : 'MIPS #'}</span>
              <span className="sig__expanded-value">{archMode === 'mips' ? s.number : s.mipsNumber}</span>
            </div>
          )}
          <div className="sig__expanded-row">
            <span className="sig__expanded-label">Catchable</span>
            <span className="sig__expanded-value">{s.catchable ? <CheckIcon /> : <XIcon />}</span>
          </div>
          <div className="sig__expanded-row">
            <span className="sig__expanded-label">Blockable</span>
            <span className="sig__expanded-value">{s.blockable ? <CheckIcon /> : <XIcon />}</span>
          </div>
          <div className="sig__expanded-row">
            <span className="sig__expanded-label">POSIX</span>
            <span className="sig__expanded-value">{s.posix ? <CheckIcon /> : <XIcon />}</span>
          </div>
        </div>
      )}
      <p className="sig__expanded-usage">{s.usage}</p>
    </div>
  );

  // Desktop table view
  const renderDesktopTable = () => (
    <div className="sig__table-wrap">
    <table className="sig__table">
      <thead>
        <tr>
          <th>Signal</th>
          <th>#</th>
          <th>Action</th>
          <th>Catch</th>
          <th>Block</th>
          <th>POSIX</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(s => (
          <React.Fragment key={s.name}>
            <tr
              className={`sig__row ${expandedSignal === s.name ? 'sig__row--expanded' : ''}`}
              onClick={() => toggleExpand(s.name)}
            >
              <td className="sig__name-cell">{s.name}</td>
              <td>{getSignalNumber(s, archMode)}</td>
              <td>{renderActionBadge(s.action)}</td>
              <td className="sig__icon-cell">{s.catchable ? <CheckIcon /> : <XIcon />}</td>
              <td className="sig__icon-cell">{s.blockable ? <CheckIcon /> : <XIcon />}</td>
              <td className="sig__icon-cell">{s.posix ? <CheckIcon /> : <XIcon />}</td>
              <td className="sig__desc-cell">{s.description}</td>
            </tr>
            {expandedSignal === s.name && (
              <tr className="sig__expanded-row">
                <td colSpan={7}>{renderExpandedContent(s)}</td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
    </div>
  );

  // Tablet table view
  const renderTabletTable = () => (
    <div className="sig__table-wrap">
    <table className="sig__table sig__table--tablet">
      <thead>
        <tr>
          <th>Signal</th>
          <th>#</th>
          <th>Action</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(s => (
          <React.Fragment key={s.name}>
            <tr
              className={`sig__row ${expandedSignal === s.name ? 'sig__row--expanded' : ''}`}
              onClick={() => toggleExpand(s.name)}
            >
              <td className="sig__name-cell">{s.name}</td>
              <td>{getSignalNumber(s, archMode)}</td>
              <td>{renderActionBadge(s.action)}</td>
              <td className="sig__desc-cell">{s.description}</td>
            </tr>
            {expandedSignal === s.name && (
              <tr className="sig__expanded-row">
                <td colSpan={4}>{renderExpandedContent(s)}</td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
    </div>
  );

  // Mobile card list
  const renderMobileCards = () => (
    <div className="sig__cards">
      {filtered.map(s => (
        <div
          key={s.name}
          className={`sig__card sig__card--${s.action.toLowerCase()} ${expandedSignal === s.name ? 'sig__card--expanded' : ''}`}
          onClick={() => toggleExpand(s.name)}
        >
          <div className="sig__card-header">
            <span className="sig__card-name">{s.name}</span>
            <span className="sig__card-number">{getSignalNumber(s, archMode)}</span>
            {renderActionBadge(s.action)}
          </div>
          <p className="sig__card-desc">{s.description}</p>
          {expandedSignal === s.name && renderExpandedContent(s)}
        </div>
      ))}
    </div>
  );

  return (
    <ToolPage
      title="Signal Reference"
      description="Interactive Unix/Linux signal reference. Browse all 31 standard signals and real-time signals with numbers, default actions, and detailed usage notes."
      keywords={[
        'unix signals',
        'linux signals',
        'signal reference',
        'POSIX signals',
        'SIGKILL',
        'SIGTERM',
        'SIGSEGV',
        'signal numbers',
        'signal handler',
        'kill signal',
        'signal table',
        'MIPS signals',
        'real-time signals',
      ]}
    >
      <div className="sig">
        {/* Architecture tabs */}
        <div className="sig__arch-bar">
          <TabSelector size="sm" tabs={archTabs} activeTab={archMode} onTabChange={setArchMode} />
        </div>

        {/* Search bar */}
        <div className="sig__toolbar">
          <input
            type="text"
            className="sig__search"
            placeholder="Search signals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {!isDesktop && (
            <Button
              variant={isTablet ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterDrawerOpen(!filterDrawerOpen)}
              className="sig__filter-trigger"
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
            <div className="sig__drawer-backdrop" onClick={() => setFilterDrawerOpen(false)} />
            <div className="sig__drawer">
              <div className="sig__drawer-header">
                <span className="sig__drawer-title">Filters</span>
                <Button variant="ghost" size="sm" onClick={() => setFilterDrawerOpen(false)}>✕</Button>
              </div>
              {renderFilters()}
            </div>
          </>
        )}

        {/* Count */}
        <div className="sig__count">
          Showing {filtered.length} of {(signals as Signal[]).length} signals
        </div>

        {/* Content */}
        {isDesktop && renderDesktopTable()}
        {!isDesktop && isTablet && renderTabletTable()}
        {!isTablet && renderMobileCards()}
      </div>
    </ToolPage>
  );
};

export default SignalReference;
