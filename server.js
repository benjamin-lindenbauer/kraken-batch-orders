const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Import utils
const { getLeverage, getPairInfo } = require('./public/utils.js');

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
    const { asset, price, direction, numOrders, distance, total } = req.body;
    
    try {
        const pairInfo = getLeverage(asset);
        if (!pairInfo) {
            return res.status(400).json({ error: ['Invalid trading pair'] });
        }

        const priceDecimals = getPairInfo(asset).priceDecimals;
        const orders = [];
        
        // Calculate the sum of the geometric progression factors
        let sumFactors = 0;
        for (let i = 0; i < numOrders; i++) {
            sumFactors += Math.pow(1 + distance / 100, i);
        }
        
        // Calculate the base price per order that will result in the desired total
        const basePrice = total / sumFactors;
        
        for (let i = 0; i < numOrders; i++) {
            const orderPrice = direction === 'buy' 
                ? price / Math.pow(1 + distance / 100, i)
                : price * Math.pow(1 + distance / 100, i);
            // Calculate this order's portion of the total using the geometric progression
            const pricePerOrder = basePrice * Math.pow(1 + distance / 100, i);
            const volume = pricePerOrder / orderPrice;
            
            orders.push({
                ordertype: "limit",
                price: orderPrice.toFixed(priceDecimals),
                timeinforce: "GTC",
                type: direction,
                cl_ord_id: `${Date.now()}-${i}`,
                volume: volume.toFixed(8),
                pair: asset,
                leverage: getLeverage(asset)
            });
        }

        const nonce = Date.now().toString();
        const path = '/0/private/AddOrderBatch';

        const requestData = {
            nonce: nonce,
            orders: orders,
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

        const response = await axios.request(config);
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.post('/api/cancel-order', async (req, res) => {
    try {
        const { txid } = req.body;
        const nonce = Date.now().toString();
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
        const nonce = Date.now().toString();
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
        const nonce = Date.now().toString();
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
