# Kraken Batch Trading

A web application for creating and managing batch orders on Kraken (spot/margin). Efficiently create multiple orders with geometric price and volume progression, preview order details in real time, and manage your open positions.

## Features

### Order Creation
- **Batch order creation** with up to 30 orders per batch
- **Geometric price progression**: Orders placed at increasing/decreasing price intervals
- **Geometric volume progression**: Order sizes increase/decrease geometrically across the batch
- **Multi-quote trading pairs**: Trade each supported base asset against USD, EUR, or BTC with the correct leverage cap applied automatically
- **Customizable parameters**:
  - Trading pair selection with pair-specific leverage limits
  - First order price
  - Number of orders (1-30)
  - Price distance between orders (%)
  - Order Value Increase percentage between orders (%)
  - Total USD amount to allocate across all orders
  - Optional stop-loss and take-profit levels

### Order Preview & Analysis
- **Real-time order preview** with individual order details:
  - Order price, volume, and USD value for each order
  - Distance to current market price
  - Stop-loss and take-profit prices
- **Summary statistics**:
  - Average entry price
  - Total value and USD value
  - Total price range percentage
  - Liquidation price (for leveraged positions)
- **Price slider simulation**: Visualize P&L at different price levels with:
  - Realized and unrealized losses
  - Open and closed position sizes

### Market Context & Charting
- **TradingView chart tab** embedded directly in the UI with autosizing, dark/light theme awareness, and pair-aware attribution links
- **One-click context switch**: Chart automatically follows the currently selected trading pair and keeps the TradingView widget in sync with UI theme toggles
- **Quick access links** to the TradingView symbol page for deeper analysis

### Order Management
- **View all open orders** with pair, type, price, volume, and USD value
- **Cancel individual orders** or all orders at once
- **Cancel all orders for a specific pair** directly from the orders table
- **Batch cancellation** for efficient position management
- **Auto-refresh functionality** to keep order status current
- **Account balance display** with total USD value
- **Inline order editing**: Update the limit price or volume for an existing order (supports +/- offsets and percentages) and send the amendment via the `/api/amend-order` endpoint without leaving the table

Note: Destructive actions (Cancel All and Cancel All for Pair) prompt for confirmation in the UI to prevent accidental cancellations.

## Architecture

### Backend (Node.js + Express)
- **API endpoints** for batch order creation, single orders, and order cancellation
- **Order amendment proxy** that forwards inline edits to Kraken's `AmendOrder` API
- **Kraken API integration** with proper request signing and nonce management
- **Order batching logic**: Automatically splits large orders into batches (max 15 orders per batch)
- **Geometric progression calculations** for price and volume distribution
- **Netlify Functions support** for serverless deployment

### Frontend (Vanilla JavaScript + Bootstrap)
- **Responsive UI** with tabbed interface (Create Orders / Open Orders)
- **Real-time calculations** for order preview and P&L simulation
- **Live price fetching** from Kraken public API
- **Account balance tracking** with trade balance queries
- **TradingView integration** for a fully embedded chart that honors the current theme and selected trading pair

## Trading Pairs Support

- **Quote currencies**: Every supported base asset can be traded against `USD`, `EUR`, and `BTC`. BTC-quoted pairs automatically use 8 decimal places for price precision.
- **Base assets & leverage caps**:
  - `BTC` – 5x
  - `ETH` – 5x
  - `XRP` – 5x
  - `SUI` – 5x
  - `DOGE` – 5x
  - `SOL` – 5x
  - `ADA` – 5x
  - `LINK` – 5x
  - `BNB` – 3x
  - `XLM` – 2x
  - `ZEC` – 3x
  - `PAXG` – 3x
  - `LTC` – 5x
  - `ICP` – 3x

Example pairs now include `BTC/EUR`, `ETH/BTC`, `SOL/USD`, and dozens more combinations generated from the supported base/quote sets.

## Setup

### Prerequisites
- Node.js 16+ and npm
- Kraken Futures account with API credentials

### Installation

1. Clone the repository:
```bash
git clone [your-repo-url]
cd kraken-batch-orders
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Kraken API credentials:
```
KRAKEN_API_KEY=your_api_key_here
KRAKEN_API_SECRET=your_api_secret_here
```

4. Start the development server:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

### Deployment

The application supports Netlify Functions for serverless deployment. Configuration is in `netlify.toml`.

## How It Works

### Order Calculation
1. **Geometric Price Progression**: Orders are placed at exponentially increasing/decreasing prices
   - Buy orders: `price = startPrice / (1 + distance%)^i`
   - Sell orders: `price = startPrice * (1 + distance%)^i`

2. **Geometric Volume Progression**: Order sizes follow a geometric sequence
   - Base volume calculated to achieve target USD total
   - Each order: `volume = basePrice * (1 + volumeDistance%)^i / orderPrice`

3. **Stop-Loss & Take-Profit**: Optional close orders attached to each order
   - Stop-loss: Triggered if price moves against position
   - Take-profit: Triggered if price moves in favor of position

### Batch Processing
- Orders are automatically split into batches of up to 15 orders
- Each batch is sent to Kraken API with proper authentication
- Nonce management ensures request uniqueness and ordering

## Security

- **API credentials** stored securely in `.env` file (never committed to version control)
- **Request signing**: All private API requests are HMAC-SHA512 signed
- **Frontend isolation**: Frontend never has access to API keys or secrets
- **Nonce management**: Prevents replay attacks with microsecond-precision nonces
- **Cache control**: Prevents sensitive data caching in browser

## API Endpoints

- `POST /api/batch-orders` - Create multiple orders
- `POST /api/add-order` - Create a single order
- `POST /api/cancel-order` - Cancel a specific order
- `POST /api/cancel-all` - Cancel all open orders
- `POST /api/cancel-all-of-pair` - Cancel all orders for a trading pair
- `POST /api/amend-order` - Amend the price and/or size of an existing order
- `GET /api/open-orders` - Fetch all open orders
- `GET /api/open-positions` - Fetch normalized open positions data
- `GET /api/ticker/:pair` - Get current price for a pair
- `GET /api/balances` - Get account balances
- `POST /api/trade-balance` - Get trading balance for an asset

## Automation

- `scripts/daily_orders.js` — Node script that automates creating a daily batch of buy orders using the same geometric progression logic as the UI.
  - Usage: `node scripts/daily_orders.js <COIN> [base_price] [price_distance] [spot]`
    - `COIN`: One of `BTC`, `XRP`, `ETH`, `SUI` (defaults to `XRP` if omitted in code)
    - `base_price` (optional): First order price
    - `price_distance` (optional): Percent distance between order prices
    - `spot` (optional): `true` to use spot (no leverage), otherwise margin
  - Examples:
    - `node scripts/daily_orders.js XRP`
    - `node scripts/daily_orders.js BTC 65000 1.0 true`

### GitHub Actions

- `.github/workflows/daily-orders-btc.yml` — Schedules BTC orders daily at 15:00 UTC; can also be run manually with an optional `base_price` input.
- `.github/workflows/daily-orders-xrp.yml` — Schedules XRP orders daily at 15:00 UTC; can also be run manually with an optional `base_price` input.
- `.github/workflows/manual-kraken-orders.yml` — Manual workflow to place orders for `BTC`, `XRP`, or `ETH` with inputs: `coin`, `base_price`, `price_distance`, and `spot`.

All workflows require repository secrets:
- `KRAKEN_API_KEY`
- `KRAKEN_API_SECRET`

### Local Usage

- Create a `.env` file in the project root with:
  - `KRAKEN_API_KEY=...`
  - `KRAKEN_API_SECRET=...`
- Run the script locally:
  - `node scripts/daily_orders.js <COIN> [base_price] [price_distance] [spot]`
  - Examples:
    - `node scripts/daily_orders.js XRP`
    - `node scripts/daily_orders.js BTC 65000 1.0 true`

Notes
- The script places real orders using your API key. Use small sizes while testing.
- Ensure your Kraken API key has only the minimal required permissions (trading; no withdrawal).

## License

MIT License

## Author

- Benjamin Lindenbauer — https://github.com/benjamin-lindenbauer
