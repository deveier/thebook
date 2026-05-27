# thebookdex Frontend

A modern, high-performance DEX interface for the **thebookdex** program on Vara Network.

## Features
- **Hybrid Trading:** Integrated Orderbook and AMM Swap interfaces.
- **Liquidity Management:** View and manage AMM pools.
- **Sails Integration:** Uses generated JavaScript client for direct contract communication.
- **Modern UI:** Built with React, TypeScript, and bespoke Vanilla CSS for a professional look.

## Getting Started

### 1. Configure Program ID
Open `src/consts.ts` and update the `PROGRAM_ID` with your deployed contract address.

### 2. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

## Project Structure
- `src/app/api`: Sails-generated JS client.
- `src/components/layout`: Sidebar, Header, and Global Layout.
- `src/views`: Main application views (Trade, Swap, Pools, etc.).
- `src/hooks`: Custom hooks for Gear and Sails interaction.
- `src/index.css`: Global styles and CSS variables.
