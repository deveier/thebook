import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

const SKELETON_WIDTHS = ['70%', '85%', '65%', '90%', '75%'];

export function Skeleton({ width = '100%', height = 20, borderRadius = 4, className }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className || ''}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card}>
      <Skeleton height={14} width="40%" borderRadius={4} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]} borderRadius={4} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className={styles.row}>
      <Skeleton height={14} width={80} borderRadius={4} />
      <Skeleton height={14} width={60} borderRadius={4} />
      <Skeleton height={14} width={70} borderRadius={4} />
    </div>
  );
}
