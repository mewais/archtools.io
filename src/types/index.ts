// Type definitions for ArchTools.io

export type Theme = 'light' | 'dark';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  className?: string;
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
