import React, { useState, useMemo, useCallback } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import './FLOPSCalc.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type Precision =
  | 'FP64' | 'FP32' | 'FP16' | 'BF16'
  | 'FP8_E4M3' | 'FP8_E5M2'
  | 'MXFP8_E4M3' | 'MXFP8_E5M2'
  | 'MXFP6_E3M2' | 'MXFP6_E2M3'
  | 'MXFP4_E2M1'
  | 'INT32' | 'INT16' | 'INT8';

type GroupType = 'vector' | 'matrix';

interface BaseGroup {
  id: number;
  name: string;
  clockGHz: number;
  precision: Precision;
}

interface VectorGroup extends BaseGroup {
  type: 'vector';
  cores: number;
  fpUnits: number;
  vectorBits: number;
  fma: boolean;
}

interface MatrixGroup extends BaseGroup {
  type: 'matrix';
  units: number;
  opsPerCycle: number;
}

type ComputeGroup = VectorGroup | MatrixGroup;

type PresetGroup = Omit<VectorGroup, 'id'> | Omit<MatrixGroup, 'id'>;

interface SystemPreset {
  name: string;
  groups: PresetGroup[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  'var(--group-0)', 'var(--group-1)', 'var(--group-2)', 'var(--group-3)',
  'var(--group-4)', 'var(--group-5)', 'var(--group-6)', 'var(--group-7)',
];

const MAX_GROUPS = 8;

const PRECISION_BITS: Record<Precision, number> = {
  FP64: 64, FP32: 32, FP16: 16, BF16: 16,
  FP8_E4M3: 8, FP8_E5M2: 8,
  MXFP8_E4M3: 8, MXFP8_E5M2: 8,
  MXFP6_E3M2: 6, MXFP6_E2M3: 6,
  MXFP4_E2M1: 4,
  INT32: 32, INT16: 16, INT8: 8,
};

const isIntPrecision = (p: Precision): boolean =>
  p === 'INT8' || p === 'INT16' || p === 'INT32';

const PRECISION_LABELS: Record<Precision, string> = {
  FP64: 'FP64 (64-bit)',
  FP32: 'FP32 (32-bit)',
  FP16: 'FP16 (16-bit)',
  BF16: 'BF16 (16-bit)',
  FP8_E4M3: 'FP8 E4M3 (8-bit)',
  FP8_E5M2: 'FP8 E5M2 (8-bit)',
  MXFP8_E4M3: 'MXFP8 E4M3 (8-bit)',
  MXFP8_E5M2: 'MXFP8 E5M2 (8-bit)',
  MXFP6_E3M2: 'MXFP6 E3M2 (6-bit)',
  MXFP6_E2M3: 'MXFP6 E2M3 (6-bit)',
  MXFP4_E2M1: 'MXFP4 E2M1 (4-bit)',
  INT32: 'INT32 (32-bit)',
  INT16: 'INT16 (16-bit)',
  INT8: 'INT8 (8-bit)',
};

const PRECISION_OPTIONS = Object.keys(PRECISION_BITS) as Precision[];

const VECTOR_WIDTH_OPTIONS = [32, 64, 128, 256, 512, 1024];

const PRESETS: SystemPreset[] = [
  // ─── CPUs ─────────────────────────────────────────────────────────────
  {
    name: 'Apple M4 Pro',
    groups: [
      { type: 'vector', name: 'P-cores', cores: 10, clockGHz: 4.51, fpUnits: 2, vectorBits: 128, precision: 'FP32', fma: true },
      { type: 'vector', name: 'E-cores', cores: 4, clockGHz: 2.74, fpUnits: 2, vectorBits: 128, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'Apple M4 Max',
    groups: [
      { type: 'vector', name: 'P-cores', cores: 12, clockGHz: 4.51, fpUnits: 2, vectorBits: 128, precision: 'FP32', fma: true },
      { type: 'vector', name: 'E-cores', cores: 4, clockGHz: 2.74, fpUnits: 2, vectorBits: 128, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'Intel Core i9-14900K',
    groups: [
      { type: 'vector', name: 'P-cores', cores: 8, clockGHz: 5.8, fpUnits: 2, vectorBits: 256, precision: 'FP32', fma: true },
      { type: 'vector', name: 'E-cores', cores: 16, clockGHz: 4.4, fpUnits: 1, vectorBits: 256, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'AMD Ryzen 9 7950X',
    groups: [
      { type: 'vector', name: 'All cores', cores: 16, clockGHz: 5.7, fpUnits: 2, vectorBits: 256, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'AMD Ryzen 9 9950X',
    groups: [
      { type: 'vector', name: 'All cores', cores: 16, clockGHz: 5.7, fpUnits: 2, vectorBits: 256, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'Intel Xeon w9-3595X',
    groups: [
      { type: 'vector', name: 'All cores', cores: 60, clockGHz: 4.6, fpUnits: 2, vectorBits: 512, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'AMD EPYC 9754 (Bergamo)',
    groups: [
      { type: 'vector', name: 'All cores', cores: 128, clockGHz: 3.1, fpUnits: 2, vectorBits: 256, precision: 'FP32', fma: true },
    ],
  },
  // ─── GPUs ─────────────────────────────────────────────────────────────
  {
    name: 'NVIDIA H100 SXM (FP16)',
    groups: [
      { type: 'vector', name: 'CUDA cores', cores: 16896, clockGHz: 1.83, fpUnits: 1, vectorBits: 32, precision: 'FP16', fma: true },
      { type: 'matrix', name: 'Tensor cores', units: 528, clockGHz: 1.83, opsPerCycle: 1024, precision: 'FP16' },
    ],
  },
  {
    name: 'NVIDIA H100 SXM (FP32)',
    groups: [
      { type: 'vector', name: 'CUDA cores', cores: 16896, clockGHz: 1.83, fpUnits: 1, vectorBits: 32, precision: 'FP32', fma: true },
      { type: 'matrix', name: 'Tensor cores', units: 528, clockGHz: 1.83, opsPerCycle: 512, precision: 'FP32' },
    ],
  },
  {
    name: 'NVIDIA RTX 4090 (FP16)',
    groups: [
      { type: 'vector', name: 'CUDA cores', cores: 16384, clockGHz: 2.52, fpUnits: 1, vectorBits: 32, precision: 'FP16', fma: true },
      { type: 'matrix', name: 'Tensor cores', units: 512, clockGHz: 2.52, opsPerCycle: 256, precision: 'FP16' },
    ],
  },
  {
    name: 'NVIDIA RTX 4090 (FP32)',
    groups: [
      { type: 'vector', name: 'CUDA cores', cores: 16384, clockGHz: 2.52, fpUnits: 1, vectorBits: 32, precision: 'FP32', fma: true },
    ],
  },
  {
    name: 'AMD MI300X (FP16)',
    groups: [
      { type: 'vector', name: 'Stream processors', cores: 19456, clockGHz: 2.1, fpUnits: 1, vectorBits: 32, precision: 'FP16', fma: true },
      { type: 'matrix', name: 'Matrix cores', units: 304, clockGHz: 2.1, opsPerCycle: 2048, precision: 'FP16' },
    ],
  },
  {
    name: 'AMD MI300X (FP32)',
    groups: [
      { type: 'vector', name: 'Stream processors', cores: 19456, clockGHz: 2.1, fpUnits: 1, vectorBits: 32, precision: 'FP32', fma: true },
    ],
  },
];

// ─── Pure Functions ──────────────────────────────────────────────────────────

const computeGroupFLOPS = (g: ComputeGroup): number => {
  if (g.type === 'vector') {
    const elements = g.vectorBits / PRECISION_BITS[g.precision];
    const opsPerCycle = g.fpUnits * (g.fma ? 2 : 1) * elements;
    return g.cores * g.clockGHz * opsPerCycle * 1e9;
  }
  return g.units * g.clockGHz * g.opsPerCycle * 1e9;
};

const formatFLOPS = (flops: number): { value: string; unit: string; raw: string } => {
  if (flops <= 0 || !isFinite(flops)) return { value: '0', unit: 'FLOPS', raw: '0' };
  if (flops >= 1e15) return { value: (flops / 1e15).toFixed(2), unit: 'PFLOPS', raw: flops.toFixed(0) };
  if (flops >= 1e12) return { value: (flops / 1e12).toFixed(2), unit: 'TFLOPS', raw: flops.toFixed(0) };
  if (flops >= 1e9) return { value: (flops / 1e9).toFixed(2), unit: 'GFLOPS', raw: flops.toFixed(0) };
  if (flops >= 1e6) return { value: (flops / 1e6).toFixed(2), unit: 'MFLOPS', raw: flops.toFixed(0) };
  if (flops >= 1e3) return { value: (flops / 1e3).toFixed(2), unit: 'KFLOPS', raw: flops.toFixed(0) };
  return { value: flops.toFixed(2), unit: 'FLOPS', raw: flops.toFixed(0) };
};

const formatFormula = (g: ComputeGroup): string => {
  if (g.type === 'vector') {
    const elements = g.vectorBits / PRECISION_BITS[g.precision];
    const parts: string[] = [
      `${g.cores} cores`,
      `${g.clockGHz} GHz`,
      `${g.fpUnits} FP unit${g.fpUnits !== 1 ? 's' : ''}`,
    ];
    if (g.fma) parts.push('2 (FMA)');
    parts.push(`${elements} elem (${g.vectorBits}b/${PRECISION_BITS[g.precision]}b)`);
    return parts.join(' \u00d7 ');
  }
  return `${g.units} units \u00d7 ${g.clockGHz} GHz \u00d7 ${g.opsPerCycle} ops/cycle`;
};

const makeDefaultVector = (id: number, name: string): VectorGroup => ({
  type: 'vector', id, name,
  cores: 8, clockGHz: 3.0, fpUnits: 2, vectorBits: 256, precision: 'FP32', fma: true,
});

const makeDefaultMatrix = (id: number, name: string): MatrixGroup => ({
  type: 'matrix', id, name,
  units: 128, clockGHz: 1.5, opsPerCycle: 256, precision: 'FP16',
});

// ─── Main Component ──────────────────────────────────────────────────────────

const FLOPSCalc: React.FC = () => {
  const [groups, setGroups] = useState<ComputeGroup[]>([
    makeDefaultVector(1, 'Compute Group 1'),
  ]);
  const [nextId, setNextId] = useState(2);

  // ─── Derived ────────────────────────────────────────────────────────────

  const groupResults = useMemo(() =>
    groups.map(g => ({ id: g.id, flops: computeGroupFLOPS(g) })),
    [groups]
  );

  const totalFLOPS = useMemo(() =>
    groupResults.reduce((sum, r) => sum + r.flops, 0),
    [groupResults]
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

  const addGroup = useCallback((type: GroupType) => {
    if (groups.length >= MAX_GROUPS) return;
    const newId = nextId;
    const name = type === 'vector' ? `Vector Group ${newId}` : `Matrix Group ${newId}`;
    const g = type === 'vector' ? makeDefaultVector(newId, name) : makeDefaultMatrix(newId, name);
    setGroups(prev => [...prev, g]);
    setNextId(prev => prev + 1);
  }, [groups.length, nextId]);

  const removeGroup = useCallback((id: number) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  const updateGroup = useCallback((id: number, field: string, value: string | number | boolean) => {
    setGroups(prev => prev.map(g =>
      g.id === id ? { ...g, [field]: value } : g
    ));
  }, []);

  const switchGroupType = useCallback((id: number, newType: GroupType) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== id || g.type === newType) return g;
      if (newType === 'vector') {
        return makeDefaultVector(g.id, g.name);
      }
      return makeDefaultMatrix(g.id, g.name);
    }));
  }, []);

  const loadPreset = useCallback((presetIndex: number) => {
    if (presetIndex < 0 || presetIndex >= PRESETS.length) return;
    const preset = PRESETS[presetIndex];
    let id = nextId;
    const newGroups = preset.groups.map(g => ({ ...g, id: id++ })) as ComputeGroup[];
    setGroups(newGroups);
    setNextId(id);
  }, [nextId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ─── Render: Precision Select ─────────────────────────────────────────

  const renderPrecisionSelect = (g: ComputeGroup) => (
    <div className="flops__field">
      <label className="flops__field-label">Precision</label>
      <select
        className="flops__field-select"
        value={g.precision}
        onChange={(ev) => updateGroup(g.id, 'precision', ev.target.value)}
      >
        {PRECISION_OPTIONS.map(p => (
          <option key={p} value={p}>{PRECISION_LABELS[p]}</option>
        ))}
      </select>
    </div>
  );

  // ─── Render: Vector Fields ────────────────────────────────────────────

  const renderVectorFields = (g: VectorGroup) => {
    const isScalar = g.vectorBits <= PRECISION_BITS[g.precision];
    const unitsLabel = isScalar
      ? (isIntPrecision(g.precision) ? 'Integer Units/Core' : 'FP Units/Core')
      : 'Vector Units/Core';
    return (
    <>
      <div className="flops__group-fields">
        <div className="flops__field">
          <label className="flops__field-label">Cores</label>
          <input
            type="number"
            className="flops__field-input"
            min={1}
            value={g.cores}
            onChange={(ev) => updateGroup(g.id, 'cores', Math.max(1, parseInt(ev.target.value) || 1))}
          />
        </div>
        <div className="flops__field">
          <label className="flops__field-label">Clock</label>
          <input
            type="number"
            className="flops__field-input"
            min={0.01} step="any"
            value={g.clockGHz}
            onChange={(ev) => updateGroup(g.id, 'clockGHz', Math.max(0.01, Number(ev.target.value) || 0.01))}
          />
          <span className="flops__field-unit">GHz</span>
        </div>
        <div className="flops__field">
          <label className="flops__field-label">{unitsLabel}</label>
          <input
            type="number"
            className="flops__field-input flops__field-input--narrow"
            min={1}
            value={g.fpUnits}
            onChange={(ev) => updateGroup(g.id, 'fpUnits', Math.max(1, parseInt(ev.target.value) || 1))}
          />
        </div>
      </div>
      <div className="flops__group-fields">
        <div className="flops__field">
          <label className="flops__field-label">Vector</label>
          <select
            className="flops__field-select"
            value={VECTOR_WIDTH_OPTIONS.includes(g.vectorBits) ? g.vectorBits : 'custom'}
            onChange={(ev) => {
              if (ev.target.value === 'custom') {
                updateGroup(g.id, 'vectorBits', 2048);
              } else {
                updateGroup(g.id, 'vectorBits', Number(ev.target.value));
              }
            }}
          >
            {VECTOR_WIDTH_OPTIONS.map(w => (
              <option key={w} value={w}>{w}-bit</option>
            ))}
            <option value="custom">Custom</option>
          </select>
          {!VECTOR_WIDTH_OPTIONS.includes(g.vectorBits) && (
            <input
              type="number"
              className="flops__field-input flops__field-input--narrow"
              min={1}
              value={g.vectorBits}
              onChange={(ev) => updateGroup(g.id, 'vectorBits', Math.max(1, parseInt(ev.target.value) || 1))}
            />
          )}
          <span className="flops__field-unit">bit</span>
        </div>
        {renderPrecisionSelect(g)}
        <label className="flops__field-checkbox">
          <input
            type="checkbox"
            checked={g.fma}
            onChange={(ev) => updateGroup(g.id, 'fma', ev.target.checked)}
          />
          <span>FMA</span>
        </label>
      </div>
    </>
  );
  };

  // ─── Render: Matrix Fields ────────────────────────────────────────────

  const renderMatrixFields = (g: MatrixGroup) => (
    <>
      <div className="flops__group-fields">
        <div className="flops__field">
          <label className="flops__field-label">Tensor Units</label>
          <input
            type="number"
            className="flops__field-input"
            min={1}
            value={g.units}
            onChange={(ev) => updateGroup(g.id, 'units', Math.max(1, parseInt(ev.target.value) || 1))}
          />
        </div>
        <div className="flops__field">
          <label className="flops__field-label">Clock</label>
          <input
            type="number"
            className="flops__field-input"
            min={0.01} step="any"
            value={g.clockGHz}
            onChange={(ev) => updateGroup(g.id, 'clockGHz', Math.max(0.01, Number(ev.target.value) || 0.01))}
          />
          <span className="flops__field-unit">GHz</span>
        </div>
        <div className="flops__field">
          <label className="flops__field-label">Ops/Cycle</label>
          <input
            type="number"
            className="flops__field-input flops__field-input--wide"
            min={1}
            value={g.opsPerCycle}
            onChange={(ev) => updateGroup(g.id, 'opsPerCycle', Math.max(1, parseInt(ev.target.value) || 1))}
          />
        </div>
        {renderPrecisionSelect(g)}
      </div>
    </>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  const totalFormatted = formatFLOPS(totalFLOPS);

  return (
    <ToolPage
      title="FLOPS Calculator"
      description="Free online FLOPS calculator. Compute peak floating-point performance from cores, clock speed, FP units, and vector width. Compare CPU and GPU theoretical throughput."
      keywords={[
        'flops calculator', 'flops calculator online', 'peak flops',
        'gflops calculator', 'tflops calculator', 'floating point performance',
        'peak performance calculator', 'cpu flops', 'gpu flops', 'vector flops',
        'simd performance', 'avx flops', 'neon flops', 'theoretical peak',
        'compute performance', 'fma throughput', 'operations per second',
        'tensor core flops', 'matrix core flops', 'computer architecture',
        'developer tools', 'free flops calculator',
      ]}
    >
      <div className="flops">
        {/* Preset Loader */}
        <div className="flops__preset-row">
          <span className="flops__preset-label">Load preset</span>
          <select
            className="flops__preset-select"
            value=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (!isNaN(idx)) loadPreset(idx);
            }}
          >
            <option value="" disabled>Select a system...</option>
            <optgroup label="CPUs">
              {PRESETS.map((p, i) => (
                p.groups.every(g => g.type === 'vector') && !p.name.includes('NVIDIA') && !p.name.includes('AMD MI') ? (
                  <option key={i} value={i}>{p.name}</option>
                ) : null
              ))}
            </optgroup>
            <optgroup label="GPUs">
              {PRESETS.map((p, i) => (
                p.groups.some(g => g.type === 'matrix') || p.name.includes('NVIDIA') || p.name.includes('AMD MI') ? (
                  <option key={i} value={i}>{p.name}</option>
                ) : null
              ))}
            </optgroup>
          </select>
        </div>

        {/* Compute Groups */}
        <div className="flops__groups">
          {groups.map((g, i) => {
            const color = GROUP_COLORS[i % GROUP_COLORS.length];
            const gFlops = groupResults.find(r => r.id === g.id)?.flops ?? 0;
            const gFormatted = formatFLOPS(gFlops);
            return (
              <div className="flops__group" key={g.id}>
                <div className="flops__group-color" style={{ background: color }} />
                <div className="flops__group-content">
                  <div className="flops__group-fields">
                    <input
                      className="flops__group-name"
                      value={g.name}
                      onChange={(ev) => updateGroup(g.id, 'name', ev.target.value)}
                      spellCheck={false}
                    />
                    <div className="flops__field">
                      <label className="flops__field-label">Type</label>
                      <select
                        className="flops__field-select"
                        value={g.type}
                        onChange={(ev) => switchGroupType(g.id, ev.target.value as GroupType)}
                      >
                        <option value="vector">Vector</option>
                        <option value="matrix">Matrix</option>
                      </select>
                    </div>
                  </div>
                  {g.type === 'vector' ? renderVectorFields(g) : renderMatrixFields(g)}
                  <div className="flops__group-result">
                    = {gFormatted.value} {gFormatted.unit}
                  </div>
                </div>
                <button
                  className="flops__group-remove"
                  onClick={() => removeGroup(g.id)}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            );
          })}
          {groups.length < MAX_GROUPS && (
            <div className="flops__add-row">
              <button className="flops__add-btn" onClick={() => addGroup('vector')}>
                + Add Vector Group
              </button>
              <button className="flops__add-btn" onClick={() => addGroup('matrix')}>
                + Add Matrix Group
              </button>
            </div>
          )}
        </div>

        {/* Contribution Bar */}
        {groups.length > 1 && totalFLOPS > 0 && (
          <div className="flops__contrib-bar-wrapper">
            <div className="flops__contrib-bar">
              {groupResults.map((r, i) => (
                r.flops > 0 && (
                  <div key={r.id} className="flops__contrib-segment"
                    style={{ flex: r.flops, background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                )
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flops__results">
          <div className="flops__value-row">
            <span className="flops__value-label">Total Peak</span>
            <span className="flops__value-data flops__value-data--mono flops__value-data--lg">
              {totalFormatted.value} {totalFormatted.unit}
            </span>
            <button className="flops__copy-btn" onClick={() => copyToClipboard(`${totalFormatted.value} ${totalFormatted.unit}`)} title="Copy">
              <CopyIcon size={16} />
            </button>
          </div>
        </div>

        {/* Per-Group Breakdown */}
        {groups.length > 0 && (
          <div className="flops__breakdown">
            {groups.map((g, i) => {
              const gFlops = groupResults.find(r => r.id === g.id)?.flops ?? 0;
              const gFormatted = formatFLOPS(gFlops);
              const pct = totalFLOPS > 0 ? ((gFlops / totalFLOPS) * 100).toFixed(1) : '0.0';
              return (
                <div className="flops__breakdown-row" key={g.id}>
                  <div className="flops__breakdown-color" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                  <span className="flops__breakdown-name">{g.name}</span>
                  <span className="flops__breakdown-type">{g.type}</span>
                  <span className="flops__breakdown-flops">{gFormatted.value} {gFormatted.unit}</span>
                  <span className="flops__breakdown-pct">{pct}%</span>
                  <span className="flops__breakdown-formula">{formatFormula(g)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default FLOPSCalc;
