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
    initAutoLiveSync();
  } catch (e) {
    console.error("Initialization error:", e);
  }
});

function initAutoLiveSync() {
  // Automatically check for fresh 30-minute cloud market updates every 3 minutes
  setInterval(() => {
    if (!document.hidden) {
      loadData();
    }
  }, 180000);
}

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

      if (contentId === 'tab-wyckoff') {
        try { renderWyckoffTab(); } catch(e) { console.error('Error rendering Wyckoff tab:', e); }
      } else if (contentId === 'tab-today-action') {
        try { renderTodayActionWatchlist(); } catch(e) { console.error('Error rendering Today Action tab:', e); }
      } else if (contentId === 'tab-overview') {
        try { renderTop15(); renderWorst5(); } catch(e) { console.error('Error rendering Overview tab:', e); }
      } else if (contentId === 'tab-watchlist') {
        try { renderSparkWatchlistTable(stockData.all_stocks || [], 'all-stocks-tbody'); } catch(e) { console.error('Error rendering Spark Watchlist:', e); }
      } else if (contentId === 'tab-nifty250') {
        try { renderNifty250Table(nifty250Data.all_stocks || [], 'nifty250-tbody'); } catch(e) { console.error('Error rendering Nifty 250:', e); }
      } else if (contentId === 'tab-events') {
        try { renderEventsTab(); } catch(e) { console.error('Error rendering Events tab:', e); }
      }
    });
  });
}

function showToast(message, type = 'info', duration = 4000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.className = `toast-notification ${type} show`;
  toast.innerHTML = message;
  
  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

const GITHUB_REPO = "digant2207/indian-stock-analyzer";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/digant2207/indian-stock-analyzer/main/";

function openCloudModal() {
  const savedToken = localStorage.getItem('gh_token') || '';
  const tokenInput = document.getElementById('github-pat-input');
  if (tokenInput) tokenInput.value = savedToken;
  
  const modal = document.getElementById('cloud-scan-modal');
  if (modal) modal.classList.add('active');
  checkLatestGithubRunStatus();
}

function closeCloudModal() {
  const modal = document.getElementById('cloud-scan-modal');
  if (modal) modal.classList.remove('active');
}

async function checkLatestGithubRunStatus() {
  const runInfoEl = document.getElementById('cloud-run-info');
  if (!runInfoEl) return;
  runInfoEl.innerHTML = '<span class="spin-icon">⏳</span> Checking GitHub Actions...';

  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily_analysis.yml/runs?per_page=1`, {
      cache: 'no-store'
    });
    if (resp.ok) {
      const data = await resp.json();
      const latest = data.workflow_runs && data.workflow_runs[0];
      if (latest) {
        const status = latest.status;
        const conclusion = latest.conclusion;
        const runTime = new Date(latest.updated_at || latest.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        if (status === 'in_progress' || status === 'queued') {
          runInfoEl.innerHTML = `<span style="color:var(--accent-cyan);">⏳ Running in Cloud (${status})... Started at ${runTime}</span>`;
        } else if (conclusion === 'success') {
          runInfoEl.innerHTML = `<span style="color:var(--accent-green);">✅ Completed Successfully at ${runTime}</span>`;
        } else {
          runInfoEl.innerHTML = `<span>Status: ${status} (${conclusion || 'pending'}) at ${runTime}</span>`;
        }
      } else {
        runInfoEl.textContent = 'No past cloud runs found.';
      }
    } else {
      runInfoEl.textContent = 'Public GitHub Actions status available.';
    }
  } catch (e) {
    runInfoEl.textContent = 'Ready to sync or trigger cloud scan.';
  }
}

async function syncLatestGithubData() {
  closeCloudModal();
  const btnText = document.getElementById('refresh-btn-text');
  if (btnText) btnText.innerHTML = '<span class="spin-icon">⏳</span> Syncing GitHub Data...';
  
  await loadData();
  showToast('✅ Synced with latest data from GitHub repository!', 'success', 4000);
  
  setTimeout(() => {
    if (btnText) btnText.textContent = 'Refresh Data';
  }, 2000);
}

async function startGithubCloudScan() {
  const tokenInput = document.getElementById('github-pat-input');
  const token = tokenInput ? tokenInput.value.trim() : '';
  
  if (!token) {
    showToast('⚠️ Please enter your GitHub Personal Access Token to trigger Cloud Scans.', 'error', 5000);
    return;
  }

  localStorage.setItem('gh_token', token);
  closeCloudModal();
  await triggerGithubWorkflowDispatch(token);
}

async function triggerGithubWorkflowDispatch(token) {
  const btn = document.getElementById('btn-refresh-data');
  const btnText = document.getElementById('refresh-btn-text');
  
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spin-icon">⏳</span> Triggering Cloud Scan...';

  try {
    const dispatchResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily_analysis.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main' })
    });

    if (dispatchResp.status === 204 || dispatchResp.ok) {
      showToast('🚀 GitHub Actions Cloud Scan triggered! Scanning 135+ stocks in cloud...', 'info', 6000);
      if (btnText) btnText.innerHTML = '<span class="spin-icon">⏳</span> Cloud Scan Running...';

      const dispatchTime = Date.now();
      let pollAttempts = 0;
      let runFound = false;

      const pollInterval = setInterval(async () => {
        pollAttempts++;
        try {
          const runsResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily_analysis.yml/runs?per_page=1`, {
            cache: 'no-store'
          });

          if (runsResp.ok) {
            const rData = await runsResp.json();
            const latest = rData.workflow_runs && rData.workflow_runs[0];
            
            if (latest) {
              const runCreated = new Date(latest.created_at).getTime();
              // Verify run was created around or after our dispatch
              if (runCreated >= dispatchTime - 30000) {
                runFound = true;
                if (latest.status === 'completed') {
                  clearInterval(pollInterval);
                  if (latest.conclusion === 'success') {
                    if (btnText) btnText.innerHTML = '✅ Cloud Scan Complete!';
                    showToast('✅ Real-Time GitHub Cloud Scan completed! Updating dashboard...', 'success', 5000);
                    await loadData();
                  } else {
                    if (btnText) btnText.textContent = 'Refresh Data';
                    showToast(`⚠️ Cloud scan finished with status: ${latest.conclusion}`, 'error', 6000);
                  }
                  if (btn) btn.disabled = false;
                  setTimeout(() => {
                    if (btnText) btnText.textContent = 'Refresh Data';
                  }, 3500);
                } else {
                  if (btnText) btnText.innerHTML = `<span class="spin-icon">⏳</span> Cloud Scanning (${pollAttempts * 5}s)...`;
                }
              }
            }
          }
        } catch (pollErr) {
          console.warn("GitHub Actions polling:", pollErr);
        }

        // Safety timeout: 4 minutes
        if (pollAttempts > 48) {
          clearInterval(pollInterval);
          if (btnText) btnText.textContent = 'Refresh Data';
          if (btn) btn.disabled = false;
          await loadData();
        }
      }, 5000);

    } else if (dispatchResp.status === 401 || dispatchResp.status === 403) {
      showToast('⚠️ GitHub Authentication Failed: Invalid Token or missing "repo / workflow" scope.', 'error', 6000);
      openCloudModal();
      if (btnText) btnText.textContent = 'Refresh Data';
      if (btn) btn.disabled = false;
    } else {
      const errText = await dispatchResp.text();
      showToast(`⚠️ GitHub Cloud Scan error: ${dispatchResp.status} ${errText}`, 'error', 6000);
      if (btnText) btnText.textContent = 'Refresh Data';
      if (btn) btn.disabled = false;
    }

  } catch (err) {
    showToast(`⚠️ Error triggering cloud scan: ${err.message}`, 'error', 5000);
    if (btnText) btnText.textContent = 'Refresh Data';
    if (btn) btn.disabled = false;
  }
}

async function triggerLiveRefresh() {
  const btn = document.getElementById('btn-refresh-data');
  const btnText = document.getElementById('refresh-btn-text');
  
  const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalHost) {
    // Local Python Server Mode
    if (btn) btn.disabled = true;
    if (btnText) btnText.innerHTML = '<span class="spin-icon">⏳</span> Initializing Scan...';

    try {
      const refreshResp = await fetch('/api/refresh', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!refreshResp.ok) throw new Error(`HTTP ${refreshResp.status}`);

      showToast('🚀 Live market scanner started in background...', 'info', 3500);

      let pollAttempts = 0;
      let seenRunning = false;

      const intervalId = setInterval(async () => {
        pollAttempts++;
        try {
          const sResp = await fetch('/api/scan_status?t=' + Date.now(), { 
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
          });

          if (sResp.ok) {
            const status = await sResp.json();
            
            if (status.is_running) {
              seenRunning = true;
              if (btnText) {
                btnText.innerHTML = `<span class="spin-icon">⏳</span> Scanning (${status.progress_pct || 0}%)...`;
              }
            } else {
              const isCompleted = (status.progress_pct === 100 && (seenRunning || pollAttempts >= 2));
              
              if (isCompleted) {
                clearInterval(intervalId);
                if (btnText) btnText.innerHTML = '✅ Update Complete!';
                showToast('✅ Market data & breakout levels updated successfully!', 'success', 4500);
                await loadData();
                
                setTimeout(() => {
                  if (btnText) btnText.textContent = 'Refresh Data';
                  if (btn) btn.disabled = false;
                }, 3000);
              } else if (status.status_message && status.status_message.toLowerCase().includes('failed')) {
                clearInterval(intervalId);
                showToast(`⚠️ ${status.status_message}`, 'error', 5000);
                if (btnText) btnText.textContent = 'Refresh Data';
                if (btn) btn.disabled = false;
              }
            }
          }
        } catch (pollErr) {
          console.warn("Scan status polling...", pollErr);
        }

        if (pollAttempts > 200) {
          clearInterval(intervalId);
          if (btnText) btnText.textContent = 'Refresh Data';
          if (btn) btn.disabled = false;
          await loadData();
        }
      }, 1200);

    } catch (err) {
      console.warn("Local server error, falling back to GitHub sync:", err);
      await syncLatestGithubData();
      if (btn) btn.disabled = false;
    }

  } else {
    // GitHub Pages / Web Mode
    const savedToken = localStorage.getItem('gh_token');
    if (savedToken) {
      // Trigger cloud scan directly using saved GitHub token
      await triggerGithubWorkflowDispatch(savedToken);
    } else {
      // Fetch latest GitHub data immediately and offer token setup
      if (btnText) btnText.innerHTML = '<span class="spin-icon">⏳</span> Syncing Real-Time GitHub Data...';
      await loadData();
      showToast('☁️ Synced with latest data from GitHub repository.<br><small>To trigger a live on-demand re-scan on GitHub Cloud, click <b>⚙️ Cloud Sync</b>.</small>', 'info', 6000);
      if (btnText) btnText.innerHTML = '✅ Data Synced!';
      
      setTimeout(() => {
        if (btnText) btnText.textContent = 'Refresh Data';
      }, 3000);
      
      openCloudModal();
    }
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

  if (window.location.protocol !== 'file:') {
    const timestamp = Date.now();
    const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    // On GitHub Pages or remote web, fetch directly from raw.githubusercontent.com for instant real-time data
    const analysisUrl = isLocalHost ? `analysis_data.json?_t=${timestamp}` : `${GITHUB_RAW_BASE}analysis_data.json?_t=${timestamp}`;
    const niftyUrl = isLocalHost ? `nifty250_data.json?_t=${timestamp}` : `${GITHUB_RAW_BASE}nifty250_data.json?_t=${timestamp}`;

    try {
      const resp = await fetch(analysisUrl, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (resp.ok) {
        const freshData = await resp.json();
        if (freshData && freshData.all_stocks && freshData.all_stocks.length > 0) {
          stockData = freshData;
          window.stockData = freshData;
        }
      }
    } catch (err) {
      console.log("Using preloaded stock data fallback.");
    }

    try {
      const nResp = await fetch(niftyUrl, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (nResp.ok) {
        const freshNifty = await nResp.json();
        if (freshNifty && freshNifty.all_stocks && freshNifty.all_stocks.length > 0) {
          nifty250Data = freshNifty;
          window.nifty250Data = freshNifty;
        }
      }
    } catch (err) {
      console.log("Using preloaded Nifty 250 data fallback.");
    }

    renderAllViews();
  }
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
  try { renderWyckoffTab(); } catch (e) { console.error("renderWyckoffTab error:", e); }
}

function renderSummary() {
  const combined = getCombinedStocks();
  const s = stockData.summary || {};
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl) lastUpdatedEl.textContent = s.last_updated || 'Daily 8:00 AM & 30-Min Market Run Active';
  
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

    const fundScore = formatNum(s.fundamental_score !== undefined ? s.fundamental_score : (s.composite_score * 0.35), 1);
    const techScore = formatNum(s.technical_score !== undefined ? s.technical_score : (s.composite_score * 0.45), 1);
    const overallScore = formatNum(s.composite_score, 1);

    return `
      <tr onclick="openStockModal('${s.symbol}')">
        <td><strong>#${idx + 1} ${s.name || cleanSym}</strong> <span class="badge badge-accumulate">${cleanSym}</span></td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><span class="badge badge-accumulate">${fundScore} / 35</span></td>
        <td><span class="badge badge-strong-buy">${techScore} / 50</span></td>
        <td><strong style="color:var(--accent-green); font-size:0.95rem;">${overallScore} / 100</strong></td>
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

    const fundScore = formatNum(s.fundamental_score !== undefined ? s.fundamental_score : (s.composite_score * 0.35), 1);
    const techScore = formatNum(s.technical_score !== undefined ? s.technical_score : (s.composite_score * 0.45), 1);
    const overallScore = formatNum(s.composite_score, 1);

    return `
      <tr onclick="openStockModal('${s.symbol}')">
        <td><strong>#${idx + 1} ${s.name || cleanSym}</strong> <span class="badge badge-accumulate">${cleanSym}</span></td>
        <td><span class="badge badge-hold">${s.sector || 'General'}</span></td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td><span class="badge badge-accumulate">${fundScore} / 35</span></td>
        <td><span class="badge badge-strong-buy">${techScore} / 50</span></td>
        <td><strong style="color:var(--accent-green); font-size:0.95rem;">${overallScore} / 100</strong></td>
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

  const fundScore = formatNum(stock.fundamental_score !== undefined ? stock.fundamental_score : (stock.composite_score * 0.35), 1);
  const techScore = formatNum(stock.technical_score !== undefined ? stock.technical_score : (stock.composite_score * 0.45), 1);
  const overallScore = formatNum(stock.composite_score, 1);

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
          <span class="metric-lbl">Fund / Tech / Overall</span>
          <span class="metric-val" style="color:${isWorst ? '#e11d48':'#059669'}; font-size:0.78rem;">F:${fundScore} | T:${techScore} | <strong>Total:${overallScore}</strong></span>
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

  // Wyckoff Tab Listeners
  const wSearchInput = document.getElementById('wyckoff-search');
  const wUniverseSelect = document.getElementById('wyckoff-universe-filter');
  const wPhaseSelect = document.getElementById('wyckoff-phase-filter');
  const wStructSelect = document.getElementById('wyckoff-structure-filter');

  wSearchInput?.addEventListener('input', filterWyckoffTable);
  wUniverseSelect?.addEventListener('change', filterWyckoffTable);
  wPhaseSelect?.addEventListener('change', filterWyckoffTable);
  wStructSelect?.addEventListener('change', filterWyckoffTable);
}

// -------------------------------------------------------------
// Wyckoff Methodology Tab Logic & Rendering (1-Day Chart)
// -------------------------------------------------------------
let currentWyckoffQuickFilter = 'ALL';

function getWyckoffPhaseBadge(phase) {
  switch (phase) {
    case 'Phase C': return 'badge-wyckoff-phase-c';
    case 'Phase D': return 'badge-wyckoff-phase-d';
    case 'Phase E': return 'badge-wyckoff-phase-e';
    case 'Phase B': return 'badge-wyckoff-phase-b';
    case 'Phase A': return 'badge-wyckoff-phase-a';
    default: return 'badge-accumulate';
  }
}

function getWyckoffStructureBadge(structure) {
  if (structure === 'Distribution' || structure === 'Markdown') return 'badge-wyckoff-dist';
  if (structure === 'Markup') return 'badge-wyckoff-phase-e';
  return 'badge-wyckoff-phase-d';
}

function applyWyckoffQuickFilter(filterKey) {
  currentWyckoffQuickFilter = filterKey;
  
  document.querySelectorAll('#tab-wyckoff .pill-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`wyckoff-btn-${filterKey.toLowerCase()}`);
  if (activeBtn) activeBtn.classList.add('active');

  const phaseFilter = document.getElementById('wyckoff-phase-filter');
  const structFilter = document.getElementById('wyckoff-structure-filter');

  if (filterKey === 'SPRING') {
    if (phaseFilter) phaseFilter.value = 'Phase C';
    if (structFilter) structFilter.value = 'Accumulation';
  } else if (filterKey === 'JAC') {
    if (phaseFilter) phaseFilter.value = 'Phase D';
    if (structFilter) structFilter.value = 'Accumulation';
  } else if (filterKey === 'LPS') {
    if (phaseFilter) phaseFilter.value = 'Phase D';
    if (structFilter) structFilter.value = 'ALL';
  } else if (filterKey === 'MARKUP') {
    if (phaseFilter) phaseFilter.value = 'Phase E';
    if (structFilter) structFilter.value = 'Markup';
  } else if (filterKey === 'CAUSE') {
    if (phaseFilter) phaseFilter.value = 'Phase B';
    if (structFilter) structFilter.value = 'ALL';
  } else if (filterKey === 'DIST') {
    if (phaseFilter) phaseFilter.value = 'ALL';
    if (structFilter) structFilter.value = 'Distribution';
  } else {
    if (phaseFilter) phaseFilter.value = 'ALL';
    if (structFilter) structFilter.value = 'ALL';
  }

  filterWyckoffTable();
}

function setWyckoffFilter(type, val) {
  document.querySelectorAll('.tab-btn').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === 'tab-wyckoff');
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-wyckoff');
  });

  if (type === 'PHASE') {
    const pSelect = document.getElementById('wyckoff-phase-filter');
    if (pSelect) pSelect.value = val;
  } else if (type === 'STRUCTURE') {
    const sSelect = document.getElementById('wyckoff-structure-filter');
    if (sSelect) sSelect.value = val;
  }

  filterWyckoffTable();
}

function filterWyckoffTable() {
  const tbody = document.getElementById('wyckoff-tbody');
  if (!tbody) return;

  const searchVal = (document.getElementById('wyckoff-search')?.value || '').toLowerCase().trim();
  const universeVal = document.getElementById('wyckoff-universe-filter')?.value || 'ALL';
  const phaseVal = document.getElementById('wyckoff-phase-filter')?.value || 'ALL';
  const structVal = document.getElementById('wyckoff-structure-filter')?.value || 'ALL';

  let stockList = [];
  if (universeVal === 'SPARK') {
    stockList = stockData.all_stocks || [];
  } else if (universeVal === 'NIFTY') {
    stockList = nifty250Data.all_stocks || [];
  } else {
    stockList = getCombinedStocks();
  }

  const filtered = stockList.filter(s => {
    const cleanSym = getCleanSymbol(s.symbol).toLowerCase();
    const name = (s.name || '').toLowerCase();
    const matchesSearch = !searchVal || cleanSym.includes(searchVal) || name.includes(searchVal);

    const sPhase = s.wyckoff_phase || 'Phase B';
    const matchesPhase = (phaseVal === 'ALL') || (sPhase === phaseVal);

    const sStruct = s.wyckoff_structure || 'Accumulation';
    const matchesStruct = (structVal === 'ALL') || (sStruct === structVal);

    let matchesQuick = true;
    if (currentWyckoffQuickFilter === 'SPRING') {
      matchesQuick = (sPhase === 'Phase C' && (s.wyckoff_event || '').includes('Spring'));
    } else if (currentWyckoffQuickFilter === 'JAC') {
      matchesQuick = (sPhase === 'Phase D' && (s.wyckoff_event || '').includes('Jump Across Creek'));
    } else if (currentWyckoffQuickFilter === 'LPS') {
      matchesQuick = (sPhase === 'Phase D' && (s.wyckoff_event || '').includes('Last Point of Support'));
    } else if (currentWyckoffQuickFilter === 'MARKUP') {
      matchesQuick = (sPhase === 'Phase E' && sStruct === 'Markup');
    } else if (currentWyckoffQuickFilter === 'CAUSE') {
      matchesQuick = (sPhase === 'Phase B');
    } else if (currentWyckoffQuickFilter === 'DIST') {
      matchesQuick = (sStruct === 'Distribution' || sStruct === 'Markdown');
    }

    return matchesSearch && matchesPhase && matchesStruct && matchesQuick;
  });

  renderWyckoffRows(filtered, tbody);
}

function renderWyckoffTab() {
  const combined = getCombinedStocks();

  // Summary Metrics
  const springsCount = combined.filter(s => s.wyckoff_phase === 'Phase C' && (s.wyckoff_event || '').includes('Spring')).length;
  const breakoutsCount = combined.filter(s => s.wyckoff_phase === 'Phase D' && s.wyckoff_structure === 'Accumulation').length;
  const markupsCount = combined.filter(s => s.wyckoff_phase === 'Phase E' && s.wyckoff_structure === 'Markup').length;
  const distCount = combined.filter(s => ['Distribution', 'Markdown'].includes(s.wyckoff_structure || '')).length;

  const springsEl = document.getElementById('stat-wyckoff-springs');
  if (springsEl) springsEl.textContent = springsCount;

  const breakoutsEl = document.getElementById('stat-wyckoff-breakouts');
  if (breakoutsEl) breakoutsEl.textContent = breakoutsCount;

  const markupsEl = document.getElementById('stat-wyckoff-markups');
  if (markupsEl) markupsEl.textContent = markupsCount;

  const distEl = document.getElementById('stat-wyckoff-dist');
  if (distEl) distEl.textContent = distCount;

  filterWyckoffTable();
}

function renderWyckoffRows(list, tbody) {
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 24px; color:var(--text-secondary);">No stocks match the selected Wyckoff criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s, idx) => {
    const cleanSym = getCleanSymbol(s.symbol);
    const phase = s.wyckoff_phase || 'Phase B';
    const struct = s.wyckoff_structure || 'Accumulation';
    const event = s.wyckoff_event || 'Range Consolidation';
    const creek = s.wyckoff_creek || (s.current_price * 1.02);
    const ice = s.wyckoff_ice || (s.current_price * 0.98);
    const breakout = s.wyckoff_breakout || creek;
    const distPct = s.wyckoff_dist_to_breakout_pct !== undefined ? s.wyckoff_dist_to_breakout_pct : (((breakout - s.current_price) / s.current_price) * 100);
    const stoploss = s.wyckoff_stoploss || ice;
    const riskPct = s.wyckoff_stoploss_pct !== undefined ? s.wyckoff_stoploss_pct : (((s.current_price - stoploss) / s.current_price) * 100);
    const t1 = s.wyckoff_target_1 || (creek + (creek - ice));
    const t2 = s.wyckoff_target_2 || (creek + (creek - ice) * 2);
    const isDone = Math.abs(distPct) <= 0.5 || s.is_breakout_done_today;

    return `
      <tr class="${isDone ? 'row-breakout-done' : ''}" onclick="openStockModal('${s.symbol}')">
        <td>
          <strong>#${idx + 1} ${s.name || cleanSym}</strong>
          <span class="badge badge-accumulate">${cleanSym}</span>
          ${isDone ? '<span class="badge badge-breakout-done" style="margin-left:6px;">TRIGGERED</span>' : ''}
        </td>
        <td><strong>₹${formatNum(s.current_price, 2)}</strong></td>
        <td class="${(s.day_change_pct || 0) >= 0 ? 'positive' : 'negative'}">${(s.day_change_pct || 0) >= 0 ? '+' : ''}${formatNum(s.day_change_pct, 2)}%</td>
        <td>
          <span class="badge ${getWyckoffPhaseBadge(phase)}">${phase}</span>
        </td>
        <td>
          <span class="badge ${getWyckoffStructureBadge(struct)}" style="margin-right:4px;">${struct}</span>
          <span style="font-size:0.75rem; color:var(--text-secondary);">${event}</span>
        </td>
        <td><strong style="color:var(--accent-green); font-size:0.9rem;">₹${formatNum(breakout, 2)}</strong></td>
        <td>
          <span class="badge ${isDone ? 'badge-strong-buy' : (distPct <= 2.0 ? 'badge-accumulate' : 'badge-hold')}">
            ${isDone ? 'At Breakout' : formatNum(distPct, 1) + '%'}
          </span>
        </td>
        <td><strong style="color:var(--accent-rose)">₹${formatNum(stoploss, 2)}</strong> <span style="font-size:0.7rem; color:var(--text-muted);">(${formatNum(riskPct, 1)}%)</span></td>
        <td>
          <span style="font-size:0.75rem;">₹${formatNum(ice, 2)} - ₹${formatNum(creek, 2)}</span>
        </td>
        <td>
          <span style="font-size:0.75rem; color:var(--accent-cyan);">T1: ₹${formatNum(t1, 1)}</span><br>
          <span style="font-size:0.72rem; color:var(--text-muted);">T2: ₹${formatNum(t2, 1)}</span>
        </td>
        <td style="font-size:0.78rem;">
          <strong style="color:var(--accent-cyan)">${s.wyckoff_signal || 'WATCH'}</strong>
          <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">
            ${(s.wyckoff_rationale && s.wyckoff_rationale[0]) || 'Trading range analysis'}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openStockModal(symbol) {
  const combined = getCombinedStocks();
  const stock = combined.find(s => s.symbol === symbol);
  if (!stock) return;

  const cleanSym = getCleanSymbol(stock.symbol);
  document.getElementById('modal-stock-title').textContent = `${stock.name || cleanSym} (${cleanSym})`;
  document.getElementById('modal-stock-subtitle').textContent = `${stock.sector || 'General'} | ${stock.cap_type || 'Equity'}`;
  
  const fundScore = formatNum(stock.fundamental_score !== undefined ? stock.fundamental_score : (stock.composite_score * 0.35), 1);
  const techScore = formatNum(stock.technical_score !== undefined ? stock.technical_score : (stock.composite_score * 0.45), 1);
  const overallScore = formatNum(stock.composite_score, 1);

  const content = document.getElementById('modal-body');
  content.innerHTML = `
    <div class="modal-box" style="margin-bottom:14px; background:var(--bg-secondary);">
      <div class="modal-box-title">📊 3 Criteria Score Breakdown</div>
      <div style="display:flex; justify-content:space-between; gap:12px; margin-top:8px;">
        <div style="flex:1; text-align:center; padding:8px; background:rgba(56,189,248,0.1); border-radius:8px;">
          <div style="font-size:0.75rem; color:var(--text-secondary);">1. Fundamental Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--accent-cyan);">${fundScore} / 35</div>
        </div>
        <div style="flex:1; text-align:center; padding:8px; background:rgba(168,85,247,0.1); border-radius:8px;">
          <div style="font-size:0.75rem; color:var(--text-secondary);">2. Technical Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:#a855f7;">${techScore} / 50</div>
        </div>
        <div style="flex:1; text-align:center; padding:8px; background:rgba(34,197,94,0.1); border-radius:8px;">
          <div style="font-size:0.75rem; color:var(--text-secondary);">3. Overall Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--accent-green);">${overallScore} / 100</div>
        </div>
      </div>
    </div>

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

    <div class="modal-box" style="margin-top:14px; border-left: 4px solid #a855f7;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <div class="modal-box-title" style="color:#a855f7; margin-bottom:0; font-size:0.88rem;">🏛️ Wyckoff Methodology Analysis (1-Day Chart)</div>
        <span class="badge ${getWyckoffPhaseBadge(stock.wyckoff_phase || 'Phase B')}">${stock.wyckoff_phase || 'Phase B'}: ${stock.wyckoff_event || 'Range Consolidation'}</span>
      </div>
      
      <div class="modal-grid" style="margin-top:8px;">
        <div>
          <p><strong>Market Structure:</strong> <span class="badge ${getWyckoffStructureBadge(stock.wyckoff_structure || 'Accumulation')}">${stock.wyckoff_structure || 'Accumulation'}</span></p>
          <p><strong>Wyckoff Breakout Trigger:</strong> <strong style="color:var(--accent-green)">₹${formatNum(stock.wyckoff_breakout || stock.buy_trigger_level, 2)}</strong> (${formatNum(stock.wyckoff_dist_to_breakout_pct || 0, 1)}% dist)</p>
          <p><strong>Structural Stop Loss:</strong> <strong style="color:var(--accent-rose)">₹${formatNum(stock.wyckoff_stoploss || stock.swing_stoploss, 2)}</strong> (${formatNum(stock.wyckoff_stoploss_pct || 0, 1)}% risk)</p>
          <p><strong>Trading Range Creek (Resistance):</strong> ₹${formatNum(stock.wyckoff_creek, 2)}</p>
          <p><strong>Trading Range Ice (Support):</strong> ₹${formatNum(stock.wyckoff_ice, 2)}</p>
        </div>
        <div>
          <p><strong>Wyckoff Signal:</strong> <strong style="color:var(--accent-cyan); font-size:0.95rem;">${stock.wyckoff_signal || 'CAUSE WATCH'}</strong></p>
          <p><strong>Cause Target 1 (1x Range):</strong> ₹${formatNum(stock.wyckoff_target_1, 2)}</p>
          <p><strong>Cause Target 2 (2x Range):</strong> ₹${formatNum(stock.wyckoff_target_2, 2)}</p>
          <div style="margin-top:6px; font-size:0.78rem; color:var(--text-secondary);">
            <strong>Wyckoff Rationale & Volume Absorption:</strong>
            <ul style="padding-left:16px; margin-top:4px;">
              ${(stock.wyckoff_rationale || ['Range structure established. Monitoring volume absorption.']).map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>
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
