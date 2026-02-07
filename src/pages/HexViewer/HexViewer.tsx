import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import ToolPage from '../ToolPage';
import { UploadIcon } from '../../components/Icons';
import { TabSelector, Button } from '../../components';
import type { TabItem } from '../../types';
import './HexViewer.css';

type ViewMode = 'hex' | 'int' | 'float' | 'ascii';
type Endianness = 'little' | 'big';
type IntSize = 8 | 16 | 32 | 64;
type IntSign = 'unsigned' | 'signed';
type FloatFormat =
  | 'fp64' | 'fp32' | 'fp16' | 'bf16'  // Standard IEEE formats
  | 'e4m3' | 'e5m2'                     // FP8 formats
  | 'mxfp8_e4m3' | 'mxfp8_e5m2'         // MXFP8 formats
  | 'mxfp6_e3m2' | 'mxfp6_e2m3'         // MXFP6 formats
  | 'mxfp4_e2m1';                        // MXFP4 format

// Float format specifications
interface FloatFormatSpec {
  name: string;
  totalBits: number;
  exponentBits: number;
  mantissaBits: number;
  bias: number;
  hasInfNan: boolean;
}

const FLOAT_FORMATS: Record<FloatFormat, FloatFormatSpec> = {
  fp64: { name: 'FP64', totalBits: 64, exponentBits: 11, mantissaBits: 52, bias: 1023, hasInfNan: true },
  fp32: { name: 'FP32', totalBits: 32, exponentBits: 8, mantissaBits: 23, bias: 127, hasInfNan: true },
  fp16: { name: 'FP16', totalBits: 16, exponentBits: 5, mantissaBits: 10, bias: 15, hasInfNan: true },
  bf16: { name: 'BF16', totalBits: 16, exponentBits: 8, mantissaBits: 7, bias: 127, hasInfNan: true },
  e4m3: { name: 'E4M3', totalBits: 8, exponentBits: 4, mantissaBits: 3, bias: 7, hasInfNan: false },
  e5m2: { name: 'E5M2', totalBits: 8, exponentBits: 5, mantissaBits: 2, bias: 15, hasInfNan: true },
  mxfp8_e4m3: { name: 'MX8-E4M3', totalBits: 8, exponentBits: 4, mantissaBits: 3, bias: 7, hasInfNan: false },
  mxfp8_e5m2: { name: 'MX8-E5M2', totalBits: 8, exponentBits: 5, mantissaBits: 2, bias: 15, hasInfNan: true },
  mxfp6_e3m2: { name: 'MX6-E3M2', totalBits: 6, exponentBits: 3, mantissaBits: 2, bias: 3, hasInfNan: false },
  mxfp6_e2m3: { name: 'MX6-E2M3', totalBits: 6, exponentBits: 2, mantissaBits: 3, bias: 1, hasInfNan: false },
  mxfp4_e2m1: { name: 'MX4-E2M1', totalBits: 4, exponentBits: 2, mantissaBits: 1, bias: 1, hasInfNan: false },
};

// Get byte count for a format (rounds up for sub-byte formats)
const getFormatByteCount = (format: FloatFormat): number => {
  return Math.ceil(FLOAT_FORMATS[format].totalBits / 8);
};

// Check if format is a scaled (MXFP) format
const isScaledFormat = (format: FloatFormat): boolean => {
  return format.startsWith('mxfp');
};

interface ViewConfig {
  intSize: IntSize;
  intSign: IntSign;
  floatFormat: FloatFormat;
  bytesPerRow: number;
}

interface SearchResult {
  offset: number;
  length: number;
}

const VIEW_TABS: TabItem[] = [
  { id: 'hex', label: 'Hex Dump' },
  { id: 'int', label: 'Integers' },
  { id: 'float', label: 'Floats' },
  { id: 'ascii', label: 'ASCII' },
];

const MODE_TABS: TabItem[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'diff', label: 'Diff' },
];

// Parse hex string to bytes
const parseHexString = (hex: string): Uint8Array | null => {
  // Remove common prefixes and separators
  const cleaned = hex.replace(/0x/gi, '').replace(/[\s,;:\-]/g, '');
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) return null;
  if (cleaned.length % 2 !== 0) return null;
  if (cleaned.length === 0) return null;

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
  }
  return bytes;
};

// Parse Base64 to bytes
const parseBase64 = (b64: string): Uint8Array | null => {
  try {
    const binary = atob(b64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
};

// Format byte as hex
const toHex = (byte: number): string => byte.toString(16).padStart(2, '0').toUpperCase();

// Format bytes as ASCII (printable or dot)
const toAscii = (byte: number): string => {
  if (byte >= 32 && byte < 127) return String.fromCharCode(byte);
  return '.';
};

// Read integer from bytes with endianness
const readInt = (
  data: Uint8Array,
  offset: number,
  size: IntSize,
  endian: Endianness,
  signed: IntSign
): bigint | null => {
  const byteCount = size / 8;
  if (offset + byteCount > data.length) return null;

  let value = 0n;
  if (endian === 'little') {
    for (let i = byteCount - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(data[offset + i]);
    }
  } else {
    for (let i = 0; i < byteCount; i++) {
      value = (value << 8n) | BigInt(data[offset + i]);
    }
  }

  if (signed === 'signed') {
    const signBit = 1n << BigInt(size - 1);
    if (value >= signBit) {
      value = value - (1n << BigInt(size));
    }
  }

  return value;
};

// Generic float decoder using format specification
const decodeFloat = (bits: bigint, spec: FloatFormatSpec): number => {
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = spec;

  const signMask = 1n << BigInt(totalBits - 1);
  const expMask = (1n << BigInt(exponentBits)) - 1n;
  const mantMask = (1n << BigInt(mantissaBits)) - 1n;
  const maxExp = (1 << exponentBits) - 1;

  const sign = (bits & signMask) !== 0n ? -1 : 1;
  const exp = Number((bits >> BigInt(mantissaBits)) & expMask);
  const mant = Number(bits & mantMask);
  const mantMax = 1 << mantissaBits;

  // Zero
  if (exp === 0 && mant === 0) {
    return sign === -1 ? -0 : 0;
  }

  // Denormalized
  if (exp === 0) {
    return sign * (mant / mantMax) * Math.pow(2, 1 - bias);
  }

  // Infinity/NaN (only for formats that support it)
  if (exp === maxExp && hasInfNan) {
    if (mant === 0) return sign === -1 ? -Infinity : Infinity;
    return NaN;
  }

  // Normalized
  return sign * (1 + mant / mantMax) * Math.pow(2, exp - bias);
};

// Read float from bytes with endianness
const readFloat = (
  data: Uint8Array,
  offset: number,
  format: FloatFormat,
  endian: Endianness,
  scale: number = 0
): number | null => {
  const spec = FLOAT_FORMATS[format];
  const byteCount = getFormatByteCount(format);
  if (offset + byteCount > data.length) return null;

  // Build the value with endianness
  let bits = 0n;
  if (endian === 'little') {
    for (let i = byteCount - 1; i >= 0; i--) {
      bits = (bits << 8n) | BigInt(data[offset + i]);
    }
  } else {
    for (let i = 0; i < byteCount; i++) {
      bits = (bits << 8n) | BigInt(data[offset + i]);
    }
  }

  // For sub-byte formats, shift to get the correct bits
  const totalBits = spec.totalBits;
  const byteBits = byteCount * 8;
  if (byteBits > totalBits) {
    bits = bits >> BigInt(byteBits - totalBits);
  }

  let value: number;

  // Use native DataView for fp32 and fp64 for precision
  if (format === 'fp32') {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, Number(bits), false);
    value = view.getFloat32(0, false);
  } else if (format === 'fp64') {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, Number(bits >> 32n), false);
    view.setUint32(4, Number(bits & 0xFFFFFFFFn), false);
    value = view.getFloat64(0, false);
  } else {
    // Use generic decoder for all other formats
    value = decodeFloat(bits, spec);
  }

  // Apply scale for MXFP formats
  if (isScaledFormat(format) && scale !== 0 && Number.isFinite(value)) {
    value = value * Math.pow(2, scale);
  }

  return value;
};

// Swap endianness of data
const swapEndianness = (data: Uint8Array, unitSize: number): Uint8Array => {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += unitSize) {
    for (let j = 0; j < unitSize && i + j < data.length; j++) {
      result[i + j] = data[i + unitSize - 1 - j] ?? 0;
    }
  }
  return result;
};

// Generic float encoder using format specification
const encodeFloat = (value: number, format: FloatFormat, scale: number = 0): bigint => {
  const spec = FLOAT_FORMATS[format];
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = spec;

  // Apply inverse scale for MXFP formats before encoding
  if (isScaledFormat(format) && scale !== 0 && Number.isFinite(value) && value !== 0) {
    value = value / Math.pow(2, scale);
  }

  const maxExp = (1 << exponentBits) - 1;
  const mantMax = 1 << mantissaBits;

  // Handle special values
  if (Number.isNaN(value)) {
    if (!hasInfNan) return 0n; // Formats without NaN: return 0
    const sign = 0n;
    const exp = BigInt(maxExp);
    const mant = 1n; // Non-zero mantissa for NaN
    return (sign << BigInt(totalBits - 1)) | (exp << BigInt(mantissaBits)) | mant;
  }

  if (!Number.isFinite(value)) {
    const sign = value < 0 ? 1n : 0n;
    if (!hasInfNan) {
      // Formats without infinity: return max value
      const exp = BigInt(maxExp);
      const mant = BigInt(mantMax - 1);
      return (sign << BigInt(totalBits - 1)) | (exp << BigInt(mantissaBits)) | mant;
    }
    const exp = BigInt(maxExp);
    return (sign << BigInt(totalBits - 1)) | (exp << BigInt(mantissaBits));
  }

  if (value === 0) {
    return Object.is(value, -0) ? (1n << BigInt(totalBits - 1)) : 0n;
  }

  const sign = value < 0 ? 1n : 0n;
  const absValue = Math.abs(value);

  let expVal = Math.floor(Math.log2(absValue));
  let mantissa = absValue / Math.pow(2, expVal) - 1;
  let biasedExp = expVal + bias;

  // Handle overflow
  if (biasedExp >= maxExp) {
    if (hasInfNan) {
      // Return infinity
      return (sign << BigInt(totalBits - 1)) | (BigInt(maxExp) << BigInt(mantissaBits));
    } else {
      // Return max value
      return (sign << BigInt(totalBits - 1)) | (BigInt(maxExp) << BigInt(mantissaBits)) | BigInt(mantMax - 1);
    }
  }

  // Handle denormalized
  if (biasedExp <= 0) {
    const shift = 1 - biasedExp;
    if (shift > mantissaBits) return sign << BigInt(totalBits - 1);
    const denormMantissa = (1 + mantissa) / Math.pow(2, shift);
    return (sign << BigInt(totalBits - 1)) | BigInt(Math.round(denormMantissa * mantMax));
  }

  const mantissaInt = BigInt(Math.round(mantissa * mantMax));
  return (sign << BigInt(totalBits - 1)) | (BigInt(biasedExp) << BigInt(mantissaBits)) | mantissaInt;
};

// Convert float format
const convertFloatFormat = (
  data: Uint8Array,
  fromFormat: FloatFormat,
  toFormat: FloatFormat,
  endian: Endianness,
  fromScale: number = 0,
  toScale: number = 0
): Uint8Array => {
  const fromBytes = getFormatByteCount(fromFormat);
  const toBytes = getFormatByteCount(toFormat);
  const count = Math.floor(data.length / fromBytes);
  const result = new Uint8Array(count * toBytes);

  for (let i = 0; i < count; i++) {
    const value = readFloat(data, i * fromBytes, fromFormat, endian, fromScale);
    if (value === null) continue;

    // Encode to target format
    let bits: bigint;
    if (toFormat === 'fp64') {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setFloat64(0, value, false);
      bits = (BigInt(view.getUint32(0, false)) << 32n) | BigInt(view.getUint32(4, false));
    } else if (toFormat === 'fp32') {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setFloat32(0, value, false);
      bits = BigInt(view.getUint32(0, false));
    } else {
      bits = encodeFloat(value, toFormat, toScale);
    }

    // Write with endianness
    const offset = i * toBytes;
    if (endian === 'little') {
      for (let j = 0; j < toBytes; j++) {
        result[offset + j] = Number((bits >> BigInt(j * 8)) & 0xFFn);
      }
    } else {
      for (let j = 0; j < toBytes; j++) {
        result[offset + j] = Number((bits >> BigInt((toBytes - 1 - j) * 8)) & 0xFFn);
      }
    }
  }

  return result;
};

// Calculate statistics for numeric data
interface Statistics {
  count: number;
  min: number;
  max: number;
  mean: number;
  sum: number;
}

const calculateStats = (values: number[]): Statistics | null => {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length === 0) return null;

  const sum = finite.reduce((a, b) => a + b, 0);
  return {
    count: finite.length,
    min: Math.min(...finite),
    max: Math.max(...finite),
    mean: sum / finite.length,
    sum,
  };
};

// Format number for display
const formatNumber = (n: number): string => {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '+Inf' : '-Inf';
  if (Math.abs(n) < 0.0001 || Math.abs(n) >= 1000000) {
    return n.toExponential(4);
  }
  return n.toPrecision(6).replace(/\.?0+$/, '');
};

const HexViewer: React.FC = () => {
  // Data state
  const [data, setData] = useState<Uint8Array | null>(null);
  const [data2, setData2] = useState<Uint8Array | null>(null); // For diff mode
  const [fileName, setFileName] = useState<string>('');
  const [fileName2, setFileName2] = useState<string>('');

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('hex');
  const [endianness, setEndianness] = useState<Endianness>('little');
  const [config, setConfig] = useState<ViewConfig>(() => ({
    intSize: 32,
    intSign: 'unsigned',
    floatFormat: 'fp32',
    bytesPerRow: window.matchMedia('(max-width: 767px)').matches ? 8 : 16,
  }));

  // Keep bytesPerRow responsive to screen width
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => {
      setConfig(prev => ({ ...prev, bytesPerRow: e.matches ? 8 : 16 }));
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Mode state
  const [diffMode, setDiffMode] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'hex' | 'ascii' | 'int' | 'float'>('hex');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResult, setCurrentResult] = useState(0);

  // Conversion state
  const [convertFrom, setConvertFrom] = useState<FloatFormat>('fp32');
  const [convertTo, setConvertTo] = useState<FloatFormat>('fp16');

  // Scale state for MXFP formats
  const [viewScale, setViewScale] = useState(0);
  const [convertFromScale, setConvertFromScale] = useState(0);
  const [convertToScale, setConvertToScale] = useState(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const hexInputRef = useRef<HTMLTextAreaElement>(null);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, isSecond = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      if (isSecond) {
        setData2(bytes);
        setFileName2(file.name);
      } else {
        setData(bytes);
        setFileName(file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Handle hex paste
  const handleHexPaste = useCallback(() => {
    const text = hexInputRef.current?.value || '';
    // Try hex first
    let bytes = parseHexString(text);
    if (!bytes) {
      // Try Base64
      bytes = parseBase64(text);
    }
    if (bytes) {
      setData(bytes);
      setFileName('pasted data');
    }
  }, []);

  // Swap endianness
  const handleSwapEndian = useCallback(() => {
    if (!data) return;
    const unitSize = viewMode === 'int' ? config.intSize / 8 :
                     viewMode === 'float' ? getFormatByteCount(config.floatFormat) : 2;
    setData(swapEndianness(data, unitSize));
  }, [data, viewMode, config]);

  // Convert format
  const handleConvert = useCallback(() => {
    if (!data) return;
    const fromScale = isScaledFormat(convertFrom) ? convertFromScale : 0;
    const toScale = isScaledFormat(convertTo) ? convertToScale : 0;
    const converted = convertFloatFormat(data, convertFrom, convertTo, endianness, fromScale, toScale);
    setData(converted);
  }, [data, convertFrom, convertTo, endianness, convertFromScale, convertToScale]);

  // Download data
  const handleDownload = useCallback(() => {
    if (!data) return;
    const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName ? `converted_${fileName}` : 'converted.bin';
    a.click();
    URL.revokeObjectURL(url);
  }, [data, fileName]);

  // Search
  const handleSearch = useCallback(() => {
    if (!data || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const results: SearchResult[] = [];

    if (searchType === 'hex') {
      const searchBytes = parseHexString(searchQuery);
      if (searchBytes) {
        for (let i = 0; i <= data.length - searchBytes.length; i++) {
          let match = true;
          for (let j = 0; j < searchBytes.length; j++) {
            if (data[i + j] !== searchBytes[j]) {
              match = false;
              break;
            }
          }
          if (match) results.push({ offset: i, length: searchBytes.length });
        }
      }
    } else if (searchType === 'ascii') {
      const searchStr = searchQuery;
      for (let i = 0; i <= data.length - searchStr.length; i++) {
        let match = true;
        for (let j = 0; j < searchStr.length; j++) {
          if (data[i + j] !== searchStr.charCodeAt(j)) {
            match = false;
            break;
          }
        }
        if (match) results.push({ offset: i, length: searchStr.length });
      }
    }

    setSearchResults(results);
    setCurrentResult(0);
  }, [data, searchQuery, searchType]);

  // Calculate statistics (always computed for int/float views)
  const stats = useMemo((): Statistics | null => {
    if (!data) return null;
    if (viewMode !== 'int' && viewMode !== 'float') return null;

    const values: number[] = [];
    if (viewMode === 'int') {
      const byteCount = config.intSize / 8;
      for (let i = 0; i < data.length; i += byteCount) {
        const val = readInt(data, i, config.intSize, endianness, config.intSign);
        if (val !== null) values.push(Number(val));
      }
    } else if (viewMode === 'float') {
      const byteCount = getFormatByteCount(config.floatFormat);
      const scale = isScaledFormat(config.floatFormat) ? viewScale : 0;
      for (let i = 0; i < data.length; i += byteCount) {
        const val = readFloat(data, i, config.floatFormat, endianness, scale);
        if (val !== null) values.push(val);
      }
    }

    return calculateStats(values);
  }, [data, viewMode, config, endianness, viewScale]);

  // Render hex dump view
  const renderHexDump = (bytes: Uint8Array, otherBytes?: Uint8Array) => {
    const rows: React.ReactNode[] = [];
    const { bytesPerRow } = config;
    const maxLength = Math.max(bytes.length, otherBytes?.length ?? 0);

    for (let offset = 0; offset < maxLength; offset += bytesPerRow) {
      const rowBytes = bytes.slice(offset, offset + bytesPerRow);
      const otherRowBytes = otherBytes?.slice(offset, offset + bytesPerRow);

      const hexCells1: React.ReactNode[] = [];
      const hexCells2: React.ReactNode[] = [];
      const asciiCells: React.ReactNode[] = [];

      for (let i = 0; i < bytesPerRow; i++) {
        const byte = rowBytes[i];
        const otherByte = otherRowBytes?.[i];
        const isDiff = diffMode && otherBytes && byte !== otherByte;
        const isHighlighted = searchResults.some(
          r => offset + i >= r.offset && offset + i < r.offset + r.length
        );

        // File 1 hex cells
        if (byte !== undefined) {
          hexCells1.push(
            <span
              key={i}
              className={`hex-viewer__byte ${isDiff ? 'hex-viewer__byte--diff' : ''} ${isHighlighted ? 'hex-viewer__byte--highlight' : ''}`}
            >
              {toHex(byte)}
            </span>
          );
          asciiCells.push(
            <span
              key={i}
              className={`hex-viewer__ascii ${isDiff ? 'hex-viewer__ascii--diff' : ''} ${isHighlighted ? 'hex-viewer__ascii--highlight' : ''}`}
            >
              {toAscii(byte)}
            </span>
          );
        } else {
          hexCells1.push(<span key={i} className="hex-viewer__byte hex-viewer__byte--empty">  </span>);
          asciiCells.push(<span key={i} className="hex-viewer__ascii hex-viewer__ascii--empty"> </span>);
        }

        // File 2 hex cells (only in diff mode)
        if (diffMode && otherBytes) {
          if (otherByte !== undefined) {
            hexCells2.push(
              <span
                key={i}
                className={`hex-viewer__byte ${isDiff ? 'hex-viewer__byte--diff2' : ''}`}
              >
                {toHex(otherByte)}
              </span>
            );
          } else {
            hexCells2.push(<span key={i} className="hex-viewer__byte hex-viewer__byte--empty">  </span>);
          }
        }

        // Add spacer every 8 bytes
        if (i === 7 && bytesPerRow === 16) {
          hexCells1.push(<span key="spacer" className="hex-viewer__spacer" />);
          if (diffMode && otherBytes) {
            hexCells2.push(<span key="spacer" className="hex-viewer__spacer" />);
          }
        }
      }

      rows.push(
        <div key={offset} className={`hex-viewer__row ${diffMode && otherBytes ? 'hex-viewer__row--diff' : ''}`}>
          <span className="hex-viewer__offset">{offset.toString(16).padStart(8, '0')}</span>
          <span className="hex-viewer__hex-cells">{hexCells1}</span>
          {diffMode && otherBytes && (
            <>
              <span className="hex-viewer__diff-separator">│</span>
              <span className="hex-viewer__hex-cells">{hexCells2}</span>
            </>
          )}
          <span className="hex-viewer__ascii-cells">{asciiCells}</span>
        </div>
      );
    }

    return <div className="hex-viewer__dump">{rows}</div>;
  };

  // Render integer view
  const renderIntView = (bytes: Uint8Array, otherBytes?: Uint8Array) => {
    const { intSize, intSign, bytesPerRow } = config;
    const byteCount = intSize / 8;
    // Cap values per row to keep display consistent (fewer in diff mode since we show 2 columns)
    const maxValuesPerRow = diffMode && otherBytes ? 4 : 8;
    const valuesPerRow = Math.min(maxValuesPerRow, Math.max(1, Math.floor(bytesPerRow / byteCount)));
    const bytesPerDisplayRow = valuesPerRow * byteCount;
    const rows: React.ReactNode[] = [];
    const maxLength = Math.max(bytes.length, otherBytes?.length ?? 0);

    for (let offset = 0; offset < maxLength; offset += bytesPerDisplayRow) {
      const cells1: React.ReactNode[] = [];
      const cells2: React.ReactNode[] = [];

      for (let i = 0; i < valuesPerRow; i++) {
        const pos = offset + i * byteCount;

        const value = pos + byteCount <= bytes.length ? readInt(bytes, pos, intSize, endianness, intSign) : null;
        const otherValue = otherBytes && pos + byteCount <= otherBytes.length
          ? readInt(otherBytes, pos, intSize, endianness, intSign)
          : null;
        const isDiff = diffMode && otherBytes && value !== otherValue;

        cells1.push(
          <span
            key={i}
            className={`hex-viewer__int-value ${isDiff ? 'hex-viewer__int-value--diff' : ''}`}
          >
            {value !== null ? value.toString() : '--'}
          </span>
        );

        if (diffMode && otherBytes) {
          cells2.push(
            <span
              key={i}
              className={`hex-viewer__int-value ${isDiff ? 'hex-viewer__int-value--diff2' : ''}`}
            >
              {otherValue !== null ? otherValue.toString() : '--'}
            </span>
          );
        }
      }

      rows.push(
        <div key={offset} className={`hex-viewer__row ${diffMode && otherBytes ? 'hex-viewer__row--diff' : ''}`}>
          <span className="hex-viewer__offset">{offset.toString(16).padStart(8, '0')}</span>
          <span
            className="hex-viewer__int-cells"
            style={{ '--values-per-row': valuesPerRow } as React.CSSProperties}
          >
            {cells1}
          </span>
          {diffMode && otherBytes && (
            <>
              <span className="hex-viewer__diff-separator">│</span>
              <span
                className="hex-viewer__int-cells"
                style={{ '--values-per-row': valuesPerRow } as React.CSSProperties}
              >
                {cells2}
              </span>
            </>
          )}
        </div>
      );
    }

    return <div className="hex-viewer__dump hex-viewer__dump--int">{rows}</div>;
  };

  // Render float view
  const renderFloatView = (bytes: Uint8Array, otherBytes?: Uint8Array) => {
    const { floatFormat, bytesPerRow } = config;
    const byteCount = getFormatByteCount(floatFormat);
    const scale = isScaledFormat(floatFormat) ? viewScale : 0;
    // Cap values per row to keep display consistent (fewer in diff mode since we show 2 columns)
    const maxValuesPerRow = diffMode && otherBytes ? 4 : 8;
    const valuesPerRow = Math.min(maxValuesPerRow, Math.max(1, Math.floor(bytesPerRow / byteCount)));
    const bytesPerDisplayRow = valuesPerRow * byteCount;
    const rows: React.ReactNode[] = [];
    const maxLength = Math.max(bytes.length, otherBytes?.length ?? 0);

    for (let offset = 0; offset < maxLength; offset += bytesPerDisplayRow) {
      const cells1: React.ReactNode[] = [];
      const cells2: React.ReactNode[] = [];

      for (let i = 0; i < valuesPerRow; i++) {
        const pos = offset + i * byteCount;

        const value = pos + byteCount <= bytes.length ? readFloat(bytes, pos, floatFormat, endianness, scale) : null;
        const otherValue = otherBytes && pos + byteCount <= otherBytes.length
          ? readFloat(otherBytes, pos, floatFormat, endianness, scale)
          : null;
        const isDiff = diffMode && otherBytes && value !== otherValue;

        cells1.push(
          <span
            key={i}
            className={`hex-viewer__float-value ${isDiff ? 'hex-viewer__float-value--diff' : ''}`}
          >
            {value !== null ? formatNumber(value) : '--'}
          </span>
        );

        if (diffMode && otherBytes) {
          cells2.push(
            <span
              key={i}
              className={`hex-viewer__float-value ${isDiff ? 'hex-viewer__float-value--diff2' : ''}`}
            >
              {otherValue !== null ? formatNumber(otherValue) : '--'}
            </span>
          );
        }
      }

      rows.push(
        <div key={offset} className={`hex-viewer__row ${diffMode && otherBytes ? 'hex-viewer__row--diff' : ''}`}>
          <span className="hex-viewer__offset">{offset.toString(16).padStart(8, '0')}</span>
          <span
            className="hex-viewer__float-cells"
            style={{ '--values-per-row': valuesPerRow } as React.CSSProperties}
          >
            {cells1}
          </span>
          {diffMode && otherBytes && (
            <>
              <span className="hex-viewer__diff-separator">│</span>
              <span
                className="hex-viewer__float-cells"
                style={{ '--values-per-row': valuesPerRow } as React.CSSProperties}
              >
                {cells2}
              </span>
            </>
          )}
        </div>
      );
    }

    return <div className="hex-viewer__dump hex-viewer__dump--float">{rows}</div>;
  };

  // Render ASCII view
  const renderAsciiView = (bytes: Uint8Array, otherBytes?: Uint8Array) => {
    const { bytesPerRow } = config;
    const rows: React.ReactNode[] = [];
    const maxLength = Math.max(bytes.length, otherBytes?.length ?? 0);

    for (let offset = 0; offset < maxLength; offset += bytesPerRow) {
      const rowBytes = bytes.slice(offset, offset + bytesPerRow);
      const otherRowBytes = otherBytes?.slice(offset, offset + bytesPerRow);
      const cells1: React.ReactNode[] = [];
      const cells2: React.ReactNode[] = [];

      for (let i = 0; i < bytesPerRow; i++) {
        const byte = rowBytes[i];
        const otherByte = otherRowBytes?.[i];
        const isDiff = diffMode && otherBytes && byte !== otherByte;
        const isHighlighted = searchResults.some(
          r => offset + i >= r.offset && offset + i < r.offset + r.length
        );
        const isPrintable = byte !== undefined && byte >= 32 && byte < 127;
        const otherIsPrintable = otherByte !== undefined && otherByte >= 32 && otherByte < 127;

        cells1.push(
          <span
            key={i}
            className={`hex-viewer__ascii-char ${byte === undefined ? 'hex-viewer__ascii-char--empty' : ''} ${!isPrintable && byte !== undefined ? 'hex-viewer__ascii-char--nonprint' : ''} ${isDiff ? 'hex-viewer__ascii-char--diff' : ''} ${isHighlighted ? 'hex-viewer__ascii-char--highlight' : ''}`}
          >
            {byte === undefined ? ' ' : isPrintable ? String.fromCharCode(byte) : '.'}
          </span>
        );

        if (diffMode && otherBytes) {
          cells2.push(
            <span
              key={i}
              className={`hex-viewer__ascii-char ${otherByte === undefined ? 'hex-viewer__ascii-char--empty' : ''} ${!otherIsPrintable && otherByte !== undefined ? 'hex-viewer__ascii-char--nonprint' : ''} ${isDiff ? 'hex-viewer__ascii-char--diff2' : ''}`}
            >
              {otherByte === undefined ? ' ' : otherIsPrintable ? String.fromCharCode(otherByte) : '.'}
            </span>
          );
        }
      }

      rows.push(
        <div key={offset} className={`hex-viewer__row ${diffMode && otherBytes ? 'hex-viewer__row--diff' : ''}`}>
          <span className="hex-viewer__offset">{offset.toString(16).padStart(8, '0')}</span>
          <span className="hex-viewer__ascii-line">{cells1}</span>
          {diffMode && otherBytes && (
            <>
              <span className="hex-viewer__diff-separator">│</span>
              <span className="hex-viewer__ascii-line">{cells2}</span>
            </>
          )}
        </div>
      );
    }

    return <div className="hex-viewer__dump hex-viewer__dump--ascii">{rows}</div>;
  };

  // Render current view
  const renderView = () => {
    if (!data) return null;

    switch (viewMode) {
      case 'hex':
        return renderHexDump(data, diffMode ? data2 ?? undefined : undefined);
      case 'int':
        return renderIntView(data, diffMode ? data2 ?? undefined : undefined);
      case 'float':
        return renderFloatView(data, diffMode ? data2 ?? undefined : undefined);
      case 'ascii':
        return renderAsciiView(data, diffMode ? data2 ?? undefined : undefined);
    }
  };

  return (
    <ToolPage
      title="Hex Viewer & Binary Diff Tool"
      description="Free online hex viewer and binary file analyzer. View files as hex dump, integers (8/16/32/64-bit), or floating-point (FP64, FP32, FP16, BF16, FP8, MXFP). Side-by-side diff comparison, pattern search, endianness swap, format conversion, and statistics. Perfect for debugging, reverse engineering, and ML model analysis."
      keywords={[
        'hex viewer',
        'hex viewer online',
        'hex editor',
        'binary viewer',
        'binary file viewer',
        'hex dump',
        'binary diff',
        'hex compare',
        'file comparison tool',
        'binary file diff',
        'float viewer',
        'fp32 viewer',
        'fp16 viewer',
        'fp64 viewer',
        'bfloat16 viewer',
        'bf16',
        'fp8 viewer',
        'e4m3',
        'e5m2',
        'mxfp viewer',
        'microscaling formats',
        'float converter',
        'fp32 to fp16',
        'endian swap',
        'byte swap',
        'little endian',
        'big endian',
        'binary to decimal',
        'hex to decimal',
        'integer viewer',
        'byte viewer',
        'data converter',
        'binary analysis',
        'reverse engineering',
        'debugging tool',
        'machine learning formats',
        'ml model viewer',
        'tensor viewer',
        'developer tools',
        'free hex viewer'
      ]}
    >
      <div className="hex-viewer">
        {/* Header with Mode Tabs */}
        <div className="hex-viewer__header">
          <TabSelector
            tabs={MODE_TABS}
            activeTab={diffMode ? 'diff' : 'normal'}
            onTabChange={(id) => setDiffMode(id === 'diff')}
            size="md"
            className="hex-viewer__mode-tabs"
          />
        </div>

        {/* Input Section */}
        <div className="hex-viewer__input-section">
          <div className="hex-viewer__input-row">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="hex-viewer__upload-btn"
            >
              <UploadIcon size={16} /> {diffMode ? 'Upload File 1' : 'Upload Binary'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handleFileUpload(e, false)}
              className="hex-viewer__file-input"
            />

            {diffMode && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef2.current?.click()}
                  className="hex-viewer__upload-btn"
                >
                  <UploadIcon size={16} /> Upload File 2
                </Button>
                <input
                  ref={fileInputRef2}
                  type="file"
                  onChange={(e) => handleFileUpload(e, true)}
                  className="hex-viewer__file-input"
                />
              </>
            )}

            <div className="hex-viewer__paste-group">
              <textarea
                ref={hexInputRef}
                className="hex-viewer__paste-input"
                placeholder="Paste hex (00 11 22...) or Base64"
                rows={1}
              />
              <Button variant="primary" size="sm" onClick={handleHexPaste}>
                Load
              </Button>
            </div>
          </div>

          {(fileName || fileName2) && (
            <div className="hex-viewer__file-info">
              {fileName && <span>File 1: {fileName} ({data?.length ?? 0} bytes)</span>}
              {fileName2 && <span>File 2: {fileName2} ({data2?.length ?? 0} bytes)</span>}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="hex-viewer__controls">
          <div className="hex-viewer__control-row">
            <TabSelector
              tabs={VIEW_TABS}
              activeTab={viewMode}
              onTabChange={(id) => setViewMode(id as ViewMode)}
              size="sm"
              className="hex-viewer__view-tabs"
            />

            <div className="hex-viewer__control-options">
              <div className="hex-viewer__control-group">
                <label className="hex-viewer__control-label">Endian:</label>
                <select
                  className="hex-viewer__select"
                  value={endianness}
                  onChange={(e) => setEndianness(e.target.value as Endianness)}
                >
                  <option value="little">Little</option>
                  <option value="big">Big</option>
                </select>
              </div>

              <div className="hex-viewer__control-group">
                <label className="hex-viewer__control-label">Bytes/Row:</label>
                <select
                  className="hex-viewer__select"
                  value={config.bytesPerRow}
                  onChange={(e) => setConfig({ ...config, bytesPerRow: Number(e.target.value) })}
                >
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                </select>
              </div>
            </div>
          </div>

          {/* View-specific controls */}
          {viewMode === 'int' && (
            <div className="hex-viewer__control-row">
              <div className="hex-viewer__control-group">
                <label className="hex-viewer__control-label">Size:</label>
                <select
                  className="hex-viewer__select"
                  value={config.intSize}
                  onChange={(e) => setConfig({ ...config, intSize: Number(e.target.value) as IntSize })}
                >
                  <option value={8}>8-bit</option>
                  <option value={16}>16-bit</option>
                  <option value={32}>32-bit</option>
                  <option value={64}>64-bit</option>
                </select>
              </div>

              <div className="hex-viewer__control-group">
                <label className="hex-viewer__control-label">Sign:</label>
                <select
                  className="hex-viewer__select"
                  value={config.intSign}
                  onChange={(e) => setConfig({ ...config, intSign: e.target.value as IntSign })}
                >
                  <option value="unsigned">Unsigned</option>
                  <option value="signed">Signed</option>
                </select>
              </div>
            </div>
          )}

          {viewMode === 'float' && (
            <div className="hex-viewer__control-row">
              <div className="hex-viewer__control-group">
                <label className="hex-viewer__control-label">Format:</label>
                <select
                  className="hex-viewer__select"
                  value={config.floatFormat}
                  onChange={(e) => setConfig({ ...config, floatFormat: e.target.value as FloatFormat })}
                >
                  <optgroup label="Standard">
                    <option value="fp64">FP64 (Double)</option>
                    <option value="fp32">FP32 (Float)</option>
                  </optgroup>
                  <optgroup label="Half Precision">
                    <option value="fp16">FP16 (Half)</option>
                    <option value="bf16">BF16 (BFloat16)</option>
                  </optgroup>
                  <optgroup label="8-bit (FP8)">
                    <option value="e4m3">E4M3</option>
                    <option value="e5m2">E5M2</option>
                  </optgroup>
                  <optgroup label="Microscaling (MXFP)">
                    <option value="mxfp8_e4m3">MXFP8 E4M3</option>
                    <option value="mxfp8_e5m2">MXFP8 E5M2</option>
                    <option value="mxfp6_e3m2">MXFP6 E3M2</option>
                    <option value="mxfp6_e2m3">MXFP6 E2M3</option>
                    <option value="mxfp4_e2m1">MXFP4 E2M1</option>
                  </optgroup>
                </select>
              </div>

              {isScaledFormat(config.floatFormat) && (
                <div className="hex-viewer__control-group">
                  <label className="hex-viewer__control-label">Scale (2^n):</label>
                  <input
                    type="number"
                    className="hex-viewer__scale-input"
                    value={viewScale}
                    onChange={(e) => setViewScale(parseInt(e.target.value) || 0)}
                  />
                  <span className="hex-viewer__scale-hint">
                    = {Math.pow(2, viewScale).toExponential(2)}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Search */}
        <div className="hex-viewer__search">
          <select
            className="hex-viewer__select"
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as typeof searchType)}
          >
            <option value="hex">Hex</option>
            <option value="ascii">ASCII</option>
          </select>
          <input
            type="text"
            className="hex-viewer__search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="secondary" size="sm" onClick={handleSearch}>
            Search
          </Button>
          {searchResults.length > 0 && (
            <span className="hex-viewer__search-results">
              {currentResult + 1} / {searchResults.length} matches
              <Button
                variant="ghost"
                size="sm"
                className="hex-viewer__search-nav"
                onClick={() => setCurrentResult((currentResult - 1 + searchResults.length) % searchResults.length)}
              >
                ←
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hex-viewer__search-nav"
                onClick={() => setCurrentResult((currentResult + 1) % searchResults.length)}
              >
                →
              </Button>
            </span>
          )}
        </div>

        {/* Statistics */}
        {stats && (
          <div className="hex-viewer__stats">
            <span>Count: {stats.count}</span>
            <span>Min: {formatNumber(stats.min)}</span>
            <span>Max: {formatNumber(stats.max)}</span>
            <span>Mean: {formatNumber(stats.mean)}</span>
            <span>Sum: {formatNumber(stats.sum)}</span>
          </div>
        )}

        {/* Data View */}
        <div className="hex-viewer__view">
          {data ? renderView() : (
            <div className="hex-viewer__empty">
              Upload a binary file or paste hex/Base64 data to begin
            </div>
          )}
        </div>

        {/* Actions */}
        {data && (
          <div className="hex-viewer__actions">
            <div className="hex-viewer__action-group">
              <Button variant="secondary" size="sm" onClick={handleSwapEndian}>
                Swap Endianness
              </Button>
            </div>

            <div className="hex-viewer__action-group hex-viewer__action-group--convert">
              <span className="hex-viewer__action-label">Convert:</span>
              <select
                className="hex-viewer__select"
                value={convertFrom}
                onChange={(e) => setConvertFrom(e.target.value as FloatFormat)}
              >
                <optgroup label="Standard">
                  <option value="fp64">FP64</option>
                  <option value="fp32">FP32</option>
                </optgroup>
                <optgroup label="Half">
                  <option value="fp16">FP16</option>
                  <option value="bf16">BF16</option>
                </optgroup>
                <optgroup label="FP8">
                  <option value="e4m3">E4M3</option>
                  <option value="e5m2">E5M2</option>
                </optgroup>
                <optgroup label="MXFP">
                  <option value="mxfp8_e4m3">MX8-E4M3</option>
                  <option value="mxfp8_e5m2">MX8-E5M2</option>
                  <option value="mxfp6_e3m2">MX6-E3M2</option>
                  <option value="mxfp6_e2m3">MX6-E2M3</option>
                  <option value="mxfp4_e2m1">MX4-E2M1</option>
                </optgroup>
              </select>
              {isScaledFormat(convertFrom) && (
                <input
                  type="number"
                  className="hex-viewer__scale-input hex-viewer__scale-input--compact"
                  value={convertFromScale}
                  onChange={(e) => setConvertFromScale(parseInt(e.target.value) || 0)}
                  title="Source scale (2^n)"
                  placeholder="scale"
                />
              )}
              <span>→</span>
              <select
                className="hex-viewer__select"
                value={convertTo}
                onChange={(e) => setConvertTo(e.target.value as FloatFormat)}
              >
                <optgroup label="Standard">
                  <option value="fp64">FP64</option>
                  <option value="fp32">FP32</option>
                </optgroup>
                <optgroup label="Half">
                  <option value="fp16">FP16</option>
                  <option value="bf16">BF16</option>
                </optgroup>
                <optgroup label="FP8">
                  <option value="e4m3">E4M3</option>
                  <option value="e5m2">E5M2</option>
                </optgroup>
                <optgroup label="MXFP">
                  <option value="mxfp8_e4m3">MX8-E4M3</option>
                  <option value="mxfp8_e5m2">MX8-E5M2</option>
                  <option value="mxfp6_e3m2">MX6-E3M2</option>
                  <option value="mxfp6_e2m3">MX6-E2M3</option>
                  <option value="mxfp4_e2m1">MX4-E2M1</option>
                </optgroup>
              </select>
              {isScaledFormat(convertTo) && (
                <input
                  type="number"
                  className="hex-viewer__scale-input hex-viewer__scale-input--compact"
                  value={convertToScale}
                  onChange={(e) => setConvertToScale(parseInt(e.target.value) || 0)}
                  title="Target scale (2^n)"
                  placeholder="scale"
                />
              )}
              <Button variant="secondary" size="sm" onClick={handleConvert}>
                Convert
              </Button>
            </div>

            <Button variant="primary" size="sm" onClick={handleDownload} className="hex-viewer__download-btn">
              Download
            </Button>
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default HexViewer;
