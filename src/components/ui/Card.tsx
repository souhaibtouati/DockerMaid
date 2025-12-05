import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden ${className} ${
        onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''
      }`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div style={{ padding: '20px 24px' }} className={`border-b border-slate-700 ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function CardContent({ children, className = '', style }: CardContentProps) {
  return <div style={{ padding: '20px 24px', ...style }} className={className}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div style={{ padding: '16px 24px' }} className={`border-t border-slate-700 ${className}`}>
      {children}
    </div>
  );
}
