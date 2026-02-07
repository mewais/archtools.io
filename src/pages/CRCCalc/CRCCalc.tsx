import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import { TabSelector } from '../../components';
import type { TabItem } from '../../types';
import './CRCCalc.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CRCConfig {
  name: string;
  width: number;
  poly: number;
  init: number;
  xorOut: number;
  refIn: boolean;
  refOut: boolean;
}

type InputMode = 'text' | 'hex';

interface HashResults {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
  computing: boolean;
}

// ─── CRC Engine ──────────────────────────────────────────────────────────────

const reflect = (value: number, width: number): number => {
  let result = 0;
  for (let i = 0; i < width; i++) {
    if (value & (1 << i)) {
      result |= 1 << (width - 1 - i);
    }
  }
  return result >>> 0;
};

const buildCRCTable = (poly: number, width: number): Uint32Array => {
  const table = new Uint32Array(256);
  const topBit = 1 << (width - 1);
  const mask = width === 32 ? 0xFFFFFFFF : (1 << width) - 1;

  for (let i = 0; i < 256; i++) {
    let crc = i << (width - 8);
    for (let j = 0; j < 8; j++) {
      if (crc & topBit) {
        crc = ((crc << 1) ^ poly) & mask;
      } else {
        crc = (crc << 1) & mask;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
};

const computeCRC = (data: Uint8Array, config: CRCConfig): number => {
  const { width, poly, init, xorOut, refIn, refOut } = config;
  const mask = width === 32 ? 0xFFFFFFFF : (1 << width) - 1;
  const table = buildCRCTable(poly, width);
  let crc = init & mask;

  for (let i = 0; i < data.length; i++) {
    const byte = refIn ? reflect(data[i], 8) : data[i];
    const tableIndex = ((crc >>> (width - 8)) ^ byte) & 0xFF;
    crc = ((crc << 8) ^ table[tableIndex]) & mask;
  }

  if (refOut) {
    crc = reflect(crc, width);
  }
  return (crc ^ xorOut) >>> 0;
};

// ─── CRC Presets ─────────────────────────────────────────────────────────────

const CRC32_PRESETS: CRCConfig[] = [
  { name: 'CRC-32 (ISO 3309)', width: 32, poly: 0x04C11DB7, init: 0xFFFFFFFF, xorOut: 0xFFFFFFFF, refIn: true, refOut: true },
  { name: 'CRC-32C (Castagnoli)', width: 32, poly: 0x1EDC6F41, init: 0xFFFFFFFF, xorOut: 0xFFFFFFFF, refIn: true, refOut: true },
  { name: 'CRC-32/MPEG-2', width: 32, poly: 0x04C11DB7, init: 0xFFFFFFFF, xorOut: 0x00000000, refIn: false, refOut: false },
  { name: 'CRC-32/POSIX', width: 32, poly: 0x04C11DB7, init: 0x00000000, xorOut: 0xFFFFFFFF, refIn: false, refOut: false },
];

const CRC16_PRESETS: CRCConfig[] = [
  { name: 'CRC-16/IBM (ARC)', width: 16, poly: 0x8005, init: 0x0000, xorOut: 0x0000, refIn: true, refOut: true },
  { name: 'CRC-16/CCITT-FALSE', width: 16, poly: 0x1021, init: 0xFFFF, xorOut: 0x0000, refIn: false, refOut: false },
  { name: 'CRC-16/XMODEM', width: 16, poly: 0x1021, init: 0x0000, xorOut: 0x0000, refIn: false, refOut: false },
  { name: 'CRC-16/MODBUS', width: 16, poly: 0x8005, init: 0xFFFF, xorOut: 0x0000, refIn: true, refOut: true },
  { name: 'CRC-16/USB', width: 16, poly: 0x8005, init: 0xFFFF, xorOut: 0xFFFF, refIn: true, refOut: true },
  { name: 'CRC-16/KERMIT', width: 16, poly: 0x1021, init: 0x0000, xorOut: 0x0000, refIn: true, refOut: true },
];

const CRC8_PRESETS: CRCConfig[] = [
  { name: 'CRC-8', width: 8, poly: 0x07, init: 0x00, xorOut: 0x00, refIn: false, refOut: false },
  { name: 'CRC-8/CDMA2000', width: 8, poly: 0x9B, init: 0xFF, xorOut: 0x00, refIn: false, refOut: false },
  { name: 'CRC-8/MAXIM', width: 8, poly: 0x31, init: 0x00, xorOut: 0x00, refIn: true, refOut: true },
  { name: 'CRC-8/ROHC', width: 8, poly: 0x07, init: 0xFF, xorOut: 0x00, refIn: true, refOut: true },
];

const ALL_PRESETS: CRCConfig[] = [...CRC32_PRESETS, ...CRC16_PRESETS, ...CRC8_PRESETS];

// ─── Simple Checksums ────────────────────────────────────────────────────────

const checksumXOR8 = (data: Uint8Array): number => {
  let result = 0;
  for (let i = 0; i < data.length; i++) {
    result ^= data[i];
  }
  return result;
};

const checksumSum8 = (data: Uint8Array): number => {
  let result = 0;
  for (let i = 0; i < data.length; i++) {
    result = (result + data[i]) & 0xFF;
  }
  return result;
};

const checksumSum16 = (data: Uint8Array): number => {
  let result = 0;
  for (let i = 0; i < data.length; i += 2) {
    const word = i + 1 < data.length
      ? (data[i] << 8) | data[i + 1]
      : data[i] << 8;
    result = (result + word) & 0xFFFF;
  }
  return result;
};

const checksumFletcher16 = (data: Uint8Array): number => {
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < data.length; i++) {
    sum1 = (sum1 + data[i]) % 255;
    sum2 = (sum2 + sum1) % 255;
  }
  return (sum2 << 8) | sum1;
};

const checksumAdler32 = (data: Uint8Array): number => {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};

// ─── Cryptographic Hashes ────────────────────────────────────────────────────

// Pure JS MD5 implementation (Web Crypto doesn't support MD5)
const md5 = (data: Uint8Array): string => {
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  // Pre-processing: adding padding bits
  const bitLen = data.length * 8;
  const padLen = ((56 - (data.length + 1) % 64) + 64) % 64;
  const padded = new Uint8Array(data.length + 1 + padLen + 8);
  padded.set(data);
  padded[data.length] = 0x80;
  // Append length in bits as 64-bit little-endian
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, 0, true); // high 32 bits (fine for < 512MB)

  let a0 = 0x67452301 >>> 0;
  let b0 = 0xefcdab89 >>> 0;
  let c0 = 0x98badcfe >>> 0;
  let d0 = 0x10325476 >>> 0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const result = new Uint8Array(16);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, a0, true);
  rv.setUint32(4, b0, true);
  rv.setUint32(8, c0, true);
  rv.setUint32(12, d0, true);

  return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
};

const hashWithCrypto = async (algorithm: string, data: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest(algorithm, data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ─── Input Parsing ───────────────────────────────────────────────────────────

const parseHexInput = (hex: string): { data: Uint8Array | null; error: string | null } => {
  const cleaned = hex.replace(/[\s,\-]/g, '');
  if (cleaned.length === 0) return { data: new Uint8Array(0), error: null };
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    return { data: null, error: 'Invalid hex characters. Use only 0-9 and A-F.' };
  }
  if (cleaned.length % 2 !== 0) {
    return { data: null, error: 'Odd number of hex digits. Each byte needs two hex digits.' };
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return { data: bytes, error: null };
};

// ─── Formatting ──────────────────────────────────────────────────────────────

const formatCRC = (value: number, width: number): string => {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width / 4, '0');
};

// ─── Chevron Icon ────────────────────────────────────────────────────────────

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    className={`crc-calc__chevron ${open ? 'crc-calc__chevron--open' : ''}`}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ─── Tabs ────────────────────────────────────────────────────────────────────

const INPUT_TABS: TabItem[] = [
  { id: 'text', label: 'Text' },
  { id: 'hex', label: 'Hex' },
];

// ─── Main Component ──────────────────────────────────────────────────────────

const CRCCalc: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(['crc32'])
  );
  const [showCustom, setShowCustom] = useState(false);
  const [customCRC, setCustomCRC] = useState<CRCConfig>({
    name: 'Custom',
    width: 32,
    poly: 0x04C11DB7,
    init: 0x00000000,
    xorOut: 0x00000000,
    refIn: false,
    refOut: false,
  });
  const [customPolyStr, setCustomPolyStr] = useState('04C11DB7');
  const [customInitStr, setCustomInitStr] = useState('00000000');
  const [customXorOutStr, setCustomXorOutStr] = useState('00000000');
  const [hashResults, setHashResults] = useState<HashResults>({
    md5: '', sha1: '', sha256: '', sha512: '', computing: false,
  });

  // Parse input data
  const { inputData, hexError } = useMemo(() => {
    if (inputMode === 'text') {
      return { inputData: new TextEncoder().encode(inputText), hexError: null };
    }
    const { data, error } = parseHexInput(inputText);
    return { inputData: data ?? new Uint8Array(0), hexError: error };
  }, [inputText, inputMode]);

  // CRC results (synchronous)
  const crc32Results = useMemo(() =>
    CRC32_PRESETS.map(p => ({ name: p.name, value: computeCRC(inputData, p), width: p.width })),
    [inputData]
  );

  const crc16Results = useMemo(() =>
    CRC16_PRESETS.map(p => ({ name: p.name, value: computeCRC(inputData, p), width: p.width })),
    [inputData]
  );

  const crc8Results = useMemo(() =>
    CRC8_PRESETS.map(p => ({ name: p.name, value: computeCRC(inputData, p), width: p.width })),
    [inputData]
  );

  // Checksum results (synchronous)
  const checksumResults = useMemo(() => [
    { name: 'XOR-8', value: checksumXOR8(inputData), width: 8 },
    { name: 'Sum-8', value: checksumSum8(inputData), width: 8 },
    { name: 'Sum-16', value: checksumSum16(inputData), width: 16 },
    { name: 'Fletcher-16', value: checksumFletcher16(inputData), width: 16 },
    { name: 'Adler-32', value: checksumAdler32(inputData), width: 32 },
  ], [inputData]);

  // Custom CRC result
  const customCRCResult = useMemo(() => {
    const poly = parseInt(customPolyStr, 16);
    const init = parseInt(customInitStr, 16);
    const xorOut = parseInt(customXorOutStr, 16);
    if (isNaN(poly) || isNaN(init) || isNaN(xorOut)) return null;
    const maxVal = customCRC.width === 32 ? 0xFFFFFFFF : (1 << customCRC.width) - 1;
    if (poly > maxVal || init > maxVal || xorOut > maxVal) return null;
    const config: CRCConfig = {
      ...customCRC,
      poly: poly >>> 0,
      init: init >>> 0,
      xorOut: xorOut >>> 0,
    };
    return { value: computeCRC(inputData, config), width: config.width };
  }, [inputData, customCRC, customPolyStr, customInitStr, customXorOutStr]);

  // Hash results (async)
  useEffect(() => {
    let cancelled = false;
    setHashResults(prev => ({ ...prev, computing: true }));

    const compute = async () => {
      try {
        const md5Result = md5(inputData);
        let sha1Result = '', sha256Result = '', sha512Result = '';
        if (typeof crypto !== 'undefined' && crypto.subtle) {
          [sha1Result, sha256Result, sha512Result] = await Promise.all([
            hashWithCrypto('SHA-1', inputData),
            hashWithCrypto('SHA-256', inputData),
            hashWithCrypto('SHA-512', inputData),
          ]);
        }
        if (!cancelled) {
          setHashResults({
            md5: md5Result,
            sha1: sha1Result || 'Requires HTTPS',
            sha256: sha256Result || 'Requires HTTPS',
            sha512: sha512Result || 'Requires HTTPS',
            computing: false,
          });
        }
      } catch {
        if (!cancelled) {
          setHashResults(prev => ({
            ...prev,
            sha1: prev.sha1 || 'Error',
            sha256: prev.sha256 || 'Error',
            sha512: prev.sha512 || 'Error',
            computing: false,
          }));
        }
      }
    };
    compute();
    return () => { cancelled = true; };
  }, [inputData]);

  // Section toggle
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Load preset into custom CRC fields
  const loadPreset = (presetName: string) => {
    const preset = ALL_PRESETS.find(p => p.name === presetName);
    if (!preset) return;
    setCustomCRC(preset);
    setCustomPolyStr((preset.poly >>> 0).toString(16).toUpperCase().padStart(preset.width / 4, '0'));
    setCustomInitStr((preset.init >>> 0).toString(16).toUpperCase().padStart(preset.width / 4, '0'));
    setCustomXorOutStr((preset.xorOut >>> 0).toString(16).toUpperCase().padStart(preset.width / 4, '0'));
  };

  // Sync custom hex fields to customCRC on width change
  const handleWidthChange = (newWidth: number) => {
    const maxVal = newWidth === 32 ? 0xFFFFFFFF : (1 << newWidth) - 1;
    const padLen = newWidth / 4;

    const poly = Math.min(parseInt(customPolyStr, 16) || 0, maxVal);
    const init = Math.min(parseInt(customInitStr, 16) || 0, maxVal);
    const xorOut = Math.min(parseInt(customXorOutStr, 16) || 0, maxVal);

    setCustomCRC(prev => ({ ...prev, width: newWidth }));
    setCustomPolyStr((poly >>> 0).toString(16).toUpperCase().padStart(padLen, '0'));
    setCustomInitStr((init >>> 0).toString(16).toUpperCase().padStart(padLen, '0'));
    setCustomXorOutStr((xorOut >>> 0).toString(16).toUpperCase().padStart(padLen, '0'));
  };

  // Custom CRC validation
  const customError = useMemo(() => {
    const poly = parseInt(customPolyStr, 16);
    const init = parseInt(customInitStr, 16);
    const xorOut = parseInt(customXorOutStr, 16);
    const maxVal = customCRC.width === 32 ? 0xFFFFFFFF : (1 << customCRC.width) - 1;

    if (isNaN(poly) || !/^[0-9a-fA-F]+$/.test(customPolyStr)) return 'Invalid polynomial';
    if (isNaN(init) || !/^[0-9a-fA-F]+$/.test(customInitStr)) return 'Invalid init value';
    if (isNaN(xorOut) || !/^[0-9a-fA-F]+$/.test(customXorOutStr)) return 'Invalid XOR out value';
    if (poly > maxVal) return `Polynomial exceeds ${customCRC.width}-bit range`;
    if (init > maxVal) return `Init value exceeds ${customCRC.width}-bit range`;
    if (xorOut > maxVal) return `XOR out exceeds ${customCRC.width}-bit range`;
    return null;
  }, [customPolyStr, customInitStr, customXorOutStr, customCRC.width]);

  const byteCount = inputData.length;

  // Render a result row
  const renderValueRow = (name: string, value: string, copyValue: string) => (
    <div className="crc-calc__value-row" key={name}>
      <span className="crc-calc__value-label">{name}</span>
      <span className="crc-calc__value-data crc-calc__value-data--mono">{value}</span>
      <button
        className="crc-calc__copy-btn"
        onClick={() => copyToClipboard(copyValue)}
        title="Copy"
      >
        <CopyIcon size={16} />
      </button>
    </div>
  );

  // Render a collapsible section
  const renderSection = (
    id: string,
    title: string,
    results: { name: string; value: number | string; width?: number }[],
    isHash?: boolean,
  ) => {
    const isOpen = expandedSections.has(id);
    return (
      <div className="crc-calc__section" key={id}>
        <button
          className="crc-calc__section-header"
          onClick={() => toggleSection(id)}
          aria-expanded={isOpen}
        >
          <span className="crc-calc__section-title">{title}</span>
          <span className="crc-calc__section-count">{results.length}</span>
          <ChevronIcon open={isOpen} />
        </button>
        {isOpen && (
          <div className="crc-calc__section-body">
            {isHash && hashResults.computing ? (
              <div className="crc-calc__computing">Computing hashes...</div>
            ) : (
              results.map(r => {
                const display = typeof r.value === 'string'
                  ? r.value
                  : formatCRC(r.value as number, r.width!);
                const copyVal = typeof r.value === 'string'
                  ? r.value
                  : formatCRC(r.value as number, r.width!);
                return renderValueRow(r.name, display, copyVal);
              })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <ToolPage
      title="CRC & Checksum Calculator"
      description="Free online CRC and checksum calculator. Compute CRC32, CRC16, CRC8, MD5, SHA-1, SHA-256, and more. Supports text and hex input, custom polynomials, and multiple output formats."
      keywords={[
        'crc calculator',
        'crc32 calculator',
        'crc32 online',
        'crc16 calculator',
        'crc8 calculator',
        'checksum calculator',
        'checksum calculator online',
        'hash calculator',
        'md5 calculator',
        'sha256 calculator',
        'sha1 calculator',
        'crc polynomial',
        'custom crc',
        'hex checksum',
        'data integrity',
        'error detection',
        'network checksum',
        'embedded checksum',
        'developer tools',
        'free crc calculator'
      ]}
    >
      <div className="crc-calc">
        {/* Input Section */}
        <div className="crc-calc__input-section">
          <div className="crc-calc__input-header">
            <TabSelector
              tabs={INPUT_TABS}
              activeTab={inputMode}
              onTabChange={(id) => {
                setInputMode(id as InputMode);
                setInputText('');
              }}
              size="sm"
              className="crc-calc__tabs"
            />
          </div>
          <textarea
            className={`crc-calc__textarea ${hexError ? 'crc-calc__textarea--invalid' : ''}`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={inputMode === 'text' ? 'Hello, World!' : '48 65 6C 6C 6F'}
            rows={4}
            spellCheck={false}
          />
          <div className="crc-calc__input-footer">
            <span className="crc-calc__byte-count">{byteCount} byte{byteCount !== 1 ? 's' : ''}</span>
            {hexError && <span className="crc-calc__hex-error">{hexError}</span>}
          </div>
        </div>

        {/* Results */}
        <div className="crc-calc__results">
          {renderSection('crc32', 'CRC-32', crc32Results)}
          {renderSection('crc16', 'CRC-16', crc16Results)}
          {renderSection('crc8', 'CRC-8', crc8Results)}
          {renderSection('checksums', 'Checksums', checksumResults)}
          {renderSection('hashes', 'Hashes', [
            { name: 'MD5', value: hashResults.md5 || '\u2014' },
            { name: 'SHA-1', value: hashResults.sha1 || '\u2014' },
            { name: 'SHA-256', value: hashResults.sha256 || '\u2014' },
            { name: 'SHA-512', value: hashResults.sha512 || '\u2014' },
          ], true)}
        </div>

        {/* Custom CRC */}
        <div className="crc-calc__custom">
          <button
            className="crc-calc__custom-toggle"
            onClick={() => setShowCustom(!showCustom)}
          >
            <ChevronIcon open={showCustom} />
            Custom CRC
          </button>

          {showCustom && (
            <div className="crc-calc__custom-body">
              <p className="crc-calc__custom-desc">
                Configure your own CRC parameters, or load a standard preset to see what parameters it uses.
              </p>

              <div className="crc-calc__custom-fields">
                <div className="crc-calc__custom-field">
                  <label className="crc-calc__custom-label">Width</label>
                  <select
                    className="crc-calc__custom-select"
                    value={customCRC.width}
                    onChange={(e) => handleWidthChange(Number(e.target.value))}
                  >
                    <option value={8}>8-bit</option>
                    <option value={16}>16-bit</option>
                    <option value={32}>32-bit</option>
                  </select>
                </div>

                <div className="crc-calc__custom-field">
                  <label className="crc-calc__custom-label">Polynomial</label>
                  <div className="crc-calc__hex-input-wrapper">
                    <span className="crc-calc__hex-prefix">0x</span>
                    <input
                      type="text"
                      className="crc-calc__custom-input"
                      value={customPolyStr}
                      onChange={(e) => setCustomPolyStr(e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase())}
                      maxLength={customCRC.width / 4}
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="crc-calc__custom-field">
                  <label className="crc-calc__custom-label">Init Value</label>
                  <div className="crc-calc__hex-input-wrapper">
                    <span className="crc-calc__hex-prefix">0x</span>
                    <input
                      type="text"
                      className="crc-calc__custom-input"
                      value={customInitStr}
                      onChange={(e) => setCustomInitStr(e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase())}
                      maxLength={customCRC.width / 4}
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="crc-calc__custom-field">
                  <label className="crc-calc__custom-label">XOR Out</label>
                  <div className="crc-calc__hex-input-wrapper">
                    <span className="crc-calc__hex-prefix">0x</span>
                    <input
                      type="text"
                      className="crc-calc__custom-input"
                      value={customXorOutStr}
                      onChange={(e) => setCustomXorOutStr(e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase())}
                      maxLength={customCRC.width / 4}
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="crc-calc__custom-field crc-calc__custom-field--checkbox">
                  <label className="crc-calc__custom-checkbox-label">
                    <input
                      type="checkbox"
                      checked={customCRC.refIn}
                      onChange={(e) => setCustomCRC(prev => ({ ...prev, refIn: e.target.checked }))}
                    />
                    Reflect In
                  </label>
                  <span className="crc-calc__custom-hint">Reverse bit order of each input byte</span>
                </div>

                <div className="crc-calc__custom-field crc-calc__custom-field--checkbox">
                  <label className="crc-calc__custom-checkbox-label">
                    <input
                      type="checkbox"
                      checked={customCRC.refOut}
                      onChange={(e) => setCustomCRC(prev => ({ ...prev, refOut: e.target.checked }))}
                    />
                    Reflect Out
                  </label>
                  <span className="crc-calc__custom-hint">Reverse bit order of the final CRC</span>
                </div>
              </div>

              {customError && (
                <div className="crc-calc__custom-error">{customError}</div>
              )}

              {!customError && customCRCResult && (
                <div className="crc-calc__custom-result">
                  {renderValueRow(
                    'Custom CRC',
                    formatCRC(customCRCResult.value, customCRCResult.width),
                    formatCRC(customCRCResult.value, customCRCResult.width),
                  )}
                </div>
              )}

              <div className="crc-calc__custom-preset-row">
                <label className="crc-calc__custom-label">Inspect a standard</label>
                <select
                  className="crc-calc__custom-select"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) loadPreset(e.target.value);
                  }}
                >
                  <option value="">Load preset parameters...</option>
                  <optgroup label="CRC-32">
                    {CRC32_PRESETS.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="CRC-16">
                    {CRC16_PRESETS.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="CRC-8">
                    {CRC8_PRESETS.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPage>
  );
};

export default CRCCalc;
