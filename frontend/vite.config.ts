import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@polkadot/util', '@polkadot/util-crypto', '@polkadot/api', '@polkadot/types'],
  },
  optimizeDeps: {
    include: ['@gear-js/api', '@gear-js/react-hooks', 'sails-js', '@polkadot/util', '@polkadot/util-crypto', '@polkadot/types'],
  },
})
