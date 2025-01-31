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
        basePriceDistance: 0.032,
        orderPriceDistance: 0.012,
        stopLossDistance: 0.05,
        takeProfitDistance: 0.1,
        leverage: 5,
        priceDecimals: 1,
        pair: 'BTC/USD'
    },
    XRP: {
        basePriceDistance: 0.065,
        orderPriceDistance: 0.015,
        stopLossDistance: 0.075,
        takeProfitDistance: 0.15,
        leverage: 5,
        priceDecimals: 5,
        pair: 'XRP/USD'
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

async function manageDailyOrders() {
    try {
        // Get coin from command line argument, default to BTC
        const coin = process.argv[2]?.toUpperCase() || 'BTC';
        if (!ORDERS_SETTINGS[coin]) {
            console.error(`Error: Invalid coin "${coin}". Supported coins are: ${Object.keys(ORDERS_SETTINGS).join(', ')}`);
            process.exit(1);
        }

        // Get trade balance
        const balanceInfo = await krakenRequest('/0/private/TradeBalance', { asset: 'ZUSD' });
        const tradeBalance = parseFloat(balanceInfo.tb);
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

        // Settings
        const totalOrders = 15;
        const settings = ORDERS_SETTINGS[coin];
        const basePriceDistance = settings.basePriceDistance;
        const orderPriceDistance = settings.orderPriceDistance;
        const stopLossDistance = settings.stopLossDistance;
        const takeProfitDistance = settings.takeProfitDistance;
        const leverage = settings.leverage;
        const pair = settings.pair;
        const baseVolume = 0.0315; // Volume of the first order
        const volumeIncrease = 0.005; // Increase in volume for each additional order
        const useStopLoss = true;
        const orders = [];

        // Create buy orders
        for (let i = 0; i < totalOrders; i++) {
            const priceDivider = 1 + basePriceDistance + (orderPriceDistance * i);
            const limitPrice = (currentPrice / priceDivider);
            const stopLossPrice = (parseFloat(limitPrice) / (1 + stopLossDistance));
            const takeProfitPrice = (parseFloat(limitPrice) * (1 + takeProfitDistance));
            const volumePercentage = baseVolume + (volumeIncrease * i);
            const volume = ((tradeBalance * leverage * volumePercentage) / parseFloat(limitPrice));

            orders.push({
                ordertype: 'limit',
                type: 'buy',
                price: limitPrice.toFixed(settings.priceDecimals),
                volume: volume.toFixed(8),
                leverage: leverage,
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

// Execute immediately
manageDailyOrders();
