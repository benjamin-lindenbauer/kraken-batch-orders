import axios from 'axios';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { Buffer } from 'buffer';

dotenv.config();

const API_KEY = process.env.KRAKEN_API_KEY;
const API_SECRET = process.env.KRAKEN_API_SECRET;
const API_URL = 'https://api.kraken.com';

const ORDERS_SETTINGS = {
    BTC: {
        basePriceDistance: 0.062,
        orderPriceDistance: 1.0,
        stopLossDistance: 0.04,
        takeProfitDistance: 0.08,
        leverage: 5,
        priceDecimals: 1,
        pair: 'BTC/USD'
    },
    XRP: {
        basePriceDistance: 0.115,
        orderPriceDistance: 1.5,
        stopLossDistance: 0.06,
        takeProfitDistance: 0.12,
        leverage: 5,
        priceDecimals: 5,
        pair: 'XRP/USD'
    },
    SUI: {
        basePriceDistance: 0.115,
        orderPriceDistance: 1.5,
        stopLossDistance: 0.06,
        takeProfitDistance: 0.12,
        leverage: 3,
        priceDecimals: 5,
        pair: 'SUI/USD'
    }
};

if (!API_KEY || !API_SECRET) {
    console.error('Error: KRAKEN_API_KEY and KRAKEN_API_SECRET must be set in .env file');
    process.exit(1);
}

const apiKey = API_KEY;
const apiSecret = API_SECRET;

// Nonce generator
let lastNonce = 0;
function generateNonce() {
    const timestamp = Date.now() * 1000; // Convert to microseconds
    lastNonce = Math.max(timestamp, lastNonce + 1);
    return lastNonce.toString();
}

function getKrakenSignature(path, nonce, postData) {
    const message = postData;
    const secret_buffer = Buffer.from(apiSecret, 'base64');
    const hash = crypto.createHash('sha256');
    const hmac = crypto.createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    const hmac_digest = hmac.update(path + hash_digest, 'binary').digest('base64');
    return hmac_digest;
}

async function krakenRequest(endpoint, data = {}, useJson = false) {
    const nonce = generateNonce();
    const postData = useJson ? 
        JSON.stringify({ nonce, ...data }) : 
        new URLSearchParams({ nonce, ...data }).toString();
    
    try {
        const config = {
            method: 'POST',
            url: `${API_URL}${endpoint}`,
            headers: {
                'API-Key': apiKey,
                'API-Sign': getKrakenSignature(endpoint, nonce, postData),
                'Content-Type': useJson ? 'application/json' : 'application/x-www-form-urlencoded',
            },
            data: postData
        };
        const response = await axios(config);

        if (response.data.error && response.data.error.length > 0) {
            throw new Error(`Kraken API error: ${JSON.stringify(response.data.error)}`);
        }

        return response.data.result;
    } catch (error) {
        if (error.response) {
            console.error('API Response Error:', error.response.data);
        }
        throw error;
    }
}

async function getPublicData(endpoint, params = {}) {
    try {
        const response = await axios.get(`${API_URL}${endpoint}`, { params });
        
        if (response.data.error && response.data.error.length > 0) {
            throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
        }

        return response.data.result;
    } catch (error) {
        console.error('Error fetching public data:', error.message);
        throw error;
    }
}

async function submitOrderBatch(orders, pair = 'BTC/USD', validate = false) {
    try {
        const result = await krakenRequest('/0/private/AddOrderBatch', {
            orders: orders,
            pair: pair,
            validate
        }, true);
        return result;
    } catch (error) {
        console.error('Error submitting orders:', error.message);
        throw error;
    }
}

async function getHighestPrice(coin, since) {
    const pair = coin === 'BTC' ? 'XXBTZUSD' : `X${coin}ZUSD`;
    const ohlcData = await getPublicData('/0/public/OHLC', { pair, interval: 1440, since });
    const prices = ohlcData[pair].map(entry => parseFloat(entry[2]));
    return Math.max(...prices);
}

async function manageDailyOrders(coin, basePriceArg, priceDistanceArg, spot) {
    try {
        // Get trade balance
        const balanceInfo = await spot ? 
            krakenRequest('/0/private/Balance', {}, true) :
            krakenRequest('/0/private/TradeBalance', { asset: 'ZUSD' }, true);
        const tradeBalance = parseFloat(spot ? balanceInfo.ZUSD : balanceInfo.tb);
        console.log(`Trade balance: $${tradeBalance.toFixed(2)}`);

        // Get and cancel all buy orders
        const openOrders = await krakenRequest('/0/private/OpenOrders');
        if (!openOrders || !openOrders.open) {
            throw new Error('Failed to get open orders from API');
        }
        
        const buyOrderIds = Object.entries(openOrders.open)
            .filter(([_, order]) => order.descr.type === 'buy')
            .map(([orderId, _]) => orderId);

        console.log(buyOrderIds.length, 'Buy orders to cancel');

        if (buyOrderIds.length > 1) {
            await krakenRequest('/0/private/CancelOrderBatch', {
                orders: buyOrderIds
            }, true);
            console.log(`Cancelled ${buyOrderIds.length} buy orders`);
        } else if (buyOrderIds.length === 1) {
            await krakenRequest('/0/private/CancelOrder', {
                txid: buyOrderIds[0]
            }, true);
            console.log('Cancelled 1 buy order');
        } else {
            console.log('No buy orders to cancel');
        }

        // Get current price
        const tickerPair = coin === 'BTC' ? 'XXBTZUSD' : `X${coin}ZUSD`;
        const tickerInfo = await getPublicData('/0/public/Ticker', { pair: tickerPair });
        const currentPrice = parseFloat(tickerInfo[tickerPair].c[0]);
        console.log(`Current ${coin} price: $${currentPrice}`);

        if (isNaN(currentPrice)) {
            console.error('Error: Could not fetch current price');
            return;
        }

        // Get highest price of last 5 days
        const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60;
        const highestPrice = await getHighestPrice(coin, fiveDaysAgo);
        console.log(`Highest ${coin} price in last 5 days: $${highestPrice}`);

        if (isNaN(highestPrice)) {
            console.error('Error: Could not fetch highest price');
            return;
        }

        // Settings
        const totalOrders = 15;
        const settings = ORDERS_SETTINGS[coin];
        const basePriceDistance = settings.basePriceDistance;
        const orderPriceDistance = priceDistanceArg ? priceDistanceArg / 100 : settings.orderPriceDistance / 100;
        const basePrice = basePriceArg || Math.min(currentPrice / (1 + orderPriceDistance), highestPrice / (1 + basePriceDistance));
        const stopLossDistance = settings.stopLossDistance;
        const takeProfitDistance = settings.takeProfitDistance;
        const leverage = spot ? 1 : settings.leverage;
        const pair = settings.pair;
        const baseVolume = 0.0315; // Volume of the first order
        const volumeIncrease = 0.005; // Increase in volume for each additional order
        const useStopLoss = false;
        const orders = [];

        // Create buy orders
        for (let i = 0; i < totalOrders; i++) {
            const limitPrice = basePrice / (1 + orderPriceDistance * i);
            const stopLossPrice = (parseFloat(limitPrice) / (1 + stopLossDistance));
            const takeProfitPrice = (parseFloat(limitPrice) * (1 + takeProfitDistance));
            const volumePercentage = baseVolume + (volumeIncrease * i);
            const volume = ((tradeBalance * leverage * volumePercentage) / parseFloat(limitPrice));

            orders.push({
                ordertype: 'limit',
                type: 'buy',
                price: limitPrice.toFixed(settings.priceDecimals),
                volume: volume.toFixed(8),
                ...!spot && { leverage: leverage },
                close: {
                    ordertype: useStopLoss ? 'stop-loss' : 'take-profit',
                    price: useStopLoss ? stopLossPrice.toFixed(settings.priceDecimals) : takeProfitPrice.toFixed(settings.priceDecimals)
                }
            });
        }

        console.log(`Orders to be created: ${orders.map(o => `${o.type} ${coin} ${o.volume} @ $${o.price}`).join(', ')}`);

        // First validate the orders
        //await submitOrderBatch(orders, true);
        const results = await submitOrderBatch(orders, pair);
        console.log(`${results.orders.length} orders submitted successfully:`);
        console.log(results.orders.map(o => o.descr.order + ', close: ' + o.descr.close));
        
    } catch (error) {
        console.error('Error managing daily orders:', error.message);
        process.exit(1);
    }
}

// Get coin and base price from command line arguments
const coin = process.argv[2]?.toUpperCase() || 'XRP';
const basePriceArg = process.argv[3] ? parseFloat(process.argv[3]) : undefined;
const priceDistanceArg = process.argv[4] ? parseFloat(process.argv[4]) : undefined;
const spot = process.argv[5] ? process.argv[5].toLowerCase() === 'true' : false;

// Execute immediately
manageDailyOrders(coin, basePriceArg, priceDistanceArg, spot);
