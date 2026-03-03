import styles from './OddBadge.module.css';

export function OddBadge({ value }) {
  const f = parseFloat(value);
  if (!value || isNaN(f)) return <div className={`${styles.badge} ${styles.none}`}>–</div>;
  const cls = f < 2.0 ? styles.low : f < 3.5 ? styles.mid : styles.high;
  return <div className={`${styles.badge} ${cls}`}>{f.toFixed(2)}</div>;
}
