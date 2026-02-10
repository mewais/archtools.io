import { createContext, useContext, useState, useCallback, type FC, type ReactNode } from 'react';

/**
 * Panel identifiers used across the simulator layout.
 */
export type PanelId = 'code-editor' | 'pc-decode' | 'registers' | 'memory' | 'stack';

/**
 * Tabs available in the right panel.
 */
export type RightTab = 'registers' | 'memory' | 'stack';

/**
 * Layout context shape.
 */
export interface LayoutContextType {
  /** Set of currently minimized panel IDs */
  minimizedPanels: Set<PanelId>;
  /** Panel ID that is expanded as an overlay, or null */
  expandedPanel: PanelId | null;
  /** Active tab in the right panel */
  activeRightTab: RightTab;

  /** Toggle a panel between minimized and normal */
  toggleMinimize: (panelId: PanelId) => void;
  /** Toggle a panel between expanded-overlay and normal */
  toggleExpand: (panelId: PanelId) => void;
  /** Set the active right-panel tab */
  setActiveRightTab: (tab: RightTab) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

interface LayoutProviderProps {
  children: ReactNode;
}

/**
 * Provides panel minimize/expand state and right-tab selection
 * to all simulator child components.
 */
export const LayoutProvider: FC<LayoutProviderProps> = ({ children }) => {
  const [minimizedPanels, setMinimizedPanels] = useState<Set<PanelId>>(new Set());
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<RightTab>('registers');

  const toggleMinimize = useCallback((panelId: PanelId) => {
    setMinimizedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((panelId: PanelId) => {
    setExpandedPanel(prev => (prev === panelId ? null : panelId));
  }, []);

  const value: LayoutContextType = {
    minimizedPanels,
    expandedPanel,
    activeRightTab,
    toggleMinimize,
    toggleExpand,
    setActiveRightTab,
  };

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};

/**
 * Access the layout context. Must be called within a LayoutProvider.
 */
export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};
