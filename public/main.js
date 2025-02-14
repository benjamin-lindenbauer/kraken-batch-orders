// Functions
function calculateOrders() {
    const price = parseFloat(document.getElementById('start_price').value);
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
            <td><strong>$${totalValue.toFixed(2)} Total $</strong></td>
        </tr>
    `;

    // Calculate liquidation price
    const totalBalance = parseFloat(document.getElementById('totalBalance').textContent.replace(/[^0-9.-]/g, ''));
    const liquidationPrice = totalCoins > 0 
      ? ((totalValue - totalBalance) / totalCoins).toFixed(priceDecimals)
      : 'N/A';

    tableHtml += `
        <tr>
            <td colspan="4" class="text-center">
                Liquidation Price: $${liquidationPrice}
            </td>
        </tr>
    `;

    tableHtml = `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Price</th>
                    <th>Order Volume</th>
                    <th>Order Volume $</th>
                </tr>
            </thead>
            <tbody>
    ` + tableHtml + '</tbody></table>';
    document.getElementById('previewTable').innerHTML = tableHtml;
}

async function updateStartPrice() {
    const pair = document.getElementById('asset').value;
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

        updateFirstOrderPrice();
    } catch (error) {
        console.error('Error fetching price:', error);
        document.getElementById('currentPrice').textContent = 'Error fetching price';
    }
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

function updateTotalBalance(asset) {
    const pairInfo = getPairInfo(asset);
    if (pairInfo) {
        // Update leverage and total balance
        const totalBalance = parseFloat(document.getElementById('totalBalance').textContent.replace('Total $', ''));
        document.getElementById('leverageText').textContent = `Total $ (${pairInfo.leverage}x leverage)`;
        document.getElementById('total').value = totalBalance * pairInfo.leverage;
    }
}

function populateAssetOptions() {
    const assetSelect = document.getElementById('asset');
    const assets = window.getSupportedAssets();
    
    assetSelect.innerHTML = assets.map(asset => {
        const info = window.getPairInfo(asset);
        return `<option value="${asset}">${info.name} (${asset})</option>`;
    }).join('');
}

async function getTradeBalance() {
    try {
        const response = await fetch('/api/trade-balance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                asset: 'ZUSD'
            })
        });
        
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            console.error('Error fetching trade balance:', data.error);
            return;
        }

        // Get the trade balance and update the total input field
        document.getElementById('totalBalance').textContent = `Total $${parseInt(data.result.eb)}`;
        document.getElementById('total').value = parseInt(data.result.tb) * 5;
    } catch (error) {
        console.error('Error fetching trade balance:', error);
    }
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
        significantBalances.forEach(([currency, amount]) => {
            balanceHtml += `${parseFloat(amount).toFixed(currency === 'XBT' ? 4 : 2)} ${currency}, `;
        });
        //remove the last comma and space
        balanceHtml = balanceHtml.slice(0, -2);
        balanceHtml += '</div>';
        balanceDisplay.innerHTML = balanceHtml;
        
        getTradeBalance();
    } catch (error) {
        balanceDisplay.innerHTML = '<span class="text-danger">Error loading balances</span>';
    }
}

function updateFirstOrderPrice() {
    const direction = document.getElementById('direction').value;
    const priceInput = document.getElementById('start_price');
    const currentPrice = parseFloat(document.getElementById('currentPrice').textContent.replace('$', ''));
    const pair = document.getElementById('asset').value;
    const pairInfo = window.getPairInfo(pair);
    const priceDecimals = pairInfo.priceDecimals;
    //step should be 0.01 if priceDecimals is 2
    priceInput.setAttribute('step', '0.' + '0'.repeat(priceDecimals - 1) + '1');

    if (direction === 'buy') {
        const offset = 1 - (document.getElementById('priceOffset').value / 100);
        priceInput.value = (currentPrice * offset).toFixed(priceDecimals); // Below current price
    } else {
        const offset = 1 + (document.getElementById('priceOffset').value / 100);
        priceInput.value = (currentPrice * offset).toFixed(priceDecimals); // Above current price
    }
    calculateOrders();
}


async function createOrders(event) {
    event.preventDefault();
    const stopLossEnabled = document.getElementById('enableStopLoss').checked;
    const takeProfitEnabled = document.getElementById('enableTakeProfit').checked;
    const formData = {
        asset: document.getElementById('asset').value,
        price: document.getElementById('start_price').value,
        direction: document.getElementById('direction').value,
        numOrders: document.getElementById('numOrders').value,
        distance: document.getElementById('distance').value,
        volume_distance: document.getElementById('volume_distance').value,
        total: document.getElementById('total').value,
        stop_loss: stopLossEnabled ? document.getElementById('stop_loss').value : null,
        take_profit: takeProfitEnabled ? document.getElementById('take_profit').value : null
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
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Form input event listeners
    document.querySelectorAll('#orderForm input, #orderForm select').forEach(element => {
        element.addEventListener('change', calculateOrders);
    });

    // Update button text when number of orders changes
    document.getElementById('numOrders').addEventListener('input', function() {
        const createButton = document.getElementById('createButton');
        createButton.textContent = `Create ${this.value} Orders`;
    });
    // Initialize button text
    document.getElementById('createButton').textContent = `Create ${document.getElementById('numOrders').value} Orders`;

    // Handle tab changes
    document.getElementById('open-tab').addEventListener('click', fetchOpenOrders);
    document.getElementById('refreshOrders').addEventListener('click', fetchOpenOrders);
    document.getElementById('cancelAll').addEventListener('click', cancelAllOrders);

    // Button event listeners
    document.getElementById('createButton').addEventListener('click', createOrders);

    document.getElementById('asset').addEventListener('change', function() {
        updateTotalBalance(this.value);
        updateStartPrice();
    });

    document.getElementById('direction').addEventListener('change', updateFirstOrderPrice);
    document.getElementById('priceOffset').addEventListener('input', updateFirstOrderPrice);

    // Stop Loss and Take Profit checkbox handlers
    document.getElementById('enableStopLoss').addEventListener('change', function() {
        document.getElementById('stop_loss').disabled = !this.checked;
    });

    document.getElementById('enableTakeProfit').addEventListener('change', function() {
        document.getElementById('take_profit').disabled = !this.checked;
    });

    // Initialize asset options
    populateAssetOptions();

    // Start balance updates
    updateBalances().then(() => {
        // Start price updates
        updateStartPrice();
    });
});
