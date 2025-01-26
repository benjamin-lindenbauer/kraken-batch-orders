const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
    lastModified: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// Import utils
const { getPairInfo } = require('./public/utils.js');

let lastNonce = Math.floor(Date.now() * 1000); // Microsecond precision

function generateNonce() {
    const newNonce = Math.max(Date.now() * 1000, lastNonce + 1);
    lastNonce = newNonce;
    return newNonce.toString();
}

function getMessageSignature(path, postData, secret, nonce) {
    const message = postData;
    const secret_buffer = Buffer.from(secret, 'base64');
    const hash = new crypto.createHash('sha256');
    const hmac = new crypto.createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    const hmac_digest = hmac.update(path + hash_digest, 'binary').digest('base64');
    return hmac_digest;
}

// Export the router for Netlify Functions
const router = express.Router();

router.post('/api/batch-order', async (req, res) => {
    const { asset, price, direction, numOrders, distance, volume_distance, total, stop_loss, take_profit } = req.body;
    
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
        
        // Calculate the base price per order that will result in the desired total
        const basePrice = total / sumFactors;
        
        for (let i = 0; i < numOrders; i++) {
            const orderPrice = direction === 'buy' 
                ? price / Math.pow(1 + distance / 100, i)
                : price * Math.pow(1 + distance / 100, i);
            // Calculate this order's portion of the total using the geometric progression with volume_distance
            const pricePerOrder = basePrice * Math.pow(1 + volume_distance / 100, i);
            const volume = pricePerOrder / orderPrice;
            const order = {
                ordertype: "limit",
                price: orderPrice.toFixed(priceDecimals),
                timeinforce: "GTC",
                type: direction,
                //cl_ord_id: `${Date.now()}-${i}`,
                volume: volume.toFixed(8),
                pair: asset,
                leverage: pairInfo.leverage
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

        const nonce = generateNonce();
        const path = '/0/private/AddOrderBatch';

        const requestData = {
            nonce: nonce,
            orders: orders,
            pair: asset,
            validate: false,
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

        const response = await axios.request(config);
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.post('/api/cancel-order', async (req, res) => {
    try {
        const { txid } = req.body;
        const nonce = generateNonce();
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
        const nonce = generateNonce();
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
        const nonce = generateNonce();
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
        const nonce = generateNonce();
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
        const nonce = generateNonce();
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

// For local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.use('/', router);
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Export the router for Netlify Functions
module.exports = router;
