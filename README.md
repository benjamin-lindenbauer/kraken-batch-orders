# Kraken Batch Orders

A web application for creating and managing batch orders on Kraken Futures. Efficiently create multiple orders with geometric price and volume progression, preview order details in real-time, and manage your open positions.

## Features

### Order Creation
- **Batch order creation** with up to 30 orders per batch
- **Geometric price progression**: Orders placed at increasing/decreasing price intervals
- **Geometric volume progression**: Order sizes increase/decrease geometrically across the batch
- **Customizable parameters**:
  - Trading pair selection with pair-specific leverage limits
  - First order price
  - Number of orders (1-30)
  - Price distance between orders (%)
  - Volume increase percentage between orders (%)
  - Total USD amount to allocate across all orders
  - Optional stop-loss and take-profit levels

### Order Preview & Analysis
- **Real-time order preview** with individual order details:
  - Order price, volume, and USD value for each order
  - Distance to current market price
  - Stop-loss and take-profit prices
- **Summary statistics**:
  - Average entry price
  - Total volume and USD value
  - Total price range percentage
  - Liquidation price (for leveraged positions)
- **Price slider simulation**: Visualize P&L at different price levels with:
  - Realized and unrealized losses
  - Open and closed position sizes

### Order Management
- **View all open orders** with pair, type, price, volume, and USD value
- **Cancel individual orders** or all orders at once
- **Batch cancellation** for efficient position management
- **Auto-refresh functionality** to keep order status current
- **Account balance display** with total USD value

## Architecture

### Backend (Node.js + Express)
- **API endpoints** for batch order creation, single orders, and order cancellation
- **Kraken API integration** with proper request signing and nonce management
- **Order batching logic**: Automatically splits large orders into batches (max 15 orders per batch)
- **Geometric progression calculations** for price and volume distribution
- **Netlify Functions support** for serverless deployment

### Frontend (Vanilla JavaScript + Bootstrap)
- **Responsive UI** with tabbed interface (Create Orders / Open Orders)
- **Real-time calculations** for order preview and P&L simulation
- **Live price fetching** from Kraken public API
- **Account balance tracking** with trade balance queries

## Trading Pairs Support

Currently supports the following trading pairs with their respective maximum leverage:
- **BTC/USD** - 5x leverage
- **ETH/USD** - 5x leverage
- **XRP/USD** - 5x leverage
- **SUI/USD** - 5x leverage
- **DOGE/USD** - 5x leverage
- **SOL/USD** - 5x leverage
- **ADA/USD** - 5x leverage
- **LINK/USD** - 5x leverage
- **BNB/USD** - 3x leverage
- **XLM/USD** - 2x leverage
- **ZEC/USD** - 2x leverage
- **PAXG/USD** - 3x leverage

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
- `GET /api/open-orders` - Fetch all open orders
- `GET /api/ticker/:pair` - Get current price for a pair
- `GET /api/balances` - Get account balances
- `POST /api/trade-balance` - Get trading balance for an asset

## License

MIT License
