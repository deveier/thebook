import { lazy, Suspense, useState } from 'react';
import { Layout } from './components/layout/Layout';
import { SkeletonCard } from './components/ui/Skeleton';

const TradeView = lazy(() => import('./views/TradeView').then(m => ({ default: m.TradeView })));
const SwapView = lazy(() => import('./views/SwapView').then(m => ({ default: m.SwapView })));
const PoolsView = lazy(() => import('./views/PoolsView').then(m => ({ default: m.PoolsView })));
const PortfolioView = lazy(() => import('./views/PortfolioView').then(m => ({ default: m.PortfolioView })));
const LeaderboardView = lazy(() => import('./views/LeaderboardView').then(m => ({ default: m.LeaderboardView })));

function PageLoader() {
  return (
    <div style={{ padding: 24 }}>
      <SkeletonCard lines={6} />
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('trade');

  const renderContent = () => {
    switch (activeTab) {
      case 'trade':
        return <TradeView />;
      case 'swap':
        return <SwapView />;
      case 'pools':
        return <PoolsView />;
      case 'leaderboard':
        return <LeaderboardView />;
      case 'portfolio':
        return <PortfolioView />;
      default:
        return <TradeView />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <Suspense fallback={<PageLoader />}>
        {renderContent()}
      </Suspense>
    </Layout>
  );
}

export default App;
