import React, { useState, useMemo, useEffect } from 'react';
import type { ISAVariant } from '../../types/ISAVariant';
import './FloatRegisterTable.css';

export interface FloatRegisterTableProps {
  registers: bigint[];  // 32 FP registers
  registerWidth: 32 | 64 | 128 | null;
  isaVariant: ISAVariant;  // ISA configuration to determine available formats
  onValueChange?: (index: number, value: bigint) => void;  // Reserved for future use
  watchpoints?: Set<number>;
  onToggleWatchpoint?: (index: number) => void;
}

type FloatFormat = 'float16' | 'float32' | 'float64' | 'float128';

/**
 * ABI names for floating-point registers
 */
const FLOAT_ABI_NAMES = [
  'ft0', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'ft7',
  'fs0', 'fs1', 'fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5',
  'fa6', 'fa7', 'fs2', 'fs3', 'fs4', 'fs5', 'fs6', 'fs7',
  'fs8', 'fs9', 'fs10', 'fs11', 'ft8', 'ft9', 'ft10', 'ft11',
];

/**
 * FloatRegisterTable - Floating-Point Register Viewer
 *
 * Features:
 * - Display 32 floating-point registers (f0-f31)
 * - Toggle between float32 and float64 interpretation
 * - Show/hide NaN-boxing visualization
 * - Watchpoint support
 * - Hex and floating-point value display
 */
const FloatRegisterTable: React.FC<FloatRegisterTableProps> = ({
  registers,
  registerWidth,
  isaVariant,
  onValueChange: _onValueChange,  // Reserved for future use
  watchpoints = new Set(),
  onToggleWatchpoint,
}) => {
  // Determine available float formats based on ISA extensions
  const availableFormats = useMemo(() => {
    const formats: { format: FloatFormat; label: string }[] = [];
    const extensions = isaVariant.extensions;

    // Zfh = Float16
    if (extensions.includes('Zfh')) {
      formats.push({ format: 'float16', label: 'F16' });
    }

    // F = Float32 (always available if we have floating-point)
    if (extensions.includes('F') || extensions.includes('G')) {
      formats.push({ format: 'float32', label: 'F32' });
    }

    // D = Float64
    if (extensions.includes('D') || extensions.includes('G')) {
      formats.push({ format: 'float64', label: 'F64' });
    }

    // Q = Float128
    if (extensions.includes('Q')) {
      formats.push({ format: 'float128', label: 'F128' });
    }

    return formats;
  }, [isaVariant.extensions]);

  // Default format should be the largest available format (most precision)
  // This ensures double-precision values display correctly when D extension is enabled
  const [format, setFormat] = useState<FloatFormat>(
    availableFormats[availableFormats.length - 1]?.format || 'float32'
  );

  // Sync format when ISA variant changes
  // Only switch to best format if current format is no longer available
  // This respects user's manual format selection while handling ISA downgrades
  useEffect(() => {
    const isCurrentFormatAvailable = availableFormats.some(f => f.format === format);
    if (!isCurrentFormatAvailable) {
      const bestFormat = availableFormats[availableFormats.length - 1]?.format;
      if (bestFormat) {
        setFormat(bestFormat);
      }
    }
  }, [availableFormats, format]);

  /**
   * Format value as hex with appropriate width
   * Masks value to display only the relevant bits for the register width
   */
  const formatHex = (value: bigint, width: number): string => {
    const hexDigits = width / 4;
    // Mask the value to only show the relevant bits for the width
    // This handles NaN-boxed single-precision values (upper bits = 0xFFFFFFFF)
    const mask = width === 32 ? 0xFFFFFFFFn :
                 width === 64 ? 0xFFFFFFFFFFFFFFFFn :
                 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn; // 128-bit
    const maskedValue = value & mask;
    return `0x${maskedValue.toString(16).toUpperCase().padStart(hexDigits, '0')}`;
  };

  /**
   * Convert bigint to floating-point representation
   */
  const formatFloat = (value: bigint, format: FloatFormat): string => {
    try {
      switch (format) {
        case 'float16': {
          // Float16 requires manual implementation (no native JS support)
          const bits = Number(value & 0xFFFFn);
          const sign = (bits >> 15) & 0x1;
          const exponent = (bits >> 10) & 0x1F;
          const fraction = bits & 0x3FF;

          // Special cases
          if (exponent === 0x1F) {
            return fraction === 0 ? (sign ? '-Inf' : '+Inf') : 'NaN';
          }

          // Approximate conversion for display
          const signVal = sign ? -1 : 1;
          const expVal = exponent === 0 ? -14 : exponent - 15;
          const fracVal = exponent === 0 ? fraction / 1024 : (fraction + 1024) / 1024;
          const result = signVal * fracVal * Math.pow(2, expVal);

          return result.toExponential(3);
        }

        case 'float32': {
          const buffer = new ArrayBuffer(4);
          const view = new DataView(buffer);
          view.setUint32(0, Number(value & 0xFFFFFFFFn), false);
          const floatVal = view.getFloat32(0, false);

          if (isNaN(floatVal)) return 'NaN';
          if (!isFinite(floatVal)) return floatVal > 0 ? '+Inf' : '-Inf';
          return floatVal.toExponential(6);
        }

        case 'float64': {
          const buffer = new ArrayBuffer(8);
          const view = new DataView(buffer);
          view.setBigUint64(0, value & 0xFFFFFFFFFFFFFFFFn, false);
          const doubleVal = view.getFloat64(0, false);

          if (isNaN(doubleVal)) return 'NaN';
          if (!isFinite(doubleVal)) return doubleVal > 0 ? '+Inf' : '-Inf';
          return doubleVal.toExponential(15);
        }

        case 'float128': {
          // Float128 is not natively supported in JavaScript
          // Would require external library like bigfloat for proper conversion
          // For now, display a placeholder
          return `---`;
        }

        default:
          return 'Error';
      }
    } catch {
      return 'Error';
    }
  };

  if (!registerWidth) {
    return (
      <div className="float-register-table__empty">
        No floating-point extensions enabled
      </div>
    );
  }

  // Show toolbar only if multiple formats are available
  const showToolbar = availableFormats.length > 1;

  return (
    <div className="float-register-table">
      {/* Toolbar (only shown if multiple formats available) */}
      {showToolbar && (
        <div className="float-register-table__toolbar">
          <div className="float-register-table__format">
            <span className="float-register-table__format-label">Format:</span>
            {availableFormats.map(({ format: fmt, label }) => (
              <label key={fmt} className="float-register-table__format-option">
                <input
                  type="radio"
                  name="float-format"
                  checked={format === fmt}
                  onChange={() => setFormat(fmt)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="float-register-table__content">
        <table className="float-register-table__table">
          <thead>
            <tr>
              <th className="float-register-table__header"></th>
              <th className="float-register-table__header">#</th>
              <th className="float-register-table__header">Name</th>
              <th className="float-register-table__header">Hex Value</th>
              <th className="float-register-table__header">Float Value</th>
            </tr>
          </thead>
          <tbody>
            {registers.map((value, index) => {
              const isWatching = watchpoints.has(index);

              return (
                <tr key={index} className="float-register-table__row">
                  {/* Watchpoint bubble */}
                  <td className="float-register-table__cell float-register-table__cell--watch">
                    <div
                      className={`watchpoint-bubble ${
                        isWatching ? 'watchpoint-bubble--active' : ''
                      }`}
                      onClick={() => onToggleWatchpoint?.(index)}
                      title={isWatching ? 'Remove watchpoint' : 'Add watchpoint'}
                      role="button"
                      tabIndex={0}
                    />
                  </td>

                  {/* Register number */}
                  <td className="float-register-table__cell float-register-table__cell--index">
                    f{index}
                  </td>

                  {/* ABI name */}
                  <td className="float-register-table__cell float-register-table__cell--name">
                    {FLOAT_ABI_NAMES[index]}
                  </td>

                  {/* Hex value */}
                  <td className="float-register-table__cell float-register-table__cell--hex">
                    {formatHex(value, registerWidth)}
                  </td>

                  {/* Float value */}
                  <td className="float-register-table__cell float-register-table__cell--float">
                    {formatFloat(value, format)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FloatRegisterTable;
