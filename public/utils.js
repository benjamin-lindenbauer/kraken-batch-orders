// Utility functions for Kraken batch orders

const TRADING_PAIRS = {
    'BTC/USD': {
        symbol: 'BTC',
        name: 'Bitcoin',
        leverage: '5',
        priceDecimals: 1
    },
    'BTC/CHF': {
        symbol: 'BTC',
        name: 'Bitcoin',
        priceDecimals: 1
    },
    'ETH/USD': {
        symbol: 'ETH',
        name: 'Ethereum',
        leverage: '5',
        priceDecimals: 1
    },
    'XRP/USD': {
        symbol: 'XRP',
        name: 'Ripple',
        leverage: '5',
        priceDecimals: 5
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
const getSupportedAssets = () => {
    return Object.keys(TRADING_PAIRS);
};

// Get pair info
const getPairInfo = (asset) => {
    return TRADING_PAIRS[asset];
};

// Support both CommonJS and ES modules
if (typeof exports !== 'undefined') {
    exports.getSupportedAssets = getSupportedAssets;
    exports.getPairInfo = getPairInfo;
    exports.TRADING_PAIRS = TRADING_PAIRS;
} else {
    window.getSupportedAssets = getSupportedAssets;
    window.getPairInfo = getPairInfo;
    window.TRADING_PAIRS = TRADING_PAIRS;
}
