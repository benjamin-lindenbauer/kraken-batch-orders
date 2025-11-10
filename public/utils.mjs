// Utility functions for Kraken batch trading

export const TRADING_PAIRS = {
    'BTC/USD': {
        symbol: 'BTC',
        name: 'Bitcoin',
        leverage: '5',
        priceDecimals: 1,
        default: true
    },
    'ETH/USD': {
        symbol: 'ETH',
        name: 'Ethereum',
        leverage: '5',
        priceDecimals: 2
    },
    'XRP/USD': {
        symbol: 'XRP',
        name: 'Ripple',
        leverage: '5',
        priceDecimals: 5
    },
    'SUI/USD': {
        symbol: 'SUI',
        name: 'Sui',
        leverage: '5',
        priceDecimals: 4
    },
    'DOGE/USD': {
        symbol: 'DOGE',
        name: 'Dogecoin',
        leverage: '5',
        priceDecimals: 6
    },
    'SOL/USD': {
        symbol: 'SOL',
        name: 'Solana',
        leverage: '5',
        priceDecimals: 2
    },
    'ADA/USD': {
        symbol: 'ADA',
        name: 'Cardano',
        leverage: '5',
        priceDecimals: 6
    },
    'LINK/USD': {
        symbol: 'LINK',
        name: 'Chainlink',
        leverage: '5',
        priceDecimals: 4
    },
    'BNB/USD': {
        symbol: 'BNB',
        name: 'Binance',
        leverage: '3',
        priceDecimals: 2
    },
    'XLM/USD': {
        symbol: 'XLM',
        name: 'Stellar',
        leverage: '2',
        priceDecimals: 6
    },
    'ZEC/USD': {
        symbol: 'ZEC',
        name: 'Zcash',
        leverage: '3',
        priceDecimals: 2
    },
    'PAXG/USD': {
        symbol: 'PAXG',
        name: 'Paxos Gold',
        leverage: '3',
        priceDecimals: 2
    },
    'LTC/USD': {
        symbol: 'LTC',
        name: 'Litecoin',
        leverage: '5',
        priceDecimals: 2
    },
    'ICP/USD': {
        symbol: 'ICP',
        name: 'Internet Computer',
        leverage: '3',
        priceDecimals: 3
    },
};

// Get all supported assets
export function getSupportedAssets() {
    return Object.keys(TRADING_PAIRS);
}

// Get pair info
export function getPairInfo(asset) {
    return TRADING_PAIRS[asset];
}

// If we're in a browser environment, add to window object
if (typeof window !== 'undefined') {
    window.TRADING_PAIRS = TRADING_PAIRS;
    window.getSupportedAssets = getSupportedAssets;
    window.getPairInfo = getPairInfo;
}
