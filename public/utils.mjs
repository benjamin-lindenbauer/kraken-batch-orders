// Utility functions for Kraken batch trading

export const TRADING_PAIRS = {
    'BTC': {
        symbol: 'BTC',
        name: 'Bitcoin',
        leverage: '5',
        priceDecimals: 1,
        default: true
    },
    'ETH': {
        symbol: 'ETH',
        name: 'Ethereum',
        leverage: '5',
        priceDecimals: 2
    },
    'XRP': {
        symbol: 'XRP',
        name: 'Ripple',
        leverage: '5',
        priceDecimals: 5
    },
    'SUI': {
        symbol: 'SUI',
        name: 'Sui',
        leverage: '5',
        priceDecimals: 4
    },
    'DOGE': {
        symbol: 'DOGE',
        name: 'Dogecoin',
        leverage: '5',
        priceDecimals: 6
    },
    'SOL': {
        symbol: 'SOL',
        name: 'Solana',
        leverage: '5',
        priceDecimals: 2
    },
    'ADA': {
        symbol: 'ADA',
        name: 'Cardano',
        leverage: '5',
        priceDecimals: 6
    },
    'LINK': {
        symbol: 'LINK',
        name: 'Chainlink',
        leverage: '5',
        priceDecimals: 4
    },
    'BNB': {
        symbol: 'BNB',
        name: 'Binance',
        leverage: '3',
        priceDecimals: 2
    },
    'XLM': {
        symbol: 'XLM',
        name: 'Stellar',
        leverage: '2',
        priceDecimals: 6
    },
    'ZEC': {
        symbol: 'ZEC',
        name: 'Zcash',
        leverage: '3',
        priceDecimals: 2
    },
    'PAXG': {
        symbol: 'PAXG',
        name: 'Paxos Gold',
        leverage: '3',
        priceDecimals: 2
    },
    'LTC': {
        symbol: 'LTC',
        name: 'Litecoin',
        leverage: '5',
        priceDecimals: 2
    },
    'ICP': {
        symbol: 'ICP',
        name: 'Internet Computer',
        leverage: '3',
        priceDecimals: 3
    },
};

const QUOTE_CURRENCIES = ['USD', 'EUR'];

// Get all supported assets (base/quote pairs)
export function getSupportedAssets() {
    const defaultBases = new Set();
    const defaultPairs = [];
    const otherPairs = [];

    Object.entries(TRADING_PAIRS).forEach(([base, info]) => {
        if (info.default) {
            defaultBases.add(base);
        }

        QUOTE_CURRENCIES.forEach((quote, index) => {
            const pair = `${base}/${quote}`;
            if (info.default && index === 0) {
                defaultPairs.push(pair);
            } else {
                otherPairs.push(pair);
            }
        });
    });

    return [...defaultPairs, ...otherPairs];
}

// Get pair info for a base/quote combination
export function getPairInfo(asset) {
    const [base, quote] = asset.split('/');
    return TRADING_PAIRS[base];
}

// If we're in a browser environment, add to window object
if (typeof window !== 'undefined') {
    window.TRADING_PAIRS = TRADING_PAIRS;
    window.getSupportedAssets = getSupportedAssets;
    window.getPairInfo = getPairInfo;
}
