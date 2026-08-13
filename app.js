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

document.addEventListener('DOMContentLoaded', () => {
  try {
    initTabs();
    initTheme();
    loadData();
    setupEventListeners();
    loadEmailConfigUI();
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
  try { renderSparkWatchlistTable(stockData.all_stocks || [], 'all-stocks-tbody'); } catch (e) { console.error("renderSparkWatchlistTable error:", e); }
  try { populateSectorFilter(stockData.all_stocks || [], 'sector-filter'); } catch (e) { console.error("populateSectorFilter spark error:", e); }
  try { renderNifty250Table(nifty250Data.all_stocks || [], 'nifty250-tbody'); } catch (e) { console.error("renderNifty250Table error:", e); }
  try { populateSectorFilter(nifty250Data.all_stocks || [], 'nifty250-sector-filter'); } catch (e) { console.error("populateSectorFilter nifty error:", e); }
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

// Today's Action Watchlist - Strictly Top 25 High-Potential Breakouts
function renderTodayActionWatchlist() {
  const tbody = document.getElementById('today-action-tbody');
  if (!tbody) return;

  const combined = getCombinedStocks();

  // Filter stocks where distance to breakout is <= 2.0% or breakout triggered today
  const filtered = combined.filter(stk => {
    const basePrice = stk.prev_close || stk.current_price;
    const buyTrigger = stk.buy_trigger_level || (basePrice * 1.005);
    const distPctFromPrevClose = ((buyTrigger - basePrice) / basePrice) * 100.0;
    
    const near52wHigh = Math.abs(stk.pct_from_52w_high || -100) <= 2.0;
    const nearBreakout = distPctFromPrevClose >= 0 && distPctFromPrevClose <= 2.0;
    const isBreakoutSignal = stk.is_breakout_done_today || stk.is_20d_high_breakout || stk.is_52w_high_breakout || stk.swing_signal === 'BREAKOUT BUY';

    return (nearBreakout || near52wHigh || isBreakoutSignal) && distPctFromPrevClose <= 2.0;
  });

  // Sort by highest quality composite score first
  filtered.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

  // Cap strictly at top 25 high-potential stocks
  const top25Breakouts = filtered.slice(0, 25);
  const listToRender = top25Breakouts.length > 0 ? top25Breakouts : combined.slice(0, 25);

  renderTodayActionRows(listToRender, tbody);
}

function renderTodayActionRows(list, tbody) {
  tbody.innerHTML = list.map((s, idx) => {
    const cleanSym = getCleanSymbol(s.symbol);
    const basePrice = s.prev_close || s.current_price;
    const buyTrigger = s.buy_trigger_level || (basePrice * 1.005);
    const sellTrigger = s.sell_trigger_level || (basePrice * 0.995);
    
    const distFromPrevClose = Math.abs(((buyTrigger - basePrice) / basePrice) * 100.0);
    const isDoneToday = s.is_breakout_done_today || s.is_20d_high_breakout || s.is_52w_high_breakout;

    return `
      <tr class="${isDoneToday ? 'row-breakout-done' : ''}" onclick="openStockModal('${s.symbol}')">
        <td>
          <strong>#${idx + 1} ${s.name || cleanSym}</strong> 
          <span class="badge badge-accumulate">${cleanSym}</span>
          ${isDoneToday ? '<span class="badge badge-breakout-done" style="margin-left:6px;">🔥 BREAKOUT DONE TODAY</span>' : ''}
        </td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong> <span style="font-size:0.7rem; color:var(--text-muted);">(Prev: ₹${formatNum(basePrice, 2)})</span></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><span class="badge ${isDoneToday ? 'badge-strong-buy' : 'badge-accumulate'}">${isDoneToday ? 'DONE (0.0%)' : formatNum(distFromPrevClose, 2) + '%'}</span></td>
        <td><strong style="color:var(--accent-green)">₹${formatNum(buyTrigger, 2)}</strong></td>
        <td><strong style="color:var(--accent-rose)">₹${formatNum(sellTrigger, 2)}</strong></td>
        <td>₹${formatNum(s.swing_target_1, 2)}</td>
        <td>₹${formatNum(s.swing_stoploss, 2)}</td>
        <td style="font-size:0.78rem;">
          ${isDoneToday ? '<strong style="color:var(--accent-green)">Triggered Breakout Today!</strong> • ' : ''}
          ${(s.rationale || []).join(' • ')}
        </td>
      </tr>
    `;
  }).join('');
}

// Spark Watchlist Table Rendering
function renderSparkWatchlistTable(stocks, tbodyId='all-stocks-tbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = (stocks || []).map((s, idx) => {
    const cleanSym = getCleanSymbol(s.symbol);
    const hasEvent = s.upcoming_event_str && s.upcoming_event_str !== 'None';
    const eventBadge = hasEvent 
      ? `<span class="badge badge-strong-buy">${s.upcoming_event_str}</span>` 
      : `<span style="color:var(--text-muted)">None</span>`;

    return `
      <tr onclick="openStockModal('${s.symbol}')">
        <td><strong>#${idx + 1} ${s.name || cleanSym}</strong> <span class="badge badge-accumulate">${cleanSym}</span></td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><strong>${formatNum(s.composite_score, 1)}</strong></td>
        <td><span class="badge ${getBadgeClass(s.long_term_signal)}">${s.long_term_signal || 'HOLD'}</span></td>
        <td><span class="badge ${getBadgeClass(s.swing_signal)}">${s.swing_signal || 'NEUTRAL'}</span></td>
        <td>${formatNum(s.rev_growth_yoy, 1)}%</td>
        <td>${formatNum(s.roe, 1)}%</td>
        <td>${eventBadge}</td>
      </tr>
    `;
  }).join('');
}

// Nifty 250 Table Rendering
function renderNifty250Table(stocks, tbodyId='nifty250-tbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = (stocks || []).map((s, idx) => {
    const cleanSym = getCleanSymbol(s.symbol);
    const hasEvent = s.upcoming_event_str && s.upcoming_event_str !== 'None';
    const eventBadge = hasEvent 
      ? `<span class="badge badge-strong-buy">${s.upcoming_event_str}</span>` 
      : `<span style="color:var(--text-muted)">None</span>`;

    return `
      <tr onclick="openStockModal('${s.symbol}')">
        <td><strong>#${idx + 1} ${s.name || cleanSym}</strong> <span class="badge badge-accumulate">${cleanSym}</span></td>
        <td><span class="badge badge-hold">${s.sector || 'General'}</span></td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><strong>${formatNum(s.composite_score, 1)}</strong></td>
        <td><span class="badge ${getBadgeClass(s.long_term_signal)}">${s.long_term_signal || 'HOLD'}</span></td>
        <td><span class="badge ${getBadgeClass(s.swing_signal)}">${s.swing_signal || 'NEUTRAL'}</span></td>
        <td>${formatNum(s.rev_growth_yoy, 1)}%</td>
        <td>${formatNum(s.roe, 1)}%</td>
        <td>${eventBadge}</td>
      </tr>
    `;
  }).join('');
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

// Major Corporate Events Filter
function renderEventsTab() {
  const container = document.getElementById('events-timeline-container');
  if (!container) return;

  const timelineFilter = document.getElementById('event-timeline-filter')?.value || 'ALL';
  const selectedStocks = getCombinedStocks();
  
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
    container.innerHTML = `<div class="modal-box" style="grid-column:1/-1;"><p style="color:var(--text-secondary)">No verified corporate event disclosures found for timeline: <strong>${timelineFilter}</strong>.</p></div>`;
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

      <div class="modal-box-title" style="margin-top:6px; color:var(--text-primary); font-size:0.95rem;">${e.title || 'Major Corporate Event'}</div>
      <p style="font-size:0.83rem; color:var(--text-secondary); margin:6px 0;">${e.summary || ''}</p>

      <div class="card-metrics" style="margin-top:10px;">
        <div class="metric-item">
          <span class="metric-lbl">Event Category</span>
          <span class="metric-val" style="color:var(--accent-green)">${e.type || 'Corporate Action'}</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">Price Impact</span>
          <span class="metric-val" style="color:var(--accent-cyan)">${e.impact || 'High Impact'}</span>
        </div>
      </div>
      <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;"><strong>Rationale:</strong> ${e.impact_reason || 'Monitored for corporate catalyst'}</p>
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

    renderSparkWatchlistTable(filtered, 'all-stocks-tbody');
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

    renderNifty250Table(filtered, 'nifty250-tbody');
  };

  nSearchInput?.addEventListener('input', filterNiftyTable);
  nSectorSelect?.addEventListener('change', filterNiftyTable);
  nSignalSelect?.addEventListener('change', filterNiftyTable);
}

async function loadEmailConfigUI() {
  try {
    const resp = await fetch('/api/get_email_config');
    if (resp.ok) {
      const cfg = await resp.json();
      const rec = document.getElementById('email-recipient-input');
      const snd = document.getElementById('email-sender-input');
      const pwd = document.getElementById('email-password-input');
      if (rec && cfg.recipient_email) rec.value = cfg.recipient_email;
      if (snd && cfg.sender_email) snd.value = cfg.sender_email;
      if (pwd && cfg.app_password) pwd.value = cfg.app_password;
    }
  } catch (e) {
    console.log("Could not load email config UI");
  }
}

async function saveEmailConfig() {
  const rec = document.getElementById('email-recipient-input')?.value.trim();
  const snd = document.getElementById('email-sender-input')?.value.trim();
  const pwd = document.getElementById('email-password-input')?.value.trim();
  const statusDiv = document.getElementById('email-status');

  if (!rec || !snd || !pwd) {
    if (statusDiv) {
      statusDiv.style.color = '#e11d48';
      statusDiv.textContent = 'Please fill recipient email, sender Gmail, and App Password!';
    }
    return;
  }

  if (statusDiv) {
    statusDiv.style.color = 'var(--accent-cyan)';
    statusDiv.textContent = 'Saving Email Settings...';
  }

  try {
    const resp = await fetch('/api/save_email_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, recipient_email: rec, sender_email: snd, app_password: pwd })
    });
    const res = await resp.json();
    if (statusDiv) {
      statusDiv.style.color = res.status === 'success' ? 'var(--accent-green)' : '#e11d48';
      statusDiv.textContent = res.message || 'Saved!';
    }
  } catch (e) {
    if (statusDiv) {
      statusDiv.style.color = '#e11d48';
      statusDiv.textContent = 'Failed to save email settings.';
    }
  }
}

async function testSendEmail() {
  const statusDiv = document.getElementById('email-status');
  if (statusDiv) {
    statusDiv.style.color = 'var(--accent-cyan)';
    statusDiv.textContent = '⏳ Sending Test Morning Email Digest...';
  }

  try {
    const resp = await fetch('/api/test_email', { method: 'POST' });
    const res = await resp.json();
    if (statusDiv) {
      statusDiv.style.color = res.status === 'success' ? 'var(--accent-green)' : '#e11d48';
      statusDiv.textContent = res.message || 'Tested!';
    }
  } catch (e) {
    if (statusDiv) {
      statusDiv.style.color = '#e11d48';
      statusDiv.textContent = 'Error sending test email. Check server connection.';
    }
  }
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
        <p><strong>Previous Close (Starting Base):</strong> ₹${formatNum(stock.prev_close || stock.current_price, 2)}</p>
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
      <div class="modal-box-title">Announced Corporate Event Date</div>
      <p style="font-size:0.95rem; font-weight:700; color:var(--accent-cyan); margin-bottom:8px;">${stock.upcoming_event_str || 'None'}</p>
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
