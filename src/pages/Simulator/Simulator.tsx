import React, { useEffect } from 'react';
import ToolPage from '../ToolPage';
import Grid from '../../components/Grid';
import TabSelector from '../../components/TabSelector';
import { SimulatorProvider } from './contexts/SimulatorContext';
import { LayoutProvider, useLayout } from './contexts/LayoutContext';
import { useSimulator } from './hooks/useSimulator';
import { useMediaQuery } from '../../hooks';
import CodeEditorPanel from './components/CodeEditorPanel';
import PCDecodePanel from './components/PCDecodePanel';
import RegisterPanel from './components/RegisterPanel';
import MemoryPanel from './components/MemoryPanel';
import StackPanel from './components/StackPanel';
import type { GridColumn, TabItem } from '../../types';
import './Simulator.css';

const rightTabs: TabItem[] = [
  { id: 'registers', label: 'Registers' },
  { id: 'memory', label: 'Memory' },
  { id: 'stack', label: 'Stack' },
];

const mobileTabs: TabItem[] = [
  { id: 'code', label: 'Code' },
  { id: 'pc-decode', label: 'PC/Decode' },
  { id: 'registers', label: 'Registers' },
  { id: 'memory', label: 'Memory' },
  { id: 'stack', label: 'Stack' },
];

/**
 * SimulatorContent - Inner component with context access
 */
const SimulatorContent: React.FC = () => {
  const { initializeSimulator } = useSimulator();
  const { activeRightTab, setActiveRightTab } = useLayout();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const [activeMobileTab, setActiveMobileTab] = React.useState('code');

  // Initialize WASM simulator on mount
  useEffect(() => {
    initializeSimulator(false); // RV32 by default
  }, [initializeSimulator]);

  // Mobile/tablet: single column with tabs
  if (!isDesktop) {
    return (
      <div className="simulator">
        <TabSelector
          tabs={mobileTabs}
          activeTab={activeMobileTab}
          onTabChange={setActiveMobileTab}
          size="sm"
          className="simulator__mobile-tabs"
        />
        <div className="simulator__mobile-content">
          {activeMobileTab === 'code' && <CodeEditorPanel />}
          {activeMobileTab === 'pc-decode' && <PCDecodePanel />}
          {activeMobileTab === 'registers' && <RegisterPanel />}
          {activeMobileTab === 'memory' && <MemoryPanel />}
          {activeMobileTab === 'stack' && <StackPanel />}
        </div>
      </div>
    );
  }

  // Desktop: 2-column layout with tabs on right
  const rightPanel = (
    <div className="simulator__right-panel">
      <TabSelector
        tabs={rightTabs}
        activeTab={activeRightTab}
        onTabChange={(tab) => setActiveRightTab(tab as 'registers' | 'memory' | 'stack')}
        size="sm"
        className="simulator__right-tabs"
      />
      <div className="simulator__right-content">
        {activeRightTab === 'registers' && <RegisterPanel />}
        {activeRightTab === 'memory' && <MemoryPanel />}
        {activeRightTab === 'stack' && <StackPanel />}
      </div>
    </div>
  );

  const columns: GridColumn[] = [
    {
      id: 'left',
      span: 7,
      content: (
        <div className="simulator__column simulator__column--left">
          <CodeEditorPanel />
          <PCDecodePanel />
        </div>
      ),
    },
    {
      id: 'right',
      span: 5,
      content: rightPanel,
    },
  ];

  return (
    <div className="simulator">
      <Grid
        columns={columns}
        layout="horizontal"
        gap="md"
        mobileHeight="split"
      />
    </div>
  );
};

/**
 * Simulator - Main page component with context providers
 */
const Simulator: React.FC = () => {
  return (
    <ToolPage
      title="RISC-V Functional Simulator"
      description="Step-by-step RISC-V assembly execution with real-time visualization of registers, memory, and program flow."
      fullWidth
    >
      <SimulatorProvider>
        <LayoutProvider>
          <SimulatorContent />
        </LayoutProvider>
      </SimulatorProvider>
    </ToolPage>
  );
};

export default Simulator;
