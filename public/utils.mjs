// Utility functions for Kraken batch trading

export const ASSETS = {
    'BTC': {
        symbol: 'BTC',
        name: 'Bitcoin',
        leverage: '10',
        priceDecimals: 1,
        default: true
    },
    'ETH': {
        symbol: 'ETH',
        name: 'Ethereum',
        leverage: '10',
        priceDecimals: 2
    },
    'XRP': {
        symbol: 'XRP',
        name: 'Ripple',
        leverage: '10',
        priceDecimals: 5
    },
    'SUI': {
        symbol: 'SUI',
        name: 'Sui',
        leverage: '10',
        priceDecimals: 4
    },
    'DOGE': {
        symbol: 'DOGE',
        name: 'Dogecoin',
        leverage: '10',
        priceDecimals: 6
    },
    'SOL': {
        symbol: 'SOL',
        name: 'Solana',
        leverage: '10',
        priceDecimals: 2
    },
    'ADA': {
        symbol: 'ADA',
        name: 'Cardano',
        leverage: '10',
        priceDecimals: 6
    },
    'LINK': {
        symbol: 'LINK',
        name: 'Chainlink',
        leverage: '10',
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
    'XMR': {
        symbol: 'XMR',
        name: 'Monero',
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
        leverage: '10',
        priceDecimals: 2
    },
    'ICP': {
        symbol: 'ICP',
        name: 'Internet Computer',
        leverage: '3',
        priceDecimals: 3
    },
    'DASH': {
        symbol: 'DASH',
        name: 'Dash',
        leverage: '3',
        priceDecimals: 3
    },
    'TRX': {
        symbol: 'TRX',
        name: 'Tron',
        leverage: '3',
        priceDecimals: 6
    },
    'TAO': {
        symbol: 'TAO',
        name: 'Bittensor',
        leverage: '3',
        priceDecimals: 3
    },
    'NEAR': {
        symbol: 'NEAR',
        name: 'NEAR Protocol',
        leverage: '3',
        priceDecimals: 3
    },
    'BCH': {
        symbol: 'BCH',
        name: 'Bitcoin Cash',
        leverage: '3',
        priceDecimals: 2
    },
    'AVAX': {
        symbol: 'AVAX',
        name: 'Avalanche',
        leverage: '10',
        priceDecimals: 2
    },
    'HBAR': {
        symbol: 'HBAR',
        name: 'Hedera',
        leverage: '3',
        priceDecimals: 5
    },
    'SHIB': {
        symbol: 'SHIB',
        name: 'Shiba Inu',
        leverage: '3',
        priceDecimals: 8
    },
};

export const QUOTE_CURRENCIES = ['USD', 'EUR', 'BTC'];

// Get all supported assets (base/quote pairs)
export function getSupportedAssets() {
    const pairs = [];

    Object.keys(ASSETS).forEach((base) => {
        QUOTE_CURRENCIES.forEach((quote) => {
            if (base === quote) return;
            const pair = `${base}/${quote}`;
            pairs.push(pair);
        });
    });

    return pairs;
}

// Get pair info for a base/quote combination
export function getPairInfo(asset) {
    const [base, quote] = asset.split('/');
    if (quote === 'BTC') return {...ASSETS[base], priceDecimals: 8};
    return ASSETS[base];
}

// If we're in a browser environment, add to window object
if (typeof window !== 'undefined') {
    window.ASSETS = ASSETS;
    window.QUOTE_CURRENCIES = QUOTE_CURRENCIES;
    window.getSupportedAssets = getSupportedAssets;
    window.getPairInfo = getPairInfo;
}
