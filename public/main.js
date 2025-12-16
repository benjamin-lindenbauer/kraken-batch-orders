let orders = [];
let openOrdersData = [];
let tradeHistoryData = [];
const openPositionsBody = document.getElementById('openPositionsTable');
const tradeHistoryTableBody = document.getElementById('tradeHistoryTableBody');
const themeToggleButton = document.getElementById('themeToggle');
const THEME_STORAGE_KEY = 'kraken-theme-preference';
const TRADINGVIEW_WIDGET_SRC = 'https://s3.tradingview.com/tv.js';

const currencyMap = {
    'XETH': 'ETH',
    'XLTC': 'LTC',
    'XXBT': 'BTC',
    'XXRP': 'XRP',
    'XZEC': 'ZEC',
    'ZEUR': 'EUR',
    'ZUSD': 'USD'
};

let activeTheme = 'light';
let hasStoredThemePreference = false;
let tradingViewScriptPromise = null;
let tradingViewWidgetInstance = null;

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch (_error) {
    return null;
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_error) {
    // Ignore persistence errors (e.g. private mode)
  }
}

function setToggleState(theme) {
  if (!themeToggleButton) return;
  const isDark = theme === 'dark';
  themeToggleButton.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  themeToggleButton.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  themeToggleButton.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
}

function applyTheme(theme) {
  activeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', activeTheme);
  if (document.body) {
    document.body.classList.toggle('theme-dark', activeTheme === 'dark');
  }
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', activeTheme === 'dark' ? '#0f172a' : '#f5f6fa');
  }
  setToggleState(activeTheme);
  if (document.getElementById('tradingviewWidgetContainer')) {
    const currentPair = getSelectedPair() || 'BTC/USD';
    updateTradingViewWidget(currentPair);
  }
}

function getSelectedPair() {
  const assetSelect = document.getElementById('asset');
  const quoteSelect = document.getElementById('quote');
  const assetValue = assetSelect ? assetSelect.value : '';
  const quoteValue = quoteSelect ? quoteSelect.value : '';

  if (assetValue && quoteValue) return `${assetValue}/${quoteValue}`;
  if (assetValue) return `${assetValue}/USD`;
  if (quoteValue) return `BTC/${quoteValue}`;
  return null;
}

function getDefaultAssetSymbol() {
  const assets = window.ASSETS ? Object.values(window.ASSETS) : [];
  const defaultAsset = assets.find((asset) => asset.default);
  return defaultAsset ? defaultAsset.symbol : assets[0]?.symbol || '';
}

const storedTheme = getStoredTheme();
hasStoredThemePreference = storedTheme !== null;

const prefersDarkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const initialTheme =
  storedTheme ??
  (prefersDarkMedia && typeof prefersDarkMedia.matches === 'boolean' && prefersDarkMedia.matches ? 'dark' : 'light');

applyTheme(initialTheme);

if (prefersDarkMedia) {
  const handleSystemThemeChange = (event) => {
    if (hasStoredThemePreference) return;
    applyTheme(event.matches ? 'dark' : 'light');
  };

  if (typeof prefersDarkMedia.addEventListener === 'function') {
    prefersDarkMedia.addEventListener('change', handleSystemThemeChange);
  } else if (typeof prefersDarkMedia.addListener === 'function') {
    prefersDarkMedia.addListener(handleSystemThemeChange);
  }
}

if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    hasStoredThemePreference = true;
  });
}

function fixCurrencyNames(currency) {
    return currencyMap[currency] || currency;
}

function splitPairSymbols(pair) {
  if (!pair) {
    return { base: '', quote: '' };
  }

  const value = String(pair);

  if (value.includes('/')) {
    const [base = '', quote = ''] = value.split('/');
    return { base, quote };
  }

  const quoteCandidates = [
    'ZUSD',
    'USD',
    'USDT',
    'ZEUR',
    'EUR',
    'ZGBP',
    'GBP',
    'ZCAD',
    'CAD',
    'ZJPY',
    'JPY',
    'ZCHF',
    'CHF',
    'AUD',
    'NZD',
    'USDC',
    'DAI',
    'ETH',
    'XBT',
    'BTC',
  ];

  for (const quote of quoteCandidates) {
    if (value.endsWith(quote) && value.length > quote.length) {
      const base = value.slice(0, value.length - quote.length);
      return { base, quote };
    }
  }

  if (value.length % 2 === 0) {
    const midpoint = value.length / 2;
    return { base: value.slice(0, midpoint), quote: value.slice(midpoint) };
  }

  return { base: value, quote: '' };
}

function formatPairDisplay(pair) {
  const { base, quote } = splitPairSymbols(pair);
  if (base && quote) {
    return `${fixCurrencyNames(base)}/${fixCurrencyNames(quote)}`;
  }
  if (base) {
    return fixCurrencyNames(base);
  }
  return fixCurrencyNames(pair);
}

function renderEmptyRow() {
  if (!openPositionsBody) return
  openPositionsBody.innerHTML = `
    <tr>
      <td colspan="13" class="table-placeholder">No open positions</td>
    </tr>
  `
}

function renderErrorRow(message) {
  if (!openPositionsBody) return
  openPositionsBody.innerHTML = `
    <tr>
      <td colspan="13" class="table-placeholder">Failed to load open positions: ${escapeHtml(message)}</td>
    </tr>
  `
}

function renderLoadingRow() {
  if (!openPositionsBody) return
  openPositionsBody.innerHTML = `
    <tr>
      <td colspan="13" class="table-placeholder">Loading open positions...</td>
    </tr>
  `
}

function renderPositions(positions) {
  if (!openPositionsBody) return
  if (!Array.isArray(positions) || positions.length === 0) {
    renderEmptyRow()
    return
  }

  const rows = positions
    .map((position) => {
      const opened = formatTimestamp(position.openedAt)
      return `
        <tr>
          <td>${escapeHtml(formatPairDisplay(position.pair))}</td>
          <td>${escapeHtml(position.type)}</td>
          <td>${escapeHtml(position.orderType)}</td>
          <td class="numeric">${formatNumeric(position.volume)}</td>
          <td class="numeric">${formatNumeric(position.volumeClosed)}</td>
          <td class="numeric">${formatNumeric(position.cost)}</td>
          <td class="numeric">${formatNumeric(position.margin)}</td>
          <td class="numeric">${position.value !== null ? formatNumeric(position.value) : '--'}</td>
          <td class="numeric">${position.net !== null ? formatNumeric(position.net) : '--'}</td>
          <td>${opened}</td>
          <td>${escapeHtml(position.status)}</td>
        </tr>
      `
    })
    .join('')

  openPositionsBody.innerHTML = rows
}

async function fetchOpenPositions() {
  if (!openPositionsBody) return

  renderLoadingRow()

  try {
    const response = await fetch('/api/open-positions')
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`)
    }

    const payload = await response.json()
    if (payload.error) {
      throw new Error(payload.error)
    }

    renderPositions(payload.positions ?? [])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    renderErrorRow(message)
  }
}

function renderTradeHistoryPlaceholder(message) {
  if (!tradeHistoryTableBody) return
  tradeHistoryTableBody.innerHTML = `
    <tr>
      <td colspan="8" class="table-placeholder">${escapeHtml(message)}</td>
    </tr>
  `
}

function renderTradeHistoryRows(trades) {
  if (!tradeHistoryTableBody) return
  const pairFilter = document.getElementById('tradeHistoryPairFilter')
  const selectedPair = pairFilter ? pairFilter.value : ''
  const sourceTrades = Array.isArray(trades) ? trades : tradeHistoryData
  const filteredTrades = selectedPair
    ? sourceTrades.filter((trade) => trade.pair === selectedPair)
    : sourceTrades

  if (!Array.isArray(filteredTrades) || filteredTrades.length === 0) {
    const message = selectedPair ? 'No trades for this pair' : 'No trades found'
    renderTradeHistoryPlaceholder(message)
    return
  }

  const rows = filteredTrades
    .map((trade) => {
      const time = formatTimestamp(trade.time)
      return `
        <tr>
          <td>${escapeHtml(formatPairDisplay(trade.pair))}</td>
          <td>${time}</td>
          <td>${escapeHtml(trade.type)}</td>
          <td>${escapeHtml(trade.ordertype)}</td>
          <td class="numeric">${formatNumeric(trade.price)}</td>
          <td class="numeric">${formatNumeric(trade.cost)}</td>
          <td class="numeric">${formatNumeric(trade.fee)}</td>
          <td class="numeric">${formatNumeric(trade.vol)}</td>
        </tr>
      `
    })
    .join('')

  tradeHistoryTableBody.innerHTML = rows
}

async function fetchTradeHistory() {
  if (!tradeHistoryTableBody) return

  renderTradeHistoryPlaceholder('Loading trade history...')

  const pairFilter = document.getElementById('tradeHistoryPairFilter')
  if (pairFilter) {
    pairFilter.disabled = true
  }

  try {
    const response = await fetch('/api/trades-history')
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`)
    }

    const payload = await response.json()
    if (payload.error) {
      const errorMessage = Array.isArray(payload.error) ? payload.error.join(', ') : payload.error
      throw new Error(errorMessage)
    }

    tradeHistoryData = payload.trades ?? []
    const pairs = tradeHistoryData.map((trade) => trade.pair)
    updateTradeHistoryPairFilterOptions(pairs)
    renderTradeHistoryRows(tradeHistoryData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    renderTradeHistoryPlaceholder(`Failed to load trade history: ${message}`)
    tradeHistoryData = []
    updateTradeHistoryPairFilterOptions([])
  }
}

function updateTradeHistoryPairFilterOptions(pairs) {
  const pairFilter = document.getElementById('tradeHistoryPairFilter')
  if (!pairFilter) return

  const uniquePairs = Array.from(new Set(pairs)).sort((a, b) => a.localeCompare(b))
  const previousValue = pairFilter.value
  const options = ['<option value="">All pairs</option>']

  uniquePairs.forEach((pair) => {
    options.push(`<option value="${pair}">${formatPairDisplay(pair)}</option>`)
  })

  pairFilter.innerHTML = options.join('')

  if (uniquePairs.includes(previousValue)) {
    pairFilter.value = previousValue
  } else {
    pairFilter.value = ''
  }

  pairFilter.disabled = uniquePairs.length === 0
}

function formatNumeric(value) {
  const number = Number(value)
  if (Number.isNaN(number)) return escapeHtml(String(value ?? '--'))
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
}

function formatTimestamp(value) {
  if (!value) return '--'
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '--'
  const date = new Date(numeric * 1000)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function copyOrderId(orderId) {
    if (!orderId) return;

    const writePromise = navigator.clipboard?.writeText?.(orderId);
    if (writePromise && typeof writePromise.then === 'function') {
        writePromise.catch(err => {
            console.error('Failed to copy order ID via Clipboard API:', err);
            fallbackCopyOrderId(orderId);
        });
    } else {
        fallbackCopyOrderId(orderId);
    }
}

function fallbackCopyOrderId(orderId) {
    const textarea = document.createElement('textarea');
    textarea.value = orderId;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('Fallback copy failed:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

function formatOpenTime(opentm) {
    if (opentm === undefined || opentm === null) return '-';
    const timestamp = Number(opentm) * 1000;
    if (Number.isNaN(timestamp)) return '-';
    return new Date(timestamp).toLocaleString();
}

function updatePairFilterOptions(pairs) {
    const pairFilter = document.getElementById('openOrdersPairFilter');
    if (!pairFilter) return;

    const uniquePairs = Array.from(new Set(pairs)).sort((a, b) => a.localeCompare(b));
    const previousValue = pairFilter.value;
    const options = ['<option value="">All pairs</option>'];

    uniquePairs.forEach(pair => {
        options.push(`<option value="${pair}">${pair}</option>`);
    });

    pairFilter.innerHTML = options.join('');

    if (uniquePairs.includes(previousValue)) {
        pairFilter.value = previousValue;
    } else {
        pairFilter.value = '';
    }

    pairFilter.disabled = uniquePairs.length === 0;
}

function renderOpenOrdersTable({ customMessage, messageClass } = {}) {
    const tbody = document.getElementById('openOrdersTable');
    if (!tbody) return;

    const orderCountSpan = document.getElementById('openOrdersCount');
    const pairFilter = document.getElementById('openOrdersPairFilter');
    const selectedPair = pairFilter ? pairFilter.value : '';
    const filteredData = selectedPair
        ? openOrdersData.filter(([, order]) => order.descr.pair === selectedPair)
        : openOrdersData.slice();

    if (orderCountSpan) {
        if (customMessage) {
            orderCountSpan.textContent = '0 ';
        } else if (selectedPair && selectedPair !== '' && filteredData.length !== openOrdersData.length) {
            orderCountSpan.textContent = `${filteredData.length} (${openOrdersData.length} total) `;
        } else {
            orderCountSpan.textContent = `${filteredData.length} `;
        }
    }

    if (customMessage) {
        const classes = ['text-center'];
        if (messageClass) classes.push(messageClass);
        tbody.innerHTML = `<tr><td colspan="10" class="${classes.join(' ')}">${customMessage}</td></tr>`;
        return;
    }

    if (filteredData.length === 0) {
        const emptyMessage = selectedPair ? 'No open orders for this pair' : 'No open orders';
        tbody.innerHTML = `<tr><td colspan="10" class="text-center">${emptyMessage}</td></tr>`;
        return;
    }

    const ordersByPair = {};
    filteredData.forEach(([orderId, order]) => {
        const pair = order.descr.pair;
        const price = parseFloat(order.descr.price);
        const volume = parseFloat(order.vol);
        if (!ordersByPair[pair]) {
            ordersByPair[pair] = {
                orderIds: [],
                totalVolume: 0,
                totalValue: 0,
            };
        }
        ordersByPair[pair].orderIds.push(orderId);
        if (Number.isFinite(volume)) {
            ordersByPair[pair].totalVolume += volume;
            if (Number.isFinite(price)) {
                ordersByPair[pair].totalValue += price * volume;
            }
        }
    });

    const rows = [];
    filteredData.forEach(([orderId, order]) => {
        const pair = order.descr.pair;
        const pairData = ordersByPair[pair];
        const pairOrders = pairData.orderIds;
        const isLastOfPair = pairOrders[pairOrders.length - 1] === orderId;
        const orderType = order.descr.ordertype || '-';
        const price = parseFloat(order.descr.price);
        const volume = parseFloat(order.vol);
        const totalValue = Number.isFinite(price) && Number.isFinite(volume)
            ? `${(price * volume).toFixed(2)}`
            : '-';
        const openTime = formatOpenTime(order.opentm);

        rows.push(`
            <tr id="order-${orderId}">
                <td>
                    <button type="button" class="btn btn-link p-0 order-id-button" data-order-id="${orderId}" title="Copy order ID">
                        ${orderId}
                    </button>
                </td>
                <td>${pair}</td>
                <td><span class="order-type-${order.descr.type.toLowerCase()}">${order.descr.type}</span></td>
                <td>${orderType}</td>
                <td>${order.descr.leverage}</td>
                <td class="order-price-cell">${order.descr.price}</td>
                <td class="order-volume-cell">${order.vol}</td>
                <td>${totalValue}</td>
                <td>${openTime}</td>
                <td>
                    <button type="button" class="btn btn-outline-secondary btn-sm ms-1 edit-order-button" onclick="enableOrderEdit('${orderId}')">
                        Edit
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-sm cancel-order-button" onclick="cancelOrder('${orderId}', document.getElementById('order-${orderId}'))">
                        Cancel
                    </button>
                </td>
            </tr>
        `);

        if (isLastOfPair) {
            rows.push(`
                <tr class="table-secondary pair-summary-row">
                    <td colspan="2" class="fw-semibold">${pair} summary</td>
                    <td colspan="2">Orders: ${pairOrders.length}</td>
                    <td colspan="3">Total volume: ${formatNumeric(pairData.totalVolume.toFixed(4))}</td>
                    <td colspan="2">Total value: ${formatNumeric(pairData.totalValue.toFixed(2))}</td>
                    <td class="text-end">
                        <button type="button" class="btn btn-outline-danger btn-sm cancel-all-pair" data-pair="${pair}" data-order-ids='${JSON.stringify(pairOrders)}'>
                            Cancel All ${pair}
                        </button>
                    </td>
                </tr>
            `);
        }
    });

    tbody.innerHTML = rows.join('');

    tbody.querySelectorAll('.cancel-all-pair').forEach(button => {
        button.addEventListener('click', function() {
            const pair = this.getAttribute('data-pair');
            const orderIds = JSON.parse(this.getAttribute('data-order-ids'));
            cancelAllOfPair(pair, orderIds);
        });
    });

    tbody.querySelectorAll('.order-id-button').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-order-id');
            copyOrderId(id);
            this.blur();
        });
    });
}

function calculateOrders() {
    const price = parseFloat(document.getElementById('start_price').value);
    const numOrders = parseInt(document.getElementById('numOrders').value);
    const distance = parseFloat(document.getElementById('distance').value);
    const stopLoss = parseFloat(document.getElementById('stop_loss').value);
    const takeProfit = parseFloat(document.getElementById('take_profit').value);
    const volumeDistance = parseFloat(document.getElementById('volume_distance').value);
    const currentPrice = parseFloat(document.getElementById('currentPrice').textContent);
    const totalBalance = parseFloat(document.getElementById('totalBalance').textContent.replace(/[^0-9.-]/g, ''));
    const direction = document.getElementById('direction').value;
    const total = parseFloat(document.getElementById('totalValue').value);
    const pair = getSelectedPair() || 'BTC/USD';
    const leverage = document.getElementById('leverage').value;

    if (!price || !numOrders || !distance || !volumeDistance || !total) {
        document.getElementById('previewTable').innerHTML = '<p>Please fill in all fields</p>';
        return;
    }
    
    // Calculate the sum of the geometric progression factors for volume
    let sumFactors = 0;
    for (let i = 0; i < numOrders; i++) {
        sumFactors += Math.pow(1 + volumeDistance / 100, i);
    }
    
    // Calculate the base price that will result in the desired total
    const basePrice = total / sumFactors;

    orders = [];

    for (let i = 0; i < numOrders; i++) {
        const orderPrice = direction === 'buy'
            ? price / Math.pow(1 + distance / 100, i)
            : price * Math.pow(1 + distance / 100, i);
        // Calculate this order's portion using geometric progression with volume_distance
        const pricePerOrder = basePrice * Math.pow(1 + volumeDistance / 100, i);
        const volume = pricePerOrder / orderPrice;
        const totalUsd = orderPrice * volume;
        const distanceToCurrent = (orderPrice - currentPrice) / currentPrice * 100;
        const stopLossPrice = direction === 'buy' ? orderPrice * (1 - stopLoss / 100) : orderPrice * (1 + stopLoss / 100);
        const takeProfitPrice = direction === 'buy' ? orderPrice * (1 + takeProfit / 100) : orderPrice * (1 - takeProfit / 100);
        
        orders.push({
            orderPrice: orderPrice,
            volume: volume,
            total: totalUsd,
            distanceToCurrent: distanceToCurrent,
            stopLossPrice: stopLossPrice,
            takeProfitPrice: takeProfitPrice
        });
    }

    const pairInfo = window.getPairInfo(pair) || { priceDecimals: 2 };
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
    const [baseAsset = '', quoteAssetRaw = 'USD'] = pair.split('/');
    const quoteAsset = quoteAssetRaw.replace('USD', '$').replace('EUR', '€');

    orders.forEach((order, index) => {
        totalValue += order.total;
        totalCoins += order.volume;
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${order.orderPrice.toFixed(priceDecimals)}</td>
                <td>${order.volume.toFixed(6)} ${baseAsset}</td>
                <td>${order.total.toFixed(2)}</td>
                <td>${order.distanceToCurrent.toFixed(2)}%</td>
                <td>${order.stopLossPrice.toFixed(priceDecimals)}</td>
                <td>${order.takeProfitPrice.toFixed(priceDecimals)}</td>
            </tr>
        `;
    });

    // Calculate liquidation price
    const liquidationPrice = totalValue > totalBalance 
        ? ((direction === 'buy' 
            ? (totalValue - totalBalance) 
            : (totalValue + totalBalance)) / totalCoins).toFixed(priceDecimals)
        : '-';

    const formattedLiquidationPrice = liquidationPrice === '-' ? '-' : `${liquidationPrice}`;

    // Calculate leverage used
    const leverageUsed = leverage !== 'spot' && totalValue > 0 && totalBalance > 0 ? (totalValue / totalBalance).toFixed(2) : '-';

    // Add summary row
    tableHtml += `
        <tr>
            <td><strong></strong></td>
            <td><strong>${(totalValue / totalCoins).toFixed(priceDecimals)} Average price</strong></td>
            <td><strong>${totalCoins.toFixed(6)} Total ${baseAsset}</strong></td>
            <td><strong>${totalValue.toFixed(2)} Total ${quoteAsset}</strong></td>
            <td><strong>${totalRange.toFixed(2)}% Total range</strong></td>
            <td><strong>Leverage: ${leverageUsed}</strong></td>
            <td><strong>Liquidation: ${formattedLiquidationPrice}</strong></td>
        </tr>
    `;
    
    tableHtml = `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Price ${quoteAsset}</th>
                    <th>Order Value ${baseAsset}</th>
                    <th>Order Value ${quoteAsset}</th>
                    <th>Distance to Current Price</th>
                    <th>Stop Loss ${quoteAsset}</th>
                    <th>Take Profit ${quoteAsset}</th>
                </tr>
            </thead>
            <tbody>
    ` + tableHtml + '</tbody></table>';
    document.getElementById('previewTable').innerHTML = tableHtml;
}

async function updateStartPrice() {
    const pair = getSelectedPair() || 'BTC/USD';
    try {
        const krakenPair = pair.replace('/', '');
        const response = await fetch(`/api/ticker/${krakenPair}`);
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            throw new Error(`Error fetching price: ${data.error}`);
        }
        
        const result = data.result[Object.keys(data.result)[0]];
        const lastPrice = parseFloat(result.c[0]);
        document.getElementById('currentPrice').textContent = lastPrice;

        updateFirstOrderPrice();
    } catch (error) {
        console.error('Error fetching price:', error);
        document.getElementById('currentPrice').textContent = 'Error fetching price';
        calculateOrders();
    }
}

function formatTradingViewSymbol(pair) {
    if (!pair) return 'KRAKEN:BTCUSD';
    return `KRAKEN:${pair.replace('/', '')}`;
}

function loadTradingViewScript() {
    if (window.TradingView && typeof window.TradingView.widget === 'function') {
        return Promise.resolve();
    }

    if (tradingViewScriptPromise) {
        return tradingViewScriptPromise;
    }

    tradingViewScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = TRADINGVIEW_WIDGET_SRC;
        script.async = true;
        script.onload = () => {
            if (window.TradingView && typeof window.TradingView.widget === 'function') {
                resolve();
            } else {
                tradingViewScriptPromise = null;
                reject(new Error('TradingView widget library unavailable after load'));
            }
        };
        script.onerror = () => {
            tradingViewScriptPromise = null;
            reject(new Error('Failed to load TradingView widget script'));
        };

        const targetNode = document.body || document.head || document.documentElement;
        targetNode.appendChild(script);
    });

    return tradingViewScriptPromise;
}

function updateTradingViewAttribution(pair) {
    const label = document.getElementById('chartPairLabel');
    const link = document.getElementById('tradingviewWidgetLink');
    const info = typeof getPairInfo === 'function' ? getPairInfo(pair) : null;
    const pairText = pair || 'BTC/USD';
    if (label) {
        label.textContent = info ? `${info.name} (${pairText})` : pairText;
    }

    if (link) {
        const sanitized = pairText.replace('/', '');
        link.href = `https://www.tradingview.com/symbols/${sanitized}/?exchange=KRAKEN`;
        const linkText = info ? `${info.name} price` : `${pairText} price`;
        const textSpan = link.querySelector('.blue-text');
        if (textSpan) {
            textSpan.textContent = linkText;
        } else {
            link.textContent = linkText;
        }
    }
}

async function updateTradingViewWidget(pair) {
    const container = document.getElementById('tradingviewWidgetContainer');
    const widgetContainer = document.getElementById('tradingviewWidget');
    if (!container || !widgetContainer) return;

    try {
        await loadTradingViewScript();
    } catch (error) {
        console.error('Unable to load TradingView widget script', error);
        return;
    }

    if (tradingViewWidgetInstance && typeof tradingViewWidgetInstance.remove === 'function') {
        tradingViewWidgetInstance.remove();
    }
    tradingViewWidgetInstance = null;

    widgetContainer.innerHTML = '';

    const isDarkTheme = activeTheme === 'dark';
    const config = {
        container_id: widgetContainer.id,
        allow_symbol_change: true,
        autosize: true,
        calendar: false,
        compareSymbols: [],
        details: false,
        hide_legend: false,
        hide_side_toolbar: true,
        hide_top_toolbar: false,
        hide_volume: false,
        hotlist: false,
        interval: 'D',
        locale: 'en',
        save_image: true,
        style: '1',
        studies: [],
        symbol: formatTradingViewSymbol(pair),
        theme: isDarkTheme ? 'dark' : 'light',
        timezone: 'Etc/UTC',
        backgroundColor: isDarkTheme ? '#0f172a' : '#ffffff',
        gridColor: isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(46, 46, 46, 0.06)',
        watchlist: [],
        withdateranges: false,
    };

    try {
        tradingViewWidgetInstance = new window.TradingView.widget(config);
    } catch (error) {
        console.error('Failed to initialize TradingView widget', error);
        return;
    }

    updateTradingViewAttribution(pair);
}

async function fetchOpenOrders() {
    const tbody = document.getElementById('openOrdersTable');
    const errorDiv = document.getElementById('orderError');
    const orderCountSpan = document.getElementById('openOrdersCount');
    errorDiv.classList.add('is-hidden');
    
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">Loading orders...</td></tr>';
    const pairFilter = document.getElementById('openOrdersPairFilter');
    if (pairFilter) pairFilter.disabled = true;
    if (orderCountSpan) orderCountSpan.textContent = '';
    
    try {
        const response = await fetch('/api/open-orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            openOrdersData = [];
            updatePairFilterOptions([]);
            renderOpenOrdersTable({ customMessage: result.error.join(', '), messageClass: 'text-danger' });
            return;
        }

        const openOrders = result.result.open || {};
        const sortedOrders = Object.entries(openOrders)
            .sort(([, a], [, b]) => {
                if (a.descr.pair !== b.descr.pair) {
                    return a.descr.pair.localeCompare(b.descr.pair);
                }
                return parseFloat(b.descr.price) - parseFloat(a.descr.price);
            });

        openOrdersData = sortedOrders;
        const pairList = sortedOrders.map(([, order]) => order.descr.pair);
        updatePairFilterOptions(pairList);
        renderOpenOrdersTable();
    } catch (error) {
        openOrdersData = [];
        updatePairFilterOptions([]);
        renderOpenOrdersTable({ customMessage: `Error loading orders: ${error.message}`, messageClass: 'text-danger' });
    }
}

async function cancelOrder(txid, rowElement) {
    const errorDiv = document.getElementById('orderError');
    errorDiv.classList.add('is-hidden');

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
            errorDiv.classList.remove('is-hidden');
            return;
        }

        if (rowElement && typeof rowElement.remove === 'function') {
            rowElement.remove();
        }
        openOrdersData = openOrdersData.filter(([id]) => id !== txid);
        const pairList = openOrdersData.map(([, order]) => order.descr.pair);
        updatePairFilterOptions(pairList);
        renderOpenOrdersTable();
    } catch (error) {
        errorDiv.textContent = 'Error canceling order: ' + error.message;
        errorDiv.classList.remove('is-hidden');
    }
}

function removeCancelEditButton(row) {
    const cancelButton = row.querySelector('.cancel-edit-button');
    if (cancelButton && cancelButton.parentElement) {
        cancelButton.parentElement.removeChild(cancelButton);
    }
}

function cancelOrderEdit(orderId) {
    const row = document.getElementById(`order-${orderId}`);
    if (!row) {
        return;
    }

    const match = openOrdersData.find(([id]) => id === orderId);
    if (!match) {
        return;
    }

    const [, order] = match;
    const priceCell = row.querySelector('.order-price-cell');
    const volumeCell = row.querySelector('.order-volume-cell');
    const totalValueCell = volumeCell ? volumeCell.nextElementSibling : null;

    if (priceCell) {
        priceCell.textContent = order?.descr?.price ?? '';
    }

    if (volumeCell) {
        volumeCell.textContent = order?.vol ?? '';
    }

    if (totalValueCell) {
        const priceValue = Number(order?.descr?.price);
        const volumeValue = Number(order?.vol);
        if (Number.isFinite(priceValue) && Number.isFinite(volumeValue)) {
            totalValueCell.textContent = (priceValue * volumeValue).toFixed(2);
        } else {
            totalValueCell.textContent = '-';
        }
    }

    delete row.dataset.editing;

    const submitButton = row.querySelector('.edit-order-button');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Edit';
        submitButton.classList.add('btn-outline-secondary');
        submitButton.classList.remove('btn-outline-primary');
        submitButton.onclick = function () {
            enableOrderEdit(orderId);
        };
    }

    removeCancelEditButton(row);

    const cancelOrderButton = row.querySelector('.cancel-order-button');
    if (cancelOrderButton) {
        cancelOrderButton.classList.remove('d-none');
    }
}

function enableOrderEdit(orderId) {
    const row = document.getElementById(`order-${orderId}`);
    if (!row || row.dataset.editing === 'true') {
        return;
    }

    const match = openOrdersData.find(([id]) => id === orderId);
    if (!match) {
        return;
    }

    const [, order] = match;
    const priceCell = row.querySelector('.order-price-cell');
    const volumeCell = row.querySelector('.order-volume-cell');
    if (!priceCell || !volumeCell) {
        return;
    }

    const priceValue = order?.descr?.price ?? '';
    const volumeValue = order?.vol ?? '';

    priceCell.innerHTML = `
        <input type="text" class="form-control form-control-sm order-price-input" value="${escapeHtml(String(priceValue))}" />
    `;
    volumeCell.innerHTML = `
        <input type="number" class="form-control form-control-sm order-volume-input" step="any" min="0" value="${escapeHtml(String(volumeValue))}" />
    `;

    row.dataset.editing = 'true';

    const editButton = row.querySelector('.edit-order-button');
    if (editButton) {
        editButton.textContent = 'Submit';
        editButton.classList.remove('btn-outline-secondary');
        editButton.classList.add('btn-outline-primary');
        editButton.onclick = function () {
            submitOrderEdit(orderId);
        };

        let cancelEditButton = row.querySelector('.cancel-edit-button');
        if (!cancelEditButton) {
            cancelEditButton = document.createElement('button');
            cancelEditButton.type = 'button';
            cancelEditButton.className = 'btn btn-outline-secondary btn-sm ms-1 cancel-edit-button';
            cancelEditButton.textContent = 'Cancel';
            editButton.parentElement?.insertBefore(cancelEditButton, editButton.nextSibling);
        }

        if (cancelEditButton) {
            cancelEditButton.onclick = function () {
                cancelOrderEdit(orderId);
            };
        }
    }

    const cancelOrderButton = row.querySelector('.cancel-order-button');
    if (cancelOrderButton) {
        cancelOrderButton.classList.add('d-none');
    }

    const priceInput = row.querySelector('.order-price-input');
    if (priceInput) {
        priceInput.focus();
        priceInput.select();
    }
}

async function submitOrderEdit(orderId) {
    const row = document.getElementById(`order-${orderId}`);
    if (!row) {
        return;
    }

    const priceInput = row.querySelector('.order-price-input');
    const volumeInput = row.querySelector('.order-volume-input');
    const errorDiv = document.getElementById('orderError');

    if (!priceInput || !volumeInput) {
        return;
    }

    const price = priceInput.value.trim();
    const volume = volumeInput.value.trim();

    const priceNumber = Number(price);
    const volumeNumber = Number(volume);
    const priceIsRelative = /^[+-]\d+(?:\.\d+)?%?$/.test(price);
    const priceIsValidNumber = Number.isFinite(priceNumber) && priceNumber > 0;

    if (!price || !volume || (!priceIsValidNumber && !priceIsRelative) || !Number.isFinite(volumeNumber) || volumeNumber <= 0) {
        if (errorDiv) {
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.textContent = 'Please provide a valid price (number or +/- offset) and a positive volume to amend the order.';
            errorDiv.classList.remove('is-hidden');
        }
        return;
    }

    const submitButton = row.querySelector('.edit-order-button');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
    }

    try {
        const response = await fetch('/api/amend-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                txid: orderId,
                price,
                volume
            })
        });

        const result = await response.json();

        if (!response.ok || (Array.isArray(result.error) && result.error.length > 0)) {
            const errorMessage = Array.isArray(result.error) && result.error.length > 0
                ? result.error.join(', ')
                : (result.error || `Server responded with status ${response.status}`);
            throw new Error(errorMessage);
        }

        const priceCell = row.querySelector('.order-price-cell');
        const volumeCell = row.querySelector('.order-volume-cell');
        const totalValueCell = volumeCell ? volumeCell.nextElementSibling : null;

        if (priceCell) {
            priceCell.textContent = price;
        }

        if (volumeCell) {
            volumeCell.textContent = volume;
        }

        if (totalValueCell) {
            const priceValue = Number(price);
            const volumeValue = Number(volume);
            if (Number.isFinite(priceValue) && Number.isFinite(volumeValue)) {
                totalValueCell.textContent = (priceValue * volumeValue).toFixed(2);
            } else {
                totalValueCell.textContent = '-';
            }
        }

        const orderIndex = openOrdersData.findIndex(([id]) => id === orderId);
        if (orderIndex !== -1) {
            const [, existingOrder] = openOrdersData[orderIndex];
            const updatedOrder = {
                ...existingOrder,
                vol: volume,
                descr: {
                    ...existingOrder.descr,
                    price
                }
            };
            openOrdersData[orderIndex] = [orderId, updatedOrder];
        }

        delete row.dataset.editing;
        removeCancelEditButton(row);
        const cancelOrderButton = row.querySelector('.cancel-order-button');
        if (cancelOrderButton) {
            cancelOrderButton.classList.remove('d-none');
        }

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Edit';
            submitButton.classList.add('btn-outline-secondary');
            submitButton.classList.remove('btn-outline-primary');
            submitButton.onclick = function () {
                enableOrderEdit(orderId);
            };
        }

        if (errorDiv) {
            errorDiv.className = 'alert alert-success mt-3';
            errorDiv.textContent = 'Order updated successfully.';
            errorDiv.classList.remove('is-hidden');
        }
    } catch (error) {
        if (errorDiv) {
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.textContent = 'Error amending order: ' + (error instanceof Error ? error.message : String(error));
            errorDiv.classList.remove('is-hidden');
        }

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit';
        }
        return;
    }
}

async function cancelAllOrders() {
    const errorDiv = document.getElementById('orderError');
    errorDiv.classList.add('is-hidden');

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
            errorDiv.classList.remove('is-hidden');
            return;
        }

        errorDiv.className = 'alert alert-success mt-3';
        errorDiv.textContent = `Successfully canceled ${result.count} orders${result.pending ? ' (pending)' : ''}`;
        errorDiv.classList.remove('is-hidden');

        if (!result.pending) {
            openOrdersData = [];
            updatePairFilterOptions([]);
            renderOpenOrdersTable();
        } else {
            const cancelButtons = document.querySelectorAll('#openOrdersTable button.btn-outline-danger');
            cancelButtons.forEach(btn => {
                btn.disabled = true;
                btn.textContent = 'Canceling...';
            });
        }
    } catch (error) {
        errorDiv.className = 'alert alert-danger mt-3';
        errorDiv.textContent = 'Error canceling all orders: ' + error.message;
        errorDiv.classList.remove('is-hidden');
    }
}

async function cancelAllOfPair(pair, orderIds) {
    const errorDiv = document.getElementById('orderError');
    errorDiv.classList.add('is-hidden');
    
    try {
        const isSingleOrder = Array.isArray(orderIds) && orderIds.length === 1;
        const endpoint = isSingleOrder ? '/api/cancel-order' : '/api/cancel-all-of-pair';
        const payload = isSingleOrder ? { txid: orderIds[0] } : { orderIds };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.error && result.error.length > 0) {
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.textContent = `Error canceling ${pair} orders: ` + result.error.join(', ');
            errorDiv.classList.remove('is-hidden');
            return;
        }

        errorDiv.className = 'alert alert-success mt-3';
        const canceledCount = result.count || orderIds.length;
        errorDiv.textContent = `Successfully canceled ${canceledCount} ${pair} order${canceledCount === 1 ? '' : 's'}`;
        errorDiv.classList.remove('is-hidden');

        openOrdersData = openOrdersData.filter(([id]) => !orderIds.includes(id));
        const pairList = openOrdersData.map(([, order]) => order.descr.pair);
        updatePairFilterOptions(pairList);
        renderOpenOrdersTable();
    } catch (error) {
        errorDiv.className = 'alert alert-danger mt-3';
        errorDiv.textContent = `Error canceling ${pair} orders: ` + error.message;
        errorDiv.classList.remove('is-hidden');
    }
}

function updateTotalVolume(pair, newLeverage) {
    const currentPair = pair || getSelectedPair();
    const pairInfo = currentPair ? getPairInfo(currentPair) : null;
    if (pairInfo) {
        const totalBalance = parseFloat(document.getElementById('totalBalance').textContent.replace('Total $', ''));
        const leverage = parseInt(newLeverage || document.getElementById('leverage').value);
        document.getElementById('totalValue').value = totalBalance * (leverage || 1);
        calculateOrders();
    }
}

function populateAssetOptions() {
    const assetSelect = document.getElementById('asset');
    if (!assetSelect || !window.ASSETS) return;

    const assets = Object.values(window.ASSETS);
    assetSelect.innerHTML = assets.map(asset => {
        return `<option value="${asset.symbol}">${asset.name} (${asset.symbol})</option>`;
    }).join('');

    const defaultAssetSymbol = getDefaultAssetSymbol();
    if (defaultAssetSymbol) {
        assetSelect.value = defaultAssetSymbol;
    }
}

function populateQuoteOptions() {
    const quoteSelect = document.getElementById('quote');
    if (!quoteSelect || !window.QUOTE_CURRENCIES) return;

    quoteSelect.innerHTML = window.QUOTE_CURRENCIES.map(quote => `<option value="${quote}">${quote}</option>`).join('');
    if (window.QUOTE_CURRENCIES.length > 0) {
        quoteSelect.value = window.QUOTE_CURRENCIES[0];
    }
}

function setLeverageForCurrentPair() {
    const pair = getSelectedPair();
    const pairInfo = pair ? window.getPairInfo(pair) : null;
    if (pairInfo) {
        document.getElementById('leverage').value = pairInfo.leverage;
    }
}

function handlePairChange() {
    const pair = getSelectedPair() || 'BTC/USD';
    const pairInfo = getPairInfo(pair);
    const maxLeverage = pairInfo ? parseInt(pairInfo.leverage) : 10;
    const leverageSelect = document.getElementById('leverage');
    const currentLeverage = leverageSelect ? (leverageSelect.value === 'spot' ? 1 : (parseInt(leverageSelect.value) || 1)) : 1;
    if (leverageSelect) {
        Array.from(leverageSelect.options).forEach(option => {
            const optionLeverage = parseInt(option.value);
            if (Number.isNaN(optionLeverage)) {
                option.disabled = false;
                return;
            }
            option.disabled = optionLeverage > maxLeverage;
        });
    }
    if (leverageSelect && maxLeverage < currentLeverage) leverageSelect.value = maxLeverage;
    updateTotalVolume(pair, Math.min(maxLeverage, currentLeverage));
    updateStartPrice();
    updateTradingViewWidget(pair);
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
        const leverage = parseInt(document.getElementById('leverage').value);
        document.getElementById('totalValue').value = parseInt(data.result.tb) * (leverage || 1);
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
            .filter(([currency, amount]) => parseFloat(amount) > (currency === 'XXBT' ? 0.0001 : 0.01))
            .map(([currency, amount]) => [fixCurrencyNames(currency), amount])
            .sort(([, a], [, b]) => parseFloat(b) - parseFloat(a));

        // Display top 3 balances
        significantBalances.forEach(([currency, amount]) => {
            balanceHtml += `${parseFloat(amount).toFixed(amount > 10 ? 2 : 4)} ${currency}, `;
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
    const currentPrice = parseFloat(document.getElementById('currentPrice').textContent);
    const pair = getSelectedPair() || 'BTC/USD';
    const pairInfo = window.getPairInfo(pair) || { priceDecimals: 2 };
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
    const numOrders = parseInt(document.getElementById('numOrders').value);
    if (numOrders <= 0) {
        document.getElementById('result').innerHTML = `<div class="alert alert-danger">Please enter a valid number of orders.</div>`;
        return;
    }
    const stopLossEnabled = document.getElementById('enableStopLoss').checked;
    const takeProfitEnabled = document.getElementById('enableTakeProfit').checked;
    const pair = getSelectedPair();
    if (!pair) {
        document.getElementById('result').innerHTML = `<div class="alert alert-danger">Please select a trading pair.</div>`;
        return;
    }

    const pairInfo = getPairInfo(pair);
    const maxLeverage = pairInfo ? parseInt(pairInfo.leverage) : 10;
    const selectedLeverageValue = document.getElementById('leverage').value;
    const selectedLeverage = selectedLeverageValue === 'spot' ? 1 : (parseInt(selectedLeverageValue) || 1);
    const leverage = Math.min(maxLeverage, selectedLeverage);

    const formData = {
        asset: pair,
        price: parseFloat(document.getElementById('start_price').value),
        direction: document.getElementById('direction').value,
        numOrders,
        leverage,
        distance: parseFloat(document.getElementById('distance').value),
        volume_distance: parseFloat(document.getElementById('volume_distance').value),
        total: parseFloat(document.getElementById('totalValue').value),
        stop_loss: stopLossEnabled ? parseFloat(document.getElementById('stop_loss').value) : null,
        take_profit: takeProfitEnabled ? parseFloat(document.getElementById('take_profit').value) : null,
        reduce_only: document.getElementById('reduceOnly') ? document.getElementById('reduceOnly').checked : false
    };

    try {
        const req = await fetch(numOrders === 1 ? '/api/add-order' : '/api/batch-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const response = await req.json();
        if (response.error && response.error.length > 0) {
            document.getElementById('result').innerHTML = `<div class="alert alert-danger">${response.error.join(', ')}</div>`;
        } else {                
            const orderDetails = document.getElementById('orderDetails');
            const orderList = document.getElementById('orderList');
            orderList.innerHTML = response.orders ? response.orders.map(order => 
                order.error ? `<div class="text-danger">${order.error}</div>` :
                `<div>${order.descr.order}</div>`
            ).join('') : '';
            orderDetails.classList.remove('is-hidden');
        }
    } catch (error) {
        document.getElementById('result').innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

// Price preview functionality
function calculateAndDisplayLosses(previewPrice, direction) {
    const totalBalance = parseFloat(document.getElementById('totalBalance').textContent.replace(/[^0-9.-]/g, ''));
    const stopLossEnabled = document.getElementById('enableStopLoss').checked;
    let realizedLoss = 0;
    let unrealizedLoss = 0;
    let positionSize = 0;
    let closedPositionSize = 0;
  
    orders.forEach(order => {
      const entryPrice = order.orderPrice;
      const stopLossPrice = order.stopLossPrice;
      const quantity = order.volume;
      
      if (direction === 'buy') {
        if (previewPrice >= entryPrice) {
          // Price above entry - no losses
          return;
        }
        
        if (!stopLossEnabled || previewPrice > stopLossPrice) {
          // Unrealized loss between entry and stop loss
          unrealizedLoss += (entryPrice - previewPrice) * quantity;
          positionSize += quantity;
        } else {
          // Realized loss at stop loss
          realizedLoss += (entryPrice - stopLossPrice) * quantity;
          closedPositionSize += quantity;
        }
      } else { // sell direction
        if (previewPrice <= entryPrice) {
          // Price below entry - no losses
          return;
        }
        
        if (!stopLossEnabled || previewPrice < stopLossPrice) {
          // Unrealized loss between entry and stop loss
          unrealizedLoss += (previewPrice - entryPrice) * quantity;
          positionSize += quantity;
        } else {
          // Realized loss at stop loss
          realizedLoss += (stopLossPrice - entryPrice) * quantity;
          closedPositionSize += quantity;
        }
      }
    });

    if (unrealizedLoss > totalBalance) {
      realizedLoss = totalBalance;
      unrealizedLoss = 0;
      closedPositionSize = positionSize;
      positionSize = 0;
    }
  
    return { realizedLoss, unrealizedLoss, positionSize, closedPositionSize };
};

const formatCurrency = (value, decimals = 2) => {
  if (isNaN(value)) return '-';
  return `$${Math.abs(value).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${value < 0 ? ' (gain)' : ''}`;
};

let volatilityDataLoaded = false;
let volatilityLoading = false;
let currentStatsSort = { column: 'rank', direction: 'asc' };

function getUsdPairs() {
  if (!window.ASSETS) return [];
  return Object.keys(window.ASSETS).map((symbol) => `${symbol}/USD`);
}

function krakenPairName(pair) {
  return pair.replace('/', '');
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '--';
}

function calculateStats(ohlcRows) {
  if (!Array.isArray(ohlcRows) || ohlcRows.length < 2) return null;

  const completedRows = ohlcRows.slice(0, -1);
  if (completedRows.length === 0) return null;

  const firstOpen = Number(completedRows[0]?.[1]);
  const lastClose = Number(completedRows[completedRows.length - 1]?.[4]);

  if (!Number.isFinite(firstOpen) || !Number.isFinite(lastClose)) return null;

  let rangeSum = 0;
  let rangeCount = 0;
  let dollarVolumeSum = 0;

  completedRows.forEach((row) => {
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[6]);

    if (![open, high, low, close].every(Number.isFinite)) return;

    const direction = close >= open ? 'up' : 'down';
    const base = direction === 'up' ? low : high;

    if (!base || !Number.isFinite(base) || base === 0) return;

    const range = (high - low) / base;
    if (Number.isFinite(range)) {
      rangeSum += range;
      rangeCount += 1;
    }

    if (Number.isFinite(close) && Number.isFinite(volume)) {
      dollarVolumeSum += close * volume;
    }
  });

  const averageRange = rangeCount > 0 ? (rangeSum / rangeCount) * 100 : 0;
  const performance = ((lastClose - firstOpen) / firstOpen) * 100;
  const averageDollarVolume = dollarVolumeSum / rangeCount;

  return { volatility: averageRange, performance, averageDollarVolume };
}

function calculateTodayStats(ohlcRows) {
  if (!Array.isArray(ohlcRows) || ohlcRows.length === 0) return null;

  // Get the last item (today's data)
  const todayData = ohlcRows[ohlcRows.length - 1];
  if (!todayData || todayData.length < 5) return null;

  const open = Number(todayData[1]);
  const close = Number(todayData[4]);

  if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null;

  const todayPerformance = ((close - open) / open) * 100;
  return todayPerformance;
}

function calculate7DayStats(ohlcRows) {
  if (!Array.isArray(ohlcRows) || ohlcRows.length < 2) return null;

  // Get last 7 items (or all if less than 7)
  const last7Days = ohlcRows.length >= 8 ? ohlcRows.slice(-8, -1) : ohlcRows.slice(0, -1);
  if (last7Days.length === 0) return null;

  const firstOpen = Number(last7Days[0]?.[1]);
  const lastClose = Number(last7Days[last7Days.length - 1]?.[4]);

  if (!Number.isFinite(firstOpen) || !Number.isFinite(lastClose)) return null;

  const performance7Day = ((lastClose - firstOpen) / firstOpen) * 100;
  return performance7Day;
}

async function fetchOhlcForPair(pair, sinceTimestamp) {
  const interval = 1440; // 1 day
  const query = new URLSearchParams({
    pair: krakenPairName(pair),
    interval: interval.toString(),
    since: sinceTimestamp.toString(),
  });

  const response = await fetch(`/api/ohlc?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch OHLC for ${pair} (status ${response.status})`);
  }

  const payload = await response.json();
  if (payload.error && payload.error.length > 0) {
    throw new Error(payload.error.join(', '));
  }

  const seriesEntry = Object.entries(payload.result || {}).find(([key]) => key !== 'last');
  if (!seriesEntry || !Array.isArray(seriesEntry[1])) {
    throw new Error('No OHLC data returned');
  }

  const metrics = calculateStats(seriesEntry[1]);
  const performance7Day = calculate7DayStats(seriesEntry[1]);
  const performanceToday = calculateTodayStats(seriesEntry[1]);
  return { pair, metrics, performance7Day, performanceToday }; 
}

function updateSortIcons(activeColumn, direction) {
  const headers = document.querySelectorAll('.stats-sortable-header');
  headers.forEach(header => {
    const column = header.getAttribute('data-column');
    const icon = header.querySelector('.sort-icon');
    if (!icon) return;
    
    if (column === activeColumn) {
      icon.className = `sort-icon bi bi-arrow-${direction === 'asc' ? 'up' : 'down'}-short`;
    } else {
      icon.className = 'sort-icon bi bi-arrow-down-short text-muted';
    }
  });
}

function handleStatsSort(column) {
  // Toggle direction if same column, default to desc for new column
  if (currentStatsSort.column === column) {
    currentStatsSort.direction = currentStatsSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    currentStatsSort.column = column;
    currentStatsSort.direction = column === 'rank' ? 'asc' : 'desc';
  }
  
  // Re-render table with new sort
  const statsTable = document.getElementById('statsTable');
  if (statsTable && statsTable.dataset.results) {
    const results = JSON.parse(statsTable.dataset.results);
    renderStatsTable(results, currentStatsSort.column, currentStatsSort.direction);
  }
}

function renderStatsTable(results, sortColumn = null, sortDirection = 'desc') {
  const tableBody = document.getElementById('statsTableBody');
  const statusElement = document.getElementById('volatilityStatus');
  if (!tableBody) return;

  if (!Array.isArray(results) || results.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No data available</td></tr>';
    if (statusElement) statusElement.textContent = 'No OHLC data available for USD pairs.';
    return;
  }

  const calculateRankingMap = (items, selector) => {
    const entries = items.map((item) => {
      const value = selector(item);
      return { pair: item.pair, value: Number.isFinite(value) ? value : -Infinity };
    });

    entries.sort((a, b) => b.value - a.value);

    return entries.reduce((acc, { pair }, index) => {
      acc.set(pair, index + 1);
      return acc;
    }, new Map());
  };

  const performanceRanking = calculateRankingMap(results, (item) => item.metrics?.performance);
  const volatilityRanking = calculateRankingMap(results, (item) => item.metrics?.volatility);
  const volumeRanking = calculateRankingMap(results, (item) => item.metrics?.averageDollarVolume);

  const enrichedResults = results.map((item) => {
    const performanceRank = performanceRanking.get(item.pair) ?? results.length;
    const volatilityRank = volatilityRanking.get(item.pair) ?? results.length;
    const volumeRank = volumeRanking.get(item.pair) ?? results.length;
    const overallRank = (performanceRank + volatilityRank + volumeRank) / 3;

    return {
      ...item,
      performanceRank,
      volatilityRank,
      volumeRank,
      overallRank,
    };
  });

  // Sort results based on column and direction
  let sortedResults = [...enrichedResults];
  if (sortColumn) {
    sortedResults.sort((a, b) => {
      let aValue, bValue;

      switch (sortColumn) {
        case 'pair':
          aValue = a.pair || '';
          bValue = b.pair || '';
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        case 'performanceToday':
          aValue = Number.isFinite(a.performanceToday) ? a.performanceToday : -Infinity;
          bValue = Number.isFinite(b.performanceToday) ? b.performanceToday : -Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        case 'performance7Day':
          aValue = Number.isFinite(a.performance7Day) ? a.performance7Day : -Infinity;
          bValue = Number.isFinite(b.performance7Day) ? b.performance7Day : -Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        case 'performance30Day':
          aValue = Number.isFinite(a.metrics?.performance) ? a.metrics.performance : -Infinity;
          bValue = Number.isFinite(b.metrics?.performance) ? b.metrics.performance : -Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        case 'volatility':
          aValue = Number.isFinite(a.metrics?.volatility) ? a.metrics.volatility : -Infinity;
          bValue = Number.isFinite(b.metrics?.volatility) ? b.metrics.volatility : -Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        case 'volume':
          aValue = Number.isFinite(a.metrics?.averageDollarVolume) ? a.metrics.averageDollarVolume : -Infinity;
          bValue = Number.isFinite(b.metrics?.averageDollarVolume) ? b.metrics.averageDollarVolume : -Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        case 'rank':
          aValue = Number.isFinite(a.overallRank) ? a.overallRank : Infinity;
          bValue = Number.isFinite(b.overallRank) ? b.overallRank : Infinity;
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        default:
          return 0;
      }
    });
  } else {
    // Default sort by overall ranking ascending
    sortedResults.sort((a, b) => {
      const aRank = Number.isFinite(a.overallRank) ? a.overallRank : Infinity;
      const bRank = Number.isFinite(b.overallRank) ? b.overallRank : Infinity;
      return aRank - bRank;
    });
  }

  const rows = sortedResults.map(({ pair, metrics, performance7Day, performanceToday, overallRank }) => {
    const performanceTodayValue = performanceToday;
    const performance7DayValue = performance7Day;
    const performance30DayValue = metrics?.performance;
    const volatilityValue = metrics?.volatility;
    const averageDollarVolumeValue = metrics?.averageDollarVolume;
    
    const performanceTodayClass = Number.isFinite(performanceTodayValue)
      ? performanceTodayValue >= 0
        ? 'text-success'
        : 'text-danger'
      : 'text-muted';
    const performance7DayClass = Number.isFinite(performance7DayValue)
      ? performance7DayValue >= 0
        ? 'text-success'
        : 'text-danger'
      : 'text-muted';
    const performance30DayClass = Number.isFinite(performance30DayValue)
      ? performance30DayValue >= 0
        ? 'text-success'
        : 'text-danger'
      : 'text-muted';
    const volatilityClass = Number.isFinite(volatilityValue) ? '' : 'text-muted';
    const volumeClass = Number.isFinite(averageDollarVolumeValue) ? '' : 'text-muted';
    const volumeDisplay = Number.isFinite(averageDollarVolumeValue)
      ? formatCurrency(averageDollarVolumeValue, 0)
      : '--';

    return `
      <tr>
        <td>${escapeHtml(pair)}</td>
        <td class="text-end ${performanceTodayClass}">${formatPercent(performanceTodayValue)}</td>
        <td class="text-end ${performance7DayClass}">${formatPercent(performance7DayValue)}</td>
        <td class="text-end ${performance30DayClass}">${formatPercent(performance30DayValue)}</td>
        <td class="text-end ${volatilityClass}">${formatPercent(volatilityValue)}</td>
        <td class="text-end ${volumeClass}">${volumeDisplay}</td>
        <td class="text-end">${Number.isFinite(overallRank) ? overallRank.toFixed(1) : '--'}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = rows.join('');
  updateSortIcons(sortColumn, sortDirection);
  
  // Store results in table element for sorting
  const statsTable = document.getElementById('statsTable');
  if (statsTable) {
    statsTable.dataset.results = JSON.stringify(results);
  }
  
  if (statusElement) {
    statusElement.classList.remove('text-danger');
  }
}

async function loadStatsData() {
  if (volatilityLoading || volatilityDataLoaded) return;

  const statusElement = document.getElementById('volatilityStatus');
  const tableBody = document.getElementById('statsTableBody');
  if (!tableBody) return;

  volatilityLoading = true;
  if (statusElement) {
    statusElement.classList.remove('text-danger');
    statusElement.textContent = 'Fetching OHLC data for USD pairs...';
  }

  const sinceTimestamp = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const usdPairs = getUsdPairs();

  try {
    const results = await Promise.allSettled(
      usdPairs.map((pair) => fetchOhlcForPair(pair, sinceTimestamp))
    );

    const successful = results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value);

    renderStatsTable(successful, 'rank', 'asc');

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0 && statusElement) {
      statusElement.classList.add('text-danger');
      statusElement.textContent = `Some pairs failed to load (${failures.length}/${usdPairs.length}).`;
    }

    volatilityDataLoaded = true;
  } catch (error) {
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load volatility data</td></tr>';
    }
    if (statusElement) {
      statusElement.classList.add('text-danger');
      statusElement.textContent = error instanceof Error ? error.message : 'Failed to load volatility data';
    }
  } finally {
    volatilityLoading = false;
  }
}

function updateLosses() {
  try {
    const direction = document.getElementById('direction').value;
    const currentPrice = parseFloat(document.getElementById('currentPrice').textContent);

    if (!currentPrice || !direction) return;
    if (isNaN(currentPrice)) throw new Error('Invalid current price');

    const sliderValue = parseFloat(document.getElementById('priceSlider').value);
    const previewPrice = direction === 'buy'
      ? currentPrice * (1 - sliderValue/100)
      : currentPrice * (1 + sliderValue/100);

    const { realizedLoss, unrealizedLoss, positionSize, closedPositionSize } = calculateAndDisplayLosses(previewPrice, direction);

    document.getElementById('previewPrice').textContent = previewPrice.toFixed(6);
    document.getElementById('realizedLoss').innerHTML = formatCurrency(realizedLoss);
    document.getElementById('unrealizedLoss').innerHTML = formatCurrency(unrealizedLoss);
    document.getElementById('positionSize').innerHTML = positionSize.toFixed(6);
    document.getElementById('closedPositionSize').innerHTML = closedPositionSize.toFixed(6);
  } catch (error) {
    console.error('Error updating losses:', error);
  }
};

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.querySelectorAll('#orderForm input, #orderForm select').forEach(element => {
        element.addEventListener('change', calculateOrders);
    });
    document.getElementById('numOrders').addEventListener('input', function() {
        const createButton = document.getElementById('createButton');
        createButton.textContent = `Create ${this.value} Orders`;
    });
    document.getElementById('open-orders-tab').addEventListener('click', fetchOpenOrders);
    document.getElementById('open-positions-tab').addEventListener('click', fetchOpenPositions);
    const tradeHistoryTab = document.getElementById('trade-history-tab');
    if (tradeHistoryTab) {
        tradeHistoryTab.addEventListener('click', fetchTradeHistory);
    }
    const statsTab = document.getElementById('stats-tab');
    if (statsTab) {
        statsTab.addEventListener('shown.bs.tab', loadStatsData);
    }
    
    // Add event listeners for sortable stats table headers
    document.querySelectorAll('.stats-sortable-header').forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            handleStatsSort(column);
        });
    });
    document.getElementById('refreshOrders').addEventListener('click', fetchOpenOrders);
    const refreshPositionsButton = document.getElementById('refreshPositions');
    if (refreshPositionsButton) {
        refreshPositionsButton.addEventListener('click', fetchOpenPositions);
    }
    const refreshTradeHistoryButton = document.getElementById('refreshTradeHistory');
    if (refreshTradeHistoryButton) {
        refreshTradeHistoryButton.addEventListener('click', fetchTradeHistory);
    }
    const tradeHistoryPairFilter = document.getElementById('tradeHistoryPairFilter');
    if (tradeHistoryPairFilter) {
        tradeHistoryPairFilter.addEventListener('change', () => renderTradeHistoryRows());
    }
    const pairFilter = document.getElementById('openOrdersPairFilter');
    if (pairFilter) {
        pairFilter.addEventListener('change', () => renderOpenOrdersTable());
    }
    document.getElementById('cancelAll').addEventListener('click', cancelAllOrders);
    const assetSelect = document.getElementById('asset');
    if (assetSelect) {
        assetSelect.addEventListener('change', handlePairChange);
    }
    const quoteSelect = document.getElementById('quote');
    if (quoteSelect) {
        quoteSelect.addEventListener('change', handlePairChange);
    }
    document.getElementById('direction').addEventListener('change', updateFirstOrderPrice);
    document.getElementById('priceOffset').addEventListener('input', updateFirstOrderPrice);
    document.getElementById('enableStopLoss').addEventListener('change', function() {
        document.getElementById('stop_loss').disabled = !this.checked;
    });
    document.getElementById('enableTakeProfit').addEventListener('change', function() {
        document.getElementById('take_profit').disabled = !this.checked;
    });
    document.getElementById('priceSlider').addEventListener('input', updateLosses);
    document.getElementById('leverage').addEventListener('change', function() {
        const pair = getSelectedPair() || 'BTC/USD';
        const pairInfo = getPairInfo(pair);
        const maxLeverage = pairInfo ? parseInt(pairInfo.leverage) : 10;
        const newLeverage = Math.min(maxLeverage, parseInt(this.value) || 1);
        if (this.value !== 'spot') document.getElementById('leverage').value = newLeverage;
        updateTotalVolume(pair, newLeverage);
    });
    document.getElementById('createButton').addEventListener('click', createOrders);

    // Initialize asset options
    populateAssetOptions();
    populateQuoteOptions();
    setLeverageForCurrentPair();
    const initialPair = getSelectedPair() || 'BTC/USD';
    updateTradingViewWidget(initialPair);
    fetchOpenPositions();
    fetchTradeHistory();
    loadStatsData();

    // Start balance updates
    updateBalances().then(() => {
        // Start price updates
        setTimeout(updateStartPrice, 100);
    });
});

// Intercept cancel actions to confirm with the user before proceeding.
// This uses a capturing listener so it runs before any existing handlers.
document.addEventListener(
  'click',
  function (e) {
    const target = e.target.closest('#cancelAll, .cancel-all-pair');
    if (!target) return;
    const ok = window.confirm('Really cancel orders?');
    if (!ok) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true
);
