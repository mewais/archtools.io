import React, { useState, useMemo, useEffect } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import './CacheConfig.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type IndexingMode = 'vivt' | 'vipt' | 'pipt' | 'pivt';
type ReplacementPolicy = 'lru' | 'plru' | 'fifo' | 'random' | 'nru';
type WritePolicy = 'write-back' | 'write-through';

interface CacheDerived {
  totalLines: number;
  effectiveAssoc: number;
  totalSets: number;
  setsPerBank: number;
  offsetBits: number;
  bankBits: number;
  indexBits: number;
  tagBits: number;
  pageOffsetBits: number;
  // Physical size
  dirtyBit: number;
  replBitsPerLine: number;
  replBitsPerSetShared: number;
  metaBitsPerLine: number;
  dataBitsPerLine: number;
  totalPhysicalBits: number;
  overheadPct: number;
  // VM
  viptSafe: boolean;
  aliasingBits: number;
  valid: boolean;
  error: string | null;
}

interface AddressFields {
  tag: bigint;
  index: bigint;
  bank: bigint;
  offset: bigint;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CACHE_SIZE_OPTIONS = [
  256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536,
  131072, 262144, 524288, 1048576, 2097152, 4194304,
  8388608, 16777216, 33554432, 67108864,
];

const ASSOC_OPTIONS = [1, 2, 4, 8, 16, 32, -1];
const LINE_SIZE_OPTIONS = [8, 16, 32, 64, 128, 256, 512];
const BANK_OPTIONS = [1, 2, 4, 8, 16];
const ADDRESS_WIDTH_OPTIONS = [32, 39, 48, 57, 64];

const PAGE_SIZE_OPTIONS = [
  { value: 4096, label: '4 KB' },
  { value: 65536, label: '64 KB' },
  { value: 2097152, label: '2 MB' },
  { value: 1073741824, label: '1 GB' },
];

const REPL_OPTIONS: { value: ReplacementPolicy; label: string }[] = [
  { value: 'lru', label: 'LRU' },
  { value: 'plru', label: 'Pseudo-LRU (Tree)' },
  { value: 'fifo', label: 'FIFO' },
  { value: 'random', label: 'Random' },
  { value: 'nru', label: 'NRU' },
];

const FIELD_COLORS: Record<string, string> = {
  tag: 'var(--cache-color-tag)',
  index: 'var(--cache-color-index)',
  bank: 'var(--cache-color-bank)',
  offset: 'var(--cache-color-offset)',
};

const MAX_VISIBLE_SETS = 16;
const MAX_VISIBLE_WAYS = 16;

// ─── Pure Functions ──────────────────────────────────────────────────────────

const log2Int = (n: number): number => {
  if (n <= 0 || (n & (n - 1)) !== 0) return 0;
  return Math.log2(n);
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1073741824) return `${bytes / 1073741824} GB`;
  if (bytes >= 1048576) return `${bytes / 1048576} MB`;
  if (bytes >= 1024) return `${bytes / 1024} KB`;
  return `${bytes} B`;
};

const formatBits = (bits: number): string => {
  const bytes = bits / 8;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes.toFixed(0)} B`;
};

const computeReplBitsPerLine = (policy: ReplacementPolicy, ways: number): number => {
  if (ways <= 1) return 0;
  switch (policy) {
    case 'lru': return Math.ceil(Math.log2(ways));
    case 'nru': return 1;
    default: return 0;
  }
};

const computeReplBitsPerSetShared = (policy: ReplacementPolicy, ways: number): number => {
  if (ways <= 1) return 0;
  switch (policy) {
    case 'plru': return ways - 1;
    case 'fifo': return Math.ceil(Math.log2(ways));
    default: return 0;
  }
};

const derive = (
  cacheSize: number, assoc: number, lineSize: number,
  banks: number, addrWidth: number, pageSize: number,
  replPolicy: ReplacementPolicy, writePolicy: WritePolicy,
): CacheDerived => {
  const totalLines = cacheSize / lineSize;
  const effectiveAssoc = assoc === -1 ? totalLines : assoc;
  const pageOffsetBits = log2Int(pageSize);

  const fail = (error: string): CacheDerived => ({
    totalLines, effectiveAssoc, totalSets: 0, setsPerBank: 0,
    offsetBits: 0, bankBits: 0, indexBits: 0, tagBits: 0,
    pageOffsetBits, dirtyBit: 0,
    replBitsPerLine: 0, replBitsPerSetShared: 0,
    metaBitsPerLine: 0, dataBitsPerLine: 0,
    totalPhysicalBits: 0, overheadPct: 0,
    viptSafe: false, aliasingBits: 0, valid: false, error,
  });

  if (effectiveAssoc > totalLines) return fail('Associativity exceeds total cache lines');

  const totalSets = totalLines / effectiveAssoc;
  if (!Number.isInteger(totalSets)) return fail('Invalid configuration');

  const effectiveBanks = assoc === -1 ? 1 : banks;
  if (effectiveBanks > totalSets) return fail('Banks exceed total sets');
  if (totalSets % effectiveBanks !== 0) return fail('Sets not divisible by banks');

  const setsPerBank = totalSets / effectiveBanks;
  const offsetBits = log2Int(lineSize);
  const bankBits = log2Int(effectiveBanks);
  const indexBits = setsPerBank > 1 ? log2Int(setsPerBank) : 0;
  const tagBits = addrWidth - indexBits - bankBits - offsetBits;

  if (tagBits < 1) return fail('Address too narrow for this configuration');

  // VM analysis
  const bitsUsedForIndex = offsetBits + bankBits + indexBits;
  const viptSafe = bitsUsedForIndex <= pageOffsetBits;
  const aliasingBits = Math.max(0, bitsUsedForIndex - pageOffsetBits);

  // Physical size
  const dirtyBit = writePolicy === 'write-back' ? 1 : 0;
  const replBitsPerLine = computeReplBitsPerLine(replPolicy, effectiveAssoc);
  const replBitsPerSetShared = computeReplBitsPerSetShared(replPolicy, effectiveAssoc);
  const metaBitsPerLine = 1 + dirtyBit + replBitsPerLine + tagBits; // valid + dirty + repl + tag
  const dataBitsPerLine = lineSize * 8;
  const bitsPerLine = metaBitsPerLine + dataBitsPerLine;
  const totalDataBits = totalLines * dataBitsPerLine;
  const totalPhysicalBits = totalSets * (effectiveAssoc * bitsPerLine + replBitsPerSetShared);
  const overheadPct = totalDataBits > 0
    ? ((totalPhysicalBits - totalDataBits) / totalPhysicalBits) * 100 : 0;

  return {
    totalLines, effectiveAssoc, totalSets, setsPerBank,
    offsetBits, bankBits, indexBits, tagBits,
    pageOffsetBits, dirtyBit,
    replBitsPerLine, replBitsPerSetShared,
    metaBitsPerLine, dataBitsPerLine,
    totalPhysicalBits, overheadPct,
    viptSafe, aliasingBits, valid: true, error: null,
  };
};

const parseAddress = (hex: string, addrWidth: number): bigint | null => {
  const cleaned = hex.replace(/^0x/i, '').replace(/[\s_]/g, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || !cleaned) return null;
  try {
    const v = BigInt('0x' + cleaned);
    if (v > (1n << BigInt(addrWidth)) - 1n) return null;
    return v;
  } catch { return null; }
};

const extractBits = (addr: bigint, start: number, count: number): bigint => {
  if (count <= 0) return 0n;
  return (addr >> BigInt(start)) & ((1n << BigInt(count)) - 1n);
};

const fmtHex = (v: bigint, bits: number): string => {
  const digits = Math.max(1, Math.ceil(bits / 4));
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
};

const copyText = (text: string) => navigator.clipboard.writeText(text);

// ─── Component ───────────────────────────────────────────────────────────────

const CacheConfig: React.FC = () => {
  const [cacheSize, setCacheSize] = useState(32768);
  const [assoc, setAssoc] = useState(8);
  const [lineSize, setLineSize] = useState(64);
  const [banks, setBanks] = useState(1);
  const [addrWidth, setAddrWidth] = useState(64);
  const [pageSize, setPageSize] = useState(4096);
  const [mode, setMode] = useState<IndexingMode>('vipt');
  const [replPolicy, setReplPolicy] = useState<ReplacementPolicy>('lru');
  const [writePolicy, setWritePolicy] = useState<WritePolicy>('write-back');
  const [addrHex, setAddrHex] = useState('');
  const [activeBank, setActiveBank] = useState(0);

  // ─── Derived ────────────────────────────────────────────────────────────

  const d = useMemo(() =>
    derive(cacheSize, assoc, lineSize, banks, addrWidth, pageSize, replPolicy, writePolicy),
    [cacheSize, assoc, lineSize, banks, addrWidth, pageSize, replPolicy, writePolicy],
  );

  const sampleAddr = useMemo(() =>
    addrHex ? parseAddress(addrHex, addrWidth) : null,
    [addrHex, addrWidth],
  );

  const fields = useMemo((): AddressFields | null => {
    if (sampleAddr === null || !d.valid) return null;
    return {
      offset: extractBits(sampleAddr, 0, d.offsetBits),
      bank: extractBits(sampleAddr, d.offsetBits, d.bankBits),
      index: extractBits(sampleAddr, d.offsetBits + d.bankBits, d.indexBits),
      tag: extractBits(sampleAddr, d.offsetBits + d.bankBits + d.indexBits, d.tagBits),
    };
  }, [sampleAddr, d]);

  // Force banks=1 when fully associative
  useEffect(() => {
    if (assoc === -1 && banks !== 1) setBanks(1);
  }, [assoc, banks]);

  // Clamp activeBank
  useEffect(() => {
    const effectiveBanks = assoc === -1 ? 1 : banks;
    if (activeBank >= effectiveBanks) setActiveBank(0);
  }, [banks, assoc, activeBank]);

  // Auto-switch to target bank when sample address changes
  useEffect(() => {
    if (fields && d.bankBits > 0) {
      setActiveBank(Number(fields.bank));
    }
  }, [fields, d.bankBits]);

  // ─── Render: Configuration ──────────────────────────────────────────────

  const renderConfig = () => (
    <div className="cache__config">
      <div className="cache__config-row">
        <div className="cache__field">
          <label className="cache__field-label">Cache Size</label>
          <select className="cache__field-select" value={cacheSize}
            onChange={e => setCacheSize(Number(e.target.value))}>
            {CACHE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{formatSize(s)}</option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Associativity</label>
          <select className="cache__field-select" value={assoc}
            onChange={e => setAssoc(Number(e.target.value))}>
            {ASSOC_OPTIONS.map(a => (
              <option key={a} value={a}>
                {a === -1 ? 'Fully Associative' : a === 1 ? 'Direct Mapped' : `${a}-way`}
              </option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Line Size</label>
          <select className="cache__field-select" value={lineSize}
            onChange={e => setLineSize(Number(e.target.value))}>
            {LINE_SIZE_OPTIONS.map(l => (
              <option key={l} value={l}>{l} B</option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Banks</label>
          <select className="cache__field-select" value={banks}
            onChange={e => setBanks(Number(e.target.value))}
            disabled={assoc === -1}>
            {BANK_OPTIONS.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Replacement</label>
          <select className="cache__field-select" value={replPolicy}
            onChange={e => setReplPolicy(e.target.value as ReplacementPolicy)}
            disabled={assoc === 1}>
            {REPL_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="cache__config-row">
        <div className="cache__field">
          <label className="cache__field-label">Write Policy</label>
          <select className="cache__field-select" value={writePolicy}
            onChange={e => setWritePolicy(e.target.value as WritePolicy)}>
            <option value="write-back">Write-Back</option>
            <option value="write-through">Write-Through</option>
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Address Width</label>
          <select className="cache__field-select" value={addrWidth}
            onChange={e => setAddrWidth(Number(e.target.value))}>
            {ADDRESS_WIDTH_OPTIONS.map(w => (
              <option key={w} value={w}>{w}-bit</option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Page Size</label>
          <select className="cache__field-select" value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="cache__field">
          <label className="cache__field-label">Indexing</label>
          <select className="cache__field-select" value={mode}
            onChange={e => setMode(e.target.value as IndexingMode)}>
            <option value="vipt">VIPT</option>
            <option value="vivt">VIVT</option>
            <option value="pipt">PIPT</option>
            <option value="pivt">PIVT</option>
          </select>
        </div>
      </div>
    </div>
  );

  // ─── Render: Bit-Field Bar ──────────────────────────────────────────────

  const renderBitFieldBar = () => {
    if (!d.valid) return null;

    const segs = [
      { key: 'tag', name: 'Tag', bits: d.tagBits, color: FIELD_COLORS.tag },
      { key: 'index', name: 'Index', bits: d.indexBits, color: FIELD_COLORS.index },
      { key: 'bank', name: 'Bank', bits: d.bankBits, color: FIELD_COLORS.bank },
      { key: 'offset', name: 'Offset', bits: d.offsetBits, color: FIELD_COLORS.offset },
    ].filter(s => s.bits > 0);

    let bit = addrWidth;
    const segments = segs.map(s => {
      const high = bit - 1;
      const low = bit - s.bits;
      bit = low;
      return { ...s, high, low };
    });

    const showPageBoundary = d.pageOffsetBits > 0 && d.pageOffsetBits < addrWidth;

    return (
      <div className="cache__bitfield">
        <div className="cache__bitfield-bar">
          {segments.map(s => (
            <div key={s.key} className="cache__bitfield-segment"
              style={{ flex: s.bits, background: s.color }}>
              <span className="cache__bitfield-name">
                {s.name} ({s.bits}b)
              </span>
            </div>
          ))}
        </div>
        <div className="cache__bitfield-ranges">
          {segments.map(s => (
            <span key={s.key} className="cache__bitfield-range" style={{ flex: s.bits }}>
              {s.high === s.low ? `[${s.high}]` : `[${s.high}:${s.low}]`}
            </span>
          ))}
        </div>
        {showPageBoundary && (
          <div className="cache__bitfield-page">
            <div className="cache__bitfield-page-bar">
              <div className="cache__bitfield-page-translated"
                style={{ flex: addrWidth - d.pageOffsetBits }} />
              <div className="cache__bitfield-page-offset"
                style={{ flex: d.pageOffsetBits }} />
            </div>
            <div className="cache__bitfield-page-labels">
              <span style={{ flex: addrWidth - d.pageOffsetBits }}>
                {mode === 'pipt' || mode === 'pivt' ? 'Physical' : 'Virtual'} Page Number
              </span>
              <span style={{ flex: d.pageOffsetBits }}>
                Page Offset ({d.pageOffsetBits}b)
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render: Sample Address ─────────────────────────────────────────────

  const renderSampleAddress = () => {
    const addrValid = sampleAddr !== null;

    return (
      <div className="cache__sample">
        <div className="cache__sample-input-row">
          <label className="cache__field-label">Sample Address</label>
          <div className="cache__sample-input-wrapper">
            <span className="cache__sample-prefix">0x</span>
            <input
              className={`cache__sample-input ${addrHex && !addrValid ? 'cache__sample-input--error' : ''}`}
              value={addrHex}
              onChange={e => setAddrHex(e.target.value)}
              placeholder={addrWidth <= 32 ? '1A2B3C40' : '00007FFF1A2B3C40'}
              spellCheck={false}
            />
          </div>
        </div>
        {fields && d.valid && (
          <div className="cache__sample-fields">
            {d.tagBits > 0 && (
              <div className="cache__sample-field">
                <span className="cache__sample-field-dot" style={{ background: FIELD_COLORS.tag }} />
                <span className="cache__sample-field-name">Tag</span>
                <span className="cache__sample-field-value">{fmtHex(fields.tag, d.tagBits)}</span>
              </div>
            )}
            {d.indexBits > 0 && (
              <div className="cache__sample-field">
                <span className="cache__sample-field-dot" style={{ background: FIELD_COLORS.index }} />
                <span className="cache__sample-field-name">Index</span>
                <span className="cache__sample-field-value">{Number(fields.index)} (set {Number(fields.index)})</span>
              </div>
            )}
            {d.bankBits > 0 && (
              <div className="cache__sample-field">
                <span className="cache__sample-field-dot" style={{ background: FIELD_COLORS.bank }} />
                <span className="cache__sample-field-name">Bank</span>
                <span className="cache__sample-field-value">{Number(fields.bank)}</span>
              </div>
            )}
            <div className="cache__sample-field">
              <span className="cache__sample-field-dot" style={{ background: FIELD_COLORS.offset }} />
              <span className="cache__sample-field-name">Offset</span>
              <span className="cache__sample-field-value">{fmtHex(fields.offset, d.offsetBits)}</span>
            </div>
          </div>
        )}
        {addrHex && !addrValid && (
          <span className="cache__sample-error">
            Invalid address for {addrWidth}-bit address space
          </span>
        )}
      </div>
    );
  };

  // ─── Render: Stats ──────────────────────────────────────────────────────

  const renderStats = () => {
    if (!d.valid) return null;

    const replLabel = assoc === 1 ? 'N/A (direct mapped)' :
      d.replBitsPerLine > 0
        ? `${d.replBitsPerLine}b/line (${d.replBitsPerLine * d.effectiveAssoc}b/set)`
        : d.replBitsPerSetShared > 0
          ? `${d.replBitsPerSetShared}b/set (shared)`
          : '0';

    const rows: [string, string][] = [
      ['Total Cache Lines', d.totalLines.toLocaleString()],
      ['Total Sets', d.totalSets.toLocaleString()],
      ['Associativity', assoc === -1 ? `${d.effectiveAssoc}-way (fully associative)` : `${d.effectiveAssoc}-way`],
      ...(banks > 1 ? [['Sets per Bank', d.setsPerBank.toLocaleString()] as [string, string]] : []),
      ['Tag Bits', `${d.tagBits}`],
      ['Index Bits', `${d.indexBits}`],
      ...(d.bankBits > 0 ? [['Bank Bits', `${d.bankBits}`] as [string, string]] : []),
      ['Offset Bits', `${d.offsetBits}`],
      ['Replacement Bits', replLabel],
      ['Bits per Line', `${d.metaBitsPerLine + d.dataBitsPerLine} (${d.metaBitsPerLine} meta + ${d.dataBitsPerLine} data)`],
      ['Physical Size', `${formatBits(d.totalPhysicalBits)} (${d.totalPhysicalBits.toLocaleString()} bits)`],
      ['Data Capacity', formatSize(cacheSize)],
      ['Storage Overhead', `${d.overheadPct.toFixed(1)}%`],
    ];

    return (
      <div className="cache__stats">
        {rows.map(([label, value]) => (
          <div className="cache__value-row" key={label}>
            <span className="cache__value-label">{label}</span>
            <span className="cache__value-data">{value}</span>
            <button className="cache__copy-btn" onClick={() => copyText(value)} title="Copy">
              <CopyIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  // ─── Render: Cell Bar ───────────────────────────────────────────────────

  const renderCellBar = () => (
    <div className="cache__cell-bar">
      <div className="cache__cell-v" />
      {d.dirtyBit > 0 && <div className="cache__cell-d" />}
      {d.replBitsPerLine > 0 && <div className="cache__cell-r" />}
      <div className="cache__cell-tag" style={{ flex: d.tagBits }} />
      <div className="cache__cell-data" style={{ flex: d.dataBitsPerLine }} />
    </div>
  );

  // ─── Render: Cache Array ────────────────────────────────────────────────

  const renderArray = () => {
    if (!d.valid) return null;

    const effectiveBanks = assoc === -1 ? 1 : banks;
    const targetBank = fields ? Number(fields.bank) : -1;
    const targetSet = fields ? Number(fields.index) : -1;
    const isTargetBank = fields !== null && (d.bankBits === 0 || activeBank === targetBank);

    const buildVisibleSets = (total: number, target: number): (number | 'ellipsis')[] => {
      if (total <= MAX_VISIBLE_SETS) {
        return Array.from({ length: total }, (_, i) => i);
      }
      const first = [0, 1, 2, 3];
      const last = [total - 4, total - 3, total - 2, total - 1];

      if (target >= 0 && target > 4 && target < total - 4) {
        const result: (number | 'ellipsis')[] = [...first, 'ellipsis'];
        if (target > 5) result.push(target - 1);
        result.push(target);
        if (target < total - 6) result.push(target + 1);
        result.push('ellipsis', ...last);
        return result;
      }
      return [...first, 'ellipsis', ...last];
    };

    const buildVisibleWays = (total: number): (number | 'ellipsis')[] => {
      if (total <= MAX_VISIBLE_WAYS) {
        return Array.from({ length: total }, (_, i) => i);
      }
      return [
        ...Array.from({ length: 6 }, (_, i) => i),
        'ellipsis' as const,
        ...Array.from({ length: 2 }, (_, i) => total - 2 + i),
      ];
    };

    const visibleWays = buildVisibleWays(d.effectiveAssoc);
    const visibleSets = buildVisibleSets(
      d.setsPerBank,
      isTargetBank ? targetSet : -1,
    );
    const gridCols = `auto repeat(${visibleWays.length}, minmax(2.5rem, 1fr))`;

    return (
      <div className="cache__array">
        {/* Bank tabs */}
        {effectiveBanks > 1 && (
          <div className="cache__bank-tabs">
            {Array.from({ length: effectiveBanks }, (_, i) => {
              const isBankTarget = fields !== null && i === targetBank;
              return (
                <button key={i}
                  className={`cache__bank-tab ${activeBank === i ? 'cache__bank-tab--active' : ''} ${isBankTarget ? 'cache__bank-tab--target' : ''}`}
                  onClick={() => setActiveBank(i)}>
                  Bank {i}
                </button>
              );
            })}
          </div>
        )}

        {/* Grid for active bank */}
        <div className="cache__array-grid-wrapper">
          <div className="cache__array-grid" style={{ gridTemplateColumns: gridCols }}>
            {/* Header row */}
            <div className="cache__array-cell cache__array-cell--corner" />
            {visibleWays.map((w, i) => (
              <div key={i} className={`cache__array-cell cache__array-cell--header ${w === 'ellipsis' ? 'cache__array-cell--ellipsis' : ''}`}>
                {w === 'ellipsis' ? '\u22EF' : `W${w}`}
              </div>
            ))}

            {/* Data rows */}
            {visibleSets.map((setItem, si) => {
              if (setItem === 'ellipsis') {
                return (
                  <React.Fragment key={`e${si}`}>
                    <div className="cache__array-cell cache__array-cell--ellipsis">{'\u22EE'}</div>
                    {visibleWays.map((_, wi) => (
                      <div key={wi} className="cache__array-cell cache__array-cell--ellipsis">{'\u22EE'}</div>
                    ))}
                  </React.Fragment>
                );
              }

              const isTargetSet = isTargetBank && setItem === targetSet && fields !== null;
              return (
                <React.Fragment key={setItem}>
                  <div className={`cache__array-cell cache__array-cell--row-header ${isTargetSet ? 'cache__array-cell--target-header' : ''}`}>
                    S{setItem}
                  </div>
                  {visibleWays.map((w, wi) => (
                    <div key={wi}
                      className={`cache__array-cell ${isTargetSet ? 'cache__array-cell--target' : ''} ${w === 'ellipsis' ? 'cache__array-cell--ellipsis' : ''}`}>
                      {w === 'ellipsis' ? '\u22EF' : renderCellBar()}
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="cache__legend">
          <div className="cache__legend-item">
            <span className="cache__legend-color" style={{ background: 'var(--color-success)' }} />
            <span>V (1b)</span>
          </div>
          {d.dirtyBit > 0 && (
            <div className="cache__legend-item">
              <span className="cache__legend-color" style={{ background: 'var(--color-warning)' }} />
              <span>D (1b)</span>
            </div>
          )}
          {d.replBitsPerLine > 0 && (
            <div className="cache__legend-item">
              <span className="cache__legend-color" style={{ background: 'var(--color-palette-purple)' }} />
              <span>{replPolicy.toUpperCase()} ({d.replBitsPerLine}b)</span>
            </div>
          )}
          <div className="cache__legend-item">
            <span className="cache__legend-color" style={{ background: 'var(--cache-color-tag)' }} />
            <span>Tag ({d.tagBits}b)</span>
          </div>
          <div className="cache__legend-item">
            <span className="cache__legend-color" style={{ background: 'var(--bg-active)' }} />
            <span>Data ({d.dataBitsPerLine}b)</span>
          </div>
          {d.replBitsPerSetShared > 0 && (
            <div className="cache__legend-item cache__legend-item--note">
              + {replPolicy.toUpperCase()} shared: {d.replBitsPerSetShared}b/set
            </div>
          )}
        </div>

        {/* Mapping legend */}
        {fields && (
          <div className="cache__array-mapping">
            Maps to: {d.bankBits > 0 ? `Bank ${targetBank}, ` : ''}Set {targetSet}{d.effectiveAssoc > 1 ? ` (any of ${d.effectiveAssoc} ways)` : ''}
          </div>
        )}
      </div>
    );
  };

  // ─── Render: VM Analysis ────────────────────────────────────────────────

  const renderVMAnalysis = () => {
    if (!d.valid) return null;

    const synonyms = mode === 'vivt' || (mode === 'vipt' && !d.viptSafe);
    const homonyms = mode === 'vivt' || mode === 'pivt';

    return (
      <div className="cache__vm">
        <div className="cache__vm-row">
          <span className="cache__vm-label">Indexing Mode</span>
          <span className="cache__vm-value">{mode.toUpperCase()}</span>
        </div>
        <div className="cache__vm-row">
          <span className="cache__vm-label">Page Offset</span>
          <span className="cache__vm-value">{d.pageOffsetBits} bits ({formatSize(pageSize)} pages)</span>
        </div>
        {mode === 'vipt' && (
          <div className="cache__vm-row">
            <span className="cache__vm-label">VIPT Safe</span>
            <span className={`cache__vm-value ${d.viptSafe ? 'cache__vm-value--ok' : 'cache__vm-value--warn'}`}>
              {d.viptSafe
                ? 'Yes \u2014 index + bank + offset fits within page offset'
                : `No \u2014 ${d.aliasingBits} aliasing bit${d.aliasingBits > 1 ? 's' : ''} beyond page offset (${Math.pow(2, d.aliasingBits)} locations per physical line)`}
            </span>
          </div>
        )}
        <div className="cache__vm-row">
          <span className="cache__vm-label">Synonyms</span>
          <span className={`cache__vm-value ${synonyms ? 'cache__vm-value--warn' : 'cache__vm-value--ok'}`}>
            {synonyms ? 'Possible' : 'None'}
            {synonyms && mode === 'vipt' && ' \u2014 virtual index bits beyond page offset can alias'}
            {synonyms && mode === 'vivt' && ' \u2014 virtual indexing maps different VAs for same PA to different sets'}
          </span>
        </div>
        <div className="cache__vm-row">
          <span className="cache__vm-label">Homonyms</span>
          <span className={`cache__vm-value ${homonyms ? 'cache__vm-value--warn' : 'cache__vm-value--ok'}`}>
            {homonyms ? 'Possible' : 'None'}
            {homonyms && ' \u2014 virtual tagging means same VA in different address spaces may collide'}
          </span>
        </div>
      </div>
    );
  };

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <ToolPage
      title="Cache Configuration Calculator"
      description="Configure cache parameters and visualize address breakdown, array structure, and virtual memory implications. Calculate tag, index, bank, and offset bits."
      keywords={[
        'cache calculator', 'cache configuration', 'cache simulator',
        'tag bits', 'index bits', 'offset bits', 'cache line size',
        'set associative cache', 'direct mapped cache', 'fully associative',
        'VIPT cache', 'VIVT cache', 'PIPT cache', 'cache aliasing',
        'synonym problem', 'homonym problem', 'page offset',
        'cache array', 'cache banks', 'computer architecture',
        'memory hierarchy', 'cache design', 'free cache calculator',
      ]}
    >
      <div className="cache">
        {renderConfig()}

        {d.error && <div className="cache__error">{d.error}</div>}

        {d.valid && (
          <>
            {renderBitFieldBar()}
            {renderSampleAddress()}
            {renderStats()}
            {renderArray()}
            {renderVMAnalysis()}
          </>
        )}
      </div>
    </ToolPage>
  );
};

export default CacheConfig;
