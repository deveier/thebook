import { LayoutDashboard, ArrowLeftRight, Droplets, Trophy, User } from 'lucide-react';
import styles from './Sidebar.module.css';

const navItems = [
  { id: 'trade', label: 'Trade', icon: LayoutDashboard },
  { id: 'swap', label: 'Swap', icon: ArrowLeftRight },
  { id: 'pools', label: 'Pools', icon: Droplets },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'portfolio', label: 'Portfolio', icon: User },
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={styles.footer}>
        <div className={styles.marketStatus}>
          <div className={styles.label}>Market Status</div>
          <div className={styles.value}>Open</div>
        </div>
      </div>
    </aside>
  );
}
