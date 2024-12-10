# Kraken Batch Orders

A web application for creating and managing batch orders on the Kraken cryptocurrency exchange. Create multiple orders at once with customizable price ranges and monitor your open orders.

## Features

- Create multiple buy/sell orders with custom parameters:
  - Trading pair selection with appropriate leverage
  - Price of first order
  - Number of orders (2-15)
  - Distance between orders (%)
  - Total amount in USD
- View order preview with:
  - Individual order details (price, volume)
  - Total range percentage
  - Average price
  - Total volume and USD value
- Manage open orders:
  - View all open orders
  - Cancel individual orders
  - Cancel all orders at once
  - Auto-refresh functionality

## Setup

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
KRAKEN_API_KEY=your_api_key
KRAKEN_API_SECRET=your_api_secret
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## Trading Pairs Support

Currently supports the following trading pairs with their respective leverage:
- BTC/USD (5x leverage)
- XRP/USD (5x leverage)
- DOGE/USD (5x leverage)
- SOL/USD (4x leverage)
- PEPE/USD (3x leverage)
- ADA/USD (3x leverage)
- XLM/USD (2x leverage)

## Security

- API keys are stored securely in the `.env` file
- All API requests are signed with your API secret
- The frontend never sees your API credentials

## License

MIT License
