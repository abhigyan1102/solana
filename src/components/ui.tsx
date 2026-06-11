import { motion } from 'framer-motion';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function SectionHeader({
  eyebrow,
  title,
  body
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export function GlassCard({
  className = '',
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`glass-card ${className}`}
      whileHover={{ y: -5, rotateX: 1.5, rotateY: -1.5 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

export function PrimaryButton({
  children,
  isLoading,
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  isLoading?: boolean;
}) {
  return (
    <button className={`primary-button ${className}`} disabled={props.disabled || isLoading} {...props}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button className={`secondary-button ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  id,
  hint,
  children
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

export function StatusPill({
  tone,
  children
}: {
  tone: 'allowed' | 'warning' | 'blocked' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
