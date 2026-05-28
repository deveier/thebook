import { LayoutDashboard, ArrowLeftRight, Droplets, Trophy, User } from 'lucide-react';
import styles from './MobileNav.module.css';

const navItems = [
  { id: 'trade', label: 'Trade', icon: LayoutDashboard },
  { id: 'swap', label: 'Swap', icon: ArrowLeftRight },
  { id: 'pools', label: 'Pools', icon: Droplets },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'portfolio', label: 'Portfolio', icon: User },
];

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function MobileNav({ activeTab, setActiveTab }: MobileNavProps) {
  return (
    <nav className={styles.nav} aria-label="Mobile navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`${styles.item} ${activeTab === item.id ? styles.active : ''}`}
            onClick={() => setActiveTab(item.id)}
            aria-current={activeTab === item.id ? 'page' : undefined}
          >
            <Icon size={22} />
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
