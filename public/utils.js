// Utility functions for Kraken batch orders

const TRADING_PAIRS = {
    'BTC/USD': {
        name: 'Bitcoin',
        leverage: '5',
        defaultPrice: '80042',
        priceDecimals: 1
    },
    'XRP/USD': {
        name: 'Ripple',
        leverage: '5',
        defaultPrice: '1.952',
        priceDecimals: 5
    },
    'DOGE/USD': {
        name: 'Dogecoin',
        leverage: '5',
        defaultPrice: '0.303',
        priceDecimals: 6
    },
    'SOL/USD': {
        name: 'Solana',
        leverage: '4',
        defaultPrice: '195.1',
        priceDecimals: 2
    },
    'PEPE/USD': {
        name: 'Pepe',
        leverage: '3',
        defaultPrice: '0.0000202',
        priceDecimals: 8
    },
    'ADA/USD': {
        name: 'Cardano',
        leverage: '3',
        defaultPrice: '0.911',
        priceDecimals: 6
    },
    'XLM/USD': {
        name: 'Stellar',
        leverage: '2',
        defaultPrice: '0.341',
        priceDecimals: 6
    }
};

const getLeverage = (asset) => {
    return TRADING_PAIRS[asset]?.leverage || '2';
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
    exports.getLeverage = getLeverage;
    exports.getSupportedAssets = getSupportedAssets;
    exports.getPairInfo = getPairInfo;
    exports.TRADING_PAIRS = TRADING_PAIRS;
} else {
    window.getLeverage = getLeverage;
    window.getSupportedAssets = getSupportedAssets;
    window.getPairInfo = getPairInfo;
    window.TRADING_PAIRS = TRADING_PAIRS;
}
