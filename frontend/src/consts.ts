import { TrendingUp, ArrowLeftRight, Droplets, User, BarChart2, Trophy } from 'lucide-react';

export const NODE_ADDRESS = 'wss://rpc.vara.network';
export const PROGRAM_ID = '0x7fa1988c57ba1134e2461c5fb36bc13d66c1dfbf47d36c5e9960b9ca2dc0e4c4';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'trade',     label: 'Trade',     icon: BarChart2 },
  { id: 'futures',   label: 'Futures',   icon: TrendingUp },
  { id: 'swap',      label: 'Swap',      icon: ArrowLeftRight },
  { id: 'pools',     label: 'Pools',     icon: Droplets },
  { id: 'portfolio', label: 'Portfolio', icon: User },
  { id: 'leaderboard', label: 'Leaders', icon: Trophy },
];
