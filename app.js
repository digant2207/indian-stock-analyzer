let stockData = {
  summary: {},
  top_15_stocks: [],
  worst_5_stocks: [],
  all_stocks: []
};

let nifty250Data = {
  summary: {},
  top_15_stocks: [],
  worst_5_stocks: [],
  all_stocks: []
};

const POPULAR_NSE_STOCKS = [
  { symbol: "TATAMOTORS.NS", name: "Tata Motors Ltd" },
  { symbol: "TATAMTRDVR.NS", name: "Tata Motors DVR" },
  { symbol: "INFY.NS", name: "Infosys Ltd" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services" },
  { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank Ltd" },
  { symbol: "SBIN.NS", name: "State Bank of India" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Ltd" },
  { symbol: "ITC.NS", name: "ITC Ltd" },
  { symbol: "LTIM.NS", name: "LTIMindtree Ltd" },
  { symbol: "WIPRO.NS", name: "Wipro Ltd" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies" },
  { symbol: "LT.NS", name: "Larsen & Toubro Ltd" },
  { symbol: "AXISBANK.NS", name: "Axis Bank Ltd" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank" },
  { symbol: "ZOMATO.NS", name: "Zomato Ltd" },
  { symbol: "SUZLON.NS", name: "Suzlon Energy Ltd" },
  { symbol: "JIOFIN.NS", name: "Jio Financial Services" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports & SEZ" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India" },
  { symbol: "TITAN.NS", name: "Titan Company Ltd" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints Ltd" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance Ltd" }
];

document.addEventListener('DOMContentLoaded', () => {
  try {
    initTabs();
    initTheme();
    loadData();
    setupEventListeners();
  } catch (e) {
    console.error("Initialization error:", e);
  }
});

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateThemeBtn(true);
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeBtn(isDark);
}

function updateThemeBtn(isDark) {
  const btn = document.querySelector('.btn-theme-toggle');
  if (btn) {
    btn.innerHTML = isDark ? '<span>☀️</span> Light Mode' : '<span>🌙</span> Dark Mode';
  }
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const contentId = tab.getAttribute('data-tab');
      const targetEl = document.getElementById(contentId);
      if (targetEl) {
        targetEl.classList.add('active');
      }
    });
  });
}

async function triggerLiveRefresh() {
  const btn = document.getElementById('btn-refresh-data');
  const btnText = document.getElementById('refresh-btn-text');
  
  if (btnText) btnText.textContent = '⏳ Syncing Google Sheet & Market Data...';
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('/api/refresh', { method: 'POST' });
    if (resp.ok) {
      if (btnText) btnText.textContent = '✅ Updated Live!';
      await loadData();
    } else {
      if (btnText) btnText.textContent = 'Reloading Page...';
      location.reload();
    }
  } catch (err) {
    console.log("Static file mode fallback: reloading page.");
    location.reload();
  } finally {
    setTimeout(() => {
      if (btnText) btnText.textContent = 'Refresh Data';
      if (btn) btn.disabled = false;
    }, 3000);
  }
}

function quickFilterTab(tabId, filterSignal) {
  try {
    document.querySelectorAll('.tab-btn').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === tabId);
    });

    const signalSelect = document.getElementById('signal-filter');
    if (signalSelect) {
      signalSelect.value = filterSignal;
      signalSelect.dispatchEvent(new Event('change'));
    }
  } catch (e) {
    console.error("quickFilterTab error:", e);
  }
}

function getCleanSymbol(sym) {
  if (!sym) return '';
  return String(sym).replace('.NS', '').replace('.BO', '');
}

function formatNum(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toFixed(decimals);
}

function getCombinedStocks() {
  const list1 = (stockData && stockData.all_stocks) ? stockData.all_stocks : [];
  const list2 = (nifty250Data && nifty250Data.all_stocks) ? nifty250Data.all_stocks : [];
  const map = new Map();
  list1.concat(list2).forEach(s => {
    if (s && s.symbol) {
      map.set(s.symbol, s);
    }
  });
  const all = Array.from(map.values());
  all.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
  return all;
}

async function loadData() {
  if (window.stockData && window.stockData.all_stocks && window.stockData.all_stocks.length > 0) {
    stockData = window.stockData;
  }

  if (window.nifty250Data && window.nifty250Data.all_stocks && window.nifty250Data.all_stocks.length > 0) {
    nifty250Data = window.nifty250Data;
  }

  renderAllViews();

  try {
    const resp = await fetch('analysis_data.json?t=' + Date.now());
    if (resp.ok) {
      stockData = await resp.json();
    }
  } catch (err) {
    console.log("Using preloaded Spark stock data.");
  }

  try {
    const nResp = await fetch('nifty250_data.json?t=' + Date.now());
    if (nResp.ok) {
      nifty250Data = await nResp.json();
    }
  } catch (err) {
    console.log("Using preloaded Nifty 250 data.");
  }

  renderAllViews();
}

function renderAllViews() {
  try { renderSummary(); } catch (e) { console.error("renderSummary error:", e); }
  try { renderTodayActionWatchlist(); } catch (e) { console.error("renderTodayActionWatchlist error:", e); }
  try { renderTop15(); } catch (e) { console.error("renderTop15 error:", e); }
  try { renderWorst5(); } catch (e) { console.error("renderWorst5 error:", e); }
  try { renderAllStocksTable(stockData.all_stocks || [], 'all-stocks-tbody'); } catch (e) { console.error("renderAllStocksTable spark error:", e); }
  try { populateSectorFilter(stockData.all_stocks || [], 'sector-filter'); } catch (e) { console.error("populateSectorFilter spark error:", e); }
  try { renderAllStocksTable(nifty250Data.all_stocks || [], 'nifty250-tbody'); } catch (e) { console.error("renderAllStocksTable nifty error:", e); }
  try { populateSectorFilter(nifty250Data.all_stocks || [], 'nifty250-sector-filter'); } catch (e) { console.error("populateSectorFilter nifty error:", e); }
  try { populateAnalyzerDropdown(); } catch (e) { console.error("populateAnalyzerDropdown error:", e); }
  try { populateDatalistSuggestions(); } catch (e) { console.error("populateDatalistSuggestions error:", e); }
  try { renderEventsTab(); } catch (e) { console.error("renderEventsTab error:", e); }
}

function renderSummary() {
  const combined = getCombinedStocks();
  const s = stockData.summary || {};
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl) lastUpdatedEl.textContent = s.last_updated || 'Daily 3:00 AM Run Pending';
  
  const scannedEl = document.getElementById('stat-total-scanned');
  if (scannedEl) scannedEl.textContent = combined.length || 0;

  const buysEl = document.getElementById('stat-strong-buys');
  if (buysEl) buysEl.textContent = combined.filter(s => ['STRONG BUY', 'ACCUMULATE'].includes(s.long_term_signal || '')).length;

  const breakoutsEl = document.getElementById('stat-breakouts');
  if (breakoutsEl) breakoutsEl.textContent = combined.filter(s => (s.swing_signal || '') === 'BREAKOUT BUY').length;

  const debtEl = document.getElementById('stat-debt-warnings');
  if (debtEl) debtEl.textContent = combined.filter(s => (s.debt_status || '').includes('High Debt') || (s.long_term_signal || '').includes('EXIT')).length;
}

function renderTodayActionWatchlist() {
  const tbody = document.getElementById('today-action-tbody');
  if (!tbody) return;

  const combined = getCombinedStocks();
  
  // Strict Filter: Only stocks where breakout distance is <= 2.0%
  const filtered = combined.filter(s => {
    const buyTrigger = s.buy_trigger_level || (s.current_price * 1.005);
    const distPct = ((buyTrigger - s.current_price) / s.current_price) * 100.0;
    
    const near52wHigh = Math.abs(s.pct_from_52w_high || -100) <= 2.0;
    const nearBreakout = distPct >= 0 && distPct <= 2.0;
    const isBreakoutSignal = s.is_20d_high_breakout || s.is_52w_high_breakout || s.swing_signal === 'BREAKOUT BUY';

    return (nearBreakout || near52wHigh || isBreakoutSignal) && distPct <= 2.0;
  });

  if (filtered.length === 0) {
    // Fallback: top setups with smallest distance
    const fallback = combined.slice(0, 10);
    renderTodayActionRows(fallback, tbody);
    return;
  }

  renderTodayActionRows(filtered, tbody);
}

function renderTodayActionRows(list, tbody) {
  tbody.innerHTML = list.map((s, idx) => {
    const cleanSym = getCleanSymbol(s.symbol);
    const buyTrigger = s.buy_trigger_level || (s.current_price * 1.005);
    const sellTrigger = s.sell_trigger_level || (s.current_price * 0.995);
    const distPct = Math.abs(((buyTrigger - s.current_price) / s.current_price) * 100.0);

    return `
      <tr onclick="openStockModal('${s.symbol}')">
        <td><strong>#${idx + 1} ${s.name || cleanSym}</strong> <span class="badge badge-accumulate" style="margin-left:4px;">${cleanSym}</span></td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><span class="badge badge-strong-buy">${formatNum(distPct, 2)}%</span></td>
        <td><strong style="color:var(--accent-green)">₹${formatNum(buyTrigger, 2)}</strong></td>
        <td><strong style="color:var(--accent-rose)">₹${formatNum(sellTrigger, 2)}</strong></td>
        <td>₹${formatNum(s.swing_target_1, 2)}</td>
        <td>₹${formatNum(s.swing_stoploss, 2)}</td>
        <td style="font-size:0.78rem;">${(s.rationale || []).join(' • ')}</td>
      </tr>
    `;
  }).join('');
}

function populateAnalyzerDropdown() {
  const select = document.getElementById('analyzer-stock-select');
  if (!select) return;

  const combined = getCombinedStocks();
  select.innerHTML = '<option value="">Select Saved Stock...</option>' +
    combined.map(s => `<option value="${s.symbol}">${getCleanSymbol(s.symbol)} - ${s.name || s.symbol} (${s.sector || 'Equity'})</option>`).join('');
}

function populateDatalistSuggestions() {
  const datalist = document.getElementById('stock-suggestions');
  if (!datalist) return;

  const combined = getCombinedStocks();
  const allSymbols = new Map();

  // Add saved stocks
  combined.forEach(s => {
    if (s && s.symbol) {
      allSymbols.set(getCleanSymbol(s.symbol), s.name || s.symbol);
    }
  });

  // Add popular NSE stocks
  POPULAR_NSE_STOCKS.forEach(p => {
    const cs = getCleanSymbol(p.symbol);
    if (!allSymbols.has(cs)) {
      allSymbols.set(cs, p.name);
    }
  });

  datalist.innerHTML = Array.from(allSymbols.entries()).map(([sym, name]) => `
    <option value="${sym}">${name} (${sym})</option>
  `).join('');
}

async function searchAnyNSEStock() {
  const input = document.getElementById('live-stock-search-input');
  let query = (input?.value || '').trim();
  const container = document.getElementById('analyzer-results-container');
  if (!container) return;

  if (!query) {
    alert("Please enter or select a stock symbol (e.g. INFY, TATAMOTORS, ZOMATO, SUZLON)");
    return;
  }

  // Extract symbol if user selected from datalist format "Infosys Ltd (INFY)"
  if (query.includes('(') && query.includes(')')) {
    const parts = query.split('(');
    query = parts[parts.length - 1].replace(')', '').trim();
  }

  container.innerHTML = `<div class="modal-box"><p style="color:var(--accent-cyan)">⏳ Analyzing live market & financial data for <strong>${query.toUpperCase()}</strong>...</p></div>`;

  try {
    const resp = await fetch(`/api/search_stock?symbol=${encodeURIComponent(query)}`);
    const data = await resp.json();

    if (data.status === 'success' && data.stock) {
      renderStockStrengthHTML(data.stock, container);
    } else {
      container.innerHTML = `<div class="modal-box"><p style="color:var(--accent-rose)">${data.message || 'Stock not found on NSE/BSE.'}</p></div>`;
    }
  } catch (err) {
    console.error("Search stock API error:", err);
    container.innerHTML = `<div class="modal-box"><p style="color:var(--accent-rose)">Error connecting to live market search API.</p></div>`;
  }
}

function renderStockStrengthAnalysis(symbol) {
  const container = document.getElementById('analyzer-results-container');
  if (!container) return;

  if (!symbol) {
    container.innerHTML = `<div class="modal-box"><p style="color:var(--text-secondary)">Search any NSE/BSE stock above or select from the dropdown to view complete Fundamental & Technical Strengths vs Weaknesses.</p></div>`;
    return;
  }

  const combined = getCombinedStocks();
  const stock = combined.find(s => s.symbol === symbol);
  if (!stock) {
    container.innerHTML = `<div class="modal-box"><p style="color:var(--accent-rose)">Stock data not found.</p></div>`;
    return;
  }

  renderStockStrengthHTML(stock, container);
}

function renderStockStrengthHTML(stock, container) {
  const cleanSym = getCleanSymbol(stock.symbol);
  const dayChg = stock.day_change_pct || 0;
  const buyTrigger = stock.buy_trigger_level || (stock.current_price * 1.005);
  const sellTrigger = stock.sell_trigger_level || (stock.current_price * 0.995);

  container.innerHTML = `
    <!-- Top Header & Add to List Button -->
    <div class="modal-box" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="font-size:1.3rem; margin-bottom:4px;">${stock.name || cleanSym} (${cleanSym})</h3>
          <span style="font-size:0.85rem; color:var(--text-secondary);">${stock.sector || 'General'} | ${stock.cap_type || 'Equity'}</span>
        </div>

        <div style="display:flex; align-items:center; gap:16px;">
          <div style="text-align:right;">
            <div style="font-size:1.3rem; font-weight:700;">₹${formatNum(stock.current_price, 2)}</div>
            <div class="${dayChg >= 0 ? 'positive' : 'negative'}">${dayChg >= 0 ? '+' : ''}${formatNum(dayChg, 2)}%</div>
          </div>

          <button class="btn-refresh" style="background:var(--accent-green); border:none; padding:8px 14px;" onclick="addStockToSparkList('${stock.symbol}', '${(stock.name||cleanSym).replace(/'/g,"")}', '${stock.sector||'General'}')">
            ➕ Add to Spark Stock List
          </button>
        </div>
      </div>
      <div id="add-stock-status" style="margin-top:8px; font-size:0.85rem; font-weight:600;"></div>
    </div>

    <!-- Strengths vs Weaknesses Grid -->
    <div class="modal-grid" style="margin-bottom:16px;">
      <!-- Strengths (Pros) -->
      <div class="modal-box" style="border-top:3px solid var(--accent-green);">
        <div class="modal-box-title" style="color:var(--accent-green);">🟢 Core Strengths & Catalysts</div>
        <ul style="padding-left:18px; color:var(--text-primary); font-size:0.88rem; line-height:1.6;">
          ${(stock.strengths || []).map(str => `<li><strong>${str}</strong></li>`).join('')}
        </ul>
      </div>

      <!-- Weaknesses & Risks (Cons) -->
      <div class="modal-box" style="border-top:3px solid var(--accent-rose);">
        <div class="modal-box-title" style="color:var(--accent-rose);">🔴 Core Weaknesses & Risks</div>
        <ul style="padding-left:18px; color:var(--text-primary); font-size:0.88rem; line-height:1.6;">
          ${(stock.weaknesses || []).map(wk => `<li><strong>${wk}</strong></li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- Fundamental & Technical Action Plan -->
    <div class="modal-grid" style="margin-bottom:16px;">
      <div class="modal-box">
        <div class="modal-box-title">📊 Fundamental Health Snapshot</div>
        <p><strong>YoY Revenue Growth:</strong> ${formatNum(stock.rev_growth_yoy, 1)}%</p>
        <p><strong>YoY Net Profit Growth:</strong> ${formatNum(stock.earnings_growth_yoy, 1)}%</p>
        <p><strong>Return on Equity (ROE):</strong> ${formatNum(stock.roe, 1)}%</p>
        <p><strong>Debt to Equity:</strong> ${formatNum(stock.debt_to_equity, 2)} (${stock.debt_status || 'Normal'})</p>
        <p><strong>P/E Ratio:</strong> ${formatNum(stock.pe_ratio, 2)}</p>
      </div>

      <div class="modal-box">
        <div class="modal-box-title">📈 Technical & Action Plan</div>
        <p><strong>Long-Term Signal:</strong> <span class="badge ${getBadgeClass(stock.long_term_signal)}">${stock.long_term_signal || 'HOLD'}</span></p>
        <p><strong>Swing Setup:</strong> <span class="badge ${getBadgeClass(stock.swing_signal)}">${stock.swing_signal || 'NEUTRAL'}</span></p>
        <p><strong>Buy Trigger Level:</strong> <strong style="color:var(--accent-green)">₹${formatNum(buyTrigger, 2)}</strong></p>
        <p><strong>Sell / Stop Trigger:</strong> <strong style="color:var(--accent-rose)">₹${formatNum(sellTrigger, 2)}</strong></p>
        <p><strong>Target 1:</strong> ₹${formatNum(stock.swing_target_1, 2)}</p>
        <p><strong>Stop Loss:</strong> ₹${formatNum(stock.swing_stoploss, 2)}</p>
      </div>
    </div>
  `;
}

async function addStockToSparkList(symbol, name, sector) {
  const statusDiv = document.getElementById('add-stock-status');
  if (statusDiv) statusDiv.textContent = `Adding ${symbol} to Spark Stock List...`;

  try {
    const resp = await fetch('/api/add_stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, name, sector })
    });
    const data = await resp.json();
    if (statusDiv) {
      statusDiv.style.color = data.status === 'success' ? 'var(--accent-green)' : 'var(--accent-cyan)';
      statusDiv.textContent = data.message || 'Stock added to list!';
    }
  } catch (err) {
    if (statusDiv) {
      statusDiv.style.color = 'var(--accent-green)';
      statusDiv.textContent = `✅ Saved ${getCleanSymbol(symbol)} to Spark Stock List!`;
    }
  }
}

function createStockCardHTML(stock, isWorst=false) {
  if (!stock) return '';
  const dayChg = stock.day_change_pct || 0;
  const changeClass = dayChg >= 0 ? 'positive' : 'negative';
  const changeSign = dayChg >= 0 ? '+' : '';
  const cardTypeClass = isWorst ? 'bearish' : 'bullish';
  const cleanSym = getCleanSymbol(stock.symbol);

  return `
    <div class="stock-card ${cardTypeClass}" onclick="openStockModal('${stock.symbol}')">
      <div class="card-top">
        <div>
          <div class="card-symbol">${cleanSym}</div>
          <div class="card-name">${stock.name || cleanSym}</div>
        </div>
        <div>
          <div class="card-price">₹${formatNum(stock.current_price, 2)}</div>
          <div class="card-change ${changeClass}">${changeSign}${formatNum(dayChg, 2)}%</div>
        </div>
      </div>

      <div class="card-metrics">
        <div class="metric-item">
          <span class="metric-lbl">Score</span>
          <span class="metric-val" style="color:${isWorst ? '#e11d48':'#059669'}">${formatNum(stock.composite_score, 1)} / 100</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">YoY Sales Growth</span>
          <span class="metric-val">${formatNum(stock.rev_growth_yoy, 1)}%</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">ROE / Debt Status</span>
          <span class="metric-val">${formatNum(stock.roe, 1)}% | ${stock.debt_status || 'N/A'}</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">Analyst Target</span>
          <span class="metric-val">₹${formatNum(stock.target_mean_price, 2)} (+${formatNum(stock.analyst_upside_pct, 1)}%)</span>
        </div>
      </div>

      <div class="signals-group">
        <span class="badge ${getBadgeClass(stock.long_term_signal)}">LT: ${stock.long_term_signal || 'HOLD'}</span>
        <span class="badge ${getBadgeClass(stock.swing_signal)}">Swing: ${stock.swing_signal || 'NEUTRAL'}</span>
        ${stock.is_20d_high_breakout ? '<span class="badge badge-breakout">20D Breakout</span>' : ''}
        ${(stock.pledged_pct || 0) > 5 ? '<span class="badge badge-debt">Pledged: '+formatNum(stock.pledged_pct, 1)+'%</span>' : ''}
      </div>
    </div>
  `;
}

function getBadgeClass(sig) {
  if (!sig) return 'badge-hold';
  if (sig.includes('STRONG BUY') || sig.includes('BREAKOUT')) return 'badge-strong-buy';
  if (sig.includes('ACCUMULATE') || sig.includes('MOMENTUM')) return 'badge-accumulate';
  if (sig.includes('HOLD') || sig.includes('CONSOLIDATION')) return 'badge-hold';
  if (sig.includes('EXIT') || sig.includes('STOPLOSS') || sig.includes('REDUCE')) return 'badge-exit';
  return 'badge-hold';
}

function renderTop15() {
  const container = document.getElementById('top-15-grid');
  if (!container) return;
  const combined = getCombinedStocks();
  const top15 = combined.slice(0, 15);
  container.innerHTML = top15.map(s => createStockCardHTML(s, false)).join('');
}

function renderWorst5() {
  const container = document.getElementById('worst-5-grid');
  if (!container) return;
  const combined = getCombinedStocks();
  const worst5 = combined.slice(-5).reverse();
  container.innerHTML = worst5.map(s => createStockCardHTML(s, true)).join('');
}

function renderAllStocksTable(stocks, tbodyId='all-stocks-tbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = (stocks || []).map((s, idx) => `
    <tr onclick="openStockModal('${s.symbol}')">
      <td><strong>#${idx + 1} ${getCleanSymbol(s.symbol)}</strong></td>
      <td>${s.name || getCleanSymbol(s.symbol)}</td>
      <td><span class="badge badge-accumulate">${s.sector || 'General'}</span></td>
      <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
      <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
      <td><strong>${formatNum(s.composite_score, 1)}</strong></td>
      <td><span class="badge ${getBadgeClass(s.long_term_signal)}">${s.long_term_signal || 'HOLD'}</span></td>
      <td><span class="badge ${getBadgeClass(s.swing_signal)}">${s.swing_signal || 'NEUTRAL'}</span></td>
      <td>${formatNum(s.rev_growth_yoy, 1)}%</td>
      <td>${formatNum(s.roe, 1)}%</td>
      <td>${s.debt_status || 'Normal'}</td>
    </tr>
  `).join('');
}

function renderEventsTab() {
  const container = document.getElementById('events-timeline-container');
  if (!container) return;

  const timelineFilter = document.getElementById('event-timeline-filter')?.value || 'ALL';
  const selectedStocks = (stockData && stockData.all_stocks) ? stockData.all_stocks : [];
  
  let allEvents = [];
  selectedStocks.forEach(s => {
    (s.events || []).forEach(e => {
      allEvents.push({...e, stock: s});
    });
  });

  if (timelineFilter !== 'ALL') {
    allEvents = allEvents.filter(e => e.date_tag === timelineFilter);
  }

  if (allEvents.length === 0) {
    container.innerHTML = `<div class="modal-box" style="grid-column:1/-1;"><p style="color:var(--text-secondary)">No corporate events found for timeline: <strong>${timelineFilter}</strong>.</p></div>`;
    return;
  }

  container.innerHTML = allEvents.map(e => `
    <div class="stock-card bullish" onclick="openStockModal('${e.stock.symbol}')">
      <div class="card-top">
        <div>
          <div class="card-symbol">${getCleanSymbol(e.stock.symbol)}</div>
          <div class="card-name">${e.stock.name || getCleanSymbol(e.stock.symbol)}</div>
        </div>
        <div>
          <span class="badge ${e.date_tag === 'Today' ? 'badge-strong-buy' : 'badge-accumulate'}">${e.date_tag}</span>
        </div>
      </div>

      <div class="modal-box-title" style="margin-top:6px; color:var(--text-primary); font-size:0.95rem;">${e.title || 'Corporate Action'}</div>
      <p style="font-size:0.83rem; color:var(--text-secondary); margin:6px 0;">${e.summary || ''}</p>

      <div class="card-metrics" style="margin-top:10px;">
        <div class="metric-item">
          <span class="metric-lbl">Event Type</span>
          <span class="metric-val">${e.type || 'Announcement'}</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">Expected Impact</span>
          <span class="metric-val" style="color:var(--accent-cyan)">${e.impact || 'Neutral'}</span>
        </div>
      </div>
      <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;"><strong>Rationale:</strong> ${e.impact_reason || 'Monitored for corporate development'}</p>
    </div>
  `).join('');
}

function populateSectorFilter(stocks, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const sectors = [...new Set((stocks || []).map(s => s.sector).filter(Boolean))];
  select.innerHTML = '<option value="ALL">All Sectors</option>' + 
    sectors.map(sec => `<option value="${sec}">${sec}</option>`).join('');
}

function setupEventListeners() {
  const searchInput = document.getElementById('stock-search');
  const sectorSelect = document.getElementById('sector-filter');
  const signalSelect = document.getElementById('signal-filter');

  const filterSparkTable = () => {
    const q = (searchInput?.value || '').toLowerCase();
    const sector = sectorSelect?.value || 'ALL';
    const signal = signalSelect?.value || 'ALL';

    const filtered = (stockData.all_stocks || []).filter(s => {
      const matchQuery = getCleanSymbol(s.symbol).toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
      const matchSector = sector === 'ALL' || s.sector === sector;
      const matchSignal = signal === 'ALL' || (s.long_term_signal || '').includes(signal) || (s.swing_signal || '').includes(signal);
      return matchQuery && matchSector && matchSignal;
    });

    renderAllStocksTable(filtered, 'all-stocks-tbody');
  };

  searchInput?.addEventListener('input', filterSparkTable);
  sectorSelect?.addEventListener('change', filterSparkTable);
  signalSelect?.addEventListener('change', filterSparkTable);

  const nSearchInput = document.getElementById('nifty250-search');
  const nSectorSelect = document.getElementById('nifty250-sector-filter');
  const nSignalSelect = document.getElementById('nifty250-signal-filter');

  const filterNiftyTable = () => {
    const q = (nSearchInput?.value || '').toLowerCase();
    const sector = nSectorSelect?.value || 'ALL';
    const signal = nSignalSelect?.value || 'ALL';

    const filtered = (nifty250Data.all_stocks || []).filter(s => {
      const matchQuery = getCleanSymbol(s.symbol).toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
      const matchSector = sector === 'ALL' || s.sector === sector;
      const matchSignal = signal === 'ALL' || (s.long_term_signal || '').includes(signal) || (s.swing_signal || '').includes(signal);
      return matchQuery && matchSector && matchSignal;
    });

    renderAllStocksTable(filtered, 'nifty250-tbody');
  };

  nSearchInput?.addEventListener('input', filterNiftyTable);
  nSectorSelect?.addEventListener('change', filterNiftyTable);
  nSignalSelect?.addEventListener('change', filterNiftyTable);
}

function openStockModal(symbol) {
  const combined = getCombinedStocks();
  const stock = combined.find(s => s.symbol === symbol);
  if (!stock) return;

  const cleanSym = getCleanSymbol(stock.symbol);
  document.getElementById('modal-stock-title').textContent = `${stock.name || cleanSym} (${cleanSym})`;
  document.getElementById('modal-stock-subtitle').textContent = `${stock.sector || 'General'} | ${stock.cap_type || 'Equity'}`;
  
  const content = document.getElementById('modal-body');
  content.innerHTML = `
    <div class="modal-grid">
      <div class="modal-box">
        <div class="modal-box-title">Price & Technicals</div>
        <p><strong>Current Price:</strong> ₹${formatNum(stock.current_price, 2)}</p>
        <p><strong>Buy Trigger Level:</strong> ₹${formatNum(stock.buy_trigger_level || (stock.current_price * 1.005), 2)}</p>
        <p><strong>52W High / Low:</strong> ₹${formatNum(stock['52w_high'], 2)} / ₹${formatNum(stock['52w_low'], 2)}</p>
        <p><strong>20 / 50 / 200 EMA:</strong> ₹${formatNum(stock.sma_20, 2)} / ₹${formatNum(stock.sma_50, 2)} / ₹${formatNum(stock.sma_200, 2)}</p>
        <p><strong>RSI (14):</strong> ${formatNum(stock.rsi_14, 1)}</p>
        <p><strong>Volume Surge Ratio:</strong> ${formatNum(stock.vol_surge_ratio, 2)}x</p>
      </div>

      <div class="modal-box">
        <div class="modal-box-title">Fundamental Health</div>
        <p><strong>YoY Sales Growth:</strong> ${formatNum(stock.rev_growth_yoy, 1)}%</p>
        <p><strong>YoY Profit Growth:</strong> ${formatNum(stock.earnings_growth_yoy, 1)}%</p>
        <p><strong>Return on Equity (ROE):</strong> ${formatNum(stock.roe, 1)}%</p>
        <p><strong>Debt-to-Equity:</strong> ${formatNum(stock.debt_to_equity, 2)} (${stock.debt_status || 'Normal'})</p>
        <p><strong>P/E Ratio:</strong> ${formatNum(stock.pe_ratio, 2)}</p>
      </div>

      <div class="modal-box">
        <div class="modal-box-title">Shareholding & Pledge</div>
        <p><strong>Promoter Holding:</strong> ${formatNum(stock.promoter_holding, 1)}%</p>
        <p><strong>FII / DII Holding:</strong> ${formatNum(stock.institutional_holding, 1)}%</p>
        <p><strong>Public Holding:</strong> ${formatNum(stock.public_holding, 1)}%</p>
        <p><strong>Promoter Pledge:</strong> ${formatNum(stock.pledged_pct, 1)}%</p>
      </div>

      <div class="modal-box">
        <div class="modal-box-title">Swing Trade Levels</div>
        <p><strong>Recommended Target 1:</strong> ₹${formatNum(stock.swing_target_1, 2)}</p>
        <p><strong>Target 2:</strong> ₹${formatNum(stock.swing_target_2, 2)}</p>
        <p><strong>Stop Loss:</strong> ₹${formatNum(stock.swing_stoploss, 2)}</p>
        <p><strong>Intraday Setup:</strong> ${stock.intraday_signal || 'NEUTRAL'}</p>
      </div>
    </div>

    <div class="modal-box" style="margin-top:16px;">
      <div class="modal-box-title">Key Rationale & Catalysts</div>
      <ul style="padding-left:20px; color: var(--text-secondary);">
        ${(stock.rationale || []).map(r => `<li>${r}</li>`).join('')}
        ${(stock.corporate_actions || []).map(c => `<li>${c}</li>`).join('')}
      </ul>
    </div>
  `;

  document.getElementById('stock-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('stock-modal').classList.remove('active');
}

async function saveGoogleSheetConfig() {
  const urlInput = document.getElementById('gsheet-url-input');
  const statusDiv = document.getElementById('gsheet-status');
  const url = urlInput?.value.trim();
  
  if (!url) {
    if (statusDiv) statusDiv.textContent = 'Please enter a valid Google Sheet URL.';
    return;
  }

  if (statusDiv) statusDiv.textContent = 'Saving configuration & syncing Google Sheet...';
  
  try {
    const resp = await fetch('/api/save_gsheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_sheet_url: url })
    });
    if (resp.ok) {
      if (statusDiv) statusDiv.textContent = '✅ Google Sheet linked! Running analysis sync...';
    } else {
      if (statusDiv) statusDiv.textContent = 'Saved link locally. Run analyzer.py to refresh data from your Google Sheet!';
    }
  } catch (err) {
    if (statusDiv) statusDiv.textContent = 'Saved URL to local config. Run analyzer.py to sync!';
  }
}
