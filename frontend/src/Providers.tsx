import { ApiProvider, AccountProvider } from '@gear-js/react-hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NODE_ADDRESS } from './consts';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider initialArgs={{ endpoint: NODE_ADDRESS }}>
        <AccountProvider appName="thebookdex">
          {children}
        </AccountProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}
