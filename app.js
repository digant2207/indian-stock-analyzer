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

function ensureWyckoffData(s) {
  if (!s) return s;
  if (s.wyckoff_phase && s.wyckoff_creek && Number(s.wyckoff_creek) > 0) {
    return s;
  }

  const current_price = Number(s.current_price) || 0;
  const prev_close = Number(s.prev_close) || current_price;
  const day_chg = Number(s.day_change_pct) || 0;
  const sma20 = Number(s.sma_20) || current_price;
  const sma50 = Number(s.sma_50) || current_price;
  const sma200 = Number(s.sma_200) || current_price;
  const rsi = Number(s.rsi_14) || 50;
  const vol_surge = Number(s.vol_surge_ratio) || 1.0;
  const is_breakout_done = !!s.is_breakout_done_today;
  const is_20d_high = !!s.is_20d_high_breakout;
  const is_20d_low = !!s.is_20d_low_breakdown;

  const buy_trig = Number(s.buy_trigger_level) || (current_price * 1.01);
  const sell_trig = Number(s.sell_trigger_level) || (current_price * 0.99);

  const creek = Number((Math.max(buy_trig, current_price * 1.005)).toFixed(2));
  const ice = Number((Math.min(sell_trig, current_price * 0.98)).toFixed(2));
  const tr_height = Number((Math.max(creek - ice, current_price * 0.03)).toFixed(2));
  const tr_midpoint = Number(((creek + ice) / 2.0).toFixed(2));

  let phase, structure, event, breakout, stoploss, signal, rationale;

  const is_markup = (current_price > creek * 1.015) && (current_price >= sma20 && sma20 >= sma50);
  const is_markdown = (current_price < ice * 0.97) && (current_price <= sma20 && sma20 <= sma50);
  const is_sow = is_20d_low || (current_price < ice * 0.995 && vol_surge >= 1.2);
  const is_jac = is_breakout_done || is_20d_high || (current_price >= creek * 0.995 && (vol_surge >= 1.2 || day_chg > 0.8));
  const is_lps = (creek * 0.98 <= current_price && current_price <= creek * 1.04) && (current_price > tr_midpoint) && (vol_surge <= 1.3);
  const is_spring = (current_price <= ice * 1.02) && (rsi <= 45);
  const is_utad = (current_price >= creek * 0.99) && (rsi >= 68) && (day_chg < 0);
  const is_climax = (vol_surge >= 2.0) && (Math.abs(day_chg) >= 3.0);

  if (is_markup) {
    phase = "Phase E";
    structure = "Markup";
    event = "Markup Uptrend (Expansion)";
    breakout = Number((Math.max(creek, current_price * 1.008)).toFixed(2));
    stoploss = Number((Math.max(ice, current_price * 0.92, sma20 * 0.97)).toFixed(2));
    signal = "MARKUP RIDE";
    rationale = [
      `Trading firmly above Wyckoff Creek (₹${creek}) in active Markup Phase E.`,
      `Strong alignment above 20 EMA (₹${sma20.toFixed(1)}) and 50 EMA (₹${sma50.toFixed(1)}).`,
      `Accumulation cause built in ₹${ice} - ₹${creek} base now in vertical effect.`
    ];
  } else if (is_markdown) {
    phase = "Phase E";
    structure = "Markdown";
    event = "Markdown Downtrend";
    breakout = creek;
    stoploss = Number((Math.max(creek * 1.02, current_price * 1.06)).toFixed(2));
    signal = "MARKDOWN AVOID";
    rationale = [
      `Broken below Wyckoff Ice support (₹${ice}) into Markdown Phase E.`,
      `Supply heavily dominant with prices below 20 & 50 EMAs.`,
      `Avoid long positions until selling climax halts descent.`
    ];
  } else if (is_sow) {
    phase = "Phase D";
    structure = "Distribution";
    event = "Sign of Weakness (Break of Ice)";
    breakout = creek;
    stoploss = Number((Math.max(creek, current_price * 1.05)).toFixed(2));
    signal = "SOW EXIT / SHORT";
    rationale = [
      `Major Sign of Weakness (SOW) breaking below Ice support (₹${ice}).`,
      `Elevated selling volume and momentum breakdown.`,
      `High probability of entering Phase E markdown.`
    ];
  } else if (is_jac) {
    phase = "Phase D";
    structure = "Accumulation";
    event = "Jump Across Creek (Sign of Strength)";
    breakout = Number((Math.max(creek * 1.002, current_price * 1.002)).toFixed(2));
    stoploss = Number((Math.min(creek * 0.97, ice * 1.01)).toFixed(2));
    signal = "JAC BREAKOUT BUY";
    rationale = [
      `Jump Across the Creek (JAC / SOS) breaking through Creek resistance (₹${creek}).`,
      `Volume surge ${vol_surge.toFixed(1)}x confirms institutional demand absorption.`,
      `Cause of ${tr_height} pts horizontal accumulation ready to unlock upward effect.`
    ];
  } else if (is_lps) {
    phase = "Phase D";
    structure = "Accumulation";
    event = "Last Point of Support (LPS / Backup)";
    breakout = Number((Math.max(creek * 1.005, current_price * 1.01)).toFixed(2));
    stoploss = Number((Math.min(creek * 0.97, ice * 1.02)).toFixed(2));
    signal = "LPS PULLBACK BUY";
    rationale = [
      `Last Point of Support (LPS) successfully holding above Creek (₹${creek}).`,
      `Low-volume pullback demonstrates floating supply is exhausted.`,
      `Prime Wyckoff low-risk entry before Phase E markup acceleration.`
    ];
  } else if (is_spring) {
    phase = "Phase C";
    structure = "Accumulation";
    event = "Spring / Shakeout Test";
    breakout = creek;
    stoploss = Number((ice * 0.985).toFixed(2));
    signal = "SPRING TEST BUY";
    rationale = [
      `Phase C Spring test under Ice support (₹${ice}) holding firmly.`,
      `Liquidity sweep completed; supply dried up on the test.`,
      `Asymmetric risk-reward setup with stop loss strictly below Spring low (₹${stoploss}).`
    ];
  } else if (is_utad) {
    phase = "Phase C";
    structure = "Distribution";
    event = "UTAD (Upthrust After Distribution)";
    breakout = creek;
    stoploss = Number((creek * 1.025).toFixed(2));
    signal = "UTAD EXIT / CAUTION";
    rationale = [
      `Upthrust After Distribution (UTAD) spiked above Creek (₹${creek}) and failed.`,
      `Smart money distributing to trap breakout buyers.`,
      `Tighten stop loss or take profits on long positions.`
    ];
  } else if (is_climax) {
    phase = "Phase A";
    structure = current_price < tr_midpoint ? "Accumulation" : "Distribution";
    event = "Stopping Climax & Secondary Test";
    breakout = creek;
    stoploss = Number((structure === "Accumulation" ? ice * 0.98 : creek * 1.02).toFixed(2));
    signal = "CLIMAX WATCH";
    rationale = [
      `Phase A Stopping Action: Climactic volume surge (${vol_surge.toFixed(1)}x vol).`,
      `Automatic reaction establishes Trading Range between ₹${ice} and ₹${creek}.`,
      `Wait for Phase B cause development before initiating trades.`
    ];
  } else {
    phase = "Phase B";
    structure = (sma50 >= sma200 || rsi >= 48) ? "Accumulation" : "Distribution";
    event = "Range Cause Building (Absorption)";
    breakout = creek;
    stoploss = Number((ice * 0.98).toFixed(2));
    signal = "CAUSE BUILDING WATCH";
    rationale = [
      `Phase B Cause Building inside Trading Range: ₹${ice} (Ice) to ₹${creek} (Creek).`,
      `Consolidation inside ${tr_height} pts horizontal range.`,
      `Smart money absorbing supply; wait for Phase C Spring or Phase D breakout.`
    ];
  }

  const dist_to_breakout = current_price > 0 ? Number((((breakout - current_price) / current_price) * 100.0).toFixed(2)) : 0;
  const stoploss_risk_pct = current_price > 0 ? Number((((current_price - stoploss) / current_price) * 100.0).toFixed(2)) : 0;
  const target_1 = Number((creek + tr_height * 1.0).toFixed(2));
  const target_2 = Number((creek + tr_height * 2.0).toFixed(2));

  s.wyckoff_phase = phase;
  s.wyckoff_structure = structure;
  s.wyckoff_event = event;
  s.wyckoff_creek = creek;
  s.wyckoff_ice = ice;
  s.wyckoff_breakout = breakout;
  s.wyckoff_dist_to_breakout_pct = dist_to_breakout;
  s.wyckoff_stoploss = stoploss;
  s.wyckoff_stoploss_pct = stoploss_risk_pct;
  s.wyckoff_target_1 = target_1;
  s.wyckoff_target_2 = target_2;
  s.wyckoff_signal = signal;
  s.wyckoff_rationale = rationale;
  return s;
}

function getCombinedStocks() {
  const list1 = (stockData && stockData.all_stocks) ? stockData.all_stocks : [];
  const list2 = (nifty250Data && nifty250Data.all_stocks) ? nifty250Data.all_stocks : [];
  const map = new Map();
  list1.concat(list2).forEach(s => {
    if (s && s.symbol) {
      ensureWyckoffData(s);
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

    try {
      const bUrl = isLocalHost ? `ai_briefing.json?_t=${timestamp}` : `${GITHUB_RAW_BASE}ai_briefing.json?_t=${timestamp}`;
      const bResp = await fetch(bUrl, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (bResp.ok) {
        const freshBriefing = await bResp.json();
        if (freshBriefing) {
          window.AI_BRIEFING = freshBriefing;
        }
      }
    } catch (e) {}

    renderAllViews();
  }
}

function renderAllViews() {
  try { renderAiBriefing(); } catch (e) { console.error("renderAiBriefing error:", e); }
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
  stock = ensureWyckoffData(stock);
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
          <span class="metric-lbl">🏛️ Wyckoff Setup</span>
          <span class="metric-val" style="color:#a855f7; font-size:0.76rem;">${stock.wyckoff_phase} • ${stock.wyckoff_signal || 'WATCH'}</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">YoY Sales Growth</span>
          <span class="metric-val">${formatNum(stock.rev_growth_yoy, 1)}%</span>
        </div>
        <div class="metric-item">
          <span class="metric-lbl">ROE / Debt Status</span>
          <span class="metric-val">${formatNum(stock.roe, 1)}% | ${stock.debt_status || 'N/A'}</span>
        </div>
      </div>

      <div class="signals-group">
        <span class="badge ${getBadgeClass(stock.long_term_signal)}">LT: ${stock.long_term_signal || 'HOLD'}</span>
        <span class="badge ${getBadgeClass(stock.swing_signal)}">Swing: ${stock.swing_signal || 'NEUTRAL'}</span>
        <span class="badge ${getWyckoffPhaseBadge(stock.wyckoff_phase)}">${stock.wyckoff_phase}</span>
        <span class="badge ${getWyckoffStructureBadge(stock.wyckoff_structure)}">${stock.wyckoff_structure}</span>
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

let currentChartInstance = null;
let currentCandleSeries = null;
let currentVolumeSeries = null;
let currentSma20Series = null;
let currentSma50Series = null;
let currentSma200Series = null;
let currentPriceLines = [];
let currentChartResizeObserver = null;
let currentChartStock = null;
let currentChartTimeframe = '3M';
let chartToggleState = {
  wyckoff: true,
  emas: true,
  targets: true
};

function changeChartTimeframe(tf) {
  currentChartTimeframe = tf;
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === tf);
  });
  if (currentChartStock) {
    initStockChart(currentChartStock, tf);
  }
}

function toggleChartFeature(feat, checked) {
  chartToggleState[feat] = checked;
  if (!currentChartInstance) return;

  if (feat === 'wyckoff' || feat === 'targets') {
    updateChartPriceLines(currentChartStock);
  } else if (feat === 'emas') {
    if (currentSma20Series) currentSma20Series.applyOptions({ visible: checked });
    if (currentSma50Series) currentSma50Series.applyOptions({ visible: checked });
    if (currentSma200Series) currentSma200Series.applyOptions({ visible: checked });
  }
}

function updateChartPriceLines(stock) {
  if (!currentCandleSeries || !stock) return;
  currentPriceLines.forEach(pl => {
    try { currentCandleSeries.removePriceLine(pl); } catch(e){}
  });
  currentPriceLines = [];

  const curPrice = Number(stock.current_price) || 0;
  const creek = Number(stock.wyckoff_creek) || (curPrice * 1.02);
  const ice = Number(stock.wyckoff_ice) || (curPrice * 0.98);
  const t1 = Number(stock.wyckoff_target_1) || Number(stock.swing_target_1) || 0;
  const t2 = Number(stock.wyckoff_target_2) || Number(stock.swing_target_2) || 0;
  const sl = Number(stock.wyckoff_stoploss) || Number(stock.swing_stoploss) || (ice * 0.98);

  if (chartToggleState.wyckoff && window.LightweightCharts) {
    const creekLine = currentCandleSeries.createPriceLine({
      price: creek,
      color: '#06b6d4',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Creek ₹${creek.toFixed(1)}`
    });
    currentPriceLines.push(creekLine);

    const iceLine = currentCandleSeries.createPriceLine({
      price: ice,
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Ice ₹${ice.toFixed(1)}`
    });
    currentPriceLines.push(iceLine);
  }

  if (chartToggleState.targets && window.LightweightCharts) {
    if (t1 > 0) {
      const t1Line = currentCandleSeries.createPriceLine({
        price: t1,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: `Target 1 ₹${t1.toFixed(1)}`
      });
      currentPriceLines.push(t1Line);
    }
    if (t2 > 0) {
      const t2Line = currentCandleSeries.createPriceLine({
        price: t2,
        color: '#059669',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: `Target 2 ₹${t2.toFixed(1)}`
      });
      currentPriceLines.push(t2Line);
    }
    if (sl > 0) {
      const slLine = currentCandleSeries.createPriceLine({
        price: sl,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Stop Loss ₹${sl.toFixed(1)}`
      });
      currentPriceLines.push(slLine);
    }
  }
}

function formatVolumeNumber(num) {
  if (!num) return '0';
  if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return (num / 100000).toFixed(2) + ' L';
  if (num >= 1000) return (num / 1000).toFixed(1) + ' K';
  return num.toLocaleString('en-IN');
}

async function initStockChart(stock, timeframe = '3M') {
  currentChartStock = stock;
  const container = document.getElementById('tv-chart-container');
  const loader = document.getElementById('chart-loading');
  if (!container) return;

  if (currentChartInstance) {
    try { currentChartInstance.remove(); } catch(e){}
    currentChartInstance = null;
  }
  if (currentChartResizeObserver) {
    try { currentChartResizeObserver.disconnect(); } catch(e){}
    currentChartResizeObserver = null;
  }

  if (!window.LightweightCharts) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-secondary);">Chart library loading or unavailable.</div>`;
    return;
  }

  container.innerHTML = '';
  if (loader) loader.style.display = 'flex';

  let candles = (stock.candles && Array.isArray(stock.candles) && stock.candles.length > 0) ? [...stock.candles] : [];
  let sma20Data = [];
  let sma50Data = [];
  let sma200Data = [];

  const needsServerFetch = (timeframe === '6M' || timeframe === '1Y' || candles.length === 0);
  if (needsServerFetch) {
    const periodParam = timeframe === '1M' ? '1mo' : timeframe === '6M' ? '6mo' : timeframe === '1Y' ? '1y' : '3mo';
    try {
      const resp = await fetch(`/api/stock_history?symbol=${encodeURIComponent(stock.symbol)}&period=${periodParam}&interval=1d`);
      if (resp.ok) {
        const histData = await resp.json();
        if (histData.status === 'success' && histData.candles && histData.candles.length > 0) {
          candles = histData.candles;
          sma20Data = histData.sma20 || [];
          sma50Data = histData.sma50 || [];
          sma200Data = histData.sma200 || [];
        }
      }
    } catch(e) {
      console.warn("Stock history API notice:", e);
    }
  }

  if (loader) loader.style.display = 'none';

  if (!candles || candles.length === 0) {
    container.innerHTML = `<div style="padding:60px; text-align:center; color:var(--text-muted);">No historical candlestick data available for ${stock.symbol}.</div>`;
    return;
  }

  if (timeframe === '1M' && candles.length > 22) {
    candles = candles.slice(-22);
  } else if (timeframe === '3M' && candles.length > 65) {
    candles = candles.slice(-65);
  }

  candles.sort((a, b) => (a.time > b.time ? 1 : -1));
  const uniqueCandles = [];
  const seenTimes = new Set();
  for (const c of candles) {
    if (!seenTimes.has(c.time)) {
      seenTimes.add(c.time);
      uniqueCandles.push(c);
    }
  }
  candles = uniqueCandles;

  if (sma20Data.length === 0 && candles.length >= 5) {
    const calcEMA = (period) => {
      const k = 2 / (period + 1);
      let ema = candles[0].close;
      const res = [];
      for (let i = 0; i < candles.length; i++) {
        ema = (candles[i].close * k) + (ema * (1 - k));
        if (i >= Math.min(Math.floor(period / 2), 5)) {
          res.push({ time: candles[i].time, value: parseFloat(ema.toFixed(2)) });
        }
      }
      return res;
    };
    sma20Data = calcEMA(20);
    sma50Data = calcEMA(50);
    sma200Data = calcEMA(200);
  }

  const isDark = document.body.classList.contains('dark-mode') || true;
  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth || 920,
    height: container.clientHeight || 350,
    layout: {
      background: { type: 'solid', color: isDark ? '#0b1120' : '#ffffff' },
      textColor: isDark ? '#94a3b8' : '#334155',
      fontFamily: 'Inter, -apple-system, sans-serif'
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(51, 65, 85, 0.22)' : 'rgba(226, 232, 240, 0.8)' },
      horzLines: { color: isDark ? 'rgba(51, 65, 85, 0.22)' : 'rgba(226, 232, 240, 0.8)' }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(56, 189, 248, 0.6)',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#0284c7'
      },
      horzLine: {
        color: 'rgba(56, 189, 248, 0.6)',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#0284c7'
      }
    },
    rightPriceScale: {
      borderColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#cbd5e1',
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.20 }
    },
    timeScale: {
      borderColor: isDark ? 'rgba(51, 65, 85, 0.5)' : '#cbd5e1',
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true
    }
  });

  currentChartInstance = chart;

  currentVolumeSeries = chart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });
  currentVolumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 }
  });

  const volumeData = candles.map(c => ({
    time: c.time,
    value: c.volume || 0,
    color: (c.close >= c.open) ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'
  }));
  currentVolumeSeries.setData(volumeData);

  currentSma20Series = chart.addLineSeries({
    color: '#06b6d4',
    lineWidth: 1.5,
    title: '20 EMA',
    visible: chartToggleState.emas
  });
  currentSma20Series.setData(sma20Data);

  currentSma50Series = chart.addLineSeries({
    color: '#f59e0b',
    lineWidth: 1.5,
    title: '50 EMA',
    visible: chartToggleState.emas
  });
  currentSma50Series.setData(sma50Data);

  currentSma200Series = chart.addLineSeries({
    color: '#a855f7',
    lineWidth: 1.5,
    title: '200 EMA',
    visible: chartToggleState.emas
  });
  currentSma200Series.setData(sma200Data);

  currentCandleSeries = chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444'
  });
  currentCandleSeries.setData(candles);

  const markers = [];
  const isSpring = (stock.wyckoff_phase || '').includes('Phase C');
  const isJac = (stock.wyckoff_phase || '').includes('Phase D') && (stock.wyckoff_event || '').includes('Jump Across Creek');
  const isDoneToday = stock.is_breakout_done_today || stock.is_20d_high_breakout;

  const lastCandle = candles[candles.length - 1];
  if (lastCandle) {
    if (isDoneToday) {
      markers.push({
        time: lastCandle.time,
        position: 'aboveBar',
        color: '#10b981',
        shape: 'arrowUp',
        text: '🔥 Breakout'
      });
    } else if (isJac) {
      markers.push({
        time: lastCandle.time,
        position: 'aboveBar',
        color: '#06b6d4',
        shape: 'arrowUp',
        text: 'JAC'
      });
    } else if (isSpring) {
      markers.push({
        time: lastCandle.time,
        position: 'belowBar',
        color: '#c084fc',
        shape: 'arrowUp',
        text: 'Spring'
      });
    }
  }

  for (let i = Math.max(0, candles.length - 15); i < candles.length - 1; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    if (prevC && c.volume > prevC.volume * 2.2 && c.close > c.open) {
      markers.push({
        time: c.time,
        position: 'belowBar',
        color: '#38bdf8',
        shape: 'circle',
        text: 'Vol Surge'
      });
    }
  }

  if (markers.length > 0) {
    markers.sort((a, b) => (a.time > b.time ? 1 : -1));
    currentCandleSeries.setMarkers(markers);
  }

  updateChartPriceLines(stock);

  const updateLegend = (candle, vol) => {
    if (!candle) return;
    const legDate = document.getElementById('leg-date');
    const legOpen = document.getElementById('leg-open');
    const legHigh = document.getElementById('leg-high');
    const legLow = document.getElementById('leg-low');
    const legClose = document.getElementById('leg-close');
    const legChg = document.getElementById('leg-chg');
    const legVol = document.getElementById('leg-vol');

    const chg = candle.open > 0 ? (((candle.close - candle.open) / candle.open) * 100) : 0;
    const chgColor = chg >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)';

    if (legDate) legDate.textContent = candle.time;
    if (legOpen) legOpen.textContent = `₹${candle.open.toFixed(2)}`;
    if (legHigh) legHigh.textContent = `₹${candle.high.toFixed(2)}`;
    if (legLow) legLow.textContent = `₹${candle.low.toFixed(2)}`;
    if (legClose) legClose.textContent = `₹${candle.close.toFixed(2)}`;
    if (legChg) {
      legChg.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      legChg.style.color = chgColor;
    }
    if (legVol) legVol.textContent = vol !== undefined ? formatVolumeNumber(vol) : (candle.volume ? formatVolumeNumber(candle.volume) : '--');
  };

  if (lastCandle) {
    updateLegend(lastCandle, lastCandle.volume);
  }

  chart.subscribeCrosshairMove(param => {
    if (!param || !param.time || !param.seriesData) {
      if (lastCandle) updateLegend(lastCandle, lastCandle.volume);
      return;
    }
    const cData = param.seriesData.get(currentCandleSeries);
    const vData = param.seriesData.get(currentVolumeSeries);
    if (cData) {
      updateLegend(cData, vData ? vData.value : undefined);
    }
  });

  chart.timeScale().fitContent();

  currentChartResizeObserver = new ResizeObserver(entries => {
    if (!entries || entries.length === 0 || !entries[0].contentRect) return;
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) {
      chart.applyOptions({ width, height });
    }
  });
  currentChartResizeObserver.observe(container);
}

function openStockModal(symbol) {
  const combined = getCombinedStocks();
  let stock = combined.find(s => s.symbol === symbol) || 
              (stockData.all_stocks || []).find(s => s.symbol === symbol) || 
              (nifty250Data.all_stocks || []).find(s => s.symbol === symbol);
  if (!stock) return;

  stock = ensureWyckoffData(stock);
  currentChartStock = stock;
  const cleanSym = getCleanSymbol(stock.symbol);
  
  const curPrice = Number(stock.current_price) || 0;
  const creek = Number(stock.wyckoff_creek) || (curPrice * 1.02);
  const ice = Number(stock.wyckoff_ice) || (curPrice * 0.98);
  const rangeHeight = Math.max(0.01, creek - ice);
  const rangePct = ice > 0 ? ((rangeHeight / ice) * 100) : 0;
  
  let posPct = Math.round(((curPrice - ice) / rangeHeight) * 100);
  if (posPct < 0) posPct = 0;
  if (posPct > 100) posPct = 100;

  const riskAmt = Math.max(0.01, curPrice - (Number(stock.wyckoff_stoploss) || ice));
  const rewardAmt = Math.max(0.01, (Number(stock.wyckoff_target_1) || creek) - curPrice);
  const rrr = curPrice > 0 ? (rewardAmt / riskAmt).toFixed(1) : '1.0';

  const t1Upside = curPrice > 0 ? (((Number(stock.wyckoff_target_1) - curPrice) / curPrice) * 100).toFixed(1) : '0.0';
  const t2Upside = curPrice > 0 ? (((Number(stock.wyckoff_target_2) - curPrice) / curPrice) * 100).toFixed(1) : '0.0';

  let wyckoffPlaybook = "Horizontal cause building inside Trading Range. Smart money absorbing supply. Monitor for Phase C Spring or Phase D Creek Breakout.";
  if ((stock.wyckoff_phase || '').includes('Phase C')) {
    wyckoffPlaybook = "🎯 <strong>Phase C (Spring / Shakeout Test)</strong>: Smart money flushed weak hands below Ice support. High asymmetry buy zone with tight structural stop loss strictly below the Spring low.";
  } else if ((stock.wyckoff_phase || '').includes('Phase D') && (stock.wyckoff_event || '').includes('Jump Across Creek')) {
    wyckoffPlaybook = "🚀 <strong>Phase D (Jump Across Creek / SOS)</strong>: Price breaking above Creek resistance with institutional volume surge. Momentum breakout setup; buy at breakout or wait for shallow LPS retest.";
  } else if ((stock.wyckoff_phase || '').includes('Phase D') && (stock.wyckoff_event || '').includes('Last Point of Support')) {
    wyckoffPlaybook = "💎 <strong>Phase D (Last Point of Support / LPS)</strong>: Pullback successfully holding above Creek on drying supply. Ideal low-risk re-entry before Phase E markup acceleration.";
  } else if ((stock.wyckoff_phase || '').includes('Phase E') && stock.wyckoff_structure === 'Markup') {
    wyckoffPlaybook = "📈 <strong>Phase E (Markup Trend)</strong>: Active institutional trend outside the Trading Range. Ride trend momentum with trailing stop loss along 20-day EMA.";
  } else if (['Distribution', 'Markdown'].includes(stock.wyckoff_structure || '') || (stock.wyckoff_event || '').includes('Sign of Weakness') || (stock.wyckoff_event || '').includes('UTAD')) {
    wyckoffPlaybook = "⚠️ <strong>Distribution / Sign of Weakness Alert</strong>: Supply dominant; smart money distributing. Protect capital, tighten stops, or avoid long positions until selling climax.";
  }

  document.getElementById('modal-stock-title').textContent = `${stock.name || cleanSym} (${cleanSym})`;
  
  const subtitleEl = document.getElementById('modal-stock-subtitle');
  subtitleEl.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:2px;">
      <span>${stock.sector || 'General'} | ${stock.cap_type || 'Equity'}</span>
      <span class="badge ${getBadgeClass(stock.long_term_signal)}">LT: ${stock.long_term_signal || 'HOLD'}</span>
      <span class="badge ${getBadgeClass(stock.swing_signal)}">Swing: ${stock.swing_signal || 'NEUTRAL'}</span>
      <span class="badge ${getWyckoffPhaseBadge(stock.wyckoff_phase || 'Phase B')}">🏛️ ${stock.wyckoff_phase || 'Phase B'}: ${stock.wyckoff_event || 'Range Consolidation'}</span>
      <span class="badge ${getWyckoffStructureBadge(stock.wyckoff_structure || 'Accumulation')}">${stock.wyckoff_structure || 'Accumulation'}</span>
    </div>
  `;
  
  const fundScore = formatNum(stock.fundamental_score !== undefined ? stock.fundamental_score : (stock.composite_score * 0.35), 1);
  const techScore = formatNum(stock.technical_score !== undefined ? stock.technical_score : (stock.composite_score * 0.45), 1);
  const overallScore = formatNum(stock.composite_score, 1);

  const content = document.getElementById('modal-body');
  content.innerHTML = `
    <!-- Interactive TradingView Lightweight Candlestick Chart Card -->
    <div class="stock-chart-card">
      <div class="chart-header-row">
        <div class="chart-title-box">
          <div class="chart-title-text">
            📈 Interactive Candlestick Chart & Wyckoff Levels
          </div>
          <span class="badge ${getWyckoffPhaseBadge(stock.wyckoff_phase || 'Phase B')}">
            ${stock.wyckoff_phase || 'Phase B'}
          </span>
        </div>
        <div class="chart-timeframe-group">
          <button class="timeframe-btn" onclick="changeChartTimeframe('1M')">1M</button>
          <button class="timeframe-btn active" onclick="changeChartTimeframe('3M')">3M</button>
          <button class="timeframe-btn" onclick="changeChartTimeframe('6M')">6M</button>
          <button class="timeframe-btn" onclick="changeChartTimeframe('1Y')">1Y</button>
        </div>
      </div>

      <div class="chart-toggles-row">
        <div class="chart-toggles-group">
          <label class="chart-toggle-chip">
            <input type="checkbox" id="chk-wyckoff" checked onchange="toggleChartFeature('wyckoff', this.checked)">
            🏛️ Creek & Ice Levels
          </label>
          <label class="chart-toggle-chip">
            <input type="checkbox" id="chk-emas" checked onchange="toggleChartFeature('emas', this.checked)">
            📊 20 / 50 / 200 EMA
          </label>
          <label class="chart-toggle-chip">
            <input type="checkbox" id="chk-targets" checked onchange="toggleChartFeature('targets', this.checked)">
            🎯 Targets & Stop Loss
          </label>
        </div>
        <div style="font-size:0.73rem; color:var(--text-muted);">
          Hover for OHLCV • Drag to pan • Scroll to zoom
        </div>
      </div>

      <div class="chart-legend-bar" id="chart-legend-bar">
        <div class="chart-legend-ohlc">
          <span>Date: <strong id="leg-date">--</strong></span>
          <span>O: <strong id="leg-open">--</strong></span>
          <span>H: <strong id="leg-high">--</strong></span>
          <span>L: <strong id="leg-low">--</strong></span>
          <span>C: <strong id="leg-close">--</strong></span>
          <span>Chg: <strong id="leg-chg">--</strong></span>
          <span>Vol: <strong id="leg-vol">--</strong></span>
        </div>
      </div>

      <div class="chart-canvas-box" id="stock-chart-canvas-box">
        <div class="chart-loading-overlay" id="chart-loading" style="display:none;">
          <span class="spin-icon">⚡</span> Loading historical data...
        </div>
        <div id="tv-chart-container" style="width:100%; height:100%;"></div>
      </div>
    </div>

    <div class="modal-box" style="margin-bottom:14px; background:var(--bg-secondary);">
      <div class="modal-box-title">📊 4-Pillar Score & Market Cycle Breakdown</div>
      <div style="display:flex; justify-content:space-between; gap:10px; margin-top:8px; flex-wrap:wrap;">
        <div style="flex:1; min-width:110px; text-align:center; padding:8px; background:rgba(56,189,248,0.1); border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-secondary);">1. Fundamental Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--accent-cyan);">${fundScore} / 35</div>
        </div>
        <div style="flex:1; min-width:110px; text-align:center; padding:8px; background:rgba(168,85,247,0.1); border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-secondary);">2. Technical Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:#a855f7;">${techScore} / 50</div>
        </div>
        <div style="flex:1; min-width:110px; text-align:center; padding:8px; background:rgba(34,197,94,0.1); border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-secondary);">3. Overall Score</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--accent-green);">${overallScore} / 100</div>
        </div>
        <div style="flex:1; min-width:120px; text-align:center; padding:8px; background:rgba(192,132,252,0.12); border-radius:8px; border: 1px solid rgba(192,132,252,0.25);">
          <div style="font-size:0.72rem; color:var(--text-secondary);">4. Wyckoff Cycle</div>
          <div style="font-size:1.05rem; font-weight:700; color:#c084fc;">${stock.wyckoff_phase || 'Phase B'}</div>
          <div style="font-size:0.72rem; font-weight:700; color:var(--accent-cyan); margin-top:2px;">${stock.wyckoff_signal || 'CAUSE WATCH'}</div>
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

    <!-- Enhanced Wyckoff Methodology Analysis Card -->
    <div class="wyckoff-detail-box">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <div>
          <div class="modal-box-title" style="color:#a855f7; margin-bottom:2px; font-size:0.92rem;">
            🏛️ Wyckoff Methodology & Phase Analysis (1-Day Chart)
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">
            Institutional Supply/Demand Accumulation Analysis based on Rubén Villahermosa's Wyckoff Method
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <span class="badge ${getWyckoffPhaseBadge(stock.wyckoff_phase || 'Phase B')}">${stock.wyckoff_phase || 'Phase B'}</span>
          <span class="badge ${getWyckoffStructureBadge(stock.wyckoff_structure || 'Accumulation')}">${stock.wyckoff_structure || 'Accumulation'}</span>
          <span class="badge badge-strong-buy">${stock.wyckoff_signal || 'CAUSE WATCH'}</span>
        </div>
      </div>

      <!-- Visual Trading Range Gauge -->
      <div class="wyckoff-range-gauge">
        <div class="wyckoff-gauge-title">
          <span>Trading Range (TR) Position: ₹${ice.toFixed(2)} (Ice) ➔ ₹${creek.toFixed(2)} (Creek)</span>
          <span style="color:var(--accent-cyan);">Range Span: ₹${rangeHeight.toFixed(2)} (${rangePct.toFixed(1)}% Base)</span>
        </div>
        <div class="wyckoff-bar-track" title="Current Price position: ${posPct}% within Trading Range">
          <div class="wyckoff-bar-pointer" style="left: ${posPct}%;" title="Current Price: ₹${curPrice.toFixed(2)} (${posPct}% in TR)"></div>
        </div>
        <div class="wyckoff-gauge-labels">
          <span style="color:var(--accent-rose);">🧊 Ice Support: ₹${ice.toFixed(2)}</span>
          <span style="color:var(--accent-cyan); font-weight:700;">📍 Current: ₹${curPrice.toFixed(2)} (${posPct}%)</span>
          <span style="color:var(--accent-green);">🌊 Creek Resistance: ₹${creek.toFixed(2)}</span>
        </div>
      </div>
      
      <div class="modal-grid" style="margin-top:10px;">
        <div class="modal-box" style="background:var(--bg-secondary);">
          <div class="modal-box-title" style="color:var(--accent-green); margin-bottom:8px;">🎯 Wyckoff Trade Triggers & Targets</div>
          <p><strong>Wyckoff Breakout Trigger:</strong> <strong style="color:var(--accent-green)">₹${formatNum(stock.wyckoff_breakout, 2)}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${formatNum(stock.wyckoff_dist_to_breakout_pct || 0, 1)}% dist)</span></p>
          <p><strong>Structural Stop Loss:</strong> <strong style="color:var(--accent-rose)">₹${formatNum(stock.wyckoff_stoploss, 2)}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${formatNum(stock.wyckoff_stoploss_pct || 0, 1)}% risk)</span></p>
          <p><strong>Cause Target 1 (1x Range):</strong> <strong style="color:var(--accent-cyan)">₹${formatNum(stock.wyckoff_target_1, 2)}</strong> <span style="font-size:0.75rem; color:var(--accent-green);">(+${t1Upside}%)</span></p>
          <p><strong>Cause Target 2 (2x Range):</strong> <strong style="color:var(--accent-cyan)">₹${formatNum(stock.wyckoff_target_2, 2)}</strong> <span style="font-size:0.75rem; color:var(--accent-green);">(+${t2Upside}%)</span></p>
          <p><strong>Wyckoff Risk/Reward (RRR):</strong> <span class="badge badge-accumulate">1 : ${rrr}</span></p>
        </div>

        <div class="modal-box" style="background:var(--bg-secondary);">
          <div class="modal-box-title" style="color:#a855f7; margin-bottom:8px;">🔬 Volume Absorption & Institutional Footprint</div>
          <p><strong>Volume Surge vs 20D:</strong> <strong>${formatNum(stock.vol_surge_ratio, 2)}x</strong> <span style="font-size:0.75rem; color:var(--text-muted);">${(stock.vol_surge_ratio || 1) >= 1.5 ? '(Institutional Expansion)' : '(Normal Absorption)'}</span></p>
          <p><strong>Wyckoff Event:</strong> <strong>${stock.wyckoff_event || 'Range Consolidation'}</strong></p>
          <div style="margin-top:6px; font-size:0.78rem; color:var(--text-secondary);">
            <strong>Step-by-Step Wyckoff Rationale:</strong>
            <ul style="padding-left:16px; margin-top:4px; line-height:1.4;">
              ${(stock.wyckoff_rationale || ['Trading range structure established. Monitoring volume absorption.']).map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:6px; padding:10px 12px; margin-top:10px; font-size:0.8rem; color:var(--text-primary); line-height:1.4;">
        ${wyckoffPlaybook}
      </div>
    </div>

    <div class="modal-box" style="margin-top:14px;">
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

  // Initialize chart after container is in active display
  setTimeout(() => {
    initStockChart(stock, '3M');
  }, 50);
}

function closeModal() {
  if (currentChartInstance) {
    try { currentChartInstance.remove(); } catch(e){}
    currentChartInstance = null;
  }
  if (currentChartResizeObserver) {
    try { currentChartResizeObserver.disconnect(); } catch(e){}
    currentChartResizeObserver = null;
  }
  document.getElementById('stock-modal').classList.remove('active');
}

/* ============================================================
   Pre-Market AI Analyst Briefing & Telegram Controllers
   ============================================================ */
function toggleAiBriefing() {
  const body = document.getElementById('ai-briefing-body');
  const arrow = document.getElementById('ai-toggle-arrow');
  if (body) {
    const isCollapsed = body.classList.toggle('collapsed');
    if (arrow) arrow.classList.toggle('collapsed', isCollapsed);
    localStorage.setItem('ai_briefing_collapsed', isCollapsed ? 'true' : 'false');
  }
}

function openStockModalFromSymbol(symbol) {
  if (!symbol) return;
  const combined = getCombinedStocks();
  let stock = combined.find(s => 
    s.symbol === symbol || 
    s.clean_symbol === symbol || 
    (s.symbol && s.symbol.replace('.NS','').replace('.BO','') === symbol.replace('.NS','').replace('.BO','')) ||
    (s.symbol && s.symbol.startsWith(symbol + '.'))
  );
  if (stock) {
    openStockModal(stock.symbol);
  } else {
    showToast(`Stock ${symbol} details loading...`, 'info', 2500);
  }
}

function renderAiBriefing() {
  const briefing = window.AI_BRIEFING;
  if (!briefing) return;

  const card = document.getElementById('ai-briefing-card');
  if (!card) return;

  // Stance badge
  const stanceBadge = document.getElementById('ai-stance-badge');
  if (stanceBadge) {
    const stance = briefing.stance || 'RANGEBOUND NEUTRAL';
    stanceBadge.textContent = stance;
    stanceBadge.className = 'ai-stance-badge';
    if (stance.includes('BULLISH')) stanceBadge.classList.add('stance-bullish');
    else if (stance.includes('DEFENSIVE') || stance.includes('CAUTION')) stanceBadge.classList.add('stance-defensive');
    else stanceBadge.classList.add('stance-neutral');
  }

  // Engine tag & timestamp
  const engineTag = document.getElementById('ai-engine-tag');
  if (engineTag && briefing.engine) engineTag.textContent = briefing.engine;

  const timeEl = document.getElementById('ai-timestamp');
  if (timeEl && briefing.timestamp) timeEl.textContent = `Generated: ${briefing.timestamp} IST`;

  // Stance text
  const stanceText = document.getElementById('ai-stance-text');
  if (stanceText) stanceText.innerHTML = `<strong>Market Assessment:</strong> ${briefing.stance_summary || ''}`;

  // Global Cues Pills
  const cuesContainer = document.getElementById('ai-cues-pills');
  if (cuesContainer && briefing.global_cues) {
    cuesContainer.innerHTML = Object.entries(briefing.global_cues).map(([name, cue]) => {
      const sign = cue.change_pct >= 0 ? '+' : '';
      const statusClass = cue.status || (cue.change_pct >= 0 ? 'up' : 'down');
      const arrow = cue.change_pct >= 0 ? '▲' : '▼';
      const formattedPrice = (typeof cue.price === 'number') ? cue.price.toLocaleString('en-IN') : cue.price;
      return `<div class="ai-cue-pill ${statusClass}"><span>${name}</span> <strong>${formattedPrice}</strong> <span>${arrow} ${sign}${cue.change_pct}%</span></div>`;
    }).join('');
  }

  // Nifty range
  const rangeEl = document.getElementById('ai-nifty-range');
  if (rangeEl) {
    rangeEl.innerHTML = `Nifty 50 Trading Corridor: <strong>Support ₹${formatNum(briefing.nifty_support || 0, 0)}</strong> &bull; <strong>Resistance ₹${formatNum(briefing.nifty_resistance || 0, 0)}</strong>`;
  }

  // Bullets
  const bulletsList = document.getElementById('ai-bullets-list');
  if (bulletsList && briefing.executive_bullets) {
    bulletsList.innerHTML = briefing.executive_bullets.map(b => `<li>${b}</li>`).join('');
  }

  // Top Setups
  const setupsList = document.getElementById('ai-setups-list');
  if (setupsList && briefing.top_setups) {
    setupsList.innerHTML = briefing.top_setups.map(s => {
      const sym = s.symbol || '';
      const price = s.current_price ? `₹${formatNum(s.current_price, 2)}` : '';
      const trig = s.trigger ? `Trigger ₹${formatNum(s.trigger, 2)}` : '';
      return `
        <div class="ai-setup-card" onclick="openStockModalFromSymbol('${sym}')" title="Click to view interactive chart for ${s.name || sym}">
          <div class="ai-setup-left">
            <div class="ai-setup-name">${s.name || sym} <span class="ai-setup-ticker">${sym}</span></div>
            <div class="ai-setup-rationale">${s.rationale || ''}</div>
          </div>
          <div class="ai-setup-right">
            <div class="ai-setup-price">${price}</div>
            <div class="ai-setup-trig">${trig}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Risk warning
  const riskText = document.getElementById('ai-risk-text');
  if (riskText && briefing.risk_warning) {
    riskText.textContent = briefing.risk_warning;
  }

  // Restore collapsed preference
  const savedCollapsed = localStorage.getItem('ai_briefing_collapsed');
  if (savedCollapsed === 'true') {
    const body = document.getElementById('ai-briefing-body');
    const arrow = document.getElementById('ai-toggle-arrow');
    if (body) body.classList.add('collapsed');
    if (arrow) arrow.classList.add('collapsed');
  }
}

async function autoDetectChatId() {
  const token = (document.getElementById('tg-bot-token')?.value || '').trim();
  const banner = document.getElementById('tg-status-banner');

  if (!token || token.includes('...')) {
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(244, 63, 94, 0.15)';
      banner.style.color = '#fb7185';
      banner.textContent = '⚠️ Please enter your Bot Token first.';
    }
    showToast('Please enter your Bot Token first', 'error');
    return;
  }

  if (banner) {
    banner.style.display = 'block';
    banner.style.background = 'rgba(2, 132, 199, 0.15)';
    banner.style.color = '#38bdf8';
    banner.textContent = '⏳ Checking Telegram for recent messages to your bot...';
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await resp.json();

    if (!data.ok) {
      const errMsg = data.description || 'Failed to check bot updates';
      if (banner) {
        banner.style.background = 'rgba(244, 63, 94, 0.15)';
        banner.style.color = '#fb7185';
        banner.textContent = `❌ Telegram Error: ${errMsg}`;
      }
      showToast(`Telegram Error: ${errMsg}`, 'error');
      return;
    }

    const updates = data.result || [];
    if (updates.length === 0) {
      if (banner) {
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.color = '#fbbf24';
        banner.innerHTML = '⚠️ No messages found! <b>Open your bot in Telegram and send a message (like "hi" or "/start")</b>, then click Auto-Detect again!';
      }
      showToast('Send a message to your bot in Telegram first', 'info', 6000);
      return;
    }

    // Find latest message/chat
    let foundChat = null;
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
      if (chat && chat.id) {
        foundChat = chat;
        break;
      }
    }

    if (foundChat) {
      const chatInput = document.getElementById('tg-chat-id');
      if (chatInput) chatInput.value = String(foundChat.id);
      localStorage.setItem('tg_chat_id', String(foundChat.id));

      const name = foundChat.first_name || foundChat.title || foundChat.username || 'You';
      if (banner) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(16, 185, 129, 0.15)';
        banner.style.color = '#34d399';
        banner.innerHTML = `✅ Successfully detected Chat ID: <b>${foundChat.id}</b> (${name})! Click "Send Test Alert" now.`;
      }
      showToast(`Detected Chat ID: ${foundChat.id}!`, 'success', 4000);
    } else {
      if (banner) {
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.color = '#fbbf24';
        banner.textContent = 'Could not find chat ID. Please send /start to your bot in Telegram and click Auto-Detect again.';
      }
    }
  } catch (err) {
    if (banner) {
      banner.style.background = 'rgba(244, 63, 94, 0.15)';
      banner.style.color = '#fb7185';
      banner.textContent = `❌ Network Error: ${err.message}`;
    }
    showToast(`Error: ${err.message}`, 'error');
  }
}

function openTelegramModal() {
  const modal = document.getElementById('telegram-modal');
  if (!modal) return;
  modal.classList.add('active');

  const banner = document.getElementById('tg-status-banner');
  if (banner) banner.style.display = 'none';

  // Populate from localStorage first
  const localToken = localStorage.getItem('tg_bot_token') || '';
  const localChat = localStorage.getItem('tg_chat_id') || '';
  const tokenInput = document.getElementById('tg-bot-token');
  const chatInput = document.getElementById('tg-chat-id');

  if (tokenInput && localToken) tokenInput.value = localToken;
  if (chatInput && localChat) chatInput.value = localChat;

  // Try to load saved server config
  fetch('/api/get_telegram_config')
    .then(r => r.json())
    .then(cfg => {
      if (tokenInput && cfg.bot_token && !tokenInput.value) tokenInput.value = cfg.bot_token;
      if (chatInput && cfg.chat_id) chatInput.value = cfg.chat_id;
      if (document.getElementById('tg-enable-all')) document.getElementById('tg-enable-all').checked = cfg.enabled !== false;
      if (document.getElementById('tg-alert-breakout')) document.getElementById('tg-alert-breakout').checked = cfg.alert_on_breakout !== false;
      if (document.getElementById('tg-alert-briefing')) document.getElementById('tg-alert-briefing').checked = cfg.alert_morning_briefing !== false;
    })
    .catch(() => {});
}

function closeTelegramModal() {
  const modal = document.getElementById('telegram-modal');
  if (modal) modal.classList.remove('active');
}

function saveTelegramSettings() {
  const token = (document.getElementById('tg-bot-token')?.value || '').trim();
  const chat = (document.getElementById('tg-chat-id')?.value || '').trim();
  const enabled = document.getElementById('tg-enable-all')?.checked ?? true;
  const alertBreakout = document.getElementById('tg-alert-breakout')?.checked ?? true;
  const alertBriefing = document.getElementById('tg-alert-briefing')?.checked ?? true;

  if (token && !token.includes('...')) localStorage.setItem('tg_bot_token', token);
  if (chat) localStorage.setItem('tg_chat_id', chat);

  const banner = document.getElementById('tg-status-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.style.background = 'rgba(2, 132, 199, 0.15)';
    banner.style.color = '#38bdf8';
    banner.textContent = 'Saving settings...';
  }

  fetch('/api/save_telegram_config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bot_token: token,
      chat_id: chat,
      enabled: enabled,
      alert_on_breakout: alertBreakout,
      alert_morning_briefing: alertBriefing
    })
  })
  .then(r => r.json())
  .then(res => {
    if (banner) {
      banner.style.background = res.status === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
      banner.style.color = res.status === 'success' ? '#34d399' : '#fb7185';
      banner.textContent = res.message || (res.status === 'success' ? 'Settings saved successfully!' : 'Save failed');
    }
    showToast(res.message || 'Settings saved', res.status === 'success' ? 'success' : 'error');
    if (res.status === 'success') {
      setTimeout(() => closeTelegramModal(), 1200);
    }
  })
  .catch(err => {
    if (banner) {
      banner.style.background = 'rgba(16, 185, 129, 0.15)';
      banner.style.color = '#34d399';
      banner.textContent = 'Saved locally in browser!';
    }
    showToast('Saved locally in browser!', 'success');
    setTimeout(() => closeTelegramModal(), 1200);
  });
}

function testTelegramAlert() {
  const token = (document.getElementById('tg-bot-token')?.value || '').trim();
  const chat = (document.getElementById('tg-chat-id')?.value || '').trim();
  const banner = document.getElementById('tg-status-banner');

  if (!token || token.includes('...') || !chat) {
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(244, 63, 94, 0.15)';
      banner.style.color = '#fb7185';
      banner.textContent = '⚠️ Please enter both your Telegram Bot Token and Chat ID first.';
    }
    showToast('Please enter both Bot Token and Chat ID', 'error', 4000);
    return;
  }

  if (banner) {
    banner.style.display = 'block';
    banner.style.background = 'rgba(2, 132, 199, 0.15)';
    banner.style.color = '#38bdf8';
    banner.textContent = 'Sending test alert to Telegram...';
  }

  const dispatchDirectTelegram = async (botToken, chatId) => {
    try {
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const testMsg = `🔔 <b>[TEST] Indian Stock Analyzer Connected!</b>\n━━━━━━━━━━━━━━━━━━━━\n✅ Telegram bot alerts are active.\n⚡ You will receive instant notifications when a stock triggers a volume breakout during NSE/BSE trading hours.\n🌅 Pre-market AI analyst briefing will be delivered at 8:30 AM.\n━━━━━━━━━━━━━━━━━━━━\n⏰ <i>Timestamp: ${nowStr} IST</i>`;
      
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: testMsg,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      const data = await resp.json();
      if (data.ok) {
        if (banner) {
          banner.style.background = 'rgba(16, 185, 129, 0.15)';
          banner.style.color = '#34d399';
          banner.textContent = '✅ Test alert sent successfully! Check your Telegram app.';
        }
        showToast('✅ Test alert sent! Check your Telegram app.', 'success', 5000);
      } else {
        const errDesc = data.description || 'Telegram rejected request';
        if (banner) {
          banner.style.background = 'rgba(244, 63, 94, 0.15)';
          banner.style.color = '#fb7185';
          banner.textContent = `❌ Telegram Error: ${errDesc}`;
        }
        showToast(`Telegram Error: ${errDesc}`, 'error', 5000);
      }
    } catch (err) {
      if (banner) {
        banner.style.background = 'rgba(244, 63, 94, 0.15)';
        banner.style.color = '#fb7185';
        banner.textContent = `❌ Network Error: ${err.message}`;
      }
      showToast(`Network Error: ${err.message}`, 'error', 5000);
    }
  };

  // If on local server, try server endpoint first, fallback to direct dispatch
  const isLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocal) {
    fetch('/api/test_telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_token: token, chat_id: chat })
    })
    .then(r => {
      if (!r.ok) throw new Error('Local server returned status ' + r.status);
      return r.json();
    })
    .then(res => {
      if (res.status === 'success') {
        if (banner) {
          banner.style.background = 'rgba(16, 185, 129, 0.15)';
          banner.style.color = '#34d399';
          banner.textContent = res.message || '✅ Test alert sent! Check your Telegram app.';
        }
        showToast(res.message || '✅ Test alert sent! Check Telegram.', 'success', 5000);
      } else {
        // Fallback to direct client-side fetch if server had issues
        dispatchDirectTelegram(token, chat);
      }
    })
    .catch(() => {
      // Direct client-side dispatch
      dispatchDirectTelegram(token, chat);
    });
  } else {
    // Direct dispatch for GitHub Pages / Web
    dispatchDirectTelegram(token, chat);
  }
}

async function dispatchBriefingToTelegram() {
  const token = (document.getElementById('tg-bot-token')?.value || localStorage.getItem('tg_bot_token') || '').trim();
  const chat = (document.getElementById('tg-chat-id')?.value || localStorage.getItem('tg_chat_id') || '').trim();

  if (!token || token.includes('...') || !chat) {
    showToast('⚠️ Please enter Bot Token and Chat ID first', 'info', 4000);
    openTelegramModal();
    return;
  }

  const briefing = window.AI_BRIEFING;
  if (!briefing) {
    showToast('AI Briefing data not available yet', 'error');
    return;
  }

  const banner = document.getElementById('tg-status-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.style.background = 'rgba(2, 132, 199, 0.15)';
    banner.style.color = '#38bdf8';
    banner.textContent = 'Sending AI Analyst Briefing to Telegram...';
  }
  showToast('Sending AI Analyst Briefing to Telegram...', 'info', 3000);

  const stance = briefing.stance || 'RANGEBOUND NEUTRAL';
  const stanceEmoji = stance.includes('BULLISH') ? '🟢' : (stance.includes('DEFENSIVE') || stance.includes('CAUTION') ? '🔴' : '🟡');
  const nowStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  let lines = [
    `🌅 <b>[PRE-MARKET AI BRIEFING] ${nowStr}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>Market Stance:</b> ${stanceEmoji} <b>${stance}</b>`,
    `💡 <i>${briefing.stance_summary || ''}</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>Nifty 50 Levels:</b> Support <b>${briefing.nifty_support || 'N/A'}</b> | Resistance <b>${briefing.nifty_resistance || 'N/A'}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔥 <b>TOP HIGH-CONVICTION SETUPS TODAY:</b>`
  ];

  if (briefing.top_setups && briefing.top_setups.length) {
    briefing.top_setups.slice(0, 3).forEach(s => {
      const sym = s.symbol || '';
      const name = s.name || sym;
      const price = s.current_price ? Number(s.current_price).toLocaleString('en-IN') : 'N/A';
      const trig = s.trigger ? Number(s.trigger).toLocaleString('en-IN') : 'N/A';
      lines.push(`• <b>${name} (${sym})</b>: ₹${price} | Buy Trigger: ₹${trig}`);
      if (s.rationale) lines.push(`  <i>↳ ${s.rationale}</i>`);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  if (briefing.risk_warning) {
    lines.push(`⚠️ <b>Risk Watch:</b> <i>${briefing.risk_warning}</i>`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  }
  lines.push(`⏰ <i>Pre-Market AI Analyst • Indian Stock Screener</i>`);

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const res = await resp.json();
    if (res.ok) {
      if (banner) {
        banner.style.background = 'rgba(16, 185, 129, 0.15)';
        banner.style.color = '#34d399';
        banner.textContent = '✅ AI Briefing sent to your Telegram!';
      }
      showToast('✅ AI Briefing sent to your Telegram!', 'success', 5000);
    } else {
      const errDesc = res.description || 'Telegram rejected request';
      if (banner) {
        banner.style.background = 'rgba(244, 63, 94, 0.15)';
        banner.style.color = '#fb7185';
        banner.textContent = `❌ Telegram Error: ${errDesc}`;
      }
      showToast(`Telegram Error: ${errDesc}`, 'error', 5000);
    }
  } catch (err) {
    if (banner) {
      banner.style.background = 'rgba(244, 63, 94, 0.15)';
      banner.style.color = '#fb7185';
      banner.textContent = `❌ Network Error: ${err.message}`;
    }
    showToast(`Network Error: ${err.message}`, 'error', 5000);
  }
}


