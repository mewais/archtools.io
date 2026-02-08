import React, { useState, useMemo } from 'react';
import ToolPage from '../ToolPage';
import { CopyIcon } from '../../components/Icons';
import './BandwidthCalc.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type MemType = 'ddr4' | 'ddr5' | 'lpddr5' | 'gddr6' | 'hbm2' | 'hbm3';
type AddressField = 'row' | 'bankgrp' | 'bank' | 'rank' | 'column' | 'channel' | 'offset';

interface TimingPreset {
  label: string;
  memType: MemType;
  tCK: number;
  dataRate: number;
  nCL: number; nRCD: number; nRP: number; nRAS: number; nRC: number;
  nRFC: number; nREFI: number;
  nRRD_S: number; nRRD_L: number;
  nWTR_S: number; nWTR_L: number;
  nCCD_S: number; nCCD_L: number;
  nFAW: number; BL: number;
  bankGroups: number; banksPerGroup: number;
  deviceWidth: number;
  defaultBusWidth: number;
}

interface SystemPreset {
  name: string;
  timingKey: string;
  channels: number;
  ranksPerChannel: number;
  busWidth: number;
  note?: string;
}

interface BandwidthResults {
  peakBW: number;
  streamingBW: number;
  singleBankRandomBW: number;
  bankParallelBW: number;
  refreshFraction: number;
  effectiveStreaming: number;
  effectiveRandom: number;
  mixedBW: number;
  firstAccessNs: number;
  dataPerBurst: number;
  totalBanks: number;
}

interface DiagramBlock {
  start: number;
  duration: number;
  color: string;
  label: string;
}

interface DiagramRow {
  label: string;
  blocks: DiagramBlock[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMING_PRESETS: Record<string, TimingPreset> = {
  // ── DDR4 (Ramulator2-verified, x8 org, 8Gb density) ──────────────────
  'DDR4-1600': {
    label: 'DDR4-1600 (CL11)', memType: 'ddr4', tCK: 1.25, dataRate: 1600,
    nCL: 11, nRCD: 11, nRP: 11, nRAS: 28, nRC: 39,
    nRFC: 288, nREFI: 6240,
    nRRD_S: 4, nRRD_L: 5, nWTR_S: 2, nWTR_L: 6,
    nCCD_S: 4, nCCD_L: 5, nFAW: 20, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-1866': {
    label: 'DDR4-1866 (CL13)', memType: 'ddr4', tCK: 1.072, dataRate: 1866,
    nCL: 13, nRCD: 13, nRP: 13, nRAS: 32, nRC: 45,
    nRFC: 336, nREFI: 7277,
    nRRD_S: 4, nRRD_L: 5, nWTR_S: 3, nWTR_L: 7,
    nCCD_S: 4, nCCD_L: 5, nFAW: 22, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-2133': {
    label: 'DDR4-2133 (CL15)', memType: 'ddr4', tCK: 0.938, dataRate: 2133,
    nCL: 15, nRCD: 15, nRP: 15, nRAS: 36, nRC: 51,
    nRFC: 384, nREFI: 8316,
    nRRD_S: 4, nRRD_L: 6, nWTR_S: 3, nWTR_L: 8,
    nCCD_S: 4, nCCD_L: 6, nFAW: 23, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-2400': {
    label: 'DDR4-2400 (CL17)', memType: 'ddr4', tCK: 0.833, dataRate: 2400,
    nCL: 17, nRCD: 17, nRP: 17, nRAS: 39, nRC: 56,
    nRFC: 433, nREFI: 9364,
    nRRD_S: 4, nRRD_L: 6, nWTR_S: 3, nWTR_L: 9,
    nCCD_S: 4, nCCD_L: 6, nFAW: 26, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-2666': {
    label: 'DDR4-2666 (CL18)', memType: 'ddr4', tCK: 0.75, dataRate: 2666,
    nCL: 18, nRCD: 18, nRP: 18, nRAS: 43, nRC: 61,
    nRFC: 480, nREFI: 10400,
    nRRD_S: 4, nRRD_L: 7, nWTR_S: 4, nWTR_L: 10,
    nCCD_S: 4, nCCD_L: 7, nFAW: 28, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-2933': {
    label: 'DDR4-2933 (CL20)', memType: 'ddr4', tCK: 0.682, dataRate: 2933,
    nCL: 20, nRCD: 20, nRP: 20, nRAS: 47, nRC: 67,
    nRFC: 528, nREFI: 11437,
    nRRD_S: 4, nRRD_L: 8, nWTR_S: 4, nWTR_L: 11,
    nCCD_S: 4, nCCD_L: 8, nFAW: 31, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  'DDR4-3200': {
    label: 'DDR4-3200 (CL22)', memType: 'ddr4', tCK: 0.625, dataRate: 3200,
    nCL: 22, nRCD: 22, nRP: 22, nRAS: 52, nRC: 74,
    nRFC: 576, nREFI: 12480,
    nRRD_S: 4, nRRD_L: 8, nWTR_S: 4, nWTR_L: 12,
    nCCD_S: 4, nCCD_L: 8, nFAW: 34, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 64,
  },
  // ── DDR5 (JEDEC-based, x8 org, 16Gb density) ────────────────────────
  'DDR5-3200': {
    label: 'DDR5-3200 (CL24)', memType: 'ddr5', tCK: 0.625, dataRate: 3200,
    nCL: 24, nRCD: 24, nRP: 24, nRAS: 52, nRC: 76,
    nRFC: 472, nREFI: 6240,
    nRRD_S: 8, nRRD_L: 8, nWTR_S: 4, nWTR_L: 16,
    nCCD_S: 8, nCCD_L: 8, nFAW: 32, BL: 16,
    bankGroups: 8, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 32,
  },
  'DDR5-4800': {
    label: 'DDR5-4800 (CL40)', memType: 'ddr5', tCK: 0.417, dataRate: 4800,
    nCL: 40, nRCD: 40, nRP: 40, nRAS: 76, nRC: 116,
    nRFC: 708, nREFI: 9353,
    nRRD_S: 8, nRRD_L: 12, nWTR_S: 4, nWTR_L: 16,
    nCCD_S: 8, nCCD_L: 8, nFAW: 40, BL: 16,
    bankGroups: 8, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 32,
  },
  'DDR5-5600': {
    label: 'DDR5-5600 (CL46)', memType: 'ddr5', tCK: 0.357, dataRate: 5600,
    nCL: 46, nRCD: 46, nRP: 46, nRAS: 88, nRC: 134,
    nRFC: 827, nREFI: 10924,
    nRRD_S: 8, nRRD_L: 12, nWTR_S: 4, nWTR_L: 16,
    nCCD_S: 8, nCCD_L: 8, nFAW: 40, BL: 16,
    bankGroups: 8, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 32,
  },
  'DDR5-6400': {
    label: 'DDR5-6400 (CL52)', memType: 'ddr5', tCK: 0.3125, dataRate: 6400,
    nCL: 52, nRCD: 52, nRP: 52, nRAS: 100, nRC: 152,
    nRFC: 944, nREFI: 12480,
    nRRD_S: 8, nRRD_L: 12, nWTR_S: 4, nWTR_L: 16,
    nCCD_S: 8, nCCD_L: 8, nFAW: 40, BL: 16,
    bankGroups: 8, banksPerGroup: 4, deviceWidth: 8, defaultBusWidth: 32,
  },
  // ── LPDDR5 ───────────────────────────────────────────────────────────
  'LPDDR5-6400': {
    label: 'LPDDR5-6400', memType: 'lpddr5', tCK: 0.3125, dataRate: 6400,
    nCL: 28, nRCD: 24, nRP: 24, nRAS: 56, nRC: 80,
    nRFC: 672, nREFI: 12500,
    nRRD_S: 8, nRRD_L: 10, nWTR_S: 4, nWTR_L: 12,
    nCCD_S: 8, nCCD_L: 8, nFAW: 32, BL: 16,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 16, defaultBusWidth: 32,
  },
  // ── GDDR6 ────────────────────────────────────────────────────────────
  'GDDR6-16Gbps': {
    label: 'GDDR6-16Gbps', memType: 'gddr6', tCK: 0.625, dataRate: 16000,
    nCL: 24, nRCD: 24, nRP: 24, nRAS: 54, nRC: 78,
    nRFC: 126, nREFI: 11862,
    nRRD_S: 9, nRRD_L: 9, nWTR_S: 4, nWTR_L: 10,
    nCCD_S: 3, nCCD_L: 4, nFAW: 32, BL: 16,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 32, defaultBusWidth: 32,
  },
  // ── HBM ──────────────────────────────────────────────────────────────
  'HBM2': {
    label: 'HBM2', memType: 'hbm2', tCK: 1.0, dataRate: 2000,
    nCL: 14, nRCD: 14, nRP: 14, nRAS: 34, nRC: 48,
    nRFC: 350, nREFI: 3900,
    nRRD_S: 4, nRRD_L: 6, nWTR_S: 4, nWTR_L: 8,
    nCCD_S: 1, nCCD_L: 2, nFAW: 30, BL: 4,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 128, defaultBusWidth: 64,
  },
  'HBM3': {
    label: 'HBM3', memType: 'hbm3', tCK: 0.5, dataRate: 6400,
    nCL: 22, nRCD: 22, nRP: 22, nRAS: 42, nRC: 64,
    nRFC: 310, nREFI: 7800,
    nRRD_S: 4, nRRD_L: 8, nWTR_S: 4, nWTR_L: 8,
    nCCD_S: 2, nCCD_L: 4, nFAW: 20, BL: 8,
    bankGroups: 4, banksPerGroup: 4, deviceWidth: 128, defaultBusWidth: 64,
  },
};

const SYSTEM_PRESETS: SystemPreset[] = [
  { name: 'Desktop DDR4-2400 Dual Channel', timingKey: 'DDR4-2400', channels: 2, ranksPerChannel: 1, busWidth: 64 },
  { name: 'Desktop DDR4-3200 Dual Channel', timingKey: 'DDR4-3200', channels: 2, ranksPerChannel: 1, busWidth: 64 },
  { name: 'Server DDR4-2933 8-Channel', timingKey: 'DDR4-2933', channels: 8, ranksPerChannel: 2, busWidth: 64, note: '4 DIMMs \u00d7 2 ranks' },
  { name: 'Desktop DDR5-5600 Dual Channel', timingKey: 'DDR5-5600', channels: 4, ranksPerChannel: 1, busWidth: 32, note: '2 DIMMs \u00d7 2 subchannels' },
  { name: 'Desktop DDR5-6400 Dual Channel', timingKey: 'DDR5-6400', channels: 4, ranksPerChannel: 1, busWidth: 32, note: '2 DIMMs \u00d7 2 subchannels' },
  { name: 'Server DDR5-4800 8-Channel', timingKey: 'DDR5-4800', channels: 16, ranksPerChannel: 2, busWidth: 32, note: '8 DIMMs \u00d7 2 subchannels' },
  { name: 'Laptop LPDDR5-6400', timingKey: 'LPDDR5-6400', channels: 4, ranksPerChannel: 1, busWidth: 32 },
  { name: 'NVIDIA RTX 4090', timingKey: 'GDDR6-16Gbps', channels: 12, ranksPerChannel: 1, busWidth: 32, note: '384-bit = 12\u00d732' },
  { name: 'NVIDIA H100 SXM', timingKey: 'HBM3', channels: 80, ranksPerChannel: 1, busWidth: 64, note: '5 stacks \u00d7 16 ch' },
  { name: 'AMD MI300X', timingKey: 'HBM3', channels: 128, ranksPerChannel: 1, busWidth: 64, note: '8 stacks \u00d7 16 ch' },
];

const ADDR_FIELD_COLORS: Record<AddressField, string> = {
  row: 'var(--bw-color-row)',
  bankgrp: 'var(--bw-color-bankgrp)',
  bank: 'var(--bw-color-bank)',
  rank: 'var(--bw-color-rank)',
  column: 'var(--bw-color-column)',
  channel: 'var(--bw-color-channel)',
  offset: 'var(--bw-color-offset)',
};

const ADDR_FIELD_NAMES: Record<AddressField, string> = {
  row: 'Row', bankgrp: 'BankGrp', bank: 'Bank',
  rank: 'Rank', column: 'Column', channel: 'Channel', offset: 'Offset',
};

type StrategyPreset = 'RoBaRaCoCh' | 'RoRaBaChCo' | 'ChRaBaRoCo';

const STRATEGY_ORDERS: Record<StrategyPreset, AddressField[]> = {
  'RoBaRaCoCh': ['row', 'bankgrp', 'bank', 'rank', 'column', 'channel', 'offset'],
  'RoRaBaChCo': ['row', 'rank', 'bankgrp', 'bank', 'channel', 'column', 'offset'],
  'ChRaBaRoCo': ['channel', 'rank', 'bankgrp', 'bank', 'row', 'column', 'offset'],
};

const STRATEGY_OPTIONS: { value: StrategyPreset | 'custom'; label: string }[] = [
  { value: 'RoBaRaCoCh', label: 'RoBaRaCoCh \u2014 Row, Bank, Rank, Column, Channel' },
  { value: 'RoRaBaChCo', label: 'RoRaBaChCo \u2014 Row, Rank, Bank, Channel, Column' },
  { value: 'ChRaBaRoCo', label: 'ChRaBaRoCo \u2014 Channel, Rank, Bank, Row, Column' },
  { value: 'custom', label: 'Custom \u2014 define your own ordering' },
];

const MEM_TYPE_LABELS: Record<MemType, string> = {
  ddr4: 'DDR4', ddr5: 'DDR5', lpddr5: 'LPDDR5',
  gddr6: 'GDDR6', hbm2: 'HBM2', hbm3: 'HBM3',
};

// Default row/column counts (used for address mapping only)
const DEFAULT_ROWS = 65536;     // 2^16
const DEFAULT_COLUMNS = 1024;   // 2^10

// ─── Pure Functions ──────────────────────────────────────────────────────────

const log2 = (n: number): number => n > 0 ? Math.log2(n) : 0;
const log2Int = (n: number): number => {
  if (n <= 1) return 0;
  return Math.ceil(Math.log2(n));
};

const formatBW = (gbps: number): string => {
  if (gbps >= 1000) return `${(gbps / 1000).toFixed(2)} TB/s`;
  if (gbps >= 1) return `${gbps.toFixed(2)} GB/s`;
  if (gbps >= 0.001) return `${(gbps * 1000).toFixed(2)} MB/s`;
  return `${(gbps * 1e6).toFixed(2)} KB/s`;
};

const computeBandwidth = (
  dataRate: number, busWidth: number, channels: number,
  ranksPerChannel: number, BL: number, nCCD_S: number, nRC: number,
  nRRD_S: number, nFAW: number, nRFC: number, nREFI: number,
  bankGroups: number, banksPerGroup: number, tCK: number, nRCD: number, nCL: number,
  nRP: number, columns: number, hitRate: number,
): BandwidthResults => {
  const totalBanks = bankGroups * banksPerGroup * ranksPerChannel;
  const dataPerBurst = busWidth * channels / 8 * (BL / 2);
  const burstClocks = BL / 2;

  // Theoretical peak
  const peakBW = dataRate * busWidth * channels / 8 / 1000; // GB/s

  // Streaming (row buffer hits) — limited by CCD + periodic row changes
  // Each row has columns/BL independently addressable bursts. After exhausting
  // a row, we need nRP (precharge) + nRCD (activate next row) clocks of overhead.
  const burstsPerRow = Math.max(1, Math.floor(columns / BL));
  const dataClocks = burstsPerRow * nCCD_S;
  const rowOverhead = nRP + nRCD;
  const rowEfficiency = dataClocks / (dataClocks + rowOverhead);
  const streamingBW = peakBW * Math.min(1, burstClocks / nCCD_S) * rowEfficiency;

  // Random — single bank
  const singleBankRandomBW = nRC > 0 ? peakBW * burstClocks / nRC : 0;

  // Random — bank-level parallelism
  const maxFromRRD = nRRD_S > 0 ? Math.floor(nRC / nRRD_S) : totalBanks;
  const maxFromFAW = nFAW > 0 ? Math.floor(4 * nRC / nFAW) : totalBanks;
  const effectiveParallel = Math.min(totalBanks, maxFromRRD, maxFromFAW);
  const bankParallelBW = Math.min(peakBW, singleBankRandomBW * effectiveParallel);

  // Refresh overhead
  const refreshFraction = nREFI > 0 ? nRFC / nREFI : 0;

  // Effective (after refresh)
  const effectiveStreaming = streamingBW * (1 - refreshFraction);
  const effectiveRandom = bankParallelBW * (1 - refreshFraction);

  // Mixed estimate (slider-controlled)
  const hr = hitRate / 100;
  const mixedBW = (hr * streamingBW + (1 - hr) * bankParallelBW) * (1 - refreshFraction);

  // First access latency
  const firstAccessNs = (nRCD + nCL) * tCK;

  return {
    peakBW, streamingBW, singleBankRandomBW, bankParallelBW,
    refreshFraction, effectiveStreaming, effectiveRandom, mixedBW,
    firstAccessNs, dataPerBurst, totalBanks,
  };
};

const getFieldBits = (
  field: AddressField,
  channels: number, ranksPerChannel: number,
  bankGroups: number, banksPerGroup: number,
  rows: number, columns: number, busWidth: number,
): number => {
  switch (field) {
    case 'channel': return log2Int(channels);
    case 'rank': return log2Int(ranksPerChannel);
    case 'bankgrp': return log2Int(bankGroups);
    case 'bank': return log2Int(banksPerGroup);
    case 'row': return Math.ceil(log2(rows));
    case 'column': return Math.ceil(log2(columns));
    case 'offset': return Math.ceil(log2(busWidth / 8));
  }
};

const buildAddressSegments = (
  fieldOrder: AddressField[],
  channels: number, ranksPerChannel: number,
  bankGroups: number, banksPerGroup: number,
  rows: number, columns: number, busWidth: number,
) => {
  const allFields = fieldOrder
    .map(f => ({
      key: f,
      name: ADDR_FIELD_NAMES[f],
      bits: getFieldBits(f, channels, ranksPerChannel, bankGroups, banksPerGroup, rows, columns, busWidth),
      color: ADDR_FIELD_COLORS[f],
    }))
    .filter(f => f.bits > 0);

  const totalBits = allFields.reduce((s, f) => s + f.bits, 0);
  let bit = totalBits;
  return allFields.map(f => {
    const high = bit - 1;
    const low = bit - f.bits;
    bit = low;
    return { ...f, high, low };
  });
};

// ─── SVG Timing Diagram Renderer ─────────────────────────────────────────────

const DIAGRAM_ROW_HEIGHT = 28;
const DIAGRAM_LABEL_WIDTH = 70;
const DIAGRAM_PADDING = 4;

const TimingDiagram: React.FC<{
  title: string;
  rows: DiagramRow[];
  totalClocks: number;
  annotation: string;
}> = ({ title, rows, totalClocks, annotation }) => {
  const width = 600;
  const contentWidth = width - DIAGRAM_LABEL_WIDTH - DIAGRAM_PADDING * 2;
  const height = rows.length * DIAGRAM_ROW_HEIGHT + DIAGRAM_PADDING * 2;
  const scale = totalClocks > 0 ? contentWidth / totalClocks : 1;

  return (
    <div className="bw__diagram">
      <div className="bw__diagram-title">{title}</div>
      <svg
        className="bw__diagram-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
      >
        {rows.map((row, ri) => {
          const y = DIAGRAM_PADDING + ri * DIAGRAM_ROW_HEIGHT;
          return (
            <g key={ri}>
              <text
                x={DIAGRAM_LABEL_WIDTH - 4}
                y={y + DIAGRAM_ROW_HEIGHT / 2 + 1}
                textAnchor="end"
                fill="currentColor"
                fontSize="10"
                fontFamily="var(--font-code)"
                opacity={0.7}
              >
                {row.label}
              </text>
              {/* Background track */}
              <rect
                x={DIAGRAM_LABEL_WIDTH}
                y={y + 4}
                width={contentWidth}
                height={DIAGRAM_ROW_HEIGHT - 8}
                rx={3}
                fill="var(--bg-tertiary)"
                opacity={0.5}
              />
              {row.blocks.map((block, bi) => {
                const bx = DIAGRAM_LABEL_WIDTH + block.start * scale;
                const bw = Math.max(block.duration * scale, 1);
                return (
                  <g key={bi}>
                    <rect
                      x={bx}
                      y={y + 4}
                      width={bw}
                      height={DIAGRAM_ROW_HEIGHT - 8}
                      rx={3}
                      fill={block.color}
                      opacity={0.85}
                    />
                    {bw > 20 && (
                      <text
                        x={bx + bw / 2}
                        y={y + DIAGRAM_ROW_HEIGHT / 2 + 1}
                        textAnchor="middle"
                        fill="white"
                        fontSize="8"
                        fontFamily="var(--font-code)"
                        fontWeight="600"
                      >
                        {block.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="bw__diagram-annotation">{annotation}</div>
    </div>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

const copyText = (text: string) => navigator.clipboard.writeText(text);

const BandwidthCalc: React.FC = () => {
  // ─── State ─────────────────────────────────────────────────────────────
  const [timingKey, setTimingKey] = useState('DDR4-3200');
  const [channels, setChannels] = useState(2);
  const [ranksPerChannel, setRanksPerChannel] = useState(1);
  const [busWidth, setBusWidth] = useState(64);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [hitRate, setHitRate] = useState(50);

  // Address mapping
  const [strategyMode, setStrategyMode] = useState<StrategyPreset | 'custom'>('RoBaRaCoCh');
  const [fieldOrder, setFieldOrder] = useState<AddressField[]>(STRATEGY_ORDERS['RoBaRaCoCh']);

  // Editable timing overrides
  const [tCK, setTCK] = useState(TIMING_PRESETS['DDR4-3200'].tCK);
  const [dataRate, setDataRate] = useState(TIMING_PRESETS['DDR4-3200'].dataRate);
  const [BL, setBL] = useState(TIMING_PRESETS['DDR4-3200'].BL);
  const [bankGroups, setBankGroups] = useState(TIMING_PRESETS['DDR4-3200'].bankGroups);
  const [banksPerGroup, setBanksPerGroup] = useState(TIMING_PRESETS['DDR4-3200'].banksPerGroup);
  const [nCL, setNCL] = useState(TIMING_PRESETS['DDR4-3200'].nCL);
  const [nRCD, setNRCD] = useState(TIMING_PRESETS['DDR4-3200'].nRCD);
  const [nRP, setNRP] = useState(TIMING_PRESETS['DDR4-3200'].nRP);
  const [nRAS, setNRAS] = useState(TIMING_PRESETS['DDR4-3200'].nRAS);
  const [nRC, setNRC] = useState(TIMING_PRESETS['DDR4-3200'].nRC);
  const [nRFC, setNRFC] = useState(TIMING_PRESETS['DDR4-3200'].nRFC);
  const [nREFI, setNREFI] = useState(TIMING_PRESETS['DDR4-3200'].nREFI);
  const [nRRD_S, setNRRD_S] = useState(TIMING_PRESETS['DDR4-3200'].nRRD_S);  // 4 (Ramulator2 x8)
  const [nRRD_L, setNRRD_L] = useState(TIMING_PRESETS['DDR4-3200'].nRRD_L);  // 8 (Ramulator2 x8)
  const [nWTR_S, setNWTR_S] = useState(TIMING_PRESETS['DDR4-3200'].nWTR_S);
  const [nWTR_L, setNWTR_L] = useState(TIMING_PRESETS['DDR4-3200'].nWTR_L);
  const [nCCD_S, setNCCD_S] = useState(TIMING_PRESETS['DDR4-3200'].nCCD_S);
  const [nCCD_L, setNCCD_L] = useState(TIMING_PRESETS['DDR4-3200'].nCCD_L);
  const [nFAW, setNFAW] = useState(TIMING_PRESETS['DDR4-3200'].nFAW);        // 34 (Ramulator2 x8)
  const [deviceWidth, setDeviceWidth] = useState(TIMING_PRESETS['DDR4-3200'].deviceWidth);

  // ─── Preset Loading ────────────────────────────────────────────────────

  const loadTimingPreset = (key: string) => {
    const p = TIMING_PRESETS[key];
    if (!p) return;
    setTimingKey(key);
    setTCK(p.tCK); setDataRate(p.dataRate); setBL(p.BL);
    setBankGroups(p.bankGroups); setBanksPerGroup(p.banksPerGroup);
    setNCL(p.nCL); setNRCD(p.nRCD); setNRP(p.nRP); setNRAS(p.nRAS); setNRC(p.nRC);
    setNRFC(p.nRFC); setNREFI(p.nREFI);
    setNRRD_S(p.nRRD_S); setNRRD_L(p.nRRD_L);
    setNWTR_S(p.nWTR_S); setNWTR_L(p.nWTR_L);
    setNCCD_S(p.nCCD_S); setNCCD_L(p.nCCD_L);
    setNFAW(p.nFAW); setDeviceWidth(p.deviceWidth);
    setBusWidth(p.defaultBusWidth);
  };

  const loadSystemPreset = (idx: number) => {
    const sp = SYSTEM_PRESETS[idx];
    if (!sp) return;
    loadTimingPreset(sp.timingKey);
    setChannels(sp.channels);
    setRanksPerChannel(sp.ranksPerChannel);
    setBusWidth(sp.busWidth);
  };

  // ─── Address Mapping Handlers ──────────────────────────────────────────

  const handleStrategyChange = (value: string) => {
    if (value === 'custom') {
      setStrategyMode('custom');
    } else {
      const preset = value as StrategyPreset;
      setStrategyMode(preset);
      setFieldOrder(STRATEGY_ORDERS[preset]);
    }
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fieldOrder.length) return;
    const newOrder = [...fieldOrder];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setFieldOrder(newOrder);
    setStrategyMode('custom');
  };

  // ─── Derived ───────────────────────────────────────────────────────────

  const results = useMemo(() => computeBandwidth(
    dataRate, busWidth, channels, ranksPerChannel,
    BL, nCCD_S, nRC, nRRD_S, nFAW, nRFC, nREFI,
    bankGroups, banksPerGroup, tCK, nRCD, nCL, nRP, columns, hitRate,
  ), [dataRate, busWidth, channels, ranksPerChannel, BL, nCCD_S, nRC,
      nRRD_S, nFAW, nRFC, nREFI, bankGroups, banksPerGroup, tCK, nRCD, nCL, nRP, columns, hitRate]);

  const addrSegments = useMemo(() => buildAddressSegments(
    fieldOrder, channels, ranksPerChannel,
    bankGroups, banksPerGroup, rows, columns, busWidth,
  ), [fieldOrder, channels, ranksPerChannel, bankGroups, banksPerGroup, rows, columns, busWidth]);

  // ─── Timing Diagram Data ──────────────────────────────────────────────

  const burstClocks = BL / 2;

  const diagramA = useMemo((): { rows: DiagramRow[]; total: number; annotation: string } => {
    // Row Buffer Hit (Streaming)
    const total = nRCD + nCL + burstClocks * 3;
    const diagRows: DiagramRow[] = [
      {
        label: 'Bank 0',
        blocks: [
          { start: 0, duration: 1, color: 'var(--bw-cmd-act)', label: 'ACT' },
          { start: 1, duration: nRCD, color: 'var(--bw-cmd-wait)', label: 'tRCD' },
          { start: nRCD, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
          { start: nRCD + nCCD_S, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
          { start: nRCD + nCCD_S * 2, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
        ],
      },
      {
        label: 'Bus',
        blocks: [
          { start: nRCD + nCL, duration: burstClocks, color: 'var(--bw-cmd-data)', label: 'DATA' },
          { start: nRCD + nCL + nCCD_S, duration: burstClocks, color: 'var(--bw-cmd-data)', label: 'DATA' },
          { start: nRCD + nCL + nCCD_S * 2, duration: burstClocks, color: 'var(--bw-cmd-data)', label: 'DATA' },
        ],
      },
    ];
    const firstNs = ((nRCD + nCL) * tCK).toFixed(1);
    const ccdNs = (nCCD_S * tCK).toFixed(1);
    return {
      rows: diagRows,
      total,
      annotation: `First access: (tRCD+CL) \u00d7 tCK = ${firstNs} ns, then data every nCCD_S \u00d7 tCK = ${ccdNs} ns`,
    };
  }, [nRCD, nCL, nCCD_S, burstClocks, tCK]);

  const diagramB = useMemo((): { rows: DiagramRow[]; total: number; annotation: string } => {
    // Row Buffer Miss (Random single bank)
    const secondACT = nRC;
    const total = secondACT + nRCD + nCL + burstClocks;
    const diagRows: DiagramRow[] = [
      {
        label: 'Bank 0',
        blocks: [
          { start: 0, duration: 1, color: 'var(--bw-cmd-act)', label: 'ACT' },
          { start: 1, duration: nRCD, color: 'var(--bw-cmd-wait)', label: 'tRCD' },
          { start: nRCD, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
          { start: nRAS, duration: 1, color: 'var(--bw-cmd-pre)', label: 'PRE' },
          { start: nRAS + 1, duration: nRP, color: 'var(--bw-cmd-wait)', label: 'tRP' },
          { start: secondACT, duration: 1, color: 'var(--bw-cmd-act)', label: 'ACT' },
          { start: secondACT + 1, duration: nRCD, color: 'var(--bw-cmd-wait)', label: 'tRCD' },
          { start: secondACT + nRCD, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
        ],
      },
      {
        label: 'Bus',
        blocks: [
          { start: nRCD + nCL, duration: burstClocks, color: 'var(--bw-cmd-data)', label: 'DATA' },
          { start: secondACT + nRCD + nCL, duration: burstClocks, color: 'var(--bw-cmd-data)', label: 'DATA' },
        ],
      },
    ];
    const rcNs = (nRC * tCK).toFixed(1);
    return {
      rows: diagRows,
      total,
      annotation: `One access every nRC \u00d7 tCK = ${rcNs} ns`,
    };
  }, [nRCD, nCL, nRAS, nRP, nRC, burstClocks, tCK]);

  const diagramC = useMemo((): { rows: DiagramRow[]; total: number; annotation: string } => {
    // Bank-Level Parallelism
    const bankCount = Math.min(4, bankGroups * banksPerGroup);
    const total = (bankCount - 1) * nRRD_S + nRCD + nCL + burstClocks + (bankCount - 1) * burstClocks;
    const diagRows: DiagramRow[] = [];
    for (let i = 0; i < bankCount; i++) {
      diagRows.push({
        label: `Bank ${i}`,
        blocks: [
          { start: i * nRRD_S, duration: 1, color: 'var(--bw-cmd-act)', label: 'ACT' },
          { start: i * nRRD_S + 1, duration: nRCD, color: 'var(--bw-cmd-wait)', label: 'tRCD' },
          { start: i * nRRD_S + nRCD, duration: 1, color: 'var(--bw-cmd-rd)', label: 'RD' },
        ],
      });
    }
    const busBlocks: DiagramBlock[] = [];
    for (let i = 0; i < bankCount; i++) {
      busBlocks.push({
        start: i * nRRD_S + nRCD + nCL,
        duration: burstClocks,
        color: 'var(--bw-cmd-data)',
        label: `D${i}`,
      });
    }
    diagRows.push({ label: 'Bus', blocks: busBlocks });

    return {
      rows: diagRows,
      total,
      annotation: `Banks staggered by nRRD_S = ${nRRD_S} clocks. Parallelism fills the bus.`,
    };
  }, [nRRD_S, nRCD, nCL, burstClocks, bankGroups, banksPerGroup]);

  const diagramD = useMemo((): { rows: DiagramRow[]; total: number; annotation: string } => {
    // Refresh
    const total = nREFI + nRFC;
    const refiNs = (nREFI * tCK / 1000).toFixed(2);
    const rfcNs = (nRFC * tCK).toFixed(0);
    const overhead = (results.refreshFraction * 100).toFixed(2);
    const diagRows: DiagramRow[] = [
      {
        label: 'All Banks',
        blocks: [
          { start: 0, duration: nRFC, color: 'var(--bw-cmd-rfc)', label: 'tRFC' },
          { start: nREFI, duration: nRFC, color: 'var(--bw-cmd-rfc)', label: 'tRFC' },
        ],
      },
      {
        label: 'Interval',
        blocks: [
          { start: 0, duration: nREFI, color: 'var(--bw-cmd-wait)', label: `tREFI (${nREFI} clk)` },
        ],
      },
    ];
    return {
      rows: diagRows,
      total,
      annotation: `Every tREFI (${refiNs} \u00b5s), blocked for tRFC (${rfcNs} ns). Overhead: ${overhead}%`,
    };
  }, [nRFC, nREFI, tCK, results.refreshFraction]);

  // ─── Render: Presets ───────────────────────────────────────────────────

  const renderPresets = () => {
    const grouped = new Map<MemType, string[]>();
    for (const key of Object.keys(TIMING_PRESETS)) {
      const p = TIMING_PRESETS[key];
      if (!grouped.has(p.memType)) grouped.set(p.memType, []);
      grouped.get(p.memType)!.push(key);
    }

    return (
      <div className="bw__preset-row">
        <div className="bw__preset-group">
          <span className="bw__preset-label">Memory Timing</span>
          <select
            className="bw__preset-select"
            value={timingKey}
            onChange={e => loadTimingPreset(e.target.value)}
          >
            {Array.from(grouped.entries()).map(([memType, keys]) => (
              <optgroup key={memType} label={MEM_TYPE_LABELS[memType]}>
                {keys.map(k => (
                  <option key={k} value={k}>{TIMING_PRESETS[k].label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="bw__preset-group">
          <span className="bw__preset-label">System Preset</span>
          <select
            className="bw__preset-select"
            value=""
            onChange={e => {
              const idx = Number(e.target.value);
              if (!isNaN(idx)) loadSystemPreset(idx);
            }}
          >
            <option value="" disabled>Select a system...</option>
            {SYSTEM_PRESETS.map((sp, i) => (
              <option key={i} value={i}>
                {sp.name}{sp.note ? ` (${sp.note})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // ─── Render: Config ────────────────────────────────────────────────────

  const numField = (label: string, value: number, setter: (v: number) => void, min = 0, step = 'any', unit?: string) => (
    <div className="bw__field">
      <label className="bw__field-label">{label}</label>
      <input
        type="number"
        className="bw__field-input"
        value={value}
        min={min}
        step={step}
        onChange={e => setter(Number(e.target.value) || 0)}
      />
      {unit && <span className="bw__field-unit">{unit}</span>}
    </div>
  );

  const renderConfig = () => (
    <div className="bw__config">
      <div className="bw__config-row">
        {numField('tCK', tCK, setTCK, 0.01, '0.001', 'ns')}
        {numField('Data Rate', dataRate, setDataRate, 1, '100', 'MT/s')}
        {numField('Burst Length', BL, setBL, 1, '1')}
      </div>
      <div className="bw__config-row">
        {numField('Bank Groups', bankGroups, setBankGroups, 1, '1')}
        {numField('Banks/Group', banksPerGroup, setBanksPerGroup, 1, '1')}
        {numField('Rows', rows, setRows, 1, '1')}
        {numField('Columns', columns, setColumns, 1, '1')}
        {numField('Device Width', deviceWidth, setDeviceWidth, 1, '1', 'bit')}
      </div>
      <div className="bw__config-row">
        {numField('Bus Width', busWidth, setBusWidth, 1, '1', 'bit')}
        {numField('Channels', channels, setChannels, 1, '1')}
        {numField('Ranks/Channel', ranksPerChannel, setRanksPerChannel, 1, '1')}
      </div>
      <div className="bw__config-row">
        {numField('CL', nCL, setNCL, 0, '1', 'clk')}
        {numField('RCD', nRCD, setNRCD, 0, '1', 'clk')}
        {numField('RP', nRP, setNRP, 0, '1', 'clk')}
        {numField('RAS', nRAS, setNRAS, 0, '1', 'clk')}
        {numField('RC', nRC, setNRC, 0, '1', 'clk')}
      </div>
      <div className="bw__config-row">
        {numField('RFC', nRFC, setNRFC, 0, '1', 'clk')}
        {numField('REFI', nREFI, setNREFI, 0, '1', 'clk')}
        {numField('RRD_S', nRRD_S, setNRRD_S, 0, '1', 'clk')}
        {numField('RRD_L', nRRD_L, setNRRD_L, 0, '1', 'clk')}
        {numField('FAW', nFAW, setNFAW, 0, '1', 'clk')}
      </div>
      <div className="bw__config-row">
        {numField('WTR_S', nWTR_S, setNWTR_S, 0, '1', 'clk')}
        {numField('WTR_L', nWTR_L, setNWTR_L, 0, '1', 'clk')}
        {numField('CCD_S', nCCD_S, setNCCD_S, 1, '1', 'clk')}
        {numField('CCD_L', nCCD_L, setNCCD_L, 1, '1', 'clk')}
      </div>
    </div>
  );

  // ─── Render: Address Mapping ───────────────────────────────────────────

  const renderAddressMapping = () => (
    <div className="bw__addr">
      <div className="bw__addr-header">
        <span className="bw__preset-label">Strategy</span>
        <select
          className="bw__preset-select"
          value={strategyMode}
          onChange={e => handleStrategyChange(e.target.value)}
        >
          {STRATEGY_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="bw__addr-bar">
        {addrSegments.map(s => (
          <div key={s.key} className="bw__addr-segment"
            style={{ flex: s.bits, background: s.color }}>
            <span className="bw__addr-name">{s.name} ({s.bits}b)</span>
          </div>
        ))}
      </div>
      <div className="bw__addr-ranges">
        {addrSegments.map(s => (
          <span key={s.key} className="bw__addr-range" style={{ flex: s.bits }}>
            {s.high === s.low ? `[${s.high}]` : `[${s.high}:${s.low}]`}
          </span>
        ))}
      </div>
      {strategyMode === 'custom' && (
        <div className="bw__addr-custom">
          <span className="bw__addr-custom-hint">Reorder fields (MSB at top, LSB at bottom):</span>
          {fieldOrder.map((field, i) => {
            const bits = getFieldBits(field, channels, ranksPerChannel, bankGroups, banksPerGroup, rows, columns, busWidth);
            return (
              <div key={field} className="bw__addr-custom-field">
                <span className="bw__addr-custom-dot" style={{ background: ADDR_FIELD_COLORS[field] }} />
                <span className="bw__addr-custom-name">{ADDR_FIELD_NAMES[field]}</span>
                <span className="bw__addr-custom-bits">{bits}b</span>
                <button
                  className="bw__addr-custom-btn"
                  onClick={() => moveField(i, -1)}
                  disabled={i === 0}
                  title="Move up (toward MSB)"
                >
                  {'\u25B2'}
                </button>
                <button
                  className="bw__addr-custom-btn"
                  onClick={() => moveField(i, 1)}
                  disabled={i === fieldOrder.length - 1}
                  title="Move down (toward LSB)"
                >
                  {'\u25BC'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="bw__addr-note">
        This address mapping is a visualization only and does not affect the calculated bandwidth
        results below. In a real system, the mapping determines which access patterns achieve high
        row buffer hit rates (e.g. RoBaRaCoCh favors sequential streaming, while ChRaBaRoCo maximizes
        channel-level parallelism). Computing the actual hit rate requires knowing the workload's
        access pattern, which this analytical model does not simulate. Use the hit rate slider below
        to manually model your expected workload behavior.
      </div>
    </div>
  );

  // ─── Render: Timing Diagrams ───────────────────────────────────────────

  const renderTimingDiagrams = () => (
    <div className="bw__diagrams">
      <TimingDiagram
        title="A. Row Buffer Hit (Streaming)"
        rows={diagramA.rows}
        totalClocks={diagramA.total}
        annotation={diagramA.annotation}
      />
      <TimingDiagram
        title="B. Row Buffer Miss (Random)"
        rows={diagramB.rows}
        totalClocks={diagramB.total}
        annotation={diagramB.annotation}
      />
      <TimingDiagram
        title="C. Bank-Level Parallelism"
        rows={diagramC.rows}
        totalClocks={diagramC.total}
        annotation={diagramC.annotation}
      />
      <TimingDiagram
        title="D. Refresh Overhead"
        rows={diagramD.rows}
        totalClocks={diagramD.total}
        annotation={diagramD.annotation}
      />
    </div>
  );

  // ─── Render: Slider + Mixed BW ─────────────────────────────────────────

  const renderSlider = () => (
    <div className="bw__slider-section">
      <div className="bw__slider-row">
        <span className="bw__slider-label">Row Buffer Hit Rate</span>
        <input
          type="range"
          className="bw__slider-input"
          min={0}
          max={100}
          value={hitRate}
          onChange={e => setHitRate(Number(e.target.value))}
        />
        <span className="bw__slider-value">{hitRate}%</span>
      </div>
      <div className="bw__slider-result">
        <span className="bw__slider-result-label">Mixed Estimate</span>
        <span className="bw__slider-result-value">{formatBW(results.mixedBW)}</span>
        <span className="bw__slider-result-detail">
          = {hitRate}% \u00d7 {formatBW(results.streamingBW)} + {100 - hitRate}% \u00d7 {formatBW(results.bankParallelBW)} \u00d7 (1 \u2212 {(results.refreshFraction * 100).toFixed(2)}% refresh)
        </span>
      </div>
    </div>
  );

  // ─── Render: Results ───────────────────────────────────────────────────

  const renderResults = () => {
    const valueRows: [string, string, boolean?][] = [
      ['Theoretical Peak', formatBW(results.peakBW), true],
      ['Streaming BW, No Refresh', formatBW(results.streamingBW)],
      ['Streaming BW, With Refresh', formatBW(results.effectiveStreaming)],
      ['Random BW (Single Bank)', formatBW(results.singleBankRandomBW)],
      ['Random BW (Bank Parallel), No Refresh', formatBW(results.bankParallelBW)],
      ['Random BW (Bank Parallel), With Refresh', formatBW(results.effectiveRandom)],
      ['Refresh Overhead', `${(results.refreshFraction * 100).toFixed(2)}%`],
      ['First Access Latency', `${results.firstAccessNs.toFixed(2)} ns`],
      ['Data Per Burst', `${results.dataPerBurst} bytes`],
      ['Total Banks', `${results.totalBanks}`],
    ];

    return (
      <div className="bw__results">
        {valueRows.map(([label, value, isLarge]) => (
          <div className="bw__value-row" key={label}>
            <span className="bw__value-label">{label}</span>
            <span className={`bw__value-data ${isLarge ? 'bw__value-data--lg' : ''}`}>
              {value}
            </span>
            <button className="bw__copy-btn" onClick={() => copyText(value)} title="Copy">
              <CopyIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  // ─── Main Render ───────────────────────────────────────────────────────

  return (
    <ToolPage
      title="Memory Bandwidth Calculator"
      description="Free online memory bandwidth calculator. Compute peak bandwidth from clock speed, bus width, channels, and DDR rate. Supports DDR4, DDR5, GDDR6, HBM2, HBM3, and LPDDR specifications."
      keywords={[
        'memory bandwidth calculator',
        'ddr5 bandwidth calculator',
        'ddr4 bandwidth calculator',
        'ram bandwidth calculator',
        'memory bandwidth',
        'peak bandwidth',
        'gddr6 bandwidth',
        'hbm bandwidth',
        'hbm2 bandwidth',
        'hbm3 bandwidth',
        'lpddr5 bandwidth',
        'memory clock calculator',
        'bus width calculator',
        'data rate calculator',
        'memory throughput',
        'memory performance',
        'gpu bandwidth',
        'computer architecture',
        'developer tools',
        'free bandwidth calculator',
      ]}
    >
      <div className="bw">
        {renderPresets()}
        {renderConfig()}

        <div className="bw__section-label">Address Mapping</div>
        {renderAddressMapping()}

        <div className="bw__section-label">Timing Diagrams</div>
        {renderTimingDiagrams()}

        {renderSlider()}
        {renderResults()}
      </div>
    </ToolPage>
  );
};

export default BandwidthCalc;
