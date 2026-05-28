import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondary?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action, secondary }: EmptyStateProps) {
  return (
    <div className={styles.container}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        {action && (
          <button onClick={action.onClick} className={styles.primaryBtn}>
            {action.label}
          </button>
        )}
        {secondary && (
          <button onClick={secondary.onClick} className={styles.secondaryBtn}>
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
