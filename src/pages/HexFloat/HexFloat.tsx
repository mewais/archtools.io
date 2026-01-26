import React, { useState, useCallback, useRef, useMemo } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon, UploadIcon } from '../../components/Icons';
import './HexFloat.css';

type TabMode = 'single' | 'bulk';

// IEEE 754 Format configurations
interface FormatConfig {
  name: string;
  shortName: string;
  totalBits: number;
  signBits: number;
  exponentBits: number;
  mantissaBits: number;
  bias: number;
  category: 'standard' | 'half' | 'fp8' | 'scaled';
  hasInfNan?: boolean; // Some FP8 formats don't have inf/nan
}

const FP_FORMATS: FormatConfig[] = [
  { name: 'FP64 (Double)', shortName: 'FP64', totalBits: 64, signBits: 1, exponentBits: 11, mantissaBits: 52, bias: 1023, category: 'standard', hasInfNan: true },
  { name: 'FP32 (Float)', shortName: 'FP32', totalBits: 32, signBits: 1, exponentBits: 8, mantissaBits: 23, bias: 127, category: 'standard', hasInfNan: true },
  { name: 'FP16 (Half)', shortName: 'FP16', totalBits: 16, signBits: 1, exponentBits: 5, mantissaBits: 10, bias: 15, category: 'half', hasInfNan: true },
  { name: 'BF16 (Brain Float)', shortName: 'BF16', totalBits: 16, signBits: 1, exponentBits: 8, mantissaBits: 7, bias: 127, category: 'half', hasInfNan: true },
  { name: 'FP8 E4M3', shortName: 'E4M3', totalBits: 8, signBits: 1, exponentBits: 4, mantissaBits: 3, bias: 7, category: 'fp8', hasInfNan: false },
  { name: 'FP8 E5M2', shortName: 'E5M2', totalBits: 8, signBits: 1, exponentBits: 5, mantissaBits: 2, bias: 15, category: 'fp8', hasInfNan: true },
];

// Scaled FP formats (MX/Microscaling - standard FP layout with shared block scale)
// See OCP Microscaling Formats Specification v1.0
interface ScaledFormatConfig {
  name: string;
  shortName: string;
  totalBits: number;
  signBits: number;
  exponentBits: number;
  mantissaBits: number;
  bias: number;
  hasInfNan: boolean;
}

const SCALED_FORMATS: ScaledFormatConfig[] = [
  { name: 'MXFP8 E4M3', shortName: 'MX8-E4M3', totalBits: 8, signBits: 1, exponentBits: 4, mantissaBits: 3, bias: 7, hasInfNan: false },
  { name: 'MXFP8 E5M2', shortName: 'MX8-E5M2', totalBits: 8, signBits: 1, exponentBits: 5, mantissaBits: 2, bias: 15, hasInfNan: true },
  { name: 'MXFP6 E3M2', shortName: 'MX6-E3M2', totalBits: 6, signBits: 1, exponentBits: 3, mantissaBits: 2, bias: 3, hasInfNan: false },
  { name: 'MXFP6 E2M3', shortName: 'MX6-E2M3', totalBits: 6, signBits: 1, exponentBits: 2, mantissaBits: 3, bias: 1, hasInfNan: false },
  { name: 'MXFP4 E2M1', shortName: 'MX4-E2M1', totalBits: 4, signBits: 1, exponentBits: 2, mantissaBits: 1, bias: 1, hasInfNan: false },
];

// Encode a number to a specific FP format
interface EncodedValue {
  hex: string;
  bits: bigint;
  binary: string;
  signBit: string;
  exponentBits: string;
  mantissaBits: string;
  decodedValue: number | string;
  isSpecial: boolean;
  specialType?: 'inf' | '-inf' | 'nan' | 'denorm' | 'zero';
}

interface ScaledEncodedValue {
  hex: string;
  bits: bigint;
  binary: string;
  signBit: string;
  exponentBits: string;
  mantissaBits: string;
  decodedValue: number;
  scaledValue: number;
}

// Convert float64 to raw bits
const float64ToBits = (value: number): bigint => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  return (BigInt(view.getUint32(0)) << 32n) | BigInt(view.getUint32(4));
};

// Convert raw bits to float64
const bitsToFloat64 = (bits: bigint): number => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Number((bits >> 32n) & 0xFFFFFFFFn), false);
  view.setUint32(4, Number(bits & 0xFFFFFFFFn), false);
  return view.getFloat64(0, false);
};

// Convert float32 to raw bits
const float32ToBits = (value: number): bigint => {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return BigInt(view.getUint32(0, false));
};

// Convert raw bits to float32
const bitsToFloat32 = (bits: bigint): number => {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, Number(bits & 0xFFFFFFFFn), false);
  return view.getFloat32(0, false);
};

// Encode a number to a given FP format
const encodeToFormat = (value: number, format: FormatConfig): EncodedValue => {
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = format;

  // Handle special cases first
  if (Number.isNaN(value)) {
    if (hasInfNan) {
      const expMask = (1n << BigInt(exponentBits)) - 1n;
      const mantissaVal = 1n << BigInt(mantissaBits - 1);
      const bits = (expMask << BigInt(mantissaBits)) | mantissaVal;
      return formatEncodedValue(bits, format, 'nan');
    } else {
      // For formats without NaN, encode as max value
      const maxExp = (1n << BigInt(exponentBits)) - 1n;
      const maxMant = (1n << BigInt(mantissaBits)) - 1n;
      const bits = (maxExp << BigInt(mantissaBits)) | maxMant;
      return formatEncodedValue(bits, format, undefined);
    }
  }

  if (!Number.isFinite(value)) {
    if (hasInfNan) {
      const sign = value < 0 ? 1n : 0n;
      const expMask = (1n << BigInt(exponentBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (expMask << BigInt(mantissaBits));
      return formatEncodedValue(bits, format, value < 0 ? '-inf' : 'inf');
    } else {
      // For formats without Inf, saturate to max value
      const sign = value < 0 ? 1n : 0n;
      const maxExp = (1n << BigInt(exponentBits)) - 1n;
      const maxMant = (1n << BigInt(mantissaBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (maxExp << BigInt(mantissaBits)) | maxMant;
      return formatEncodedValue(bits, format, undefined);
    }
  }

  if (value === 0) {
    const bits = Object.is(value, -0) ? (1n << BigInt(totalBits - 1)) : 0n;
    return formatEncodedValue(bits, format, 'zero');
  }

  const sign = value < 0 ? 1n : 0n;
  const absValue = Math.abs(value);

  let exp = Math.floor(Math.log2(absValue));
  let mantissa = absValue / Math.pow(2, exp) - 1;

  let biasedExp = exp + bias;

  const maxExp = hasInfNan ? (1 << exponentBits) - 2 : (1 << exponentBits) - 1;
  if (biasedExp > maxExp) {
    if (hasInfNan) {
      const expMask = (1n << BigInt(exponentBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (expMask << BigInt(mantissaBits));
      return formatEncodedValue(bits, format, sign ? '-inf' : 'inf');
    } else {
      // Saturate
      const maxExpBig = BigInt(maxExp);
      const maxMant = (1n << BigInt(mantissaBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (maxExpBig << BigInt(mantissaBits)) | maxMant;
      return formatEncodedValue(bits, format, undefined);
    }
  }

  if (biasedExp <= 0) {
    const shift = 1 - biasedExp;
    if (shift > mantissaBits + 1) {
      const bits = sign << BigInt(totalBits - 1);
      return formatEncodedValue(bits, format, 'zero');
    }
    const denormMantissa = (1 + mantissa) / Math.pow(2, shift);
    const mantissaInt = BigInt(Math.round(denormMantissa * Math.pow(2, mantissaBits)));
    const bits = (sign << BigInt(totalBits - 1)) | mantissaInt;
    return formatEncodedValue(bits, format, 'denorm');
  }

  const mantissaInt = BigInt(Math.round(mantissa * Math.pow(2, mantissaBits)));
  const expInt = BigInt(biasedExp);
  const bits = (sign << BigInt(totalBits - 1)) | (expInt << BigInt(mantissaBits)) | mantissaInt;

  return formatEncodedValue(bits, format, undefined);
};

const formatEncodedValue = (
  bits: bigint,
  format: FormatConfig,
  specialType?: 'inf' | '-inf' | 'nan' | 'denorm' | 'zero'
): EncodedValue => {
  const { totalBits, exponentBits } = format;

  const binary = bits.toString(2).padStart(totalBits, '0');
  const hex = '0x' + bits.toString(16).toUpperCase().padStart(totalBits / 4, '0');

  const signBit = binary[0];
  const exponentBitsStr = binary.slice(1, 1 + exponentBits);
  const mantissaBitsStr = binary.slice(1 + exponentBits);

  let decodedValue: number | string;
  let isSpecial = !!specialType;

  if (specialType === 'nan') {
    decodedValue = 'NaN';
  } else if (specialType === 'inf') {
    decodedValue = '+Infinity';
  } else if (specialType === '-inf') {
    decodedValue = '-Infinity';
  } else if (specialType === 'zero') {
    decodedValue = signBit === '1' ? '-0' : '0';
  } else {
    decodedValue = decodeFromBits(bits, format);
    if (specialType === 'denorm') {
      isSpecial = true;
    }
  }

  return {
    hex,
    bits,
    binary,
    signBit,
    exponentBits: exponentBitsStr,
    mantissaBits: mantissaBitsStr,
    decodedValue,
    isSpecial,
    specialType,
  };
};

const decodeFromBits = (bits: bigint, format: FormatConfig): number => {
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = format;

  const signMask = 1n << BigInt(totalBits - 1);
  const expMask = ((1n << BigInt(exponentBits)) - 1n) << BigInt(mantissaBits);
  const mantMask = (1n << BigInt(mantissaBits)) - 1n;

  const sign = (bits & signMask) !== 0n ? -1 : 1;
  const expBits = Number((bits & expMask) >> BigInt(mantissaBits));
  const mantBits = bits & mantMask;

  if (expBits === 0) {
    if (mantBits === 0n) return sign === -1 ? -0 : 0;
    const mantissa = Number(mantBits) / Math.pow(2, mantissaBits);
    return sign * mantissa * Math.pow(2, 1 - bias);
  }

  const maxExp = (1 << exponentBits) - 1;
  if (expBits === maxExp && hasInfNan) {
    if (mantBits === 0n) return sign * Infinity;
    return NaN;
  }

  const exp = expBits - bias;
  const mantissa = 1 + Number(mantBits) / Math.pow(2, mantissaBits);
  return sign * mantissa * Math.pow(2, exp);
};

// Encode to scaled format (MX format with shared block scale)
const encodeToScaledFormat = (value: number, format: ScaledFormatConfig, scale: number): ScaledEncodedValue => {
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = format;

  // Scale down the value by 2^scale (shared block scale)
  const scaledDown = value / Math.pow(2, scale);

  // Handle zero
  if (scaledDown === 0) {
    const bits = Object.is(scaledDown, -0) ? (1n << BigInt(totalBits - 1)) : 0n;
    return formatScaledValue(bits, format, scale);
  }

  // Handle infinity/NaN for formats that support them
  if (!Number.isFinite(scaledDown)) {
    if (hasInfNan) {
      const sign = scaledDown < 0 ? 1n : 0n;
      const expMask = (1n << BigInt(exponentBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (expMask << BigInt(mantissaBits));
      return formatScaledValue(bits, format, scale);
    } else {
      // Saturate to max value
      const sign = scaledDown < 0 ? 1n : 0n;
      const maxExp = (1n << BigInt(exponentBits)) - 1n;
      const maxMant = (1n << BigInt(mantissaBits)) - 1n;
      const bits = (sign << BigInt(totalBits - 1)) | (maxExp << BigInt(mantissaBits)) | maxMant;
      return formatScaledValue(bits, format, scale);
    }
  }

  if (Number.isNaN(scaledDown)) {
    if (hasInfNan) {
      const expMask = (1n << BigInt(exponentBits)) - 1n;
      const mantissaVal = 1n << BigInt(mantissaBits - 1);
      const bits = (expMask << BigInt(mantissaBits)) | mantissaVal;
      return formatScaledValue(bits, format, scale);
    } else {
      // No NaN representation, use zero
      return formatScaledValue(0n, format, scale);
    }
  }

  const sign = scaledDown < 0 ? 1n : 0n;
  const absValue = Math.abs(scaledDown);

  let exp = Math.floor(Math.log2(absValue));
  let mantissa = absValue / Math.pow(2, exp) - 1;

  let biasedExp = exp + bias;

  const maxExp = hasInfNan ? (1 << exponentBits) - 2 : (1 << exponentBits) - 1;
  if (biasedExp > maxExp) {
    // Overflow - saturate to max
    const maxExpBig = BigInt(maxExp);
    const maxMant = (1n << BigInt(mantissaBits)) - 1n;
    const bits = (sign << BigInt(totalBits - 1)) | (maxExpBig << BigInt(mantissaBits)) | maxMant;
    return formatScaledValue(bits, format, scale);
  }

  if (biasedExp <= 0) {
    // Denormalized
    const shift = 1 - biasedExp;
    if (shift > mantissaBits + 1) {
      const bits = sign << BigInt(totalBits - 1);
      return formatScaledValue(bits, format, scale);
    }
    const denormMantissa = (1 + mantissa) / Math.pow(2, shift);
    const mantissaInt = BigInt(Math.round(denormMantissa * Math.pow(2, mantissaBits)));
    const bits = (sign << BigInt(totalBits - 1)) | mantissaInt;
    return formatScaledValue(bits, format, scale);
  }

  const mantissaInt = BigInt(Math.round(mantissa * Math.pow(2, mantissaBits)));
  const expInt = BigInt(biasedExp);
  const bits = (sign << BigInt(totalBits - 1)) | (expInt << BigInt(mantissaBits)) | mantissaInt;

  return formatScaledValue(bits, format, scale);
};

// Helper to format scaled encoded value
const formatScaledValue = (bits: bigint, format: ScaledFormatConfig, scale: number): ScaledEncodedValue => {
  const { totalBits, exponentBits, mantissaBits } = format;

  const binary = bits.toString(2).padStart(totalBits, '0');
  const hex = '0x' + bits.toString(16).toUpperCase().padStart(Math.ceil(totalBits / 4), '0');

  const signBit = binary[0];
  const exponentBitsStr = binary.slice(1, 1 + exponentBits);
  const mantissaBitsStr = binary.slice(1 + exponentBits);

  // Decode value without scale
  const decodedValue = decodeScaledFromBits(bits, format);
  // Apply scale
  const scaledValue = decodedValue * Math.pow(2, scale);

  return {
    hex,
    bits,
    binary,
    signBit,
    exponentBits: exponentBitsStr,
    mantissaBits: mantissaBitsStr,
    decodedValue,
    scaledValue,
  };
};

// Decode scaled format bits to number
const decodeScaledFromBits = (bits: bigint, format: ScaledFormatConfig): number => {
  const { totalBits, exponentBits, mantissaBits, bias, hasInfNan } = format;

  const signMask = 1n << BigInt(totalBits - 1);
  const expMask = ((1n << BigInt(exponentBits)) - 1n) << BigInt(mantissaBits);
  const mantMask = (1n << BigInt(mantissaBits)) - 1n;

  const sign = (bits & signMask) !== 0n ? -1 : 1;
  const expBits = Number((bits & expMask) >> BigInt(mantissaBits));
  const mantBits = bits & mantMask;

  if (expBits === 0) {
    if (mantBits === 0n) return sign === -1 ? -0 : 0;
    // Denormalized
    const mantissa = Number(mantBits) / Math.pow(2, mantissaBits);
    return sign * mantissa * Math.pow(2, 1 - bias);
  }

  const maxExp = (1 << exponentBits) - 1;
  if (expBits === maxExp && hasInfNan) {
    if (mantBits === 0n) return sign * Infinity;
    return NaN;
  }

  const exp = expBits - bias;
  const mantissa = 1 + Number(mantBits) / Math.pow(2, mantissaBits);
  return sign * mantissa * Math.pow(2, exp);
};

// Calculate optimal scale for a value
const calculateOptimalScale = (value: number): number => {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const absValue = Math.abs(value);
  // Scale such that value fits in reasonable mantissa range
  return Math.floor(Math.log2(absValue)) + 1;
};

// Parse user input
const parseFloatInput = (input: string): { value: number; isValid: boolean; inputFormat?: string } => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { value: 0, isValid: false };

  if (trimmed === 'nan') return { value: NaN, isValid: true, inputFormat: 'special' };
  if (trimmed === 'inf' || trimmed === '+inf' || trimmed === 'infinity' || trimmed === '+infinity') {
    return { value: Infinity, isValid: true, inputFormat: 'special' };
  }
  if (trimmed === '-inf' || trimmed === '-infinity') {
    return { value: -Infinity, isValid: true, inputFormat: 'special' };
  }

  if (trimmed.startsWith('0x')) {
    try {
      const bits = BigInt(trimmed);
      const hexDigits = trimmed.length - 2;
      if (hexDigits <= 4) {
        const value = decodeFromBits(bits, FP_FORMATS[2]);
        return { value, isValid: true, inputFormat: 'hex16' };
      } else if (hexDigits <= 8) {
        const value = bitsToFloat32(bits);
        return { value, isValid: true, inputFormat: 'hex32' };
      } else {
        const value = bitsToFloat64(bits);
        return { value, isValid: true, inputFormat: 'hex64' };
      }
    } catch {
      return { value: 0, isValid: false };
    }
  }

  const value = parseFloat(trimmed);
  if (Number.isNaN(value) && trimmed !== 'nan') {
    return { value: 0, isValid: false };
  }

  return { value, isValid: true, inputFormat: 'decimal' };
};

interface AllEncodings {
  fp64: EncodedValue;
  fp32: EncodedValue;
  fp16: EncodedValue;
  bf16: EncodedValue;
  fp8e4m3: EncodedValue;
  fp8e5m2: EncodedValue;
}

const encodeAllFormats = (value: number): AllEncodings => ({
  fp64: encodeToFormat(value, FP_FORMATS[0]),
  fp32: encodeToFormat(value, FP_FORMATS[1]),
  fp16: encodeToFormat(value, FP_FORMATS[2]),
  bf16: encodeToFormat(value, FP_FORMATS[3]),
  fp8e4m3: encodeToFormat(value, FP_FORMATS[4]),
  fp8e5m2: encodeToFormat(value, FP_FORMATS[5]),
});

interface BulkResult {
  input: string;
  value: number;
  isValid: boolean;
  encodings?: AllEncodings;
}

const ChevronIcon: React.FC<{ expanded: boolean; size?: number }> = ({ expanded, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const HexFloat: React.FC = () => {
  const [mode, setMode] = useState<TabMode>('single');
  const [singleInput, setSingleInput] = useState('3.14159');
  const [bulkInput, setBulkInput] = useState('');
  const [sharedScale, setSharedScale] = useState(0);
  const [scaleInput, setScaleInput] = useState('0');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedSections, setExpandedSections] = useState({
    standard: true,
    half: true,
    fp8: false,
    scaled: false,
  });

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressTarget, setLongPressTarget] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const parsed = useMemo(() => parseFloatInput(singleInput), [singleInput]);
  const encodings = useMemo(() =>
    parsed.isValid ? encodeAllFormats(parsed.value) : null,
    [parsed]
  );

  // Scaled encodings
  const scaledEncodings = useMemo(() => {
    if (!parsed.isValid) return null;

    // Filter formats based on value compatibility
    const isSpecialValue = !Number.isFinite(parsed.value) || Number.isNaN(parsed.value);
    const compatibleFormats = isSpecialValue
      ? SCALED_FORMATS.filter(f => f.hasInfNan)
      : SCALED_FORMATS;

    if (compatibleFormats.length === 0) return null;

    return compatibleFormats.map(format => ({
      format,
      encoding: encodeToScaledFormat(parsed.value, format, sharedScale),
    }));
  }, [parsed, sharedScale]);

  // Auto-calculate optimal scale when section is expanded
  const suggestedScale = useMemo(() => {
    if (parsed.isValid && Number.isFinite(parsed.value)) {
      return calculateOptimalScale(parsed.value);
    }
    return 0;
  }, [parsed]);

  const bulkResults = useCallback((): BulkResult[] => {
    if (!bulkInput.trim()) return [];
    const values = bulkInput.split(/[\s,;\n]+/).filter(v => v.trim());
    return values.map(input => {
      const { value, isValid } = parseFloatInput(input);
      return {
        input,
        value,
        isValid,
        encodings: isValid ? encodeAllFormats(value) : undefined,
      };
    });
  }, [bulkInput]);

  const parsedBulkResults = bulkResults();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleTouchStart = (text: string) => {
    longPressTimerRef.current = setTimeout(() => {
      copyToClipboard(text);
      setLongPressTarget(text);
      setTimeout(() => setLongPressTarget(null), 300);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBulkInput(content);
    };
    reader.readAsText(file);
  };

  // Toggle a bit in a format and update the value
  const toggleBit = (format: FormatConfig, bitIndex: number, currentBits: bigint) => {
    const mask = 1n << BigInt(bitIndex);
    const newBits = currentBits ^ mask;
    const newValue = decodeFromBits(newBits, format);

    // Update input with new value
    if (Number.isNaN(newValue)) {
      setSingleInput('nan');
    } else if (!Number.isFinite(newValue)) {
      setSingleInput(newValue > 0 ? 'inf' : '-inf');
    } else if (Object.is(newValue, -0)) {
      setSingleInput('-0');
    } else {
      // Format nicely
      if (Math.abs(newValue) < 0.0001 || Math.abs(newValue) >= 1000000) {
        setSingleInput(newValue.toExponential(10));
      } else {
        setSingleInput(newValue.toPrecision(15).replace(/\.?0+$/, ''));
      }
    }
  };

  const formatDecodedValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (Number.isNaN(val)) return 'NaN';
    if (!Number.isFinite(val)) return val > 0 ? '+Infinity' : '-Infinity';
    if (Object.is(val, -0)) return '-0';
    if (Math.abs(val) < 0.0001 || Math.abs(val) >= 1000000) {
      return val.toExponential(6);
    }
    return val.toPrecision(7).replace(/\.?0+$/, '');
  };

  // Render clickable bit grid for a slice of bits
  const renderBitSlice = (
    format: FormatConfig,
    encoded: EncodedValue,
    bits: string,
    startBitIndex: number
  ) => {
    return (
      <div className="hex-float__bit-grid">
        {bits.split('').map((bit, idx) => {
          const bitIndex = startBitIndex - idx;
          return (
            <button
              key={idx}
              className={`hex-float__bit-cell ${bit === '1' ? 'hex-float__bit-cell--set' : ''}`}
              onClick={() => toggleBit(format, bitIndex, encoded.bits)}
              title={`Bit ${bitIndex}: Click to toggle`}
            >
              {bit}
            </button>
          );
        })}
      </div>
    );
  };

  // Split mantissa into chunks for multi-row display
  // firstChunkSize: how many mantissa bits fit on first row (with sign + exp)
  // remainingChunkSize: how many bits per subsequent row
  const splitMantissa = (
    mantissaBits: string,
    firstChunkSize: number,
    remainingChunkSize: number
  ) => {
    const chunks: { bits: string; startBit: number; endBit: number }[] = [];
    const totalBits = mantissaBits.length;

    if (totalBits <= firstChunkSize) {
      // All fits in first chunk
      return [{ bits: mantissaBits, startBit: totalBits - 1, endBit: 0 }];
    }

    // First chunk
    const firstBits = mantissaBits.slice(0, firstChunkSize);
    chunks.push({
      bits: firstBits,
      startBit: totalBits - 1,
      endBit: totalBits - firstChunkSize,
    });

    // Remaining chunks
    for (let i = firstChunkSize; i < totalBits; i += remainingChunkSize) {
      const bits = mantissaBits.slice(i, Math.min(i + remainingChunkSize, totalBits));
      const startBit = totalBits - 1 - i;
      const endBit = totalBits - i - bits.length;
      chunks.push({ bits, startBit, endBit });
    }

    return chunks;
  };

  // Render a format card with clickable bits
  const renderFormatCard = (format: FormatConfig, encoded: EncodedValue) => (
    <div key={format.shortName} className="hex-float__format-card">
      <div className="hex-float__format-header">
        <span className="hex-float__format-name">{format.name}</span>
        {encoded.isSpecial && encoded.specialType && (
          <span className={`hex-float__special-badge hex-float__special-badge--${encoded.specialType}`}>
            {encoded.specialType === 'denorm' ? 'Denormalized' :
             encoded.specialType === 'zero' ? 'Zero' :
             encoded.specialType === 'inf' || encoded.specialType === '-inf' ? 'Infinity' : 'NaN'}
          </span>
        )}
      </div>

      <div className="hex-float__format-values">
        <div className="hex-float__value-row">
          <span className="hex-float__value-label">Hex</span>
          <span className="hex-float__value-data hex-float__value-data--mono">{encoded.hex}</span>
          <button
            className="hex-float__copy-btn"
            onClick={() => copyToClipboard(encoded.hex)}
            title="Copy"
          >
            <CopyIcon size={14} />
          </button>
        </div>

        <div className="hex-float__value-row">
          <span className="hex-float__value-label">Value</span>
          <span className="hex-float__value-data">{formatDecodedValue(encoded.decodedValue)}</span>
          <button
            className="hex-float__copy-btn"
            onClick={() => copyToClipboard(String(encoded.decodedValue))}
            title="Copy"
          >
            <CopyIcon size={14} />
          </button>
        </div>
      </div>

      {(() => {
        const bitsPerRow = 16;
        const totalBits = format.totalBits;
        const expEnd = totalBits - 1 - 1; // After sign bit
        const expStart = expEnd - format.exponentBits + 1;

        // Get bit type based on bit index (MSB = totalBits-1)
        const getBitType = (bitIndex: number): 'sign' | 'exponent' | 'mantissa' => {
          if (bitIndex === totalBits - 1) return 'sign';
          if (bitIndex >= expStart && bitIndex <= expEnd) return 'exponent';
          return 'mantissa';
        };

        // Calculate nibbles per row
        const nibblesPerRow = bitsPerRow / 4;
        const totalNibbles = Math.ceil(totalBits / 4);
        const numRows = Math.ceil(totalNibbles / nibblesPerRow);

        return (
          <div className="hex-float__binary-breakdown hex-float__binary-breakdown--interactive">
            <div className="hex-float__bit-legend">
              <span className="hex-float__legend-item hex-float__legend-item--sign">Sign</span>
              <span className="hex-float__legend-item hex-float__legend-item--exponent">Exp ({format.exponentBits})</span>
              <span className="hex-float__legend-item hex-float__legend-item--mantissa">Mantissa ({format.mantissaBits})</span>
            </div>
            {Array.from({ length: numRows }, (_, rowIdx) => {
              const rowStartBit = totalBits - 1 - rowIdx * bitsPerRow;
              const nibblesInRow = Math.min(nibblesPerRow, Math.ceil((rowStartBit + 1) / 4));

              return (
                <div key={rowIdx} className="hex-float__bit-row">
                  {Array.from({ length: nibblesInRow }, (_, nibbleInRow) => {
                    const nibbleIdx = rowIdx * nibblesPerRow + nibbleInRow;
                    const startBit = totalBits - 1 - nibbleIdx * 4;
                    if (startBit < 0) return null;

                    // Calculate hex value for this nibble
                    const nibbleValue = Number((encoded.bits >> BigInt(Math.max(0, startBit - 3))) & 0xFn);

                    return (
                      <div key={nibbleIdx} className="hex-float__nibble">
                        <div className="hex-float__bit-labels">
                          {[0, 1, 2, 3].map(i => {
                            const bitIdx = startBit - i;
                            if (bitIdx < 0) return <span key={i} className="hex-float__bit-label"></span>;
                            return <span key={i} className="hex-float__bit-label">{bitIdx}</span>;
                          })}
                        </div>
                        <div className="hex-float__bit-cells-wrapper">
                          <div className="hex-float__field-bg">
                            {[0, 1, 2, 3].map(i => {
                              const bitIdx = startBit - i;
                              if (bitIdx < 0) return null;
                              const bitType = getBitType(bitIdx);
                              return <span key={i} className={`hex-float__field-bg-cell hex-float__field-bg-cell--${bitType}`} />;
                            })}
                          </div>
                          <div className="hex-float__bit-cells">
                            {[0, 1, 2, 3].map(i => {
                              const bitIdx = startBit - i;
                              if (bitIdx < 0) return null;
                              const bitValue = (encoded.bits >> BigInt(bitIdx)) & 1n;
                              const bitType = getBitType(bitIdx);
                              return (
                                <button
                                  key={i}
                                  className={`hex-float__bit-cell hex-float__bit-cell--${bitType} ${bitValue === 1n ? 'hex-float__bit-cell--set' : ''}`}
                                  onClick={() => toggleBit(format, bitIdx, encoded.bits)}
                                  title={`Bit ${bitIdx} (${bitType}): Click to toggle`}
                                >
                                  {bitValue.toString()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <span className="hex-float__nibble-hex">{nibbleValue.toString(16).toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );

  // Toggle a bit in a scaled format
  const toggleScaledBit = (format: ScaledFormatConfig, bitIndex: number, currentBits: bigint) => {
    const mask = 1n << BigInt(bitIndex);
    const newBits = currentBits ^ mask;

    // Decode using proper FP decoding
    const rawValue = decodeScaledFromBits(newBits, format);
    const scaledValue = rawValue * Math.pow(2, sharedScale);

    // Update input with new value
    if (Number.isNaN(scaledValue)) {
      setSingleInput('nan');
    } else if (!Number.isFinite(scaledValue)) {
      setSingleInput(scaledValue > 0 ? 'inf' : '-inf');
    } else if (Object.is(scaledValue, -0)) {
      setSingleInput('-0');
    } else if (Math.abs(scaledValue) < 0.0001 || Math.abs(scaledValue) >= 1000000) {
      setSingleInput(scaledValue.toExponential(10));
    } else {
      setSingleInput(scaledValue.toPrecision(15).replace(/\.?0+$/, ''));
    }
  };

  // Render scaled format card
  const renderScaledFormatCard = (format: ScaledFormatConfig, encoded: ScaledEncodedValue) => {
    const totalBits = format.totalBits;
    const expEnd = totalBits - 1 - 1; // After sign bit
    const expStart = expEnd - format.exponentBits + 1;

    // Get bit type based on bit index
    const getBitType = (bitIndex: number): 'sign' | 'exponent' | 'mantissa' => {
      if (bitIndex === totalBits - 1) return 'sign';
      if (bitIndex >= expStart && bitIndex <= expEnd) return 'exponent';
      return 'mantissa';
    };

    // Calculate nibbles
    const totalNibbles = Math.ceil(totalBits / 4);

    return (
      <div key={format.shortName} className="hex-float__format-card">
        <div className="hex-float__format-header">
          <span className="hex-float__format-name">{format.name}</span>
        </div>

        <div className="hex-float__format-values">
          <div className="hex-float__value-row">
            <span className="hex-float__value-label">Hex</span>
            <span className="hex-float__value-data hex-float__value-data--mono">{encoded.hex}</span>
            <button
              className="hex-float__copy-btn"
              onClick={() => copyToClipboard(encoded.hex)}
              title="Copy"
            >
              <CopyIcon size={14} />
            </button>
          </div>

          <div className="hex-float__value-row">
            <span className="hex-float__value-label">Raw</span>
            <span className="hex-float__value-data">{formatDecodedValue(encoded.decodedValue)}</span>
          </div>

          <div className="hex-float__value-row">
            <span className="hex-float__value-label">Scaled</span>
            <span className="hex-float__value-data">{formatDecodedValue(encoded.scaledValue)}</span>
            <button
              className="hex-float__copy-btn"
              onClick={() => copyToClipboard(String(encoded.scaledValue))}
              title="Copy"
            >
              <CopyIcon size={14} />
            </button>
          </div>
        </div>

        <div className="hex-float__binary-breakdown hex-float__binary-breakdown--interactive">
          <div className="hex-float__bit-legend">
            <span className="hex-float__legend-item hex-float__legend-item--sign">Sign</span>
            <span className="hex-float__legend-item hex-float__legend-item--exponent">Exp ({format.exponentBits})</span>
            <span className="hex-float__legend-item hex-float__legend-item--mantissa">Mantissa ({format.mantissaBits})</span>
          </div>
          <div className="hex-float__bit-row">
            {(() => {
              // Handle partial nibble at MSB end for non-multiple-of-4 bit widths
              const remainder = totalBits % 4;
              const firstNibbleSize = remainder === 0 ? 4 : remainder;
              const numFullNibbles = Math.floor((totalBits - firstNibbleSize) / 4);

              const nibbles: React.ReactNode[] = [];

              // First nibble (possibly partial)
              const firstStartBit = totalBits - 1;
              const firstNibbleValue = Number((encoded.bits >> BigInt(totalBits - firstNibbleSize)) & ((1n << BigInt(firstNibbleSize)) - 1n));
              nibbles.push(
                <div key={0} className="hex-float__nibble">
                  <div className="hex-float__bit-labels">
                    {Array.from({ length: firstNibbleSize }, (_, i) => {
                      const bitIdx = firstStartBit - i;
                      return <span key={i} className="hex-float__bit-label">{bitIdx}</span>;
                    })}
                  </div>
                  <div className="hex-float__bit-cells-wrapper">
                    <div className="hex-float__field-bg">
                      {Array.from({ length: firstNibbleSize }, (_, i) => {
                        const bitIdx = firstStartBit - i;
                        const bitType = getBitType(bitIdx);
                        return <span key={i} className={`hex-float__field-bg-cell hex-float__field-bg-cell--${bitType}`} />;
                      })}
                    </div>
                    <div className="hex-float__bit-cells">
                      {Array.from({ length: firstNibbleSize }, (_, i) => {
                        const bitIdx = firstStartBit - i;
                        const bitValue = (encoded.bits >> BigInt(bitIdx)) & 1n;
                        const bitType = getBitType(bitIdx);
                        return (
                          <button
                            key={i}
                            className={`hex-float__bit-cell hex-float__bit-cell--${bitType} ${bitValue === 1n ? 'hex-float__bit-cell--set' : ''}`}
                            onClick={() => toggleScaledBit(format, bitIdx, encoded.bits)}
                            title={`Bit ${bitIdx} (${bitType}): Click to toggle`}
                          >
                            {bitValue.toString()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <span className="hex-float__nibble-hex">{firstNibbleValue.toString(16).toUpperCase()}</span>
                </div>
              );

              // Remaining full nibbles
              for (let n = 0; n < numFullNibbles; n++) {
                const startBit = totalBits - firstNibbleSize - 1 - n * 4;
                const nibbleValue = Number((encoded.bits >> BigInt(startBit - 3)) & 0xFn);
                nibbles.push(
                  <div key={n + 1} className="hex-float__nibble">
                    <div className="hex-float__bit-labels">
                      {[0, 1, 2, 3].map(i => {
                        const bitIdx = startBit - i;
                        return <span key={i} className="hex-float__bit-label">{bitIdx}</span>;
                      })}
                    </div>
                    <div className="hex-float__bit-cells-wrapper">
                      <div className="hex-float__field-bg">
                        {[0, 1, 2, 3].map(i => {
                          const bitIdx = startBit - i;
                          const bitType = getBitType(bitIdx);
                          return <span key={i} className={`hex-float__field-bg-cell hex-float__field-bg-cell--${bitType}`} />;
                        })}
                      </div>
                      <div className="hex-float__bit-cells">
                        {[0, 1, 2, 3].map(i => {
                          const bitIdx = startBit - i;
                          const bitValue = (encoded.bits >> BigInt(bitIdx)) & 1n;
                          const bitType = getBitType(bitIdx);
                          return (
                            <button
                              key={i}
                              className={`hex-float__bit-cell hex-float__bit-cell--${bitType} ${bitValue === 1n ? 'hex-float__bit-cell--set' : ''}`}
                              onClick={() => toggleScaledBit(format, bitIdx, encoded.bits)}
                              title={`Bit ${bitIdx} (${bitType}): Click to toggle`}
                            >
                              {bitValue.toString()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <span className="hex-float__nibble-hex">{nibbleValue.toString(16).toUpperCase()}</span>
                  </div>
                );
              }

              return nibbles;
            })()}
          </div>
        </div>
      </div>
    );
  };

  const standardFormats = FP_FORMATS.filter(f => f.category === 'standard');
  const halfFormats = FP_FORMATS.filter(f => f.category === 'half');
  const fp8Formats = FP_FORMATS.filter(f => f.category === 'fp8');

  const getEncodingByFormat = (format: FormatConfig): EncodedValue | null => {
    if (!encodings) return null;
    switch (format.shortName) {
      case 'FP64': return encodings.fp64;
      case 'FP32': return encodings.fp32;
      case 'FP16': return encodings.fp16;
      case 'BF16': return encodings.bf16;
      case 'E4M3': return encodings.fp8e4m3;
      case 'E5M2': return encodings.fp8e5m2;
      default: return null;
    }
  };

  return (
    <ToolPage
      title="Hex-Float Converter"
      description="Free IEEE 754 floating-point converter. Convert between decimal, hexadecimal, and binary representations for FP64, FP32, FP16, BF16, FP8, and scaled MX formats."
      keywords={[
        'ieee 754',
        'float converter',
        'hex to float',
        'float to hex',
        'floating point',
        'fp32 converter',
        'fp16 converter',
        'bf16 converter',
        'fp8 converter',
        'mxfp',
        'microscaling',
        'binary float',
        'double precision',
        'single precision',
        'half precision',
        'brain float',
        'developer tools'
      ]}
    >
      <div className="hex-float">
        <div className="hex-float__header">
          <div className="hex-float__tabs">
            <button
              className={`hex-float__tab ${mode === 'single' ? 'hex-float__tab--active' : ''}`}
              onClick={() => setMode('single')}
            >
              Single Value
            </button>
            <button
              className={`hex-float__tab ${mode === 'bulk' ? 'hex-float__tab--active' : ''}`}
              onClick={() => setMode('bulk')}
            >
              Bulk Convert
            </button>
          </div>
        </div>

        {mode === 'single' ? (
          <div className="hex-float__single">
            <div className="hex-float__input-section">
              <label className="hex-float__label">
                Enter value (decimal, 0x hex for FP32/FP64 bits, or special: inf, -inf, nan)
              </label>
              <input
                type="text"
                className={`hex-float__input ${!parsed.isValid && singleInput ? 'hex-float__input--invalid' : ''}`}
                value={singleInput}
                onChange={(e) => setSingleInput(e.target.value)}
                placeholder="3.14159 or 0x40490FDB"
              />
              {parsed.isValid && parsed.inputFormat && (
                <span className="hex-float__input-hint">
                  {parsed.inputFormat === 'hex64' ? 'Interpreted as FP64 hex bits' :
                   parsed.inputFormat === 'hex32' ? 'Interpreted as FP32 hex bits' :
                   parsed.inputFormat === 'hex16' ? 'Interpreted as FP16 hex bits' :
                   parsed.inputFormat === 'special' ? 'Special value' :
                   `Decimal: ${formatDecodedValue(parsed.value)}`}
                </span>
              )}
            </div>

            {encodings && (
              <div className="hex-float__results">
                {/* Standard Formats */}
                <div className="hex-float__section">
                  <button
                    className="hex-float__section-header"
                    onClick={() => toggleSection('standard')}
                  >
                    <span className="hex-float__section-title">Standard Precision (64-bit, 32-bit)</span>
                    <ChevronIcon expanded={expandedSections.standard} />
                  </button>
                  {expandedSections.standard && (
                    <div className="hex-float__section-content">
                      {standardFormats.map(format => {
                        const enc = getEncodingByFormat(format);
                        return enc ? renderFormatCard(format, enc) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* Half Precision Formats */}
                <div className="hex-float__section">
                  <button
                    className="hex-float__section-header"
                    onClick={() => toggleSection('half')}
                  >
                    <span className="hex-float__section-title">Half Precision (16-bit)</span>
                    <ChevronIcon expanded={expandedSections.half} />
                  </button>
                  {expandedSections.half && (
                    <div className="hex-float__section-content">
                      {halfFormats.map(format => {
                        const enc = getEncodingByFormat(format);
                        return enc ? renderFormatCard(format, enc) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* FP8 Formats */}
                <div className="hex-float__section">
                  <button
                    className="hex-float__section-header"
                    onClick={() => toggleSection('fp8')}
                  >
                    <span className="hex-float__section-title">8-bit Formats (FP8)</span>
                    <ChevronIcon expanded={expandedSections.fp8} />
                  </button>
                  {expandedSections.fp8 && (
                    <div className="hex-float__section-content">
                      {fp8Formats.map(format => {
                        const enc = getEncodingByFormat(format);
                        return enc ? renderFormatCard(format, enc) : null;
                      })}
                    </div>
                  )}
                </div>

                {/* Scaled Formats */}
                <div className="hex-float__section">
                  <button
                    className="hex-float__section-header"
                    onClick={() => toggleSection('scaled')}
                  >
                    <span className="hex-float__section-title">Scaled Formats (MX/Microscaling)</span>
                    <ChevronIcon expanded={expandedSections.scaled} />
                  </button>
                  {expandedSections.scaled && (
                    <div className="hex-float__section-content hex-float__section-content--scaled">
                      <div className="hex-float__scale-control">
                        <label className="hex-float__scale-label">
                          Shared Scale (2^n):
                          <input
                            type="number"
                            className="hex-float__scale-input"
                            value={scaleInput}
                            onChange={(e) => setScaleInput(e.target.value)}
                            onBlur={() => {
                              const val = parseInt(scaleInput) || 0;
                              setSharedScale(val);
                              setScaleInput(String(val));
                            }}
                          />
                        </label>
                        <button
                          className="hex-float__scale-auto"
                          onClick={() => {
                            setSharedScale(suggestedScale);
                            setScaleInput(String(suggestedScale));
                          }}
                          title="Auto-calculate optimal scale"
                        >
                          Auto ({suggestedScale})
                        </button>
                        <span className="hex-float__scale-hint">
                          Multiplier: 2^{sharedScale} = {Math.pow(2, sharedScale).toExponential(2)}
                        </span>
                      </div>
                      <div className="hex-float__scaled-cards">
                        {scaledEncodings?.map(({ format, encoding }) =>
                          renderScaledFormatCard(format, encoding)
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="hex-float__bulk">
            <div className="hex-float__bulk-input-section">
              <div className="hex-float__bulk-label-row">
                <label className="hex-float__label">
                  Paste values (comma, space, or newline separated)
                </label>
                <button
                  className="hex-float__upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon size={16} /> Upload File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>
              <textarea
                className="hex-float__textarea"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="3.14159, 2.71828, 1.41421&#10;0x40490FDB, 0x402DF854&#10;inf, -inf, nan"
                rows={5}
              />
            </div>

            {parsedBulkResults.length > 0 && (
              <div className="hex-float__bulk-results">
                <div className="hex-float__bulk-results-header">
                  <span className="hex-float__bulk-count">
                    {parsedBulkResults.filter(v => v.isValid).length} values converted
                    {parsedBulkResults.some(v => !v.isValid) && (
                      <span className="hex-float__bulk-invalid">
                        {' '}({parsedBulkResults.filter(v => !v.isValid).length} invalid)
                      </span>
                    )}
                  </span>
                </div>
                <div className="hex-float__bulk-table-wrapper">
                  <table className="hex-float__bulk-table">
                    <thead>
                      <tr>
                        <th>Input</th>
                        <th>Value</th>
                        <th>FP64 Hex</th>
                        <th>FP32 Hex</th>
                        <th>FP16 Hex</th>
                        <th>BF16 Hex</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedBulkResults.map((result, idx) => (
                        <tr key={idx} className={!result.isValid ? 'hex-float__bulk-row--invalid' : ''}>
                          <td className="hex-float__bulk-cell--input">{result.input}</td>
                          {result.isValid && result.encodings ? (
                            <>
                              <td>
                                <span
                                  className={`hex-float__bulk-cell-content ${longPressTarget === String(result.value) ? 'hex-float__bulk-cell-content--copying' : ''}`}
                                  onTouchStart={() => handleTouchStart(String(result.value))}
                                  onTouchEnd={handleTouchEnd}
                                  onTouchCancel={handleTouchEnd}
                                >
                                  {formatDecodedValue(result.value)}
                                  <button className="hex-float__bulk-copy-btn" onClick={() => copyToClipboard(String(result.value))} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td className="hex-float__bulk-cell--mono">
                                <span
                                  className={`hex-float__bulk-cell-content ${longPressTarget === result.encodings.fp64.hex ? 'hex-float__bulk-cell-content--copying' : ''}`}
                                  onTouchStart={() => handleTouchStart(result.encodings!.fp64.hex)}
                                  onTouchEnd={handleTouchEnd}
                                  onTouchCancel={handleTouchEnd}
                                >
                                  {result.encodings.fp64.hex}
                                  <button className="hex-float__bulk-copy-btn" onClick={() => copyToClipboard(result.encodings!.fp64.hex)} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td className="hex-float__bulk-cell--mono">
                                <span
                                  className={`hex-float__bulk-cell-content ${longPressTarget === result.encodings.fp32.hex ? 'hex-float__bulk-cell-content--copying' : ''}`}
                                  onTouchStart={() => handleTouchStart(result.encodings!.fp32.hex)}
                                  onTouchEnd={handleTouchEnd}
                                  onTouchCancel={handleTouchEnd}
                                >
                                  {result.encodings.fp32.hex}
                                  <button className="hex-float__bulk-copy-btn" onClick={() => copyToClipboard(result.encodings!.fp32.hex)} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td className="hex-float__bulk-cell--mono">
                                <span
                                  className={`hex-float__bulk-cell-content ${longPressTarget === result.encodings.fp16.hex ? 'hex-float__bulk-cell-content--copying' : ''}`}
                                  onTouchStart={() => handleTouchStart(result.encodings!.fp16.hex)}
                                  onTouchEnd={handleTouchEnd}
                                  onTouchCancel={handleTouchEnd}
                                >
                                  {result.encodings.fp16.hex}
                                  <button className="hex-float__bulk-copy-btn" onClick={() => copyToClipboard(result.encodings!.fp16.hex)} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                              <td className="hex-float__bulk-cell--mono">
                                <span
                                  className={`hex-float__bulk-cell-content ${longPressTarget === result.encodings.bf16.hex ? 'hex-float__bulk-cell-content--copying' : ''}`}
                                  onTouchStart={() => handleTouchStart(result.encodings!.bf16.hex)}
                                  onTouchEnd={handleTouchEnd}
                                  onTouchCancel={handleTouchEnd}
                                >
                                  {result.encodings.bf16.hex}
                                  <button className="hex-float__bulk-copy-btn" onClick={() => copyToClipboard(result.encodings!.bf16.hex)} title="Copy">
                                    <CopyIcon size={14} />
                                  </button>
                                </span>
                              </td>
                            </>
                          ) : (
                            <td colSpan={5} className="hex-float__bulk-cell--error">Invalid</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default HexFloat;
