import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './AnnouncementBar.module.css';

const TEXT =
  '🚀 TheBookDEX Mainnet Launch is coming · All profits from simulated trades will be settled as real VARA tokens · ' +
  'Trade BTC · ETH · VARA perpetuals now · Your positions are tracked on-chain · ' +
  'Powered by Vara Network · Be among the first futures traders on Gear Protocol · ' +
  'Early traders earn real VARA at launch · Don\'t miss out · Start trading today · ';

const SESSION_KEY = 'thebookdex:bar';

export function AnnouncementBar() {
  const [visible, setVisible] = useState(() => sessionStorage.getItem(SESSION_KEY) !== '1');

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty('--announcement-height', '0px');
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={styles.bar} role="banner">
      <div className={styles.track}>
        <div className={styles.marquee}>
          <span>{TEXT}</span>
          <span aria-hidden="true">{TEXT}</span>
        </div>
      </div>
      <button
        className={styles.close}
        onClick={() => {
          sessionStorage.setItem(SESSION_KEY, '1');
          document.documentElement.style.setProperty('--announcement-height', '0px');
          setVisible(false);
        }}
        aria-label="Dismiss announcement"
      >
        <X size={13} />
      </button>
    </div>
  );
}
