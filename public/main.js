// Global variables
let priceUpdateInterval;
let balanceUpdateInterval;

// Functions
function calculateOrders() {
    const price = parseFloat(document.getElementById('price').value);
    const numOrders = parseInt(document.getElementById('numOrders').value);
    const distance = parseFloat(document.getElementById('distance').value);
    const volume_distance = parseFloat(document.getElementById('volume_distance').value);
    const direction = document.getElementById('direction').value;
    const total = parseFloat(document.getElementById('total').value);
    const asset = document.getElementById('asset').value;

    if (!price || !numOrders || !distance || !volume_distance || !total) {
        document.getElementById('previewTable').innerHTML = '<p>Please fill in all fields</p>';
        return;
    }

    const orders = [];
    
    // Calculate the sum of the geometric progression factors for volume
    let sumFactors = 0;
    for (let i = 0; i < numOrders; i++) {
        sumFactors += Math.pow(1 + volume_distance / 100, i);
    }
    
    // Calculate the base price that will result in the desired total
    const basePrice = total / sumFactors;

    for (let i = 0; i < numOrders; i++) {
        const orderPrice = direction === 'buy'
            ? price / Math.pow(1 + distance / 100, i)
            : price * Math.pow(1 + distance / 100, i);
        // Calculate this order's portion using geometric progression with volume_distance
        const pricePerOrder = basePrice * Math.pow(1 + volume_distance / 100, i);
        const volume = pricePerOrder / orderPrice;
        const totalUsd = orderPrice * volume;
        
        orders.push({
            orderPrice: orderPrice,
            volume: volume,
            total: totalUsd
        });
    }

    const pairInfo = window.getPairInfo(asset);
    const priceDecimals = pairInfo.priceDecimals;

    // Calculate total range first
    const firstPrice = orders[0].orderPrice;
    const lastPrice = orders[orders.length - 1].orderPrice;
    const totalRange = direction === 'buy' 
        ? ((lastPrice - firstPrice) / firstPrice * 100) 
        : ((lastPrice - firstPrice) / firstPrice * 100);

    let tableHtml = '';
    let totalValue = 0;
    let totalCoins = 0;

    orders.forEach((order, index) => {
        totalValue += order.total;
        totalCoins += order.volume;
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>$${order.orderPrice.toFixed(priceDecimals)}</td>
                <td>${order.volume.toFixed(6)} ${pairInfo.symbol}</td>
                <td>$${order.total.toFixed(2)}</td>
            </tr>
        `;
    });

    // Add summary row
    tableHtml += `
        <tr>
            <td><strong>${totalRange.toFixed(2)}% Total range</strong></td>
            <td><strong>$${(totalValue / totalCoins).toFixed(priceDecimals)} Average price</strong></td>
            <td><strong>${totalCoins.toFixed(6)} Total volume</strong></td>
            <td><strong>$${totalValue.toFixed(2)} Total USD</strong></td>
        </tr>
    `;

    tableHtml = `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Price</th>
                    <th>Order Volume</th>
                    <th>Order Volume USD</th>
                </tr>
            </thead>
            <tbody>
    ` + tableHtml + '</tbody></table>';
    document.getElementById('previewTable').innerHTML = tableHtml;
}

async function updatePrice(pair) {
    try {
        const krakenPair = pair.replace('/', '');
        const response = await fetch(`/api/ticker/${krakenPair}`);
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            document.getElementById('currentPrice').textContent = 'Error fetching price';
            return;
        }
        
        const result = data.result[Object.keys(data.result)[0]];
        const lastPrice = parseFloat(result.c[0]);
        document.getElementById('currentPrice').textContent = `$${lastPrice}`;

        // Get the direction and set price accordingly
        const direction = document.getElementById('direction').value;
        const priceInput = document.getElementById('price');
        const pairInfo = window.getPairInfo(pair);
        const priceDecimals = pairInfo.priceDecimals;
        if (direction === 'buy') {
            const offset = 1 - (document.getElementById('priceOffset').value / 100);
            priceInput.setAttribute('step', priceDecimals.toString());
            priceInput.value = (lastPrice * offset).toFixed(priceDecimals); // Below current price
        } else {
            const offset = 1 + (document.getElementById('priceOffset').value / 100);
            priceInput.setAttribute('step', priceDecimals.toString());
            priceInput.value = (lastPrice * offset).toFixed(priceDecimals); // Above current price
        }
        calculateOrders(); // Recalculate orders with new price
    } catch (error) {
        document.getElementById('currentPrice').textContent = 'Error fetching price';
    }
}

function startPriceUpdates(pair) {
    if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
    }
    updatePrice(pair);
    priceUpdateInterval = setInterval(() => updatePrice(pair), 600000); // 10 minutes
}

async function fetchOpenOrders() {
    const tbody = document.getElementById('openOrdersTable');
    const errorDiv = document.getElementById('orderError');
    const orderCountSpan = document.getElementById('openOrdersCount');
    errorDiv.style.display = 'none';
    
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading orders...</td></tr>';
    orderCountSpan.textContent = '';
    
    try {
        const response = await fetch('/api/open-orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${result.error.join(', ')}</td></tr>`;
            orderCountSpan.textContent = '0 ';
            return;
        }

        const openOrders = result.result.open || {};
        const orderCount = Object.keys(openOrders).length;
        orderCountSpan.textContent = `${orderCount} `;

        if (orderCount === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No open orders</td></tr>';
            return;
        }

        // Convert orders object to array and sort by price in descending order
        const sortedOrders = Object.entries(openOrders)
            .sort(([, a], [, b]) => parseFloat(b.descr.price) - parseFloat(a.descr.price));

        tbody.innerHTML = sortedOrders.map(([orderId, order]) => `
            <tr id="order-${orderId}">
                <td>${order.descr.pair}</td>
                <td>${order.descr.type}</td>
                <td>${order.descr.price}</td>
                <td>${order.vol}</td>
                <td>$${(parseFloat(order.descr.price) * parseFloat(order.vol)).toFixed(2)}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="cancelOrder('${orderId}', document.getElementById('order-${orderId}'))">
                        Cancel
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        document.getElementById('openOrdersTable').innerHTML = 
            `<tr><td colspan="6" class="text-center text-danger">Error loading orders: ${error.message}</td></tr>`;
    }
}

async function cancelOrder(txid, rowElement) {
    const errorDiv = document.getElementById('orderError');
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/cancel-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ txid })
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            errorDiv.textContent = 'Error canceling order: ' + result.error.join(', ');
            errorDiv.style.display = 'block';
            return;
        }

        rowElement.remove();
        const tbody = document.getElementById('openOrdersTable');
        const remainingOrders = tbody.querySelectorAll('tr:not([colspan])').length;
        const orderCountSpan = document.getElementById('openOrdersCount');
        
        if (remainingOrders === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No open orders</td></tr>';
            orderCountSpan.textContent = '0 ';
        } else {
            orderCountSpan.textContent = `${remainingOrders} `;
        }
    } catch (error) {
        errorDiv.textContent = 'Error canceling order: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

async function cancelAllOrders() {
    const errorDiv = document.getElementById('orderError');
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/cancel-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            errorDiv.textContent = 'Error canceling all orders: ' + result.error.join(', ');
            errorDiv.style.display = 'block';
            return;
        }

        errorDiv.className = 'alert alert-success mt-3';
        errorDiv.textContent = `Successfully canceled ${result.count} orders${result.pending ? ' (pending)' : ''}`;
        errorDiv.style.display = 'block';

        if (!result.pending) {
            const tbody = document.getElementById('openOrdersTable');
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No open orders</td></tr>';
        } else {
            const cancelButtons = document.querySelectorAll('#openOrdersTable button');
            cancelButtons.forEach(btn => {
                btn.disabled = true;
                btn.textContent = 'Canceling...';
            });
        }
    } catch (error) {
        errorDiv.className = 'alert alert-danger mt-3';
        errorDiv.textContent = 'Error canceling all orders: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

function populateAssetOptions() {
    const assetSelect = document.getElementById('asset');
    const assets = window.getSupportedAssets();
    
    assetSelect.innerHTML = assets.map(asset => {
        const info = window.getPairInfo(asset);
        return `<option value="${asset}">${info.name} (${asset})</option>`;
    }).join('');

    assetSelect.addEventListener('change', function() {
        calculateOrders();
        if (priceUpdateInterval) {
            clearInterval(priceUpdateInterval);
        }
        startPriceUpdates(this.value);
    });

    document.getElementById('direction').addEventListener('change', updateFirstOrderPrice);
    document.getElementById('priceOffset').addEventListener('input', updateFirstOrderPrice);

    calculateOrders();
}

async function updateBalances() {
    const balanceDisplay = document.getElementById('balanceDisplay');
    
    try {
        const response = await fetch('/api/balances');
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            balanceDisplay.innerHTML = '<span class="text-danger">Error loading balances</span>';
            return;
        }

        const balances = data.result;
        let balanceHtml = '<div class="small">';
        
        // Filter and sort balances
        const significantBalances = Object.entries(balances)
            .filter(([, amount]) => parseFloat(amount) > 0.001)
            .map(([currency, amount]) => [currency.replace('ZUSD', 'USD').replace('XXBT', 'XBT'), amount])
            .sort(([, a], [, b]) => parseFloat(b) - parseFloat(a));

        // Display top 3 balances
        significantBalances.slice(0, 3).forEach(([currency, amount]) => {
            balanceHtml += `<div>${parseFloat(amount).toFixed(currency === 'XBT' ? 4 : 2)} ${currency}</div>`;
        });

        if (significantBalances.length > 3) {
            balanceHtml += `<div>+${significantBalances.length - 3} more</div>`;
        }

        balanceHtml += '</div>';
        balanceDisplay.innerHTML = balanceHtml;
    } catch (error) {
        balanceDisplay.innerHTML = '<span class="text-danger">Error loading balances</span>';
    }
}

function updateFirstOrderPrice() {
    const direction = document.getElementById('direction').value;
    const priceInput = document.getElementById('price');
    const currentPrice = parseFloat(document.getElementById('currentPrice').textContent.replace('$', ''));
    const pair = document.getElementById('asset').value;
    const pairInfo = window.getPairInfo(pair);
    const priceDecimals = pairInfo.priceDecimals;

    if (direction === 'buy') {
        const offset = 1 - (document.getElementById('priceOffset').value / 100);
        priceInput.value = (currentPrice * offset).toFixed(priceDecimals); // Below current price
    } else {
        const offset = 1 + (document.getElementById('priceOffset').value / 100);
        priceInput.value = (currentPrice * offset).toFixed(priceDecimals); // Above current price
    }
    calculateOrders();
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Form input event listeners
    document.querySelectorAll('#orderForm input, #orderForm select').forEach(element => {
        element.addEventListener('change', calculateOrders);
    });

    // Initialize asset options
    populateAssetOptions();

    // Start balance updates
    updateBalances();
    balanceUpdateInterval = setInterval(updateBalances, 60000); // Update every minute

    // Start price updates
    startPriceUpdates(document.getElementById('asset').value);

    // Handle tab changes
    document.getElementById('open-tab').addEventListener('click', fetchOpenOrders);
    document.getElementById('refreshOrders').addEventListener('click', fetchOpenOrders);
    document.getElementById('cancelAll').addEventListener('click', cancelAllOrders);

    // Button event listeners
    document.getElementById('createButton').addEventListener('click', async () => {
        const formData = {
            asset: document.getElementById('asset').value,
            price: document.getElementById('price').value,
            direction: document.getElementById('direction').value,
            numOrders: document.getElementById('numOrders').value,
            distance: document.getElementById('distance').value,
            volume_distance: document.getElementById('volume_distance').value,
            total: document.getElementById('total').value
        };

        try {
            const response = await fetch('/api/batch-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            if (result.error && result.error.length > 0) {
                document.getElementById('result').innerHTML = `<div class="alert alert-danger">${result.error.join(', ')}</div>`;
            } else {                
                const orderDetails = document.getElementById('orderDetails');
                const orderList = document.getElementById('orderList');
                orderList.innerHTML = result.result.orders.map(order => 
                    order.error ? `<div class="text-danger">${order.error}</div>` :
                    `<div>${order.descr.order}</div>`
                ).join('');
                orderDetails.style.display = 'block';
            }
        } catch (error) {
            document.getElementById('result').innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    });
});
