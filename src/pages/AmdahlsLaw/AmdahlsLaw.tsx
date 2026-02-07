import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import { TabSelector } from '../../components';
import type { TabItem } from '../../types';
import './AmdahlsLaw.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Enhancement {
  id: number;
  name: string;
  fraction: number; // 0–1
  speedup: number;  // > 0 (< 1 means slowdown)
}

type Mode = 'amdahl' | 'gustafson';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODE_TABS: TabItem[] = [
  { id: 'amdahl', label: "Amdahl" },
  { id: 'gustafson', label: "Gustafson" },
];

const ENHANCEMENT_COLORS = [
  'var(--enhance-0)', 'var(--enhance-1)', 'var(--enhance-2)', 'var(--enhance-3)',
  'var(--enhance-4)', 'var(--enhance-5)', 'var(--enhance-6)', 'var(--enhance-7)',
];

const MAX_ENHANCEMENTS = 8;
const SWEEP_POINTS = 200;
const SWEEP_MAX_X = 128;

// ─── Pure Functions ──────────────────────────────────────────────────────────

const computeAmdahl = (enhancements: Enhancement[], serial: number): number => {
  let denom = serial;
  for (const e of enhancements) {
    denom += e.fraction / e.speedup;
  }
  return denom > 0 ? 1 / denom : Infinity;
};

const computeGustafson = (enhancements: Enhancement[], serial: number): number => {
  let result = serial;
  for (const e of enhancements) {
    result += e.fraction * e.speedup;
  }
  return result;
};

const generateSweepData = (
  enhancements: Enhancement[], sweepId: number, serial: number, mode: Mode,
): { x: number; y: number }[] => {
  const swept = enhancements.find(e => e.id === sweepId);
  if (!swept || serial < 0) return [];

  const data: { x: number; y: number }[] = [];
  for (let i = 0; i <= SWEEP_POINTS; i++) {
    const t = i / SWEEP_POINTS;
    const x = Math.pow(SWEEP_MAX_X, t);
    const modified = enhancements.map(e =>
      e.id === sweepId ? { ...e, speedup: x } : e
    );
    const y = mode === 'amdahl'
      ? computeAmdahl(modified, serial)
      : computeGustafson(modified, serial);
    data.push({ x, y });
  }
  return data;
};

const niceNum = (value: number, round: boolean): number => {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const frac = value / Math.pow(10, exp);
  let nice: number;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * Math.pow(10, exp);
};

const niceScale = (maxVal: number, targetTicks: number = 5) => {
  if (maxVal <= 0) return { max: 1, ticks: [0, 1] };
  const range = niceNum(maxVal, false);
  const tickSpacing = niceNum(range / (targetTicks - 1), true);
  const niceMax = Math.ceil(maxVal / tickSpacing) * tickSpacing;
  const ticks: number[] = [];
  for (let t = 0; t <= niceMax + tickSpacing * 0.5; t += tickSpacing) {
    ticks.push(Math.round(t * 1000) / 1000);
  }
  return { max: niceMax, ticks };
};

const formatSpeedup = (value: number): string => {
  if (isNaN(value)) return '\u2014';
  if (!isFinite(value)) return '\u221E';
  if (value < 10) return value.toFixed(2) + 'x';
  if (value < 100) return value.toFixed(1) + 'x';
  return Math.round(value) + 'x';
};

const formatPercent = (value: number): string => {
  if (isNaN(value)) return '\u2014';
  return (value * 100).toFixed(1) + '%';
};

// ─── Main Component ──────────────────────────────────────────────────────────

const AmdahlsLaw: React.FC = () => {
  const [mode, setMode] = useState<Mode>('amdahl');
  const [enhancements, setEnhancements] = useState<Enhancement[]>([
    { id: 1, name: 'Enhancement 1', fraction: 0.5, speedup: 4 },
  ]);
  const [nextId, setNextId] = useState(2);
  const [sweepId, setSweepId] = useState(1);

  // Keep sweepId valid
  useEffect(() => {
    if (enhancements.length > 0 && !enhancements.some(e => e.id === sweepId)) {
      setSweepId(enhancements[0].id);
    }
  }, [enhancements, sweepId]);

  // ─── Derived ────────────────────────────────────────────────────────────

  const totalFraction = useMemo(() =>
    enhancements.reduce((sum, e) => sum + e.fraction, 0),
    [enhancements]
  );
  const serialFraction = 1 - totalFraction;
  const fractionError = totalFraction > 1.0005;

  const overallSpeedup = useMemo(() => {
    if (fractionError) return NaN;
    return mode === 'amdahl'
      ? computeAmdahl(enhancements, serialFraction)
      : computeGustafson(enhancements, serialFraction);
  }, [enhancements, serialFraction, mode, fractionError]);

  const maxSpeedup = useMemo(() => {
    if (fractionError) return NaN;
    if (mode === 'gustafson') return Infinity;
    return serialFraction > 0.0001 ? 1 / serialFraction : Infinity;
  }, [serialFraction, mode, fractionError]);

  const sweepData = useMemo(() => {
    if (fractionError || enhancements.length === 0) return [];
    return generateSweepData(enhancements, sweepId, serialFraction, mode);
  }, [enhancements, sweepId, serialFraction, mode, fractionError]);

  const sweepAsymptote = useMemo(() => {
    if (mode !== 'amdahl' || fractionError) return null;
    const swept = enhancements.find(e => e.id === sweepId);
    if (!swept) return null;
    let denom = serialFraction;
    for (const e of enhancements) {
      if (e.id !== sweepId) denom += e.fraction / e.speedup;
    }
    return denom > 0.0001 ? 1 / denom : null;
  }, [enhancements, sweepId, serialFraction, mode, fractionError]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const addEnhancement = useCallback(() => {
    if (enhancements.length >= MAX_ENHANCEMENTS) return;
    const newId = nextId;
    setEnhancements(prev => [...prev, {
      id: newId,
      name: `Enhancement ${newId}`,
      fraction: 0,
      speedup: 2,
    }]);
    setNextId(prev => prev + 1);
  }, [enhancements.length, nextId]);

  const removeEnhancement = useCallback((id: number) => {
    setEnhancements(prev => {
      const next = prev.filter(e => e.id !== id);
      if (sweepId === id && next.length > 0) {
        setSweepId(next[0].id);
      }
      return next;
    });
  }, [sweepId]);

  const updateEnhancement = useCallback((id: number, field: keyof Enhancement, value: string | number) => {
    setEnhancements(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: value } : e
    ));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ─── Render: Value Row ──────────────────────────────────────────────────

  const renderValueRow = (name: string, value: string, copyValue: string) => (
    <div className="amdahl__value-row" key={name}>
      <span className="amdahl__value-label">{name}</span>
      <span className="amdahl__value-data amdahl__value-data--mono">{value}</span>
      <button className="amdahl__copy-btn" onClick={() => copyToClipboard(copyValue)} title="Copy">
        <CopyIcon size={16} />
      </button>
    </div>
  );

  // ─── Render: Time Bars ──────────────────────────────────────────────────

  const renderTimeBars = () => {
    if (enhancements.length === 0 || fractionError) return null;

    const isAmdahl = mode === 'amdahl';
    const enhancedTotal = isAmdahl
      ? serialFraction + enhancements.reduce((s, e) => s + e.fraction / e.speedup, 0)
      : serialFraction + enhancements.reduce((s, e) => s + e.fraction * e.speedup, 0);

    const originalWidth = isAmdahl ? 100 : Math.min(100, (1 / Math.max(1, enhancedTotal)) * 100);
    const enhancedWidth = isAmdahl ? Math.max(1, enhancedTotal * 100) : 100;

    return (
      <div className="amdahl__time-bars">
        <div className="amdahl__time-bar-row">
          <span className="amdahl__time-bar-label">Original</span>
          <div className="amdahl__time-bar-track">
            <div className="amdahl__time-bar" style={{ width: `${originalWidth}%` }}>
              {enhancements.map((e, i) => (
                e.fraction > 0.001 && (
                  <div key={e.id} className="amdahl__time-segment"
                    style={{ flex: e.fraction, background: ENHANCEMENT_COLORS[i % ENHANCEMENT_COLORS.length] }} />
                )
              ))}
              {serialFraction > 0.001 && (
                <div className="amdahl__time-segment amdahl__time-segment--serial"
                  style={{ flex: Math.max(0, serialFraction) }} />
              )}
            </div>
          </div>
        </div>
        <div className="amdahl__time-bar-row">
          <span className="amdahl__time-bar-label">{isAmdahl ? 'Enhanced' : 'Scaled'}</span>
          <div className="amdahl__time-bar-track">
            <div className="amdahl__time-bar" style={{ width: `${enhancedWidth}%` }}>
              {enhancements.map((e, i) => {
                const segFlex = isAmdahl ? e.fraction / e.speedup : e.fraction * e.speedup;
                return segFlex > 0.001 && (
                  <div key={e.id} className="amdahl__time-segment"
                    style={{ flex: segFlex, background: ENHANCEMENT_COLORS[i % ENHANCEMENT_COLORS.length] }} />
                );
              })}
              {serialFraction > 0.001 && (
                <div className="amdahl__time-segment amdahl__time-segment--serial"
                  style={{ flex: Math.max(0, serialFraction) }} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render: Chart ──────────────────────────────────────────────────────

  const renderChart = () => {
    if (enhancements.length === 0 || sweepData.length === 0) {
      return (
        <div className="amdahl__chart">
          <div className="amdahl__chart-empty">Add an enhancement to see the speedup curve</div>
        </div>
      );
    }

    const margin = { top: 20, right: 20, bottom: 40, left: 55 };
    const W = 600, H = 350;
    const pW = W - margin.left - margin.right;
    const pH = H - margin.top - margin.bottom;

    const dataMaxY = Math.max(...sweepData.map(d => d.y), isFinite(overallSpeedup) ? overallSpeedup : 1, 1);
    const { max: maxY, ticks: yTicks } = niceScale(dataMaxY * 1.05);
    const xTicks = [1, 2, 4, 8, 16, 32, 64, 128];

    const toX = (v: number) => margin.left + (Math.log2(Math.max(1, v)) / 7) * pW;
    const toY = (v: number) => margin.top + pH - (Math.min(v, maxY) / maxY) * pH;

    const pathD = sweepData.map((d, i) =>
      `${i === 0 ? 'M' : 'L'}${toX(d.x).toFixed(1)},${toY(d.y).toFixed(1)}`
    ).join(' ');

    const swept = enhancements.find(e => e.id === sweepId);
    const curX = swept ? swept.speedup : 1;
    const sweptIndex = enhancements.findIndex(e => e.id === sweepId);
    const sweepColor = ENHANCEMENT_COLORS[sweptIndex >= 0 ? sweptIndex % ENHANCEMENT_COLORS.length : 0];

    return (
      <div className="amdahl__chart">
        <div className="amdahl__chart-header">
          <span className="amdahl__chart-title">
            {mode === 'amdahl' ? 'Speedup Curve' : 'Scaled Work Curve'}
          </span>
          <div className="amdahl__chart-sweep">
            <label>Scaling</label>
            <select
              value={sweepId}
              onChange={(e) => setSweepId(Number(e.target.value))}
              className="amdahl__chart-select"
            >
              {enhancements.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="amdahl__chart-svg" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {yTicks.map(t => (
            <line key={`yg${t}`} x1={margin.left} x2={W - margin.right}
              y1={toY(t)} y2={toY(t)} className="amdahl__chart-grid" />
          ))}
          {xTicks.map(t => (
            <line key={`xg${t}`} x1={toX(t)} x2={toX(t)}
              y1={margin.top} y2={margin.top + pH} className="amdahl__chart-grid" />
          ))}

          {/* Axes */}
          <line x1={margin.left} x2={margin.left}
            y1={margin.top} y2={margin.top + pH} className="amdahl__chart-axis" />
          <line x1={margin.left} x2={W - margin.right}
            y1={margin.top + pH} y2={margin.top + pH} className="amdahl__chart-axis" />

          {/* Y tick labels */}
          {yTicks.map(t => (
            <text key={`yl${t}`} x={margin.left - 8} y={toY(t) + 4}
              textAnchor="end" className="amdahl__chart-tick-label">
              {t % 1 === 0 ? t : t.toFixed(1)}x
            </text>
          ))}

          {/* X tick labels */}
          {xTicks.map(t => (
            <text key={`xl${t}`} x={toX(t)} y={margin.top + pH + 22}
              textAnchor="middle" className="amdahl__chart-tick-label">
              {t}x
            </text>
          ))}

          {/* Asymptote (Amdahl only) */}
          {sweepAsymptote != null && sweepAsymptote <= maxY && (
            <>
              <line x1={margin.left} x2={W - margin.right}
                y1={toY(sweepAsymptote)} y2={toY(sweepAsymptote)}
                className="amdahl__chart-asymptote" />
              <text x={W - margin.right - 4} y={toY(sweepAsymptote) - 6}
                textAnchor="end" className="amdahl__chart-asymptote-label">
                max {formatSpeedup(sweepAsymptote)}
              </text>
            </>
          )}

          {/* Curve */}
          <path d={pathD} fill="none" stroke={sweepColor}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Current value dot */}
          {swept && curX >= 1 && isFinite(overallSpeedup) && (
            <circle cx={toX(curX)} cy={toY(overallSpeedup)} r={5}
              fill={sweepColor} className="amdahl__chart-dot" />
          )}

          {/* Axis titles */}
          <text x={W / 2} y={H - 4} textAnchor="middle" className="amdahl__chart-axis-title">
            Enhancement Factor
          </text>
          <text x={14} y={H / 2} textAnchor="middle"
            transform={`rotate(-90,14,${H / 2})`} className="amdahl__chart-axis-title">
            {mode === 'amdahl' ? 'Speedup' : 'Scaled Work'}
          </text>
        </svg>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage
      title="Amdahl's Law Calculator"
      description="Free online Amdahl's Law calculator. Compute theoretical speedup from parallelization. Visualize diminishing returns with interactive charts. Calculate efficiency and scalability metrics."
      keywords={[
        'amdahls law calculator',
        'amdahls law',
        'parallel speedup calculator',
        'speedup calculator',
        'parallelization calculator',
        'parallel computing',
        'parallel efficiency',
        'theoretical speedup',
        'diminishing returns',
        'scalability calculator',
        'multicore speedup',
        'parallel fraction',
        'serial fraction',
        'gustafson law',
        'performance calculator',
        'HPC calculator',
        'computer architecture',
        'free speedup calculator'
      ]}
    >
      <div className="amdahl">
        {/* Mode Tabs */}
        <TabSelector
          tabs={MODE_TABS}
          activeTab={mode}
          onTabChange={(id) => setMode(id as Mode)}
          size="sm"
          className="amdahl__tabs"
        />

        {/* Enhancement List */}
        <div className="amdahl__enhancements">
          {enhancements.map((e, i) => {
            const color = ENHANCEMENT_COLORS[i % ENHANCEMENT_COLORS.length];
            return (
              <div className="amdahl__enhancement" key={e.id}>
                <div className="amdahl__enhancement-color" style={{ background: color }} />
                <div className="amdahl__enhancement-fields">
                  <input
                    className="amdahl__enhancement-name"
                    value={e.name}
                    onChange={(ev) => updateEnhancement(e.id, 'name', ev.target.value)}
                    spellCheck={false}
                  />
                  <div className="amdahl__enhancement-fraction">
                    <label className="amdahl__field-label">Fraction</label>
                    <input
                      type="range"
                      className="amdahl__fraction-slider"
                      min={0} max={100} step={0.1}
                      value={e.fraction * 100}
                      onChange={(ev) => updateEnhancement(e.id, 'fraction', Number(ev.target.value) / 100)}
                      style={{ accentColor: color }}
                    />
                    <div className="amdahl__fraction-value">
                      <input
                        type="number"
                        className="amdahl__fraction-input"
                        min={0} max={100} step={0.1}
                        value={Math.round(e.fraction * 1000) / 10}
                        onChange={(ev) => {
                          const v = Math.max(0, Math.min(100, Number(ev.target.value) || 0));
                          updateEnhancement(e.id, 'fraction', v / 100);
                        }}
                      />
                      <span className="amdahl__field-unit">%</span>
                    </div>
                  </div>
                  <div className="amdahl__enhancement-speedup">
                    <label className="amdahl__field-label">Speedup</label>
                    <div className="amdahl__speedup-wrapper">
                      <input
                        type="number"
                        className="amdahl__speedup-input"
                        min={0.01} step="any"
                        value={e.speedup}
                        onChange={(ev) => {
                          const v = Math.max(0.01, Number(ev.target.value) || 1);
                          updateEnhancement(e.id, 'speedup', v);
                        }}
                      />
                      <span className="amdahl__field-unit">x</span>
                    </div>
                  </div>
                </div>
                <button
                  className="amdahl__enhancement-remove"
                  onClick={() => removeEnhancement(e.id)}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            );
          })}
          {enhancements.length < MAX_ENHANCEMENTS && (
            <button className="amdahl__add-btn" onClick={addEnhancement}>
              + Add Enhancement
            </button>
          )}
        </div>

        {/* Fraction Allocation Bar */}
        <div className="amdahl__fraction-bar-wrapper">
          <div className={`amdahl__fraction-bar ${fractionError ? 'amdahl__fraction-bar--error' : ''}`}>
            {enhancements.map((e, i) => (
              e.fraction > 0.001 && (
                <div key={e.id} className="amdahl__fraction-segment"
                  style={{ flex: e.fraction, background: ENHANCEMENT_COLORS[i % ENHANCEMENT_COLORS.length] }} />
              )
            ))}
            {serialFraction > 0.001 && (
              <div className="amdahl__fraction-segment amdahl__fraction-segment--serial"
                style={{ flex: Math.max(0, serialFraction) }} />
            )}
          </div>
          <div className="amdahl__fraction-labels">
            {fractionError ? (
              <span className="amdahl__fraction-error">Fractions exceed 100%</span>
            ) : serialFraction > 0.001 ? (
              <span className="amdahl__serial-label">Serial: {formatPercent(serialFraction)}</span>
            ) : null}
          </div>
        </div>

        {/* Results */}
        {!fractionError && (
          <>
            <div className="amdahl__results">
              {renderValueRow(
                mode === 'amdahl' ? 'Overall Speedup' : 'Scaled Speedup',
                formatSpeedup(overallSpeedup),
                isFinite(overallSpeedup) ? overallSpeedup.toFixed(4) : '\u221E',
              )}
              {mode === 'amdahl' && renderValueRow(
                'Max Theoretical Speedup',
                formatSpeedup(maxSpeedup),
                isFinite(maxSpeedup) ? maxSpeedup.toFixed(4) : '\u221E',
              )}
              {renderValueRow(
                'Serial Bottleneck',
                formatPercent(Math.max(0, serialFraction)),
                (Math.max(0, serialFraction) * 100).toFixed(1) + '%',
              )}
            </div>

            {/* Execution Time / Work Bars */}
            {renderTimeBars()}

            {/* Speedup Curve */}
            {renderChart()}
          </>
        )}
      </div>
    </ToolPage>
  );
};

export default AmdahlsLaw;
