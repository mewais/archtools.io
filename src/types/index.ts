// Type definitions for ArchTools.io

export type Theme = 'light' | 'dark';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabSelectorProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export type GridLayout = 'horizontal' | 'vertical';

export interface GridColumn {
  id: string;
  content: React.ReactNode;
  span?: number; // Grid column span (1-12)
}

export interface GridProps {
  header?: React.ReactNode;
  columns: GridColumn[];
  layout?: GridLayout;
  gap?: 'sm' | 'md' | 'lg';
  mobileHeight?: 'auto' | 'split'; // 'auto' = natural height, 'split' = 40/60 split-screen on mobile
  className?: string;
}

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  className?: string;
  // Event handlers for tooltips
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  // Aria attributes
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface CardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  category: 'general' | 'riscv';
  tags?: string[];
  className?: string;
}

export interface ToolPageProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export interface Tool {
  id: string;
  title: string;
  description: string;
  href: string;
  category: 'general' | 'riscv';
  icon: string;
  tags: string[];
  comingSoon?: boolean;
}
