import axios from 'axios';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { Buffer } from 'buffer';

dotenv.config();

const API_KEY = process.env.KRAKEN_API_KEY;
const API_SECRET = process.env.KRAKEN_API_SECRET;
const API_URL = 'https://api.kraken.com';

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

async function submitOrderBatch(orders, validate = false) {
    // Remove pair from individual orders and add it to the root request
    const cleanedOrders = orders.map(({ pair, ...order }) => order);
    
    try {
        const result = await krakenRequest('/0/private/AddOrderBatch', {
            orders: cleanedOrders,
            pair: 'BTC/USD',  // Root level pair parameter
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
        // Get trade balance
        const balanceInfo = await krakenRequest('/0/private/TradeBalance', { asset: 'ZUSD' });
        const tradeBalance = parseInt(balanceInfo.tb);
        console.log(`Trade balance: $${tradeBalance}`);

        // Get and cancel all buy orders
        const openOrders = await krakenRequest('/0/private/OpenOrders');
        if (!openOrders || !openOrders.open) {
            throw new Error('Failed to get open orders from API');
        }
        
        const buyOrderIds = Object.entries(openOrders.open)
            .filter(([_, order]) => order.descr.pair === 'XBTUSD' && order.descr.type === 'buy')
            .map(([orderId, _]) => orderId);

        console.log('Buy orders to cancel:', buyOrderIds);

        if (buyOrderIds.length > 0) {
            await krakenRequest('/0/private/CancelOrderBatch', {
                orders: buyOrderIds  // Wrap in array as per API spec
            }, true);
            console.log(`Cancelled ${buyOrderIds.length} buy orders`);
        } else {
            console.log('No buy orders to cancel');
        }

        // Get current price for XBT/USD
        const tickerInfo = await getPublicData('/0/public/Ticker', { pair: 'XXBTZUSD' });
        const currentPrice = parseFloat(tickerInfo.XXBTZUSD.c[0]);
        console.log(`Current BTC price: $${currentPrice}`);

        // Calculate order parameters
        const totalOrders = 5;
        const basePriceDistance = 0.032; // Distance between base price and current price
        const orderPriceDistance = 0.012; // Distance between orders
        const baseVolume = 0.0315; // Volume of the first order
        const volumeIncrease = 0.005; // Increase in volume for each additional order
        const stopLossDistance = 0.05; // Distance between stop loss and order price
        const leverage = 5;
        const pair = 'BTC/USD';
        const orders = [];

        // Create buy orders below current price
        for (let i = 0; i < totalOrders; i++) {
            const priceDivider = 1 + basePriceDistance + (orderPriceDistance * i);
            const limitPrice = (currentPrice / priceDivider);
            const stopLossPrice = (parseFloat(limitPrice) * (1 - stopLossDistance));
            const volumePercentage = baseVolume + (volumeIncrease * i);
            const volume = ((tradeBalance * leverage * volumePercentage) / parseFloat(limitPrice));

            orders.push({
                ordertype: 'limit',
                type: 'buy',
                pair: pair,
                price: limitPrice.toFixed(1),
                volume: volume.toFixed(8),
                leverage: leverage,
                close: {
                    ordertype: 'stop-loss',
                    price: stopLossPrice.toFixed(1)
                }
            });
        }

        console.log(`Created ${orders.length} orders`);

        // First validate the orders
        //await submitOrderBatch(orders, true);
        const results = await submitOrderBatch(orders);
        console.log('Orders submitted successfully:', results);
        
    } catch (error) {
        console.error('Error managing daily orders:', error.message);
        process.exit(1);
    }
}

// Execute immediately
manageDailyOrders();
