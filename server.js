import express, { json, Router } from 'express';
import cors from 'cors';
import { config as _config } from 'dotenv';
import axios from 'axios';
import { createHash, createHmac } from 'crypto';

_config();

const app = express();
app.use(cors());
app.use(json());

// Add cache control headers for all responses
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// Serve static files with no-cache options
app.use(express.static('public', {
    etag: false,
    setHeaders: (res, path, stat) => {
        res.set('Cache-Control', 'no-cache');
    }
}));

// Import utils
import { getPairInfo } from './public/utils.mjs';

let lastNonce = Math.floor(Date.now() * 1000); // Microsecond precision

function generateNonce() {
    const newNonce = Math.max(Date.now() * 1000, lastNonce + 1);
    lastNonce = newNonce;
    return newNonce.toString();
}

function getMessageSignature(path, postData, secret, nonce) {
    const message = postData;
    const secret_buffer = Buffer.from(secret, 'base64');
    const hash = new createHash('sha256');
    const hmac = new createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    const hmac_digest = hmac.update(path + hash_digest, 'binary').digest('base64');
    return hmac_digest;
}

function parseBooleanQuery(value) {
    if (Array.isArray(value)) {
        value = value[value.length - 1];
    }
    if (typeof value === 'string') {
        const normalised = value.trim().toLowerCase();
        if (normalised === 'true' || normalised === '1') return true;
        if (normalised === 'false' || normalised === '0') return false;
        return undefined;
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return undefined;
}

function normaliseOpenPositions(result) {
    if (!result || typeof result !== 'object') {
        return [];
    }

    return Object.entries(result).map(([positionId, details]) => ({
        id: positionId,
        orderId: details?.ordertxid ?? '',
        pair: details?.pair ?? '',
        type: details?.type ?? '',
        orderType: details?.ordertype ?? '',
        volume: details?.vol ?? '0',
        volumeClosed: details?.vol_closed ?? '0',
        cost: details?.cost ?? '0',
        margin: details?.margin ?? '0',
        value: details?.value ?? null,
        net: details?.net ?? null,
        fee: details?.fee ?? '0',
        openedAt: details?.time ?? 0,
        status: details?.posstatus ?? '',
        terms: details?.terms ?? null,
        rolloverTime: details?.rollovertm ?? null,
        misc: details?.misc ?? null,
        flags: details?.oflags ?? null
    }));
}

// Export the router for Netlify Functions
const router = Router();

router.post('/api/batch-orders', async (req, res) => {
    const { asset, price: startPrice, direction, numOrders, leverage, distance, volume_distance, total, stop_loss, take_profit } = req.body;
    
    try {
        const pairInfo = getPairInfo(asset);
        if (!pairInfo) {
            return res.status(400).json({ error: ['Invalid trading pair'] });
        }

        const priceDecimals = pairInfo.priceDecimals;
        const orders = [];
        
        // Calculate the sum of the geometric progression factors for volume
        let sumFactors = 0;
        for (let i = 0; i < numOrders; i++) {
            sumFactors += Math.pow(1 + volume_distance / 100, i);
        }
        
        //total volume should be total rounded to 100
        const totalVolume = Math.floor(total / 100) * 100;
        // Calculate the base price per order that will result in the desired total volume
        const basePrice = totalVolume / sumFactors;
        
        for (let i = 0; i < numOrders; i++) {
            const orderPrice = direction === 'buy' 
                ? startPrice / Math.pow(1 + distance / 100, i)
                : startPrice * Math.pow(1 + distance / 100, i);
            // Calculate this order's portion of the total using the geometric progression with volume_distance
            const pricePerOrder = basePrice * Math.pow(1 + volume_distance / 100, i);
            const volume = pricePerOrder / orderPrice;
            const order = {
                ordertype: "limit",
                price: orderPrice.toFixed(priceDecimals),
                type: direction,
                volume: volume.toFixed(6 - priceDecimals),
                pair: asset,
                ...leverage > 1 && { leverage: pairInfo.leverage }
            }
            if (stop_loss) order.close = {
                ordertype: "stop-loss",
                price: (orderPrice / (1 + stop_loss / 100)).toFixed(priceDecimals)
            }
            else if (take_profit) order.close = {
                ordertype: "take-profit",
                price: (orderPrice * (1 + take_profit / 100)).toFixed(priceDecimals)
            }
            orders.push(order);
        }

        let nonce = generateNonce();
        const path = '/0/private/AddOrderBatch';

        const batchSize = numOrders <= 15 || numOrders > 20 ? 15 : 10;
        const batches = [];
        for (let i = 0; i < numOrders; i += batchSize) {
            batches.push(orders.slice(i, i + batchSize));
        }

        try {
            const results = [];
            for (const batch of batches) {
                const requestData = {
                    nonce: nonce,
                    orders: batch,
                    pair: asset,
                    validate: false,
                    deadline: new Date(Date.now() + 30000).toISOString()
                };

                const signature = getMessageSignature(path, JSON.stringify(requestData), process.env.KRAKEN_API_SECRET, nonce);

                const config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: 'https://api.kraken.com' + path,
                    headers: { 
                        'Content-Type': 'application/json',
                        'API-Key': process.env.KRAKEN_API_KEY,
                        'API-Sign': signature
                    },
                    data: requestData
                };

                const response = await axios(config);
                if (response.data.error && response.data.error.length > 0) {
                    return res.status(400).json({ error: response.data.error });
                }
                results.push(...response.data.result.orders);
                nonce++;
            }
            
            res.json({orders: results});
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.response?.data || error.message });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.post('/api/add-order', async (req, res) => {
    const { asset, price, direction, leverage, total, stop_loss, take_profit } = req.body;
    
    try {
        const pairInfo = getPairInfo(asset);
        if (!pairInfo) {
            return res.status(400).json({ error: ['Invalid trading pair'] });
        }

        const priceDecimals = pairInfo.priceDecimals;

        let nonce = generateNonce();
        const path = '/0/private/AddOrder';

        const requestData = {
            nonce: nonce,
            ordertype: "limit",
            price: price.toFixed(priceDecimals),
            type: direction,
            clOrdId: `${Date.now()}`,
            volume: (total / price).toFixed(6 - priceDecimals),
            pair: asset,
            ...leverage > 1 && { leverage: leverage },
            ...stop_loss && { close: { ordertype: "stop-loss", price: (price / (1 + stop_loss / 100)).toFixed(priceDecimals) } },
            ...take_profit && { close: { ordertype: "take-profit", price: (price * (1 + take_profit / 100)).toFixed(priceDecimals) } },
            deadline: new Date(Date.now() + 30000).toISOString() // 30 seconds from now
        };

        const signature = getMessageSignature(path, JSON.stringify(requestData), process.env.KRAKEN_API_SECRET, nonce);

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.kraken.com' + path,
            headers: { 
                'Content-Type': 'application/json',
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature
            },
            data: requestData
        };

        const response = await axios(config);
        
        res.json({orders: [response.data.result]});
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.post('/api/cancel-order', async (req, res) => {
    try {
        const { txid } = req.body;
        let nonce = generateNonce();
        const path = '/0/private/CancelOrder';
        const data = {
            nonce: nonce,
            txid: txid
        };

        const postData = new URLSearchParams(data).toString();
        const signature = getMessageSignature(path, postData, process.env.KRAKEN_API_SECRET, nonce);

        const response = await fetch('https://api.kraken.com' + path, {
            method: 'POST',
            headers: {
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: [error.message] });
    }
});

router.get('/api/open-orders', async (req, res) => {
    try {
        let nonce = generateNonce();
        const path = '/0/private/OpenOrders';
        const data = {
            nonce: nonce
        };

        const postData = new URLSearchParams(data).toString();
        const signature = getMessageSignature(path, postData, process.env.KRAKEN_API_SECRET, nonce);

        const response = await fetch('https://api.kraken.com' + path, {
            method: 'POST',
            headers: {
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: [error.message] });
    }
});

// Add the cancel-all endpoint
router.post('/api/cancel-all', async (req, res) => {
    try {
        let nonce = generateNonce();
        const path = '/0/private/CancelAll';
        const postData = `nonce=${nonce}`;
        
        const signature = getMessageSignature(
            path,
            postData,
            process.env.KRAKEN_API_SECRET,
            nonce
        );

        const response = await fetch('https://api.kraken.com' + path, {
            method: 'POST',
            headers: {
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            return res.status(400).json({ error: data.error });
        }
        
        res.json(data.result);
    } catch (error) {
        res.status(500).json({ error: [error.message] });
    }
});

// Add the cancel-all-of-pair endpoint using CancelOrderBatch
router.post('/api/cancel-all-of-pair', async (req, res) => {
    try {
        const { orderIds } = req.body;
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: ['No order IDs provided'] });
        }

        let nonce = generateNonce();
        const path = '/0/private/CancelOrderBatch';
        
        const requestData = {
            nonce: nonce,
            orders: orderIds
        };

        const signature = getMessageSignature(path, JSON.stringify(requestData), process.env.KRAKEN_API_SECRET, nonce);

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.kraken.com' + path,
            headers: { 
                'Content-Type': 'application/json',
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature
            },
            data: requestData
        };

        const response = await axios(config);
        
        if (response.data.error && response.data.error.length > 0) {
            return res.status(400).json({ error: response.data.error });
        }
        
        res.json(response.data.result);
    } catch (error) {
        console.error('Error canceling orders:', error.response?.data || error.message);
        res.status(500).json({ error: [error.response?.data?.error || error.message] });
    }
});

router.get('/api/ticker/:pair', async (req, res) => {
    try {
        const pair = req.params.pair;
        const response = await axios.get(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/balances', async (req, res) => {
    try {
        let nonce = generateNonce();
        const path = '/0/private/Balance';
        const data = {
            nonce: nonce
        };

        const postData = new URLSearchParams(data).toString();
        const signature = getMessageSignature(path, postData, process.env.KRAKEN_API_SECRET, nonce);

        const response = await fetch('https://api.kraken.com' + path, {
            method: 'POST',
            headers: {
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            res.status(400).json({ error: result.error });
            return;
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: [error.message] });
    }
});

router.post('/api/trade-balance', async (req, res) => {
    try {
        const { asset } = req.body;
        let nonce = generateNonce();
        const path = '/0/private/TradeBalance';
        const data = {
            nonce: nonce,
            asset: asset
        };
        
        const postData = new URLSearchParams(data).toString();
        const signature = getMessageSignature(path, postData, process.env.KRAKEN_API_SECRET, nonce);
        
        const response = await axios({
            method: 'POST',
            url: `https://api.kraken.com${path}`,
            headers: {
                'API-Key': process.env.KRAKEN_API_KEY,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: postData
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching trade balance:', error.response?.data || error.message);
        res.status(500).json({ error: [error.message] });
    }
});

router.get('/api/open-positions', async (req, res) => {
    try {
        const apiKey = process.env.KRAKEN_API_KEY;
        const apiSecret = process.env.KRAKEN_API_SECRET;

        if (!apiKey || !apiSecret) {
            return res.status(500).json({ error: ['Kraken API credentials are not configured'] });
        }

        const path = '/0/private/OpenPositions';
        const nonce = generateNonce();
        const searchParams = new URLSearchParams({ nonce });

        const { txid, docalcs, consolidation, rebase_multiplier: rebaseMultiplier } = req.query;

        if (txid) {
            const txidValue = Array.isArray(txid) ? txid.join(',') : String(txid);
            if (txidValue.trim() !== '') {
                searchParams.append('txid', txidValue.trim());
            }
        }

        const docalcsValue = parseBooleanQuery(docalcs);
        if (docalcsValue !== undefined) {
            searchParams.append('docalcs', docalcsValue ? 'true' : 'false');
        }

        if (consolidation) {
            const consolidationValue = Array.isArray(consolidation) ? consolidation.at(-1) : consolidation;
            if (consolidationValue) {
                searchParams.append('consolidation', String(consolidationValue));
            }
        }

        if (rebaseMultiplier) {
            const rebaseValue = Array.isArray(rebaseMultiplier) ? rebaseMultiplier.at(-1) : rebaseMultiplier;
            if (rebaseValue) {
                searchParams.append('rebase_multiplier', String(rebaseValue));
            }
        }

        const body = searchParams.toString();
        const signature = getMessageSignature(path, body, apiSecret, nonce);

        const response = await fetch(`https://api.kraken.com${path}`, {
            method: 'POST',
            headers: {
                'API-Key': apiKey,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        const payload = await response.json();

        if (!response.ok) {
            console.error('Kraken OpenPositions request failed:', payload);
            return res.status(response.status).json({ error: [`Kraken request failed with status ${response.status}`] });
        }

        if (Array.isArray(payload.error) && payload.error.length > 0) {
            return res.status(400).json({ error: payload.error });
        }

        const result = payload.result ?? {};
        res.json({
            positions: normaliseOpenPositions(result),
            raw: result
        });
    } catch (error) {
        console.error('Error fetching open positions:', error);
        res.status(500).json({ error: [error.message || 'Unhandled error fetching open positions'] });
    }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.use('/', router);
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Export the router for Netlify Functions
export default router;
