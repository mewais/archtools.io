import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon, UploadIcon } from '../../components/Icons';
import './HexInt.css';

type BitWidth = 8 | 16 | 32 | 64 | 128;
type TabMode = 'single' | 'bulk';
const ALL_BIT_WIDTHS: BitWidth[] = [8, 16, 32, 64, 128];

// Calculate minimum bits required to represent a value
const getMinBitsRequired = (input: string): number => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed === '0') return 8;

  try {
    let value: bigint;
    if (trimmed.startsWith('0x')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('0b')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('0o')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('-')) {
      // For negative numbers, we need to consider two's complement
      value = BigInt(trimmed);
      if (value < 0n) {
        // Find minimum width that can represent this negative number
        const absValue = -value;
        const bitsForAbs = absValue === 0n ? 1 : absValue.toString(2).length;
        return bitsForAbs + 1; // +1 for sign bit
      }
    } else {
      value = BigInt(trimmed);
    }

    if (value === 0n) return 8;
    const bits = value.toString(2).length;
    return bits;
  } catch {
    return 8;
  }
};

interface ConvertedValue {
  input: string;
  unsigned: bigint;
  signed: bigint;
  hex: string;
  hexLE: string;
  binary: string;
  octal: string;
  isValid: boolean;
}

// Parse input string to bigint
const parseInput = (input: string, bitWidth: BitWidth): { value: bigint; isValid: boolean } => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { value: 0n, isValid: false };

  try {
    let value: bigint;
    if (trimmed.startsWith('0x')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('0b')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('0o')) {
      value = BigInt(trimmed);
    } else if (trimmed.startsWith('-')) {
      value = BigInt(trimmed);
    } else {
      value = BigInt(trimmed);
    }

    // Mask to bit width
    const mask = (1n << BigInt(bitWidth)) - 1n;
    value = value & mask;

    return { value, isValid: true };
  } catch {
    return { value: 0n, isValid: false };
  }
};

// Convert value to all formats
const convertValue = (input: string, bitWidth: BitWidth): ConvertedValue => {
  const { value, isValid } = parseInput(input, bitWidth);

  if (!isValid) {
    return {
      input,
      unsigned: 0n,
      signed: 0n,
      hex: '',
      hexLE: '',
      binary: '',
      octal: '',
      isValid: false,
    };
  }

  const mask = (1n << BigInt(bitWidth)) - 1n;
  const unsigned = value & mask;
  const signBit = 1n << BigInt(bitWidth - 1);
  const signed = unsigned >= signBit ? unsigned - (1n << BigInt(bitWidth)) : unsigned;

  // Calculate little-endian hex (swap bytes)
  const hexBE = unsigned.toString(16).toUpperCase().padStart(bitWidth / 4, '0');
  const hexLEBytes: string[] = [];
  for (let i = hexBE.length - 2; i >= 0; i -= 2) {
    hexLEBytes.push(hexBE.slice(i, i + 2));
  }
  const hexLE = '0x' + hexLEBytes.join('');

  return {
    input,
    unsigned,
    signed,
    hex: '0x' + hexBE,
    hexLE,
    binary: unsigned.toString(2).padStart(bitWidth, '0'),
    octal: '0o' + unsigned.toString(8),
    isValid: true,
  };
};

// Format number with commas
const formatNumber = (n: bigint): string => {
  const str = n.toString();
  const isNegative = str.startsWith('-');
  const abs = isNegative ? str.slice(1) : str;
  const formatted = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return isNegative ? '-' + formatted : formatted;
};

const HexInt: React.FC = () => {
  const [mode, setMode] = useState<TabMode>('single');
  const [bitWidth, setBitWidth] = useState<BitWidth>(32);
  const [singleInput, setSingleInput] = useState('0');
  const [bulkInput, setBulkInput] = useState('');
  const [shiftAmountInput, setShiftAmountInput] = useState('1');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse shift amount, defaulting to 1 if invalid
  const shiftAmount = Math.max(1, Math.min(bitWidth, parseInt(shiftAmountInput) || 1));

  // Calculate minimum required bits and available widths
  const minBitsRequired = useMemo(() => getMinBitsRequired(singleInput), [singleInput]);
  const availableWidths = useMemo(() =>
    ALL_BIT_WIDTHS.filter(w => w >= minBitsRequired),
    [minBitsRequired]
  );

  // Auto-adjust bit width when input changes
  useEffect(() => {
    if (!availableWidths.includes(bitWidth)) {
      // Current width is too small, select the smallest valid width
      const newWidth = availableWidths[0] || 128;
      setBitWidth(newWidth);
    }
  }, [availableWidths, bitWidth]);

  const singleValue = convertValue(singleInput, bitWidth);

  // Parse bulk input
  const bulkValues = useCallback((): ConvertedValue[] => {
    if (!bulkInput.trim()) return [];
    const values = bulkInput.split(/[\s,;\n]+/).filter(v => v.trim());
    return values.map(v => convertValue(v, bitWidth));
  }, [bulkInput, bitWidth]);

  const parsedBulkValues = bulkValues();

  // Toggle bit
  const toggleBit = (bitIndex: number) => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;

    const mask = 1n << BigInt(bitIndex);
    const newValue = value ^ mask;
    setSingleInput('0x' + newValue.toString(16).toUpperCase());
  };

  // Quick actions
  const setAllBits = () => {
    const mask = (1n << BigInt(bitWidth)) - 1n;
    setSingleInput('0x' + mask.toString(16).toUpperCase());
  };

  const clearAllBits = () => {
    setSingleInput('0');
  };

  const invertBits = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const mask = (1n << BigInt(bitWidth)) - 1n;
    const inverted = value ^ mask;
    setSingleInput('0x' + inverted.toString(16).toUpperCase());
  };

  const negateBits = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const mask = (1n << BigInt(bitWidth)) - 1n;
    // Two's complement negation: -value masked to bit width
    const negated = (-value) & mask;
    setSingleInput('0x' + negated.toString(16).toUpperCase());
  };

  // Logical Shift Left: shift left, fill with 0s
  const lsl = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const mask = (1n << BigInt(bitWidth)) - 1n;
    const shifted = (value << BigInt(shiftAmount)) & mask;
    setSingleInput('0x' + shifted.toString(16).toUpperCase());
  };

  // Logical Shift Right: shift right, fill with 0s
  const lsr = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const shifted = value >> BigInt(shiftAmount);
    setSingleInput('0x' + shifted.toString(16).toUpperCase());
  };

  // Arithmetic Shift Right: shift right, preserve sign bit
  const asr = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const signBit = 1n << BigInt(bitWidth - 1);
    const isNegative = (value & signBit) !== 0n;
    let result = value;
    for (let i = 0; i < shiftAmount; i++) {
      result = result >> 1n;
      if (isNegative) {
        result = result | signBit;
      }
    }
    setSingleInput('0x' + result.toString(16).toUpperCase());
  };

  // Rotate Left: bits that fall off left come back on right
  const rol = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const mask = (1n << BigInt(bitWidth)) - 1n;
    const effectiveShift = shiftAmount % bitWidth;
    const rotated = ((value << BigInt(effectiveShift)) | (value >> BigInt(bitWidth - effectiveShift))) & mask;
    setSingleInput('0x' + rotated.toString(16).toUpperCase());
  };

  // Rotate Right: bits that fall off right come back on left
  const ror = () => {
    const { value, isValid } = parseInput(singleInput, bitWidth);
    if (!isValid) return;
    const mask = (1n << BigInt(bitWidth)) - 1n;
    const effectiveShift = shiftAmount % bitWidth;
    const rotated = ((value >> BigInt(effectiveShift)) | (value << BigInt(bitWidth - effectiveShift))) & mask;
    setSingleInput('0x' + rotated.toString(16).toUpperCase());
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Copy all bulk values
  const copyAllAs = (format: 'hex' | 'decimal' | 'binary') => {
    const values = parsedBulkValues
      .filter(v => v.isValid)
      .map(v => {
        switch (format) {
          case 'hex': return v.hex;
          case 'decimal': return v.unsigned.toString();
          case 'binary': return v.binary;
        }
      });
    navigator.clipboard.writeText(values.join('\n'));
  };

  // File upload
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

  return (
    <ToolPage
      title="Hex-Integer Converter"
      description="Convert between hexadecimal, decimal, binary, and octal. Supports signed/unsigned values and bit manipulation."
    >
      <div className="hex-int">
        {/* Tabs and Bit Width */}
        <div className="hex-int__header">
          <div className="hex-int__tabs">
            <button
              className={`hex-int__tab ${mode === 'single' ? 'hex-int__tab--active' : ''}`}
              onClick={() => setMode('single')}
            >
              Single Value
            </button>
            <button
              className={`hex-int__tab ${mode === 'bulk' ? 'hex-int__tab--active' : ''}`}
              onClick={() => setMode('bulk')}
            >
              Bulk Convert
            </button>
          </div>
          <select
            className="hex-int__width-select"
            value={bitWidth}
            onChange={(e) => setBitWidth(Number(e.target.value) as BitWidth)}
          >
            {availableWidths.map(w => (
              <option key={w} value={w}>{w}-bit</option>
            ))}
          </select>
        </div>

        {mode === 'single' ? (
          <div className="hex-int__single">
            {/* Input */}
            <div className="hex-int__input-section">
              <label className="hex-int__label">
                Enter value (0x for hex, 0b for binary, 0o for octal, or decimal)
              </label>
              <input
                type="text"
                className={`hex-int__input ${!singleValue.isValid && singleInput ? 'hex-int__input--invalid' : ''}`}
                value={singleInput}
                onChange={(e) => setSingleInput(e.target.value)}
                placeholder="0xDEADBEEF"
              />
            </div>

            {singleValue.isValid && (
              <>
                {/* Values Display */}
                <div className="hex-int__values">
                  <div className="hex-int__value-row">
                    <span className="hex-int__value-label">Decimal (unsigned)</span>
                    <span className="hex-int__value-data">{formatNumber(singleValue.unsigned)}</span>
                    <button
                      className="hex-int__copy-btn"
                      onClick={() => copyToClipboard(singleValue.unsigned.toString())}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                  <div className="hex-int__value-row">
                    <span className="hex-int__value-label">Decimal (signed)</span>
                    <span className="hex-int__value-data">{formatNumber(singleValue.signed)}</span>
                    <button
                      className="hex-int__copy-btn"
                      onClick={() => copyToClipboard(singleValue.signed.toString())}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                  <div className="hex-int__value-row">
                    <span className="hex-int__value-label">Hexadecimal</span>
                    <span className="hex-int__value-data hex-int__value-data--mono">{singleValue.hex}</span>
                    <button
                      className="hex-int__copy-btn"
                      onClick={() => copyToClipboard(singleValue.hex)}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                  <div className="hex-int__value-row">
                    <span className="hex-int__value-label">Hex (Little Endian)</span>
                    <span className="hex-int__value-data hex-int__value-data--mono">{singleValue.hexLE}</span>
                    <button
                      className="hex-int__copy-btn"
                      onClick={() => copyToClipboard(singleValue.hexLE)}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                  <div className="hex-int__value-row">
                    <span className="hex-int__value-label">Octal</span>
                    <span className="hex-int__value-data hex-int__value-data--mono">{singleValue.octal}</span>
                    <button
                      className="hex-int__copy-btn"
                      onClick={() => copyToClipboard(singleValue.octal)}
                      title="Copy"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                </div>

                {/* Binary Bit Grid */}
                <div className="hex-int__binary-section">
                  <div className="hex-int__binary-header">
                    <span className="hex-int__binary-title">Binary (click bits to toggle)</span>
                    <div className="hex-int__quick-actions-container">
                      <div className="hex-int__action-group">
                        <button onClick={setAllBits} title="Set all bits to 1">Set All</button>
                        <button onClick={clearAllBits} title="Clear all bits to 0">Clear</button>
                        <button onClick={invertBits} title="Bitwise NOT (~)">Invert</button>
                        <button onClick={negateBits} title="Two's complement negation (-)">Negate</button>
                      </div>
                      <div className="hex-int__action-group">
                        <span className="hex-int__shift-label">
                          Shift/Rotate by
                          <input
                            type="number"
                            className="hex-int__shift-input"
                            value={shiftAmountInput}
                            onChange={(e) => setShiftAmountInput(e.target.value)}
                            onBlur={() => setShiftAmountInput(String(shiftAmount))}
                            min={1}
                            max={bitWidth}
                          />
                        </span>
                        <button onClick={lsl} title="Logical Shift Left">LSL</button>
                        <button onClick={lsr} title="Logical Shift Right">LSR</button>
                        <button onClick={asr} title="Arithmetic Shift Right">ASR</button>
                        <button onClick={rol} title="Rotate Left">ROL</button>
                        <button onClick={ror} title="Rotate Right">ROR</button>
                      </div>
                    </div>
                  </div>
                  <div className="hex-int__bit-grid">
                    {/* Render in rows of 32 bits (8 nibbles) each */}
                    {Array.from({ length: Math.ceil(bitWidth / 32) }, (_, rowIdx) => {
                      const rowStartBit = bitWidth - 1 - rowIdx * 32;
                      const nibblesInRow = Math.min(8, Math.ceil((rowStartBit + 1) / 4));
                      return (
                        <div key={rowIdx} className="hex-int__bit-row">
                          {Array.from({ length: nibblesInRow }, (_, nibbleInRow) => {
                            const nibbleIdx = rowIdx * 8 + nibbleInRow;
                            const startBit = bitWidth - 1 - nibbleIdx * 4;
                            if (startBit < 0) return null;
                            const nibbleValue = Number((singleValue.unsigned >> BigInt(Math.max(0, startBit - 3))) & 0xFn);
                            return (
                              <div key={nibbleIdx} className="hex-int__nibble">
                                <div className="hex-int__bit-labels">
                                  {[0, 1, 2, 3].map(i => {
                                    const bitIdx = startBit - i;
                                    if (bitIdx < 0) return <span key={i} className="hex-int__bit-label"></span>;
                                    return <span key={i} className="hex-int__bit-label">{bitIdx}</span>;
                                  })}
                                </div>
                                <div className="hex-int__bit-cells">
                                  {[0, 1, 2, 3].map(i => {
                                    const bitIdx = startBit - i;
                                    if (bitIdx < 0) return null;
                                    const bitValue = (singleValue.unsigned >> BigInt(bitIdx)) & 1n;
                                    return (
                                      <button
                                        key={i}
                                        className={`hex-int__bit-cell ${bitValue === 1n ? 'hex-int__bit-cell--set' : ''}`}
                                        onClick={() => toggleBit(bitIdx)}
                                        title={`Bit ${bitIdx}: Click to ${bitValue === 1n ? 'clear' : 'set'}`}
                                      >
                                        {bitValue.toString()}
                                      </button>
                                    );
                                  })}
                                </div>
                                <span className="hex-int__nibble-hex">{nibbleValue.toString(16).toUpperCase()}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="hex-int__bulk">
            {/* Bulk Input */}
            <div className="hex-int__bulk-input-section">
              <div className="hex-int__bulk-label-row">
                <label className="hex-int__label">
                  Paste values (comma, space, or newline separated)
                </label>
                <button
                  className="hex-int__upload-btn"
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
                className="hex-int__textarea"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="0xDEAD, 0xBEEF, 255, 0b1010&#10;0xFF, 0x1234, -1&#10;..."
                rows={5}
              />
            </div>

            {/* Results */}
            {parsedBulkValues.length > 0 && (
              <div className="hex-int__bulk-results">
                <div className="hex-int__bulk-results-header">
                  <span className="hex-int__bulk-count">
                    {parsedBulkValues.filter(v => v.isValid).length} values converted
                    {parsedBulkValues.some(v => !v.isValid) && (
                      <span className="hex-int__bulk-invalid">
                        {' '}({parsedBulkValues.filter(v => !v.isValid).length} invalid)
                      </span>
                    )}
                  </span>
                  <div className="hex-int__bulk-actions">
                    <button onClick={() => copyAllAs('hex')}>Copy All Hex</button>
                    <button onClick={() => copyAllAs('decimal')}>Copy All Decimal</button>
                    <button onClick={() => copyAllAs('binary')}>Copy All Binary</button>
                  </div>
                </div>
                <div className="hex-int__bulk-table-wrapper">
                  <table className="hex-int__bulk-table">
                    <thead>
                      <tr>
                        <th>Input</th>
                        <th>Unsigned</th>
                        <th>Signed</th>
                        <th>Hex</th>
                        <th>Binary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedBulkValues.map((v, idx) => (
                        <tr key={idx} className={!v.isValid ? 'hex-int__bulk-row--invalid' : ''}>
                          <td className="hex-int__bulk-cell--input">{v.input}</td>
                          {v.isValid ? (
                            <>
                              <td>{formatNumber(v.unsigned)}</td>
                              <td>{formatNumber(v.signed)}</td>
                              <td className="hex-int__bulk-cell--mono">{v.hex}</td>
                              <td className="hex-int__bulk-cell--mono hex-int__bulk-cell--binary">{v.binary}</td>
                            </>
                          ) : (
                            <td colSpan={4} className="hex-int__bulk-cell--error">Invalid</td>
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

export default HexInt;
