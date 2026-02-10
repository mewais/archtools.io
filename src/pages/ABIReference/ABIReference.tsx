import React, { useState, useMemo } from 'react';
import ToolPage from '../ToolPage';
import { TabSelector, Button, Tooltip } from '../../components';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import abis from '../../data/abis.json';
import './ABIReference.css';

interface ABI {
  id: string;
  name: string;
  arch: string;
  os: string;
  intArgRegs: string[];
  floatArgRegs: string[];
  intReturnRegs: string[];
  floatReturnRegs: string[];
  calleeSaved: string[];
  callerSaved: string[];
  stackPointer: string;
  framePointer: string;
  linkRegister: string | null;
  stackAlignment: number;
  redZone: number;
  structPassing: string;
  variadicNotes: string;
  notes: string;
}

interface RegisterInfo {
  name: string;
  roles: { label: string; type: string; tooltip: string }[];
}

const abiTabs = (abis as ABI[]).map(a => ({ id: a.id, label: a.name }));

function classifyRegisters(abi: ABI): RegisterInfo[] {
  const map = new Map<string, { label: string; type: string; tooltip: string }[]>();

  const addRole = (reg: string, label: string, type: string, tooltip: string) => {
    if (!map.has(reg)) map.set(reg, []);
    map.get(reg)!.push({ label, type, tooltip });
  };

  abi.intArgRegs.forEach((r, i) => addRole(r, `arg #${i + 1}`, 'arg-int', `Integer argument #${i + 1}`));
  abi.floatArgRegs.forEach((r, i) => addRole(r, `farg #${i + 1}`, 'arg-float', `Float argument #${i + 1}`));
  abi.intReturnRegs.forEach(r => addRole(r, 'return', 'return', 'Integer return value'));
  abi.floatReturnRegs.forEach(r => addRole(r, 'freturn', 'return', 'Float return value'));
  abi.calleeSaved.forEach(r => addRole(r, 'callee-saved', 'callee', 'Preserved across function calls'));
  abi.callerSaved.forEach(r => addRole(r, 'caller-saved', 'caller', 'May be clobbered by function calls'));

  // Add special registers
  addRole(abi.stackPointer, 'stack ptr', 'special', 'Stack pointer register');
  addRole(abi.framePointer, 'frame ptr', 'special', 'Frame pointer register');
  if (abi.linkRegister) addRole(abi.linkRegister, 'link reg', 'special', 'Link/return address register');

  return Array.from(map.entries()).map(([name, roles]) => ({ name, roles }));
}

function isDiff(a: ABI, b: ABI, field: keyof ABI): boolean {
  const va = a[field];
  const vb = b[field];
  if (Array.isArray(va) && Array.isArray(vb)) {
    return va.length !== vb.length || va.some((v, i) => v !== (vb as string[])[i]);
  }
  return va !== vb;
}

const ABIReference: React.FC = () => {
  const [selectedId, setSelectedId] = useState(abis[0].id);
  const [compareMode, setCompareMode] = useState(false);
  const [compareId, setCompareId] = useState(abis[1].id);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 768px)');

  // Disable compare mode when leaving desktop
  React.useEffect(() => {
    if (!isDesktop) setCompareMode(false);
  }, [isDesktop]);

  const primary = useMemo(() => (abis as ABI[]).find(a => a.id === selectedId)!, [selectedId]);
  const secondary = useMemo(() => (abis as ABI[]).find(a => a.id === compareId)!, [compareId]);
  const primaryRegs = useMemo(() => classifyRegisters(primary), [primary]);
  const secondaryRegs = useMemo(() => classifyRegisters(secondary), [secondary]);

  const renderRoleBadge = (role: { label: string; type: string; tooltip: string }) => (
    <Tooltip key={role.label} content={role.tooltip}>
      <span className={`abi__role-badge abi__role-badge--${role.type}`}>
        {role.label}
      </span>
    </Tooltip>
  );

  const renderOverview = (abi: ABI, diffWith?: ABI) => (
    <div className="abi__section">
      <h3 className="abi__section-title">Overview</h3>
      <div className="abi__overview-grid">
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'arch') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Architecture</span>
          <span className="abi__overview-value">{abi.arch}</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'os') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">OS</span>
          <span className="abi__overview-value">{abi.os}</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'stackAlignment') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Stack Alignment</span>
          <span className="abi__overview-value">{abi.stackAlignment} bytes</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'redZone') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Red Zone</span>
          <span className="abi__overview-value">{abi.redZone > 0 ? `${abi.redZone} bytes` : 'None'}</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'stackPointer') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Stack Pointer</span>
          <span className="abi__overview-value abi__reg-name">{abi.stackPointer}</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'framePointer') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Frame Pointer</span>
          <span className="abi__overview-value abi__reg-name">{abi.framePointer}</span>
        </div>
        <div className={`abi__overview-item ${diffWith && isDiff(abi, diffWith, 'linkRegister') ? 'abi__diff' : ''}`}>
          <span className="abi__overview-label">Link Register</span>
          <span className="abi__overview-value abi__reg-name">{abi.linkRegister || 'N/A (uses stack)'}</span>
        </div>
      </div>
    </div>
  );

  const renderArgPassing = (abi: ABI, diffWith?: ABI) => (
    <div className="abi__section">
      <h3 className="abi__section-title">Argument Passing</h3>
      <div className="abi__arg-columns">
        <div className={`abi__arg-col ${diffWith && isDiff(abi, diffWith, 'intArgRegs') ? 'abi__diff' : ''}`}>
          <h4 className="abi__arg-col-title">Integer Args</h4>
          {abi.intArgRegs.length === 0 ? (
            <p className="abi__arg-none">All on stack</p>
          ) : (
            <ol className="abi__arg-list">
              {abi.intArgRegs.map((r, i) => (
                <li key={i} className="abi__arg-item">
                  <span className="abi__arg-index">#{i + 1}</span>
                  <span className="abi__reg-name">{r}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className={`abi__arg-col ${diffWith && isDiff(abi, diffWith, 'floatArgRegs') ? 'abi__diff' : ''}`}>
          <h4 className="abi__arg-col-title">Float Args</h4>
          {abi.floatArgRegs.length === 0 ? (
            <p className="abi__arg-none">All on stack</p>
          ) : (
            <ol className="abi__arg-list">
              {abi.floatArgRegs.map((r, i) => (
                <li key={i} className="abi__arg-item">
                  <span className="abi__arg-index">#{i + 1}</span>
                  <span className="abi__reg-name">{r}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );

  const renderReturnValues = (abi: ABI, diffWith?: ABI) => (
    <div className="abi__section">
      <h3 className="abi__section-title">Return Values</h3>
      <div className="abi__return-grid">
        <div className={`abi__return-item ${diffWith && isDiff(abi, diffWith, 'intReturnRegs') ? 'abi__diff' : ''}`}>
          <span className="abi__return-label">Integer</span>
          <span className="abi__return-regs">
            {abi.intReturnRegs.map(r => <span key={r} className="abi__reg-name">{r}</span>)}
          </span>
        </div>
        <div className={`abi__return-item ${diffWith && isDiff(abi, diffWith, 'floatReturnRegs') ? 'abi__diff' : ''}`}>
          <span className="abi__return-label">Float</span>
          <span className="abi__return-regs">
            {abi.floatReturnRegs.map(r => <span key={r} className="abi__reg-name">{r}</span>)}
          </span>
        </div>
      </div>
    </div>
  );

  const renderRegisterTable = (regs: RegisterInfo[], diffWith?: RegisterInfo[]) => {
    const diffNames = diffWith ? new Set(
      regs.filter(r => {
        const other = diffWith.find(o => o.name === r.name);
        if (!other) return true;
        return r.roles.length !== other.roles.length || r.roles.some((role, i) => role.label !== other.roles[i]?.label);
      }).map(r => r.name)
    ) : null;

    return (
      <div className="abi__section">
        <h3 className="abi__section-title">Register Classification</h3>
        <div className="abi__reg-table-wrap">
          <table className="abi__reg-table">
            <thead>
              <tr>
                <th>Register</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {regs.map(r => (
                <tr key={r.name} className={diffNames?.has(r.name) ? 'abi__diff' : ''}>
                  <td className="abi__reg-name">{r.name}</td>
                  <td className="abi__roles-cell">
                    {r.roles.map(renderRoleBadge)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSpecialRules = (abi: ABI, diffWith?: ABI) => (
    <div className="abi__section">
      <h3 className="abi__section-title">Special Rules</h3>
      <div className="abi__rules">
        <div className={`abi__rule ${diffWith && isDiff(abi, diffWith, 'structPassing') ? 'abi__diff' : ''}`}>
          <h4 className="abi__rule-title">Struct Passing</h4>
          <p className="abi__rule-text">{abi.structPassing}</p>
        </div>
        <div className={`abi__rule ${diffWith && isDiff(abi, diffWith, 'variadicNotes') ? 'abi__diff' : ''}`}>
          <h4 className="abi__rule-title">Variadic Functions</h4>
          <p className="abi__rule-text">{abi.variadicNotes}</p>
        </div>
        <div className={`abi__rule ${diffWith && isDiff(abi, diffWith, 'notes') ? 'abi__diff' : ''}`}>
          <h4 className="abi__rule-title">Additional Notes</h4>
          <p className="abi__rule-text">{abi.notes}</p>
        </div>
      </div>
    </div>
  );

  const renderABIContent = (abi: ABI, regs: RegisterInfo[], diffWith?: ABI, diffRegs?: RegisterInfo[]) => (
    <div className="abi__content">
      {renderOverview(abi, diffWith)}
      {renderArgPassing(abi, diffWith)}
      {renderReturnValues(abi, diffWith)}
      {renderRegisterTable(regs, diffRegs)}
      {renderSpecialRules(abi, diffWith)}
    </div>
  );

  // Mobile: use native <select>
  const renderMobileSelector = (value: string, onChange: (v: string) => void, label: string) => (
    <div className="abi__select-group">
      <label className="abi__select-label">{label}</label>
      <select
        className="abi__select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {(abis as ABI[]).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <ToolPage
      title="ABI / Calling Convention Reference"
      description="Interactive ABI and calling convention reference. Compare register usage, argument passing, and stack conventions across x86-64, AArch64, RISC-V, and i386."
      keywords={[
        'ABI reference',
        'calling convention',
        'x86-64 ABI',
        'System V ABI',
        'Microsoft x64 ABI',
        'AArch64 calling convention',
        'RISC-V calling convention',
        'register usage',
        'callee saved registers',
        'caller saved registers',
        'argument passing',
        'stack alignment',
        'red zone',
        'cdecl',
      ]}
    >
      <div className="abi">
        {/* Selector bar */}
        <div className="abi__selector-bar">
          {isTablet ? (
            <div className="abi__tab-wrap">
              <TabSelector tabs={abiTabs} activeTab={selectedId} onTabChange={setSelectedId} size="sm" />
            </div>
          ) : (
            renderMobileSelector(selectedId, setSelectedId, 'ABI')
          )}
          {isDesktop && (
            <Button
              variant="secondary"
              size="sm"
              className={`abi__compare-btn ${compareMode ? 'abi__compare-btn--active' : ''}`}
              onClick={() => setCompareMode(!compareMode)}
            >
              {compareMode ? 'Compare ON' : 'Compare OFF'}
            </Button>
          )}
        </div>

        {/* Secondary selector (desktop only) */}
        {compareMode && isDesktop && (
          <div className="abi__selector-bar abi__selector-bar--secondary">
            <div className="abi__tab-wrap">
              <TabSelector tabs={abiTabs} activeTab={compareId} onTabChange={setCompareId} size="sm" />
            </div>
          </div>
        )}

        {/* Content */}
        {!compareMode ? (
          renderABIContent(primary, primaryRegs)
        ) : (
          // Desktop compare: side by side
          <div className="abi__compare-grid">
            <div className="abi__compare-col">
              <h2 className="abi__compare-heading">{primary.name}</h2>
              {renderABIContent(primary, primaryRegs, secondary, secondaryRegs)}
            </div>
            <div className="abi__compare-col">
              <h2 className="abi__compare-heading">{secondary.name}</h2>
              {renderABIContent(secondary, secondaryRegs, primary, primaryRegs)}
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
};

export default ABIReference;
