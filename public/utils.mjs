// Utility functions for Kraken batch orders

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
        leverage: '3',
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
        leverage: '4',
        priceDecimals: 2
    },
    'LINK/USD': {
        symbol: 'LINK',
        name: 'Chainlink',
        leverage: '3',
        priceDecimals: 4
    },
    'PEPE/USD': {
        symbol: 'PEPE',
        name: 'Pepe',
        leverage: '3',
        priceDecimals: 8
    },
    'ADA/USD': {
        symbol: 'ADA',
        name: 'Cardano',
        leverage: '3',
        priceDecimals: 6
    },
    'XLM/USD': {
        symbol: 'XLM',
        name: 'Stellar',
        leverage: '2',
        priceDecimals: 6
    }
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
