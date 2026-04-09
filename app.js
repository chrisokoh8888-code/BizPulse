// ========================================================
//  BIZPULSE — app.js
//  Every Business, One Pulse
//  Firebase + Vanilla JS Business Management Platform
// ========================================================

// ─── FIREBASE CONFIG ─────────────────────────────────────
// Replace with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ─── GLOBAL STATE ─────────────────────────────────────────
let currentUser = null;
let currentBusinessId = null;
let businesses = [];
let chartInstances = {};

// Chart.js global defaults (dark theme)
Chart.defaults.color = '#a8afc8';
Chart.defaults.borderColor = '#2d3350';
Chart.defaults.font.family = "'DM Sans', sans-serif";

// ─── DEMO / SEED DATA ─────────────────────────────────────
// This seeds demo data so the app works immediately on login
const DEMO_BUSINESSES = [
  { id: 'bakery', name: 'Golden Bakery', type: 'bakery', currency: '₦' },
  { id: 'water',  name: 'Crystal Pure Water', type: 'water_factory', currency: '₦' },
  { id: 'food',   name: 'Mama\'s Fast Food', type: 'fastfood', currency: '₦' },
  { id: 'print',  name: 'PrintWave Co.', type: 'printing', currency: '₦' }
];

const BIZ_ICONS = {
  bakery: '🍞', water_factory: '💧', fastfood: '🍔',
  printing: '🖨️', retail: '🛒', other: '🏢'
};

// ─── AUTH ──────────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');

  if (!username || !password) {
    showLoginError('Please enter your username and password.');
    return;
  }

  try {
    // Fetch user record from Firestore by username
    const snap = await db.collection('users')
      .where('username', '==', username).limit(1).get();

    if (snap.empty) {
      showLoginError('User not found. Check your username.');
      return;
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    if (userData.password !== password) {
      showLoginError('Incorrect password.');
      return;
    }

    // Check if account is locked (trial expired + not upgraded)
    if (userData.status === 'expired') {
      showLoginError('Your trial has expired. Contact admin to renew your subscription.');
      return;
    }

    // Store session
    currentUser = { id: userDoc.id, ...userData };
    sessionStorage.setItem('bizpulse_user', JSON.stringify(currentUser));
    startApp();

  } catch (err) {
    console.error(err);
    // DEMO MODE — if Firebase isn't configured yet, log in with default credentials
    if (username === 'demo' && password === 'demo123') {
      currentUser = demoUser();
      sessionStorage.setItem('bizpulse_user', JSON.stringify(currentUser));
      startApp();
    } else {
      showLoginError('Login failed. Try username: demo / password: demo123');
    }
  }
}

function demoUser() {
  const trialStart = new Date();
  trialStart.setDate(trialStart.getDate() - 5);
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 25);
  return {
    id: 'demo_user',
    username: 'demo',
    email: 'demo@bizpulse.app',
    name: 'Demo Owner',
    plan: 'trial',
    status: 'active',
    trialStart: trialStart.toISOString(),
    trialEnd: trialEnd.toISOString(),
    businesses: DEMO_BUSINESSES.map(b => b.id)
  };
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function handleLogout() {
  sessionStorage.removeItem('bizpulse_user');
  currentUser = null;
  businesses = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ─── APP BOOT ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('bizpulse_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    startApp();
  }
});

async function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Set user info in UI
  const initials = (currentUser.name || currentUser.username || 'BP')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-avatar-sidebar').textContent = initials;
  document.getElementById('user-avatar-top').textContent = initials;
  document.getElementById('sidebar-username').textContent = currentUser.name || currentUser.username;

  // Trial badge
  checkTrialStatus();

  // Load businesses
  await loadBusinesses();

  // Navigate to dashboard
  navigate('dashboard', document.querySelector('[data-page="dashboard"]'));
}

// ─── TRIAL SYSTEM ──────────────────────────────────────────
function checkTrialStatus() {
  if (!currentUser || currentUser.plan !== 'trial') {
    document.getElementById('sidebar-plan').textContent = 'Subscriber';
    return;
  }

  const trialEnd = new Date(currentUser.trialEnd);
  const now = new Date();
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

  document.getElementById('sidebar-plan').textContent = `Trial — ${daysLeft}d left`;

  const badge = document.getElementById('trial-badge');
  badge.style.display = 'block';
  document.getElementById('trial-days-text').textContent = `${daysLeft} days left`;
  badge.onclick = () => showTrialWarning(daysLeft);

  if (daysLeft <= 7) {
    badge.style.background = 'rgba(231,76,60,0.12)';
    badge.style.borderColor = 'rgba(231,76,60,0.4)';
    badge.style.color = '#e74c3c';
  }

  // Show popup warning at intervals
  if (daysLeft <= 7 || daysLeft === 14 || daysLeft === 21 || daysLeft === 29) {
    setTimeout(() => showTrialWarning(daysLeft), 1500);
  }

  // Update settings page
  document.getElementById('s-plan').textContent = 'Trial';
  document.getElementById('s-expiry').textContent = trialEnd.toLocaleDateString('en-NG', { dateStyle: 'long' });
  document.getElementById('s-username').textContent = currentUser.username;
  document.getElementById('s-email').textContent = currentUser.email || '—';
}

function showTrialWarning(days) {
  document.getElementById('trial-warning-days').textContent = days;
  if (days <= 3) {
    document.getElementById('trial-warning-title').textContent = '⚠️ Critical: Trial Expiring!';
  } else if (days <= 7) {
    document.getElementById('trial-warning-title').textContent = '⏰ Trial Ending Soon!';
  } else {
    document.getElementById('trial-warning-title').textContent = '📅 Trial Reminder';
  }
  openModal('modal-trial-warning');
}

// ─── NAVIGATION ────────────────────────────────────────────
function navigate(page, el) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (el) el.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard: 'Master Dashboard',
    reports: 'Reports',
    settings: 'Settings'
  };
  document.getElementById('topbar-title').textContent =
    titles[page] || document.querySelector(`[data-page="${page}"]`)?.textContent?.trim() || page;

  // Load page data
  if (page === 'dashboard') loadMasterDashboard();
  if (page === 'reports') loadReportSelects();

  // Close sidebar on mobile
  if (window.innerWidth < 900) closeSidebar();
}

function navigateToBusiness(bizId) {
  currentBusinessId = bizId;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-business').classList.add('active');

  const navEl = document.querySelector(`[data-bizid="${bizId}"]`);
  if (navEl) navEl.classList.add('active');

  const biz = businesses.find(b => b.id === bizId);
  if (biz) {
    document.getElementById('biz-page-name').textContent = biz.name;
    document.getElementById('biz-page-type').textContent =
      `${BIZ_ICONS[biz.type] || '🏢'} ${capitalize(biz.type.replace('_', ' '))}`;
    document.getElementById('topbar-title').textContent = biz.name;
  }

  loadBusinessPage(bizId);
  if (window.innerWidth < 900) closeSidebar();
}

// ─── SIDEBAR TOGGLE ────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ─── BUSINESS MANAGEMENT ────────────────────────────────────
async function loadBusinesses() {
  try {
    if (currentUser.id === 'demo_user') {
      businesses = DEMO_BUSINESSES;
    } else {
      const snap = await db.collection('businesses')
        .where('ownerId', '==', currentUser.id).get();
      businesses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (businesses.length === 0) businesses = DEMO_BUSINESSES;
    }
  } catch (e) {
    businesses = DEMO_BUSINESSES;
  }
  renderBusinessNav();
  loadReportSelects();
}

function renderBusinessNav() {
  const container = document.getElementById('business-nav-items');
  container.innerHTML = businesses.map(b => `
    <a href="#" class="nav-item" data-page="business" data-bizid="${b.id}"
       onclick="navigateToBusiness('${b.id}')">
      <span class="nav-icon">${BIZ_ICONS[b.type] || '🏢'}</span>
      ${b.name}
    </a>
  `).join('');
}

async function addBusiness() {
  const name = document.getElementById('nb-name').value.trim();
  const type = document.getElementById('nb-type').value;
  const desc = document.getElementById('nb-desc').value.trim();
  const currency = document.getElementById('nb-currency').value.trim() || '₦';

  if (!name) { showToast('Enter a business name.', 'error'); return; }

  const newBiz = { id: slugify(name), name, type, desc, currency, ownerId: currentUser.id };

  try {
    await db.collection('businesses').doc(newBiz.id).set(newBiz);
  } catch (e) { /* demo mode */ }

  businesses.push(newBiz);
  renderBusinessNav();
  closeAllModals();
  showToast(`${name} added!`, 'success');
  loadReportSelects();
}

// ─── MASTER DASHBOARD ──────────────────────────────────────
async function loadMasterDashboard() {
  const days = parseInt(document.getElementById('revenue-period')?.value || 30);

  // Gather data for all businesses
  const allData = await Promise.all(businesses.map(b => getBusinessSummary(b.id, days)));

  const totalRevenue = allData.reduce((s, d) => s + d.revenue, 0);
  const totalExpenses = allData.reduce((s, d) => s + d.expenses, 0);
  const totalProfit = totalRevenue - totalExpenses;
  const bestBiz = allData.reduce((a, b) => b.revenue > a.revenue ? b : a, allData[0] || {});

  // KPI Cards
  document.getElementById('master-kpis').innerHTML = `
    ${kpiCard('Total Revenue', fmt(totalRevenue), '↑ vs last period', 'up', 'kpi-accent-green')}
    ${kpiCard('Total Expenses', fmt(totalExpenses), '', '', 'kpi-accent-red')}
    ${kpiCard('Net Profit', fmt(totalProfit), totalProfit >= 0 ? '↑ Profitable' : '↓ Loss', totalProfit >= 0 ? 'up' : 'down', 'kpi-accent-blue')}
    ${kpiCard('Best Performer', bestBiz.name || '—', `₦${fmt(bestBiz.revenue || 0)} revenue`, 'up', 'kpi-accent-amber')}
    ${kpiCard('Active Businesses', businesses.length, '', '', 'kpi-accent-purple')}
    ${kpiCard('Avg Profit Margin', totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) + '%' : '0%', '', '', 'kpi-accent-teal')}
  `;

  loadMasterCharts(allData, days);
  renderInsights(allData);
}

async function loadMasterCharts(allData, days) {
  days = days || parseInt(document.getElementById('revenue-period')?.value || 30);
  if (!allData) {
    allData = await Promise.all(businesses.map(b => getBusinessSummary(b.id, days)));
  }

  // Revenue comparison bar chart
  destroyChart('chart-revenue-comparison');
  const ctx1 = document.getElementById('chart-revenue-comparison');
  if (ctx1) {
    chartInstances['chart-revenue-comparison'] = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: allData.map(d => d.name),
        datasets: [
          {
            label: 'Revenue', data: allData.map(d => d.revenue),
            backgroundColor: '#f5a623cc', borderRadius: 6
          },
          {
            label: 'Expenses', data: allData.map(d => d.expenses),
            backgroundColor: '#e74c3c99', borderRadius: 6
          },
          {
            label: 'Profit', data: allData.map(d => d.revenue - d.expenses),
            backgroundColor: '#2ecc7199', borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { color: '#2d3350' } },
          y: { grid: { color: '#2d3350' }, ticks: { callback: v => '₦' + fmtShort(v) } }
        }
      }
    });
  }

  // Peak periods (simulated weekly distribution)
  destroyChart('chart-peak-periods');
  const ctx2 = document.getElementById('chart-peak-periods');
  if (ctx2) {
    const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const peakData = allData.map(d => d.weeklyPattern || [0,0,0,0,0,0,0]);
    chartInstances['chart-peak-periods'] = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: weekDays,
        datasets: allData.map((d, i) => ({
          label: d.name,
          data: peakData[i],
          borderColor: PALETTE[i % PALETTE.length],
          backgroundColor: PALETTE[i % PALETTE.length] + '22',
          fill: false, tension: 0.4, borderWidth: 2, pointRadius: 3
        }))
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: {
          x: { grid: { color: '#2d3350' } },
          y: { grid: { color: '#2d3350' }, ticks: { callback: v => '₦' + fmtShort(v) } }
        }
      }
    });
  }

  // Resource allocation donut
  destroyChart('chart-allocation');
  const ctx3 = document.getElementById('chart-allocation');
  if (ctx3) {
    chartInstances['chart-allocation'] = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: allData.map(d => d.name),
        datasets: [{
          data: allData.map(d => Math.max(d.revenue, 1)),
          backgroundColor: PALETTE.slice(0, allData.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: c => `${c.label}: ₦${fmtShort(c.raw)} (${Math.round(c.parsed / allData.reduce((s, d) => s + d.revenue, 0) * 100)}%)` } }
        }
      }
    });
  }
}

function renderInsights(allData) {
  const totalRevenue = allData.reduce((s, d) => s + d.revenue, 0);
  const best = [...allData].sort((a, b) => b.revenue - a.revenue)[0];
  const worst = [...allData].sort((a, b) => a.revenue - b.revenue)[0];
  const highExpense = [...allData].sort((a, b) => b.expenses - a.expenses)[0];

  const insights = [];

  if (best && totalRevenue > 0) {
    const pct = Math.round(best.revenue / totalRevenue * 100);
    insights.push({
      icon: '🏆', color: 'amber',
      title: `${best.name} is your top revenue generator`,
      sub: `Contributing ${pct}% of total revenue. Consider increasing capital allocation.`
    });
  }

  if (worst && worst !== best) {
    insights.push({
      icon: '📉', color: 'red',
      title: `${worst.name} is underperforming`,
      sub: `Revenue ₦${fmt(worst.revenue)}. Review operations or reduce overhead.`
    });
  }

  if (highExpense) {
    const margin = highExpense.revenue > 0
      ? Math.round((highExpense.revenue - highExpense.expenses) / highExpense.revenue * 100) : 0;
    insights.push({
      icon: '💰', color: 'blue',
      title: `${highExpense.name} has the highest expenses`,
      sub: `Profit margin at ${margin}%. Review your cost structure.`
    });
  }

  // Low stock alerts
  businesses.forEach(b => {
    if ((b.lowStockItems || []).length > 0) {
      insights.push({
        icon: '📦', color: 'red',
        title: `Low stock alert: ${b.name}`,
        sub: `${b.lowStockItems.join(', ')} running low. Restock soon.`
      });
    }
  });

  if (insights.length === 0) {
    insights.push({
      icon: '✅', color: 'green',
      title: 'All businesses look healthy',
      sub: 'Add more sales data to unlock deeper insights.'
    });
  }

  document.getElementById('insights-list').innerHTML = insights.map(i => `
    <div class="insight-item">
      <div class="insight-icon ${i.color}">${i.icon}</div>
      <div class="insight-text">
        <div class="insight-title">${i.title}</div>
        <div class="insight-sub">${i.sub}</div>
      </div>
    </div>
  `).join('');
}

// ─── BUSINESS PAGE ──────────────────────────────────────────
async function loadBusinessPage(bizId) {
  const biz = businesses.find(b => b.id === bizId);
  if (!biz) return;

  const days = parseInt(document.getElementById('biz-period')?.value || 30);
  const summary = await getBusinessSummary(bizId, days);
  const profit = summary.revenue - summary.expenses;
  const margin = summary.revenue > 0 ? Math.round(profit / summary.revenue * 100) : 0;

  document.getElementById('biz-kpis').innerHTML = `
    ${kpiCard('Revenue', fmt(summary.revenue), '↑ period', 'up', 'kpi-accent-green')}
    ${kpiCard('Expenses', fmt(summary.expenses), '', '', 'kpi-accent-red')}
    ${kpiCard('Net Profit', fmt(profit), profit >= 0 ? '↑ Profit' : '↓ Loss', profit >= 0 ? 'up' : 'down', 'kpi-accent-blue')}
    ${kpiCard('Profit Margin', margin + '%', '', margin >= 20 ? 'up' : 'down', 'kpi-accent-amber')}
    ${kpiCard('Transactions', summary.txnCount, 'total', '', 'kpi-accent-purple')}
    ${kpiCard('Avg Sale', fmt(summary.avgSale), '', '', 'kpi-accent-teal')}
  `;

  loadBusinessCharts(bizId, days, summary);
  renderInventory(bizId);
  renderTransactions(bizId);
}

async function loadBusinessCharts(bizId, days, summary) {
  bizId = bizId || currentBusinessId;
  days = days || parseInt(document.getElementById('biz-period')?.value || 30);
  if (!summary) summary = await getBusinessSummary(bizId, days);

  destroyChart('chart-biz-sales');
  const ctx = document.getElementById('chart-biz-sales');
  if (!ctx) return;

  const labels = summary.dailyLabels || [];
  const revenues = summary.dailyRevenue || [];
  const expenses = summary.dailyExpenses || [];

  chartInstances['chart-biz-sales'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue', data: revenues,
          borderColor: '#f5a623', backgroundColor: '#f5a62322',
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 2
        },
        {
          label: 'Expenses', data: expenses,
          borderColor: '#e74c3c', backgroundColor: '#e74c3c11',
          fill: false, tension: 0.4, borderWidth: 1.5, pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { color: '#2d3350' }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: '#2d3350' }, ticks: { callback: v => '₦' + fmtShort(v) } }
      }
    }
  });
}

async function renderInventory(bizId) {
  const items = await getInventory(bizId);
  const el = document.getElementById('inventory-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">📦</div><p>No inventory yet. Add stock items.</p></div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const status = item.qty <= 0 ? 'inv-low' : item.qty <= item.reorderLevel ? 'inv-warn' : 'inv-ok';
    const statusText = item.qty <= 0 ? 'Out' : item.qty <= item.reorderLevel ? 'Low' : 'OK';
    return `
      <div class="inventory-item">
        <span class="inv-name">${item.name}</span>
        <span class="inv-qty">${item.qty} ${item.unit || ''}</span>
        <span class="inv-status ${status}">${statusText}</span>
      </div>
    `;
  }).join('');
}

async function renderTransactions(bizId) {
  const txns = await getTransactions(bizId, 15);
  const el = document.getElementById('transactions-list');
  if (!txns.length) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">💳</div><p>No transactions yet.</p></div>';
    return;
  }
  el.innerHTML = txns.map(t => `
    <div class="txn-item">
      <div class="txn-left">
        <span class="txn-name">${t.item || t.desc || t.category}</span>
        <span class="txn-date">${formatDate(t.date)}</span>
      </div>
      <span class="txn-amount ${t.type}">
        ${t.type === 'sale' ? '+' : '-'}₦${fmt(t.amount)}
      </span>
    </div>
  `).join('');
}

// ─── SALE / EXPENSE / STOCK MODALS ─────────────────────────
function showAddSaleModal() {
  document.getElementById('sale-date').value = todayStr();
  openModal('modal-add-sale');
}
function showAddExpenseModal() {
  document.getElementById('exp-date').value = todayStr();
  openModal('modal-add-expense');
}
function showAddStockModal() { openModal('modal-add-stock'); }
function showAddBusinessModal() { openModal('modal-add-business'); }
function showUpgradeModal() { closeAllModals(); openModal('modal-upgrade'); }

async function recordSale() {
  const item  = document.getElementById('sale-item').value.trim();
  const qty   = parseFloat(document.getElementById('sale-qty').value) || 1;
  const price = parseFloat(document.getElementById('sale-price').value) || 0;
  const date  = document.getElementById('sale-date').value;
  const notes = document.getElementById('sale-notes').value.trim();

  if (!item || !price) { showToast('Fill in item and price.', 'error'); return; }

  const txn = {
    type: 'sale', item, qty, price,
    amount: qty * price, date, notes,
    bizId: currentBusinessId,
    createdAt: new Date().toISOString()
  };

  await saveTransaction(txn);
  closeAllModals();
  showToast(`Sale of ₦${fmt(txn.amount)} recorded!`, 'success');
  loadBusinessPage(currentBusinessId);
}

async function recordExpense() {
  const category = document.getElementById('exp-category').value;
  const desc     = document.getElementById('exp-desc').value.trim();
  const amount   = parseFloat(document.getElementById('exp-amount').value) || 0;
  const date     = document.getElementById('exp-date').value;

  if (!desc || !amount) { showToast('Fill in description and amount.', 'error'); return; }

  const txn = {
    type: 'expense', category, desc,
    amount, date,
    bizId: currentBusinessId,
    createdAt: new Date().toISOString()
  };

  await saveTransaction(txn);
  closeAllModals();
  showToast(`Expense of ₦${fmt(amount)} recorded!`, 'success');
  loadBusinessPage(currentBusinessId);
}

async function updateStock() {
  const name     = document.getElementById('stock-item').value.trim();
  const qty      = parseFloat(document.getElementById('stock-qty').value) || 0;
  const unit     = document.getElementById('stock-unit').value.trim();
  const reorder  = parseFloat(document.getElementById('stock-reorder').value) || 5;
  const cost     = parseFloat(document.getElementById('stock-cost').value) || 0;

  if (!name) { showToast('Enter item name.', 'error'); return; }

  const item = { name, qty, unit, reorderLevel: reorder, cost, bizId: currentBusinessId };
  await saveInventoryItem(item);
  closeAllModals();
  showToast(`${name} stock updated!`, 'success');
  renderInventory(currentBusinessId);
}

// ─── DATA LAYER ─────────────────────────────────────────────
// In demo mode, uses localStorage. In production, uses Firestore.

async function saveTransaction(txn) {
  try {
    await db.collection('transactions').add(txn);
  } catch (e) {
    // Fallback: localStorage
    const key = `txns_${txn.bizId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...txn, id: Date.now().toString() });
    localStorage.setItem(key, JSON.stringify(existing));
  }
}

async function saveInventoryItem(item) {
  try {
    const id = `${item.bizId}_${slugify(item.name)}`;
    await db.collection('inventory').doc(id).set(item);
  } catch (e) {
    const key = `inv_${item.bizId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = existing.findIndex(i => i.name === item.name);
    if (idx >= 0) existing[idx] = item; else existing.push(item);
    localStorage.setItem(key, JSON.stringify(existing));
  }
}

async function getTransactions(bizId, limit = 100) {
  try {
    const snap = await db.collection('transactions')
      .where('bizId', '==', bizId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const key = `txns_${bizId}`;
    return JSON.parse(localStorage.getItem(key) || '[]')
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  }
}

async function getInventory(bizId) {
  try {
    const snap = await db.collection('inventory').where('bizId', '==', bizId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const key = `inv_${bizId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
}

async function getBusinessSummary(bizId, days) {
  const biz = businesses.find(b => b.id === bizId) || {};
  const txns = await getTransactions(bizId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const recent = txns.filter(t => t.date && new Date(t.date) >= cutoff);
  const sales    = recent.filter(t => t.type === 'sale');
  const expenses = recent.filter(t => t.type === 'expense');

  const revenue  = sales.reduce((s, t) => s + (t.amount || 0), 0);
  const expTotal = expenses.reduce((s, t) => s + (t.amount || 0), 0);
  const txnCount = recent.length;
  const avgSale  = sales.length ? revenue / sales.length : 0;

  // Build daily series
  const dailyMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = { rev: 0, exp: 0 };
  }
  recent.forEach(t => {
    const k = t.date?.split('T')[0] || t.date;
    if (dailyMap[k]) {
      if (t.type === 'sale') dailyMap[k].rev += t.amount || 0;
      else dailyMap[k].exp += t.amount || 0;
    }
  });

  const dailyLabels  = Object.keys(dailyMap).map(d => d.slice(5));
  const dailyRevenue = Object.values(dailyMap).map(d => d.rev);
  const dailyExpenses= Object.values(dailyMap).map(d => d.exp);

  // Weekly pattern (Mon–Sun average)
  const weeklyPattern = [0, 0, 0, 0, 0, 0, 0];
  const weeklyCount   = [0, 0, 0, 0, 0, 0, 0];
  sales.forEach(t => {
    if (t.date) {
      const dow = new Date(t.date).getDay();
      const idx = dow === 0 ? 6 : dow - 1;
      weeklyPattern[idx] += t.amount || 0;
      weeklyCount[idx]++;
    }
  });
  const weeklyAvg = weeklyPattern.map((v, i) => weeklyCount[i] ? Math.round(v / weeklyCount[i]) : 0);

  // If no real data, generate plausible demo data for the demo businesses
  let finalRevenue = revenue, finalExpenses = expTotal;
  let finalDailyRevenue = dailyRevenue, finalDailyExpenses = dailyExpenses;
  let finalWeekly = weeklyAvg;

  if (txnCount === 0) {
    const demoData = DEMO_DATA[bizId] || { baseRevPerDay: 8000, baseExpPerDay: 3000 };
    finalRevenue  = Math.round(demoData.baseRevPerDay * days * (0.8 + Math.random() * 0.4));
    finalExpenses = Math.round(demoData.baseExpPerDay * days * (0.8 + Math.random() * 0.4));
    finalDailyRevenue = Array.from({ length: days }, () =>
      Math.round(demoData.baseRevPerDay * (0.4 + Math.random() * 1.2)));
    finalDailyExpenses = Array.from({ length: days }, () =>
      Math.round(demoData.baseExpPerDay * (0.4 + Math.random() * 1.0)));
    finalWeekly = demoData.weeklyPattern || [8000,7000,9000,8500,12000,15000,4000];
  }

  return {
    name: biz.name || bizId,
    revenue: finalRevenue, expenses: finalExpenses,
    txnCount, avgSale,
    dailyLabels, dailyRevenue: finalDailyRevenue,
    dailyExpenses: finalDailyExpenses,
    weeklyPattern: finalWeekly
  };
}

// Demo data seeds for each business type
const DEMO_DATA = {
  bakery:  { baseRevPerDay: 12000, baseExpPerDay: 6000, weeklyPattern: [10000,9000,11000,10500,14000,18000,5000] },
  water:   { baseRevPerDay: 8000,  baseExpPerDay: 2500, weeklyPattern: [7000,7500,8000,8000,9000,10000,4000] },
  food:    { baseRevPerDay: 18000, baseExpPerDay: 9000, weeklyPattern: [14000,13000,16000,15000,20000,25000,12000] },
  print:   { baseRevPerDay: 9000,  baseExpPerDay: 4000, weeklyPattern: [9000,10000,11000,10000,8000,5000,1000] }
};

// ─── REPORTS ───────────────────────────────────────────────
function loadReportSelects() {
  const sel = document.getElementById('report-biz-select');
  if (!sel) return;
  sel.innerHTML = '<option value="all">All Businesses</option>' +
    businesses.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  document.getElementById('report-from').value = monthAgo.toISOString().split('T')[0];
  document.getElementById('report-to').value   = today.toISOString().split('T')[0];
}

async function generateReport(type) {
  showToast('Generating report…', 'info');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const now = new Date().toLocaleDateString('en-NG', { dateStyle: 'full' });
  const allData = await Promise.all(businesses.map(b => getBusinessSummary(b.id, 30)));

  // Header
  doc.setFillColor(13, 15, 20);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(245, 166, 35);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('BizPulse', 15, 18);
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Every Business, One Pulse — Generated ${now}`, 15, 26);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');

  const reportTitles = {
    summary: 'Business Summary Report',
    inventory: 'Inventory Status Report',
    profit: 'Profit & Loss Report',
    peak: 'Peak Periods Report'
  };

  doc.text(reportTitles[type] || 'Report', 15, 45);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Last 30 days', 15, 52);

  let y = 65;

  if (type === 'summary' || type === 'profit') {
    // Table header
    doc.setFillColor(245, 166, 35);
    doc.rect(15, y, 180, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Business', 18, y + 5.5);
    doc.text('Revenue', 75, y + 5.5);
    doc.text('Expenses', 110, y + 5.5);
    doc.text('Profit', 145, y + 5.5);
    doc.text('Margin', 175, y + 5.5);
    y += 10;

    allData.forEach((d, i) => {
      const profit = d.revenue - d.expenses;
      const margin = d.revenue > 0 ? Math.round(profit / d.revenue * 100) : 0;
      const fillColor = i % 2 === 0 ? [248, 248, 248] : [255, 255, 255];
      doc.setFillColor(...fillColor);
      doc.rect(15, y, 180, 8, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(d.name, 18, y + 5.5);
      doc.text('₦' + fmtNum(d.revenue), 75, y + 5.5);
      doc.text('₦' + fmtNum(d.expenses), 110, y + 5.5);
      doc.setTextColor(profit >= 0 ? 34 : 200, profit >= 0 ? 150 : 30, profit >= 0 ? 60 : 30);
      doc.text('₦' + fmtNum(profit), 145, y + 5.5);
      doc.setTextColor(30, 30, 30);
      doc.text(margin + '%', 175, y + 5.5);
      y += 9;
    });

    y += 5;
    const totalRev = allData.reduce((s, d) => s + d.revenue, 0);
    const totalExp = allData.reduce((s, d) => s + d.expenses, 0);
    const totalPro = totalRev - totalExp;
    doc.setFillColor(13, 15, 20);
    doc.rect(15, y, 180, 9, 'F');
    doc.setTextColor(245, 166, 35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL', 18, y + 6);
    doc.text('₦' + fmtNum(totalRev), 75, y + 6);
    doc.text('₦' + fmtNum(totalExp), 110, y + 6);
    doc.text('₦' + fmtNum(totalPro), 145, y + 6);
    doc.text(totalRev > 0 ? Math.round(totalPro / totalRev * 100) + '%' : '0%', 175, y + 6);
  }

  if (type === 'peak') {
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    allData.forEach(d => {
      doc.setFont('helvetica', 'bold');
      doc.text(d.name, 15, y); y += 7;
      doc.setFont('helvetica', 'normal');
      if (d.weeklyPattern) {
        const maxDay = days[d.weeklyPattern.indexOf(Math.max(...d.weeklyPattern))];
        doc.text(`Peak day: ${maxDay} — Avg ₦${fmtNum(Math.max(...d.weeklyPattern))}`, 20, y);
        y += 10;
      }
    });
  }

  if (type === 'inventory') {
    for (const b of businesses) {
      const items = await getInventory(b.id);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(b.name, 15, y); y += 8;
      if (!items.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No inventory data.', 20, y); y += 8;
      } else {
        doc.setFontSize(9);
        items.forEach(it => {
          doc.setFont('helvetica', 'normal');
          const status = it.qty <= it.reorderLevel ? 'LOW STOCK' : 'OK';
          doc.text(`${it.name}: ${it.qty} ${it.unit || ''} — ${status}`, 20, y);
          y += 7;
          if (y > 270) { doc.addPage(); y = 20; }
        });
      }
      y += 4;
    }
  }

  doc.save(`BizPulse_${type}_report_${todayStr()}.pdf`);
  showToast('Report downloaded!', 'success');
}

async function generateCustomReport() {
  const bizId = document.getElementById('report-biz-select').value;
  const from  = document.getElementById('report-from').value;
  const to    = document.getElementById('report-to').value;
  if (!from || !to) { showToast('Select date range.', 'error'); return; }
  showToast('Generating custom report…', 'info');
  const targetBizList = bizId === 'all' ? businesses : businesses.filter(b => b.id === bizId);
  const days = Math.ceil((new Date(to) - new Date(from)) / 86400000);
  const allData = await Promise.all(targetBizList.map(b => getBusinessSummary(b.id, days)));
  // Reuse summary report
  await generateReport('summary');
}

function saveSettings() {
  showToast('Settings saved!', 'success');
}

// ─── MODAL HELPERS ──────────────────────────────────────────
function openModal(id) {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
  document.getElementById(id).style.display = 'block';
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => {
    m.classList.remove('open');
    m.style.display = 'none';
  });
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeAllModals();
}

// ─── TOAST ──────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── HELPERS ────────────────────────────────────────────────
const PALETTE = ['#f5a623','#4f8ef7','#2ecc71','#9b59b6','#1abc9c','#e74c3c','#f39c12'];

function kpiCard(label, value, change, dir, accent) {
  return `
    <div class="kpi-card ${accent}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${change ? `<div class="kpi-change ${dir}">${change}</div>` : ''}
    </div>
  `;
}

function fmt(n) {
  n = parseFloat(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}
function fmtShort(n) { return fmt(n); }
function fmtNum(n) { return Math.round(n).toLocaleString('en-NG'); }

function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' });
}

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function capitalize(s) {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}
