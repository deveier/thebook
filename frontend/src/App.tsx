import { useState } from 'react';
import { Layout } from './components/layout/Layout';
import { TradeView } from './views/TradeView';
import { SwapView } from './views/SwapView';
import { PoolsView } from './views/PoolsView';
import { PortfolioView } from './views/PortfolioView';
import { LeaderboardView } from './views/LeaderboardView';

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
      {renderContent()}
    </Layout>
  );
}

export default App;
