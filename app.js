const memoryStore = {};
let storageAvailable = false;
let html5QrCode = null;

const FX_CURRENCIES = ['USD', 'JPY', 'CNY', 'KRW', 'EUR', 'GBP'];
const FX_SYMBOLS = { USD: '$', JPY: '¥', CNY: '¥', KRW: '₩', EUR: '€', GBP: '£' };
const FX_NAMES = { USD: '美金', JPY: '日幣', CNY: '人民幣', KRW: '韓元', EUR: '歐元', GBP: '英鎊' };

function safeGetItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      storageAvailable = true;
      return val;
    }
  } catch (e) {
    storageAvailable = false;
  }
  return memoryStore[key] || null;
}

function safeSetItem(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      storageAvailable = true;
      return;
    }
  } catch (e) {
    storageAvailable = false;
  }
  memoryStore[key] = value;
}

function updateStorageStatus() {
  const el = document.getElementById('storageStatus');
  if (!el) return;
  if (storageAvailable) {
    el.textContent = 'LocalStorage 自動儲存中';
    el.style.color = 'var(--text-muted)';
  } else {
    el.textContent = '記憶體模式（若於沙盒預覽重新整理會重置）';
    el.style.color = 'var(--text-muted)';
  }
}

const DEFAULT_ACCOUNTS = ['中信', '國泰', '聯邦', '元大', '富邦莊敬', '富邦仁愛', '現金', '他人支付'];
const DEFAULT_DATA = {
  accounts: Object.fromEntries(DEFAULT_ACCOUNTS.map(a => [a, 0])),
  accountList: [...DEFAULT_ACCOUNTS],
  fxCash: { USD: 0, JPY: 0, CNY: 0, KRW: 0, EUR: 0, GBP: 0 },
  fxRates: { USD: 32.85, JPY: 0.2075, CNY: 4.91, KRW: 0.0238, EUR: 35.42, GBP: 42.15 },
  jpyCash: 0,
  jpyRate: 0.2075,
  usdCash: 0,
  usdRate: 32.85,
  fxExchanges: [],
  monthlyBudget: 50000,
  dividendGoal: 10000,
  showDividendGoal: true,
  showTithe: true,
  chartsIncludeInvest: false,
  chartTimeRange: 'month',
  chartPalette: 'gray',
  txViewMode: 'card',
  stxViewMode: 'table',
  projectViewMode: 'card',
  txDateSortAsc: false,
  stxDateSortAsc: false,
  stocksSortOrder: 'custom',
  fundsSortOrder: 'custom',
  fixedSortOrder: 'date_desc',
  projectsSortOrder: 'date_desc',
  freelanceSortOrder: 'date_desc',
  freelanceFilter: 'all',
  showClosedStocks: false,
  showClosedFunds: false,
  showArchivedProjects: false,
  stockPrices: {},
  stockYields: {},
  stockCustomOverrides: {},
  fundPrices: {},
  fundRates: {},
  fundCurrencies: {},
  fundCustomOverrides: {},
  ignoredHoldings: [],
  sectionsOpen: { fixed: true, envelopes: true, project: true, freelance: true },
  tithePool: 0,
  titheDonatedThisMonth: 0,
  lastTitheMonth: '',
  budgetIncludeInvest: false,
  envelopes: [],
  transactions: [],
  stockTransactions: [],
  fixedItems: [],
  projects: [],
  freelances: []
};

let data = JSON.parse(JSON.stringify(DEFAULT_DATA));
let categoryChart = null;
let necessaryChart = null;
let accountChart = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return '$0';
  const s = n < 0 ? '-' : '';
  return s + '$' + Math.abs(Math.round(n)).toLocaleString('zh-TW');
}

// 損益格式化：數字純白亮色，+-符號獨立加大特粗
function formatPLHtml(pl) {
  const rounded = Math.round(pl || 0);
  if (rounded > 0) {
    return `<span class="bold tabular text-sm" style="color:var(--text)"><span class="text-base font-black mr-0.5">+</span>${formatMoney(rounded)}</span>`;
  } else if (rounded < 0) {
    return `<span class="bold tabular text-sm" style="color:var(--text)"><span class="text-base font-black mr-0.5">-</span>${formatMoney(Math.abs(rounded))}</span>`;
  } else {
    return `<span class="tabular text-sm opacity-60" style="color:var(--text)">$0</span>`;
  }
}

function parseAmount(str) {
  if (!str || typeof str !== 'string') return 0;
  str = str.trim().replace(/,/g, '');
  try {
    if (!/^[\d\s+\-*/().]+$/.test(str)) return parseFloat(str) || 0;
    const r = Function('"use strict";return(' + str + ')')();
    return typeof r === 'number' && isFinite(r) ? r : 0;
  } catch {
    return parseFloat(str) || 0;
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function syncDateFromText(val) {
  const trimmed = (val || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    document.getElementById('txDateNative').value = trimmed;
  }
}

function syncDateFromNative(val) {
  document.getElementById('txDateText').value = val;
}

function handleReceiptFileSelect(input) {
  const span = document.getElementById('txReceiptFileName');
  if (input.files && input.files[0]) {
    span.textContent = input.files[0].name;
    span.style.color = 'var(--text)';
  } else {
    span.textContent = '未選擇任何檔案';
    span.style.color = 'var(--text-muted)';
  }
}

function saveData() {
  if (data.fxCash) {
    data.usdCash = data.fxCash.USD || 0;
    data.jpyCash = data.fxCash.JPY || 0;
  }
  if (data.fxRates) {
    data.usdRate = data.fxRates.USD || 32.85;
    data.jpyRate = data.fxRates.JPY || 0.2075;
  }
  safeSetItem('pf_app_v3', JSON.stringify(data));
  updateStorageStatus();
}

function loadData() {
  const raw = safeGetItem('pf_app_v3');
  if (raw) {
    try {
      const p = JSON.parse(raw);
      data = Object.assign({}, DEFAULT_DATA, p);
      if (!data.accountList || !data.accountList.length) data.accountList = [...DEFAULT_ACCOUNTS];
      data.accountList.forEach(a => { if (data.accounts[a] === undefined) data.accounts[a] = 0; });
      if (!data.fxExchanges) data.fxExchanges = [];
      if (!data.fxCash) {
        data.fxCash = {
          USD: parseFloat(p.usdCash) || 0,
          JPY: parseFloat(p.jpyCash) || 0,
          CNY: 0, KRW: 0, EUR: 0, GBP: 0
        };
      } else {
        FX_CURRENCIES.forEach(c => { if (data.fxCash[c] === undefined) data.fxCash[c] = 0; });
      }
      if (!data.fxRates) {
        data.fxRates = {
          USD: parseFloat(p.usdRate) || 32.85,
          JPY: parseFloat(p.jpyRate) || 0.2075,
          CNY: 4.91, KRW: 0.0238, EUR: 35.42, GBP: 42.15
        };
      } else {
        FX_CURRENCIES.forEach(c => { if (!data.fxRates[c]) data.fxRates[c] = DEFAULT_DATA.fxRates[c]; });
      }
      if (data.dividendGoal === undefined) data.dividendGoal = 10000;
      if (data.showDividendGoal === undefined) data.showDividendGoal = true;
      if (data.showTithe === undefined) data.showTithe = true;
      if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };
      if (data.chartsIncludeInvest === undefined) data.chartsIncludeInvest = false;
      if (!data.chartTimeRange) data.chartTimeRange = 'month';
      if (!data.chartPalette) data.chartPalette = 'gray';
      if (!data.txViewMode) data.txViewMode = window.innerWidth > 768 ? 'table' : 'card';
      if (!data.stxViewMode) data.stxViewMode = 'table';
      if (!data.projectViewMode) data.projectViewMode = 'card';
      if (data.txDateSortAsc === undefined) data.txDateSortAsc = false;
      if (data.stxDateSortAsc === undefined) data.stxDateSortAsc = false;
      if (!data.stocksSortOrder) data.stocksSortOrder = 'custom';
      if (!data.fundsSortOrder) data.fundsSortOrder = 'custom';
      if (!data.fixedSortOrder) data.fixedSortOrder = 'date_desc';
      if (!data.projectsSortOrder) data.projectsSortOrder = 'date_desc';
      if (!data.freelanceSortOrder) data.freelanceSortOrder = 'date_desc';
      if (!data.freelanceFilter) data.freelanceFilter = 'all';
      if (data.showClosedStocks === undefined) data.showClosedStocks = false;
      if (data.showClosedFunds === undefined) data.showClosedFunds = false;
      if (data.showArchivedProjects === undefined) data.showArchivedProjects = false;
      if (!data.stockPrices) data.stockPrices = {};
      if (!data.stockYields) data.stockYields = {};
      if (!data.stockCustomOverrides) data.stockCustomOverrides = {};
      if (!data.fundPrices) data.fundPrices = {};
      if (!data.fundRates) data.fundRates = {};
      if (!data.fundCurrencies) data.fundCurrencies = {};
      if (!data.fundCustomOverrides) data.fundCustomOverrides = {};
      if (!data.ignoredHoldings) data.ignoredHoldings = [];

      (data.stockTransactions || []).forEach(st => {
        if (st.shares !== undefined) st.shares = Math.abs(st.shares);
        if (st.price !== undefined) st.price = Math.abs(st.price);
        if (st.total !== undefined) st.total = Math.abs(st.total);
        if (st.totalCost !== undefined) st.totalCost = Math.abs(st.totalCost);
        if (st.fee !== undefined) st.fee = Math.abs(st.fee);
        if (st.tax !== undefined) st.tax = Math.abs(st.tax);
      });

      let fixedTimestamps = false;
      (data.fixedItems || []).forEach((f, idx) => {
        if (!f.createdAt) { f.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
      });
      (data.projects || []).forEach((p, idx) => {
        if (!p.createdAt) { p.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
      });
      (data.freelances || []).forEach((fl, idx) => {
        if (!fl.createdAt) { fl.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
        if (fl.status === '進行中') { fl.status = '待收款'; fixedTimestamps = true; }
      });
      if (fixedTimestamps) saveData();

      let freelanceFixed = false;
      (data.freelances || []).forEach(f => {
        if (f.status === '已收款') {
          const targetDate = f.payDate || f.execDate;
          const tx = (data.transactions || []).find(t =>
            (f.linkedTxId && t.id === f.linkedTxId) ||
            (t.name === f.name + '（接案收款）' && Math.abs(t.amount - f.amount) < 1)
          );
          if (tx) {
            if (!f.linkedTxId) { f.linkedTxId = tx.id; freelanceFixed = true; }
            if (targetDate && tx.date !== targetDate) {
              tx.date = targetDate;
              freelanceFixed = true;
            }
          }
        }
      });
      if (freelanceFixed) saveData();
    } catch {
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }
  const cm = currentMonthStr();
  if (data.lastTitheMonth !== cm) {
    data.titheDonatedThisMonth = 0;
    data.lastTitheMonth = cm;
    saveData();
  }
  updateStorageStatus();
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  safeSetItem('pf_theme', isDark ? 'dark' : 'light');
  if (document.getElementById('tab-charts').classList.contains('active')) renderCharts();
}

function initTheme() {
  const saved = safeGetItem('pf_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  const t = document.getElementById('tab-' + tab);
  if (t) t.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.tab === tab) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  populateAllAccountSelects();
  populateProjectSelect();
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'transactions') {
    populateEnvelopeSelect();
    const tday = todayStr();
    if (!document.getElementById('txDateText').value) {
      document.getElementById('txDateText').value = tday;
      document.getElementById('txDateNative').value = tday;
    }
    if (!document.getElementById('filterDateFrom').value) {
      resetTxMonthFilter();
    } else {
      renderTransactions();
    }
  }
  if (tab === 'investments') renderInvestments();
  if (tab === 'stockTx') {
    if (!document.getElementById('stxDate').value) {
      document.getElementById('stxDate').value = todayStr();
    }
    renderStockTransactions();
  }
  if (tab === 'fx') renderFxPage();
  if (tab === 'fixed') {
    renderEnvelopes();
    renderFixedSection();
  }
  if (tab === 'charts') renderCharts();
}

function populateAllAccountSelects() {
  const selects = ['txAccount', 'filterAccount', 'stxAccount', 'fixedAccount', 'freelanceAccount', 'fxFromAccount', 'fxToAccount', 'editTxAccount', 'editStxAccount'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = id === 'filterAccount' ? '<option value="">全部帳戶</option>' : '';
    (data.accountList || DEFAULT_ACCOUNTS).forEach(acc => {
      sel.innerHTML += `<option value="${acc}">${acc}</option>`;
    });
    if (id === 'fxFromAccount' || id === 'fxToAccount') {
      FX_CURRENCIES.forEach(c => {
        sel.innerHTML += `<option value="${FX_NAMES[c]}現金">${FX_NAMES[c]}現金 (${c})</option>`;
      });
    }
    if (cur) sel.value = cur;
  });
}

function populateProjectSelect() {
  const sel = document.getElementById('txProject');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">日常消費（無專案）</option>';
  (data.projects || []).filter(p => p.status !== 'archived').forEach(p => {
    sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
  sel.value = cur;
}

function openScanModal() {
  openModal('scanModal');
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      document.getElementById('txNote').value = decodedText;
      document.getElementById('txName').value = '掃碼: ' + decodedText.slice(0, 10);
      stopScanner();
      alert('掃碼成功，已自動填入備註！');
    },
    () => {}
  ).catch(() => {
    alert('無法開啟相機，請檢查瀏覽器相機權限');
    stopScanner();
  });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      closeModal('scanModal');
    }).catch(() => {
      closeModal('scanModal');
    });
  } else {
    closeModal('scanModal');
  }
}

function importInvoiceCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let text = e.target.result.replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) return alert('CSV 內容為空');

      function parseCSVLine(line) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            result.push(cur.trim().replace(/^"|"$/g, '').trim());
            cur = '';
          } else cur += char;
        }
        result.push(cur.trim().replace(/^"|"$/g, '').trim());
        return result;
      }

      let headerIdx = -1;
      let headers = [];
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const row = parseCSVLine(lines[i]);
        if (row.some(c => c === '發票日期' || c.includes('品名') || c === '賣方名稱' || c === '發票金額')) {
          headerIdx = i;
          headers = row;
          break;
        }
      }
      if (headerIdx === -1) { headerIdx = 0; headers = parseCSVLine(lines[0]); }

      let itemIdx = headers.findIndex(h => h === '消費明細_品名' || h === '品名');
      let sellerIdx = headers.findIndex(h => h === '賣方名稱');
      let amtIdx = headers.findIndex(h => h === '消費明細_金額');
      if (amtIdx === -1) amtIdx = headers.findIndex(h => h === '發票金額');
      let dateIdx = headers.findIndex(h => h === '發票日期');

      if (dateIdx === -1) dateIdx = 1;
      if (amtIdx === -1) amtIdx = 3;
      if (itemIdx === -1 && sellerIdx === -1) itemIdx = headers.length - 1;

      let count = 0;
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cleanCols = parseCSVLine(lines[i]);
        if (cleanCols.length > Math.max(dateIdx, amtIdx)) {
          const dateRaw = cleanCols[dateIdx] || '';
          let displayName = itemIdx !== -1 && cleanCols[itemIdx] ? cleanCols[itemIdx] : (sellerIdx !== -1 && cleanCols[sellerIdx] ? cleanCols[sellerIdx] : '載具消費');
          const amtRaw = cleanCols[amtIdx] ? cleanCols[amtIdx].replace(/[$,]/g, '') : '0';
          const amt = Math.abs(parseFloat(amtRaw) || 0);

          let dateFormatted = todayStr();
          const cleanDate = dateRaw.split(' ')[0].replace(/\//g, '-').replace(/\./g, '-');
          if (/^20\d{2}-\d{1,2}-\d{1,2}$/.test(cleanDate)) {
            const p = cleanDate.split('-');
            dateFormatted = `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
          }

          if (amt > 0) {
            data.transactions.push({
              id: uid(), date: dateFormatted, name: displayName, amount: -amt, category: '食', account: '他人支付', necessary: 'necessary', note: '', envelopeId: '', projectId: '', receipt: ''
            });
            count++;
          }
        }
      }
      saveData();
      renderTransactions();
      renderDashboard();
      alert(`🎉 成功匯入 ${count} 筆載具發票紀錄！`);
    } catch (err) {
      alert('解析 CSV 失敗：' + err.message);
    }
  };
  try { reader.readAsText(file, 'Big5'); } catch (e) { reader.readAsText(file, 'UTF-8'); }
  event.target.value = '';
}

function calcFxRatePreview() {
  const fromAmt = parseFloat(document.getElementById('fxFromAmount').value) || 0;
  const toAmt = parseFloat(document.getElementById('fxToAmount').value) || 0;
  const fromCur = document.getElementById('fxFromCurrency').value;
  const toCur = document.getElementById('fxToCurrency').value;
  const preview = document.getElementById('fxCalculatedRate');
  if (fromAmt > 0 && toAmt > 0) {
    const decimals = (toCur === 'JPY' || toCur === 'KRW') ? 4 : 2;
    preview.textContent = (fromAmt / toAmt).toFixed(decimals) + ` ${fromCur}/${toCur}`;
  } else {
    preview.textContent = '--';
  }
}

function applyFxBalanceChange(fx, isReverse = false) {
  const m = isReverse ? -1 : 1;
  if (!data.fxCash) data.fxCash = { USD: 0, JPY: 0, CNY: 0, KRW: 0, EUR: 0, GBP: 0 };

  if (fx.fromCur === 'TWD') {
    data.accounts[fx.fromAcc] = (data.accounts[fx.fromAcc] || 0) - m * fx.fromAmt;
  } else if (data.fxCash[fx.fromCur] !== undefined) {
    data.fxCash[fx.fromCur] = Math.max(0, (data.fxCash[fx.fromCur] || 0) - m * fx.fromAmt);
  }

  if (fx.toCur === 'TWD') {
    data.accounts[fx.toAcc] = (data.accounts[fx.toAcc] || 0) + m * fx.toAmt;
  } else if (data.fxCash[fx.toCur] !== undefined) {
    data.fxCash[fx.toCur] = Math.max(0, (data.fxCash[fx.toCur] || 0) + m * fx.toAmt);
  }
}

function openFxEdit(id) {
  const fx = data.fxExchanges.find(x => x.id === id);
  if (!fx) return;
  document.getElementById('fxEditId').value = fx.id;
  document.getElementById('fxFormTitle').textContent = '編輯換匯紀錄';
  document.getElementById('fxSubmitBtn').textContent = '儲存修改';
  document.getElementById('fxCancelEditBtn').classList.remove('hidden');

  document.getElementById('fxDate').value = fx.date || todayStr();
  document.getElementById('fxFromCurrency').value = fx.fromCur || 'TWD';
  document.getElementById('fxFromAccount').value = fx.fromAcc;
  document.getElementById('fxFromAmount').value = fx.fromAmt;
  document.getElementById('fxToCurrency').value = fx.toCur || 'JPY';
  document.getElementById('fxToAccount').value = fx.toAcc;
  document.getElementById('fxToAmount').value = fx.toAmt;
  document.getElementById('fxNote').value = fx.note || '';
  calcFxRatePreview();
}

function cancelFxEdit() {
  document.getElementById('fxEditId').value = '';
  document.getElementById('fxFormTitle').textContent = '新增換匯';
  document.getElementById('fxSubmitBtn').textContent = '儲存換匯';
  document.getElementById('fxCancelEditBtn').classList.add('hidden');
  document.getElementById('fxFromAmount').value = '';
  document.getElementById('fxToAmount').value = '';
  document.getElementById('fxNote').value = '';
  calcFxRatePreview();
}

function saveFxExchange() {
  const editId = document.getElementById('fxEditId').value;
  const date = document.getElementById('fxDate').value || todayStr();
  const fromCur = document.getElementById('fxFromCurrency').value;
  const fromAcc = document.getElementById('fxFromAccount').value;
  const fromAmt = parseFloat(document.getElementById('fxFromAmount').value) || 0;
  const toCur = document.getElementById('fxToCurrency').value;
  const toAcc = document.getElementById('fxToAccount').value;
  const toAmt = parseFloat(document.getElementById('fxToAmount').value) || 0;
  const note = document.getElementById('fxNote').value.trim();

  if (fromAmt <= 0 || toAmt <= 0) return alert('請輸入有效的換匯金額');
  if (fromCur === toCur && fromAcc === toAcc) return alert('同幣別且同帳戶無須換匯');

  const rate = fromAmt / toAmt;
  const txTitle = `換匯：${fromAcc} (${fromCur}) ➔ ${toAcc} (${toAmt.toLocaleString()} ${toCur})`;
  const txNote = note || `匯率 ${rate.toFixed(4)}`;

  if (editId) {
    const oldFx = data.fxExchanges.find(x => x.id === editId);
    if (!oldFx) return;
    applyFxBalanceChange(oldFx, true);

    oldFx.date = date;
    oldFx.fromCur = fromCur;
    oldFx.fromAcc = fromAcc;
    oldFx.fromAmt = fromAmt;
    oldFx.toCur = toCur;
    oldFx.toAcc = toAcc;
    oldFx.toAmt = toAmt;
    oldFx.rate = rate;
    oldFx.note = note;

    applyFxBalanceChange(oldFx, false);

    const linkedTx = data.transactions.find(t =>
      (oldFx.linkedTxId && t.id === oldFx.linkedTxId) ||
      (t.category === '轉帳/換匯' && t.date === oldFx.date && t.name.startsWith('換匯：'))
    );
    if (linkedTx) {
      linkedTx.date = date;
      linkedTx.name = txTitle;
      linkedTx.amount = fromCur === 'TWD' ? -fromAmt : (toCur === 'TWD' ? toAmt : 0);
      linkedTx.account = fromAcc;
      linkedTx.note = txNote;
    }
    cancelFxEdit();
  } else {
    const linkedTxId = uid();
    const newFx = { id: uid(), date, fromCur, fromAcc, fromAmt, toCur, toAcc, toAmt, rate, note, linkedTxId };
    applyFxBalanceChange(newFx, false);
    data.fxExchanges.push(newFx);

    data.transactions.push({
      id: linkedTxId, date,
      name: txTitle,
      amount: fromCur === 'TWD' ? -fromAmt : (toCur === 'TWD' ? toAmt : 0),
      category: '轉帳/換匯', account: fromAcc,
      necessary: 'necessary', note: txNote, envelopeId: '', projectId: '', receipt: ''
    });

    document.getElementById('fxFromAmount').value = '';
    document.getElementById('fxToAmount').value = '';
    document.getElementById('fxNote').value = '';
    calcFxRatePreview();
  }

  saveData();
  renderFxPage();
  renderDashboard();
  renderTransactions();
}

function deleteFxExchange(id) {
  const fx = data.fxExchanges.find(x => x.id === id);
  if (!fx) return;
  if (!confirm('確定刪除此換匯紀錄？帳戶與外幣餘額將自動回滾')) return;

  applyFxBalanceChange(fx, true);
  if (fx.linkedTxId) {
    data.transactions = data.transactions.filter(t => t.id !== fx.linkedTxId);
  }
  data.fxExchanges = data.fxExchanges.filter(x => x.id !== id);
  if (document.getElementById('fxEditId').value === id) cancelFxEdit();
  saveData();
  renderFxPage();
  renderDashboard();
  renderTransactions();
}

function renderFxPage() {
  // 6 大幣值即時參考匯率（3 欄對齊）
  if (data.fxRates) {
    document.getElementById('fx_usd_display').textContent = `USD ${(data.fxRates.USD || 32.85).toFixed(2)}`;
    document.getElementById('fx_eur_display').textContent = `EUR ${(data.fxRates.EUR || 35.42).toFixed(2)}`;
    document.getElementById('fx_gbp_display').textContent = `GBP ${(data.fxRates.GBP || 42.15).toFixed(2)}`;
    document.getElementById('fx_cny_display').textContent = `CNY ${(data.fxRates.CNY || 4.91).toFixed(2)}`;
    document.getElementById('fx_jpy_display').textContent = `JPY ${(data.fxRates.JPY || 0.2075).toFixed(4)}`;
    document.getElementById('fx_krw_display').textContent = `KRW ${(data.fxRates.KRW || 0.0238).toFixed(4)}`;
  }

  // 均價計算
  FX_CURRENCIES.forEach(cur => {
    const el = document.getElementById('avgCost_' + cur);
    if (!el) return;
    const twdSpent = data.fxExchanges.filter(x => x.toCur === cur && x.fromCur === 'TWD').reduce((s, x) => s + x.fromAmt, 0);
    const curGot = data.fxExchanges.filter(x => x.toCur === cur && x.fromCur === 'TWD').reduce((s, x) => s + x.toAmt, 0);
    const decimals = (cur === 'JPY' || cur === 'KRW') ? 4 : 2;
    el.textContent = curGot > 0 ? (twdSpent / curGot).toFixed(decimals) : '--';
  });

  if (!document.getElementById('fxDate').value) {
    document.getElementById('fxDate').value = todayStr();
  }

  // 歷史換匯紀錄（方法 2：兩行結構化展示，無折行破版）
  const sortedFx = [...data.fxExchanges].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  document.getElementById('fxHistoryList').innerHTML = sortedFx.map(x => {
    const decimals = (x.toCur === 'JPY' || x.toCur === 'KRW') ? 4 : 2;
    return `
      <div class="pill p-3 flex justify-between items-center text-xs">
        <div class="space-y-0.5">
          <div>
            <span class="bold tabular">${x.date}</span>
            <span class="font-bold ml-2">${x.fromAcc} ➔ ${x.toAcc}</span>
          </div>
          <div class="tabular font-semibold" style="color:var(--text-muted)">
            <span>${x.fromAmt.toLocaleString()} ${x.fromCur} ➔ ${x.toAmt.toLocaleString()} ${x.toCur}</span>
            <span class="ml-1.5">· 匯率 ${(x.rate || 0).toFixed(decimals)}</span>
          </div>
          ${x.note ? `<div class="text-[11px] font-semibold pt-0.5" style="color:var(--text-muted)">備註：${x.note}</div>` : ''}
        </div>
        <div class="flex gap-1.5 shrink-0 ml-3">
          <button onclick="openFxEdit('${x.id}')" class="btn text-xs px-2.5 py-1">編</button>
          <button onclick="deleteFxExchange('${x.id}')" class="btn text-xs px-2.5 py-1">刪</button>
        </div>
      </div>
    `;
  }).join('') || '<p class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無換匯紀錄</p>';
}

let draggedAccountItem = null;

function openAccountEditModal() {
  renderAccountEditList();
  FX_CURRENCIES.forEach(c => {
    const inp = document.getElementById('fxCashInput_' + c);
    if (inp) inp.value = (data.fxCash && data.fxCash[c]) || 0;
  });
  document.getElementById('newAccountName').value = '';
  openModal('accountModal');
}

function renderAccountEditList() {
  const container = document.getElementById('accountEditFields');
  container.innerHTML = '';
  (data.accountList || DEFAULT_ACCOUNTS).forEach((name, index) => {
    const item = document.createElement('div');
    item.className = 'drag-item pill p-2.5 flex items-center gap-2 border border-zinc-200 dark:border-zinc-800';
    item.draggable = true;
    item.dataset.index = index;

    item.innerHTML = `
      <div class="drag-handle text-zinc-400 dark:text-zinc-600 px-1 py-2 text-base font-mono">⠿</div>
      <div class="flex-1">
        <span class="text-xs font-bold">${name}</span>
        <input type="number" data-account="${name}" class="input mt-1 account-edit-input tabular text-xs" value="${data.accounts[name] || 0}" step="any" />
      </div>
      <button onclick="removeAccount('${name}')" class="btn text-xs px-2.5 py-1" style="color:var(--text-muted)">移除</button>
    `;

    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);

    container.appendChild(item);
  });
}

function handleDragStart(e) {
  draggedAccountItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const container = document.getElementById('accountEditFields');
  const draggingElement = document.querySelector('.dragging');
  const siblings = [...container.querySelectorAll('.drag-item:not(.dragging)')];
  const nextSibling = siblings.find(sibling => {
    return e.clientY <= sibling.getBoundingClientRect().top + sibling.offsetHeight / 2;
  });
  container.insertBefore(draggingElement, nextSibling);
}

function handleDrop(e) { e.stopPropagation(); }

function handleDragEnd() {
  this.classList.remove('dragging');
  const newOrder = [];
  document.querySelectorAll('#accountEditFields .account-edit-input').forEach(input => {
    newOrder.push(input.dataset.account);
  });
  data.accountList = newOrder;
}

function addNewAccount() {
  const name = document.getElementById('newAccountName').value.trim();
  if (!name) return alert('請輸入帳戶名稱');
  if (!data.accountList) data.accountList = [...DEFAULT_ACCOUNTS];
  if (data.accountList.includes(name)) return alert('帳戶已存在');
  data.accountList.push(name);
  data.accounts[name] = 0;
  saveData();
  renderAccountEditList();
  populateAllAccountSelects();
  document.getElementById('newAccountName').value = '';
}

function removeAccount(name) {
  if (data.accountList.length <= 1) return alert('至少保留一個帳戶');
  if (!confirm(`確定移除「${name}」？`)) return;
  data.accountList = data.accountList.filter(a => a !== name);
  delete data.accounts[name];
  saveData();
  renderAccountEditList();
  populateAllAccountSelects();
}

function saveAccounts() {
  const newOrder = [];
  document.querySelectorAll('.account-edit-input').forEach(inp => {
    const accName = inp.dataset.account;
    data.accounts[accName] = parseFloat(inp.value) || 0;
    newOrder.push(accName);
  });
  data.accountList = newOrder;
  if (!data.fxCash) data.fxCash = {};
  FX_CURRENCIES.forEach(c => {
    const inp = document.getElementById('fxCashInput_' + c);
    if (inp) data.fxCash[c] = parseFloat(inp.value) || 0;
  });
  saveData();
  closeModal('accountModal');
  populateAllAccountSelects();
  renderDashboard();
}

async function updateFxRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    if (json && json.rates && json.rates.TWD) {
      const usdToTwd = json.rates.TWD;
      if (!data.fxRates) data.fxRates = {};
      data.fxRates.USD = usdToTwd;
      ['JPY', 'CNY', 'KRW', 'EUR', 'GBP'].forEach(c => {
        if (json.rates[c]) data.fxRates[c] = usdToTwd / json.rates[c];
      });
      saveData();
      renderFxPage();
      renderDashboard();
      renderInvestments();
      return true;
    }
  } catch (e) {}
  return false;
}

async function updateStockPrices() {
  const computed = computePortfolioFromTransactions();
  const symbols = Object.keys(computed.stocks);
  if (!symbols.length) return true;

  for (let sym of symbols) {
    try {
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}.TW`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl);
      const json = await res.json();
      const curPrice = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (curPrice) { data.stockPrices[sym] = curPrice; }
    } catch (err) {}
  }
  saveData();
  renderInvestments();
  renderDashboard();
  return true;
}

// 最頂部即時現價更新：觸發旋轉動畫
async function refreshAllAssets() {
  const svg = document.getElementById('refreshAssetSvg');
  if (svg) svg.classList.add('spinning');
  await updateFxRates();
  await updateStockPrices();
  setTimeout(() => {
    if (svg) svg.classList.remove('spinning');
    alert('🎉 已完成最新股票報價與 6 大外幣匯率同步！');
  }, 750);
}

function promptDividendGoal() {
  const cur = data.dividendGoal || 10000;
  const input = prompt('請輸入每月預估股息目標金額：', cur);
  if (input !== null) {
    const val = parseFloat(input);
    if (!isNaN(val) && val > 0) {
      data.dividendGoal = val;
      saveData();
      renderInvestments();
    }
  }
}

function toggleDividendDisplay() {
  data.showDividendGoal = !data.showDividendGoal;
  saveData();
  renderInvestments();
}

function toggleTitheDisplay() {
  data.showTithe = !data.showTithe;
  saveData();
  renderDashboard();
}

function toggleSection(sec) {
  if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };
  data.sectionsOpen[sec] = !data.sectionsOpen[sec];
  saveData();
  if (sec === 'envelopes') renderEnvelopes();
  else renderFixedSection();
}

function toggleBudgetMode() {
  data.budgetIncludeInvest = !data.budgetIncludeInvest;
  document.getElementById('budgetToggle').classList.toggle('on', data.budgetIncludeInvest);
  saveData();
  renderDashboard();
}

function saveMonthlyBudget() {
  const val = parseFloat(document.getElementById('monthlyBudgetInput').value);
  data.monthlyBudget = isNaN(val) ? 0 : val;
  saveData();
  renderDashboard();
}

function isExcludedFromDailyExpense(t) {
  const cat = t.category || '';
  if (cat === '轉帳/換匯' || cat.includes('轉帳') || cat.includes('換匯')) return true;
  if (cat === '折' || cat === '收' || cat === '息' || cat === '什一') return true;
  if (t.account === '他人支付') return true;
  return false;
}

function calcMonthSpent() {
  const cm = currentMonthStr();
  return data.transactions
    .filter(t => {
      if (!t.date || !t.date.startsWith(cm)) return false;
      if (t.amount >= 0) return false;
      if (!data.budgetIncludeInvest && t.category === '投') return false;
      if (isExcludedFromDailyExpense(t)) return false;
      if (t.projectId) return false;
      return true;
    })
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

function calcTitheShould() {
  const cm = currentMonthStr();
  const income = data.transactions
    .filter(t => t.date && t.date.startsWith(cm) && (t.category === '收' || t.category === '息') && t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  return Math.round(income * 0.1);
}

function recordTitheDonation() {
  const amount = parseFloat(document.getElementById('titheDonateAmount').value);
  if (!amount || amount <= 0) return alert('請輸入奉獻金額');
  data.tithePool = Math.max(0, (data.tithePool || 0) - amount);
  data.titheDonatedThisMonth = (data.titheDonatedThisMonth || 0) + amount;
  data.transactions.push({
    id: uid(), date: todayStr(), name: '什一奉獻',
    amount: -amount, category: '什一', account: '現金', necessary: 'necessary', note: '奉獻池提撥', envelopeId: '', projectId: '', receipt: ''
  });
  data.accounts['現金'] = (data.accounts['現金'] || 0) - amount;
  saveData();
  document.getElementById('titheDonateAmount').value = '';
  renderDashboard();
  alert('已記錄奉獻 $' + amount.toLocaleString());
}

function computePortfolioFromTransactions() {
  const stocks = {};
  const funds = {};
  const ignored = new Set(data.ignoredHoldings || []);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  const sortedTxs = [...data.stockTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  sortedTxs.forEach(t => {
    const sym = (t.symbol || '').trim();
    if (!sym || ignored.has(sym)) return;

    const shares = Math.abs(t.shares || 0);
    const cost = Math.abs(t.totalCost !== undefined ? t.totalCost : (t.total + (t.fee || 0) + (t.tax || 0)));
    const assetType = t.assetType || '股票';

    if (assetType === '基金') {
      const cur = data.fundCurrencies[sym] || 'USD';
      if (!funds[sym]) {
        funds[sym] = {
          name: sym, currency: cur, units: 0, costTotal: 0,
          totalBoughtCost: 0, totalSoldIncome: 0, totalDividend: 0, latestPrice: t.price || 0,
          lastTxDate: t.date || ''
        };
      }
      funds[sym].lastTxDate = t.date || '';
      if (t.type === '買入') {
        if (funds[sym].units === 0) funds[sym].costTotal = 0;
        funds[sym].units += shares;
        funds[sym].costTotal += cost;
        funds[sym].totalBoughtCost += cost;
        if (t.price) funds[sym].latestPrice = t.price;
      } else if (t.type === '賣出') {
        const curUnits = funds[sym].units;
        const avgCost = curUnits > 0 ? (funds[sym].costTotal / curUnits) : 0;
        funds[sym].units = Math.max(0, curUnits - shares);
        funds[sym].costTotal = funds[sym].units > 0 ? Math.max(0, funds[sym].units * avgCost) : 0;
        funds[sym].totalSoldIncome += cost;
      } else if (t.type === '配息') {
        funds[sym].totalDividend += cost;
      }
    } else {
      if (!stocks[sym]) {
        stocks[sym] = {
          symbol: sym, shares: 0, costTotal: 0, latestPrice: t.price || 0,
          totalBoughtCost: 0, totalSoldIncome: 0, totalDividend: 0,
          recentOneYearDividend: 0, lastTxDate: t.date || ''
        };
      }
      stocks[sym].lastTxDate = t.date || '';
      if (t.type === '買入') {
        if (stocks[sym].shares === 0) stocks[sym].costTotal = 0;
        stocks[sym].shares += shares;
        stocks[sym].costTotal += cost;
        stocks[sym].totalBoughtCost += cost;
        if (t.price) stocks[sym].latestPrice = t.price;
      } else if (t.type === '賣出') {
        const curShares = stocks[sym].shares;
        const avgCost = curShares > 0 ? (stocks[sym].costTotal / curShares) : 0;
        stocks[sym].shares = Math.max(0, curShares - shares);
        stocks[sym].costTotal = stocks[sym].shares > 0 ? Math.max(0, stocks[sym].shares * avgCost) : 0;
        stocks[sym].totalSoldIncome += cost;
      } else if (t.type === '配息') {
        stocks[sym].totalDividend += cost;
        if (t.date && t.date >= oneYearAgoStr) {
          stocks[sym].recentOneYearDividend += cost;
        }
      }
    }
  });

  Object.keys(data.stockCustomOverrides || {}).forEach(sym => {
    if (ignored.has(sym)) return;
    const o = data.stockCustomOverrides[sym];
    if (!stocks[sym]) {
      stocks[sym] = {
        symbol: sym, shares: 0, costTotal: 0, latestPrice: 0,
        totalBoughtCost: 0, totalSoldIncome: 0, totalDividend: 0, recentOneYearDividend: 0, lastTxDate: ''
      };
    }
    if (o.shares !== undefined) stocks[sym].shares = o.shares;
    if (o.avgCost !== undefined) stocks[sym].costTotal = (stocks[sym].shares || 0) * o.avgCost;
    if (o.price !== undefined) stocks[sym].latestPrice = o.price;
  });

  Object.keys(data.fundCustomOverrides || {}).forEach(name => {
    if (ignored.has(name)) return;
    const o = data.fundCustomOverrides[name];
    if (!funds[name]) {
      funds[name] = {
        name: name, currency: data.fundCurrencies[name] || 'USD', units: 0, costTotal: 0,
        totalBoughtCost: 0, totalSoldIncome: 0, totalDividend: 0, latestPrice: 0, lastTxDate: ''
      };
    }
    if (o.units !== undefined) funds[name].units = o.units;
    if (o.avgCost !== undefined) funds[name].costTotal = (funds[name].units || 0) * o.avgCost;
    if (o.price !== undefined) funds[name].latestPrice = o.price;
  });

  return { stocks, funds };
}

function getCurrencyRate(cur, customRate) {
  if (cur === 'TWD') return 1;
  if (customRate !== undefined && customRate !== null && !isNaN(customRate)) return customRate;
  return (data.fxRates && data.fxRates[cur]) || DEFAULT_DATA.fxRates[cur] || 1;
}

function renderDashboard() {
  const twdCash = (data.accountList || DEFAULT_ACCOUNTS).reduce((s, a) => s + (parseFloat(data.accounts[a]) || 0), 0);
  let fxTotalTwd = 0;
  FX_CURRENCIES.forEach(c => {
    const amt = (data.fxCash && data.fxCash[c]) || 0;
    const rate = getCurrencyRate(c);
    fxTotalTwd += amt * rate;
  });
  const totalCash = twdCash + fxTotalTwd;

  const computed = computePortfolioFromTransactions();
  let invest = 0;

  Object.values(computed.stocks).forEach(s => {
    const price = data.stockPrices[s.symbol] !== undefined ? data.stockPrices[s.symbol] : (s.latestPrice || 0);
    invest += s.shares * price;
  });

  Object.values(computed.funds).forEach(f => {
    const price = data.fundPrices[f.name] !== undefined ? data.fundPrices[f.name] : (f.latestPrice || 0);
    const rate = getCurrencyRate(f.currency, data.fundRates[f.name]);
    invest += f.units * price * rate;
  });

  const cm = currentMonthStr();
  const inc = data.transactions.filter(t => t.date && t.date.startsWith(cm) && t.amount > 0 && t.category !== '轉帳/換匯').reduce((s, t) => s + t.amount, 0);
  const exp = data.transactions.filter(t => t.date && t.date.startsWith(cm) && t.amount < 0 && t.category !== '轉帳/換匯').reduce((s, t) => s + Math.abs(t.amount), 0);

  document.getElementById('netWorth').textContent = formatMoney(totalCash + invest);
  document.getElementById('totalTwdCash').textContent = formatMoney(twdCash);
  document.getElementById('totalCash').textContent = formatMoney(totalCash);
  document.getElementById('totalInvest').textContent = formatMoney(invest);

  if (document.activeElement !== document.getElementById('monthlyBudgetInput')) {
    document.getElementById('monthlyBudgetInput').value = data.monthlyBudget || '';
  }
  document.getElementById('budgetToggle').classList.toggle('on', !!data.budgetIncludeInvest);

  const spent = calcMonthSpent();
  const remain = (data.monthlyBudget || 0) - spent;
  document.getElementById('monthSpent').textContent = formatMoney(spent);
  document.getElementById('monthRemain').textContent = formatMoney(remain);

  document.getElementById('dashMonthIncome').textContent = formatMoney(inc);
  document.getElementById('dashMonthExpense').textContent = formatMoney(exp);

  const titheToggle = document.getElementById('titheToggle');
  const titheBody = document.getElementById('titheBody');
  titheToggle.classList.toggle('on', data.showTithe !== false);
  if (data.showTithe === false) {
    titheBody.classList.add('hidden');
  } else {
    titheBody.classList.remove('hidden');
    document.getElementById('titheShould').textContent = formatMoney(calcTitheShould());
    document.getElementById('titheDone').textContent = formatMoney(data.titheDonatedThisMonth || 0);
    document.getElementById('tithePool').textContent = formatMoney(data.tithePool || 0);
  }

  // 帳戶餘額卡片
  const accDiv = document.getElementById('accountsOverview');
  const twdCards = (data.accountList || DEFAULT_ACCOUNTS).map(name => {
    const bal = data.accounts[name] || 0;
    return `
      <div class="pill p-3 flex flex-col justify-between h-20 text-center">
        <p class="text-xs font-bold truncate" style="color:var(--text-muted)">${name}</p>
        <p class="heavy text-sm tabular">${formatMoney(bal)}</p>
      </div>`;
  }).join('');

  const fxCards = FX_CURRENCIES.filter(c => c === 'USD' || c === 'JPY' || ((data.fxCash && data.fxCash[c]) || 0) > 0).map(c => {
    const bal = (data.fxCash && data.fxCash[c]) || 0;
    const rate = getCurrencyRate(c);
    const twdEq = Math.round(bal * rate);
    const twdDisplay = twdEq >= 10000 ? `≈ ${(twdEq / 10000).toFixed(1)}萬` : `≈ $${twdEq.toLocaleString()}`;

    return `
      <div class="pill p-3 flex flex-col justify-between h-20 text-center">
        <div class="flex items-center justify-center gap-1 text-xs font-bold" style="color:var(--text-muted)">
          <span class="truncate">${FX_NAMES[c]}</span>
          <span class="tabular opacity-80 shrink-0">· ${twdDisplay}</span>
        </div>
        <p class="heavy text-sm tabular">${FX_SYMBOLS[c]}${bal.toLocaleString()}</p>
      </div>`;
  }).join('');

  accDiv.innerHTML = twdCards + fxCards;
}

function openEnvelopeModal(id = null) {
  document.getElementById('envelopeEditId').value = id || '';
  document.getElementById('envelopeModalTitle').textContent = id ? '編輯信封' : '新增信封';
  if (id) {
    const e = data.envelopes.find(x => x.id === id);
    if (e) {
      document.getElementById('envelopeName').value = e.name;
      document.getElementById('envelopeBudget').value = e.budget;
      document.getElementById('envelopeCategory').value = e.category || '';
    }
  } else {
    document.getElementById('envelopeName').value = '';
    document.getElementById('envelopeBudget').value = '';
    document.getElementById('envelopeCategory').value = '';
  }
  openModal('envelopeModal');
}

function saveEnvelope() {
  const id = document.getElementById('envelopeEditId').value;
  const name = document.getElementById('envelopeName').value.trim();
  const budget = parseFloat(document.getElementById('envelopeBudget').value) || 0;
  const category = document.getElementById('envelopeCategory').value;
  if (!name) return alert('請輸入信封名稱');
  if (id) {
    const e = data.envelopes.find(x => x.id === id);
    if (e) { e.name = name; e.budget = budget; e.category = category; }
  } else {
    data.envelopes.push({ id: uid(), name, budget, category });
  }
  saveData();
  closeModal('envelopeModal');
  renderEnvelopes();
  populateEnvelopeSelect();
}

function deleteEnvelope(id) {
  if (!confirm('確定刪除此信封？')) return;
  data.envelopes = data.envelopes.filter(e => e.id !== id);
  saveData();
  renderEnvelopes();
  populateEnvelopeSelect();
}

function renderEnvelopes() {
  const cm = currentMonthStr();
  const list = document.getElementById('envelopesList');
  if (!list) return;
  if (!data.envelopes.length) {
    list.innerHTML = '<p class="text-xs font-semibold text-center py-4" style="color:var(--text-muted)">尚未建立任何信封袋</p>';
    return;
  }
  list.innerHTML = data.envelopes.map(e => {
    const spent = data.transactions
      .filter(t => t.envelopeId === e.id && t.date && t.date.startsWith(cm) && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const remain = e.budget - spent;
    const pct = e.budget > 0 ? Math.min(100, (spent / e.budget) * 100) : 0;
    return `
      <div class="pill p-3 space-y-1.5">
        <div class="flex justify-between items-center">
          <div>
            <span class="bold text-sm">${e.name}</span>
            <span class="text-xs ml-1 font-semibold" style="color:var(--text-muted)">(${e.category || '未指定'})</span>
          </div>
          <div class="flex gap-2">
            <button onclick="openEnvelopeModal('${e.id}')" class="text-xs font-bold" style="color:var(--text-muted)">編輯</button>
            <button onclick="deleteEnvelope('${e.id}')" class="text-xs font-bold" style="color:var(--text-muted)">刪除</button>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between text-xs tabular font-bold">
          <span style="color:var(--text-muted)">已用 ${formatMoney(spent)} / 預算 ${formatMoney(e.budget)}</span>
          <span class="heavy">剩餘 ${formatMoney(remain)}</span>
        </div>
      </div>`;
  }).join('');
}

function populateEnvelopeSelect() {
  const sel = document.getElementById('txEnvelope');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">不指定</option>';
  data.envelopes.forEach(e => sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
  sel.value = cur;
}

function onCategoryChange() {
  const cat = document.getElementById('txCategory').value;
  const env = data.envelopes.find(e => e.category === cat);
  if (env) document.getElementById('txEnvelope').value = env.id;
}

async function addTransaction() {
  const date = document.getElementById('txDateText').value.trim() || todayStr();
  const name = document.getElementById('txName').value.trim();
  const amountStr = document.getElementById('txAmount').value;
  const amount = parseAmount(amountStr);
  const category = document.getElementById('txCategory').value;
  const account = document.getElementById('txAccount').value;
  const projectId = document.getElementById('txProject').value;
  const envelopeId = document.getElementById('txEnvelope').value;
  const necessary = document.querySelector('input[name="txNecessary"]:checked').value;
  const note = document.getElementById('txNote').value.trim();
  const fileInput = document.getElementById('txReceiptInput');

  if (!name) return alert('請輸入項目名稱');
  if (amount === 0 && amountStr.trim() !== '0') return alert('金額輸入有誤');

  let receiptData = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    receiptData = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    });
  }

  data.accounts[account] = (data.accounts[account] || 0) + amount;
  
  if ((category === '收' || category === '息') && amount > 0 && date.startsWith(currentMonthStr())) {
    data.tithePool = (data.tithePool || 0) + Math.round(amount * 0.1);
  }

  data.transactions.push({
    id: uid(), date, name, amount, category, account, necessary, note, envelopeId, projectId, receipt: receiptData
  });
  saveData();

  document.getElementById('txName').value = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';
  if (fileInput) fileInput.value = '';
  document.getElementById('txReceiptFileName').textContent = '未選擇任何檔案';
  document.getElementById('txReceiptFileName').style.color = 'var(--text-muted)';
  renderTransactions();
  renderDashboard();
  renderFixedSection();
}

function openTxEditModal(id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;
  document.getElementById('editTxId').value = tx.id;
  document.getElementById('editTxDate').value = tx.date;
  document.getElementById('editTxName').value = tx.name;
  document.getElementById('editTxAmount').value = tx.amount;
  document.getElementById('editTxCategory').value = tx.category;
  document.getElementById('editTxAccount').value = tx.account;
  document.getElementById('editTxNecessary').value = tx.necessary || 'necessary';
  document.getElementById('editTxNote').value = tx.note || '';
  openModal('txEditModal');
}

function saveTxEdit() {
  const id = document.getElementById('editTxId').value;
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;

  const newDate = document.getElementById('editTxDate').value || todayStr();
  const newName = document.getElementById('editTxName').value.trim();
  const newAmt = parseAmount(document.getElementById('editTxAmount').value);
  const newCat = document.getElementById('editTxCategory').value;
  const newAcc = document.getElementById('editTxAccount').value;
  const newNec = document.getElementById('editTxNecessary').value;
  const newNote = document.getElementById('editTxNote').value.trim();

  if (!newName) return alert('請輸入項目名稱');

  data.accounts[tx.account] = (data.accounts[tx.account] || 0) - tx.amount;
  data.accounts[newAcc] = (data.accounts[newAcc] || 0) + newAmt;

  tx.date = newDate;
  tx.name = newName;
  tx.amount = newAmt;
  tx.category = newCat;
  tx.account = newAcc;
  tx.necessary = newNec;
  tx.note = newNote;

  saveData();
  closeModal('txEditModal');
  renderTransactions();
  renderDashboard();
  renderFixedSection();
}

function viewReceipt(id) {
  const tx = data.transactions.find(t => t.id === id);
  if (tx && tx.receipt) {
    document.getElementById('receiptImagePreview').src = tx.receipt;
    openModal('receiptModal');
  }
}

function deleteTransaction(id) {
  if (!confirm('確定刪除此筆記錄？帳戶餘額將自動回滾')) return;
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;
  data.accounts[tx.account] = (data.accounts[tx.account] || 0) - tx.amount;
  if ((tx.category === '收' || tx.category === '息') && tx.amount > 0 && tx.date.startsWith(currentMonthStr())) {
    data.tithePool = Math.max(0, (data.tithePool || 0) - Math.round(tx.amount * 0.1));
  }
  data.transactions = data.transactions.filter(t => t.id !== id);
  saveData();
  renderTransactions();
  renderDashboard();
  renderFixedSection();
}

function setTxFilterRange(range) {
  const btnMonth = document.getElementById('txRange_month');
  const btnAll = document.getElementById('txRange_all');
  if (range === 'month') {
    btnMonth.classList.add('active');
    btnAll.classList.remove('active');
    resetTxMonthFilter();
  } else {
    btnAll.classList.add('active');
    btnMonth.classList.remove('active');
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    renderTransactions();
  }
}

function resetTxMonthFilter() {
  const cm = currentMonthStr();
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  document.getElementById('filterDateFrom').value = `${cm}-01`;
  document.getElementById('filterDateTo').value = `${cm}-${String(lastDay).padStart(2, '0')}`;
  renderTransactions();
}

function setTxViewMode(mode) {
  data.txViewMode = mode;
  document.getElementById('txView_card').classList.toggle('active', mode === 'card');
  document.getElementById('txView_table').classList.toggle('active', mode === 'table');
  saveData();
  renderTransactions();
}

function toggleTxDateSort() {
  data.txDateSortAsc = !data.txDateSortAsc;
  saveData();
  renderTransactions();
}

function renderTransactions() {
  const from = document.getElementById('filterDateFrom').value;
  const to = document.getElementById('filterDateTo').value;
  const cat = document.getElementById('filterCategory').value;
  const acc = document.getElementById('filterAccount').value;
  const nec = document.getElementById('filterNecessary').value;
  const kw = document.getElementById('filterKeyword').value.trim().toLowerCase();

  let list = [...data.transactions];
  if (from) list = list.filter(t => t.date >= from);
  if (to) list = list.filter(t => t.date <= to);
  if (cat) list = list.filter(t => t.category === cat);
  if (acc) list = list.filter(t => t.account === acc);
  if (nec) list = list.filter(t => t.necessary === nec);
  if (kw) list = list.filter(t => (t.name || '').toLowerCase().includes(kw) || (t.note || '').toLowerCase().includes(kw));

  list.sort((a, b) => {
    return data.txDateSortAsc
      ? (a.date || '').localeCompare(b.date || '')
      : (b.date || '').localeCompare(a.date || '');
  });

  const arrowEl = document.getElementById('txSortArrow');
  if (arrowEl) arrowEl.textContent = data.txDateSortAsc ? '▲' : '▼';

  const subtotal = list.reduce((s, t) => s + t.amount, 0);
  document.getElementById('txSubtotal').textContent = formatMoney(subtotal);

  const isCard = data.txViewMode === 'card';
  document.getElementById('txTableView').classList.toggle('hidden', isCard);
  document.getElementById('txCardView').classList.toggle('hidden', !isCard);

  if (isCard) {
    document.getElementById('txCardView').innerHTML = list.map(t => {
      const env = data.envelopes.find(e => e.id === t.envelopeId);
      const proj = data.projects.find(p => p.id === t.projectId);
      const tag = proj ? `[專] ${proj.name}` : (env ? env.name : '');
      const receiptBtn = t.receipt ? `<button onclick="viewReceipt('${t.id}')" class="text-xs px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 font-bold">📸 查看</button>` : '';
      return `
        <div class="pill p-3 space-y-2 text-xs">
          <div class="flex justify-between items-center">
            <div>
              <span class="tabular font-bold" style="color:var(--text-muted)">${t.date}</span>
              <span class="badge ${t.necessary === 'necessary' ? 'badge-nec' : 'badge-non'} ml-1.5">${t.category}</span>
              <strong class="text-sm bold ml-2">${t.name}</strong>
            </div>
            <div>
              <strong class="heavy text-sm tabular">${formatMoney(t.amount)}</strong>
            </div>
          </div>
          <div class="flex justify-between items-center text-[11px] font-semibold" style="color:var(--text-muted)">
            <span>${t.account} · ${t.necessary === 'necessary' ? '必要' : '非必要'} ${tag ? `· ${tag}` : ''}</span>
            <div class="flex items-center gap-2">
              ${receiptBtn}
              <button onclick="openTxEditModal('${t.id}')" class="text-xs font-bold ml-1" style="color:var(--text-muted)">編</button>
              <button onclick="deleteTransaction('${t.id}')" class="btn text-xs px-2 py-0.5">刪</button>
            </div>
          </div>
          ${t.note ? `<div class="text-[11px] font-semibold pt-0.5" style="color:var(--text-muted)">備註：${t.note}</div>` : ''}
        </div>
      `;
    }).join('') || '<p class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無明細紀錄</p>';
  } else {
    const tbody = document.getElementById('txTableBody');
    tbody.innerHTML = list.map(t => {
      const env = data.envelopes.find(e => e.id === t.envelopeId);
      const proj = data.projects.find(p => p.id === t.projectId);
      const tag = proj ? `[專] ${proj.name}` : (env ? env.name : '');
      const receiptBtn = t.receipt ? `<button onclick="viewReceipt('${t.id}')" class="text-xs px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 font-bold">📸 查看</button>` : '<span style="color:var(--text-muted)">-</span>';
      return `
        <tr class="whitespace-nowrap">
          <td class="tabular font-bold" style="color:var(--text-muted)">${t.date}</td>
          <td class="bold">${t.name}</td>
          <td class="tabular heavy text-right">${formatMoney(t.amount)}</td>
          <td>${t.category}</td>
          <td>${t.account}</td>
          <td><span class="badge ${t.necessary === 'necessary' ? 'badge-nec' : 'badge-non'}">${t.necessary === 'necessary' ? '必要' : '非必要'}</span></td>
          <td style="color:var(--text-muted)">${tag}</td>
          <td class="text-center">${receiptBtn}</td>
          <td style="color:var(--text-muted)">${t.note || ''}</td>
          <td class="text-center">
            <button onclick="openTxEditModal('${t.id}')" class="text-xs font-bold mr-1.5" style="color:var(--text-muted)">編</button>
            <button onclick="deleteTransaction('${t.id}')" class="btn text-xs px-2 py-0.5">刪</button>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="10" class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無明細紀錄</td></tr>';
  }
}

function toggleShowClosedStocks(checked) {
  data.showClosedStocks = checked;
  saveData();
  renderInvestments();
}

function toggleShowClosedFunds(checked) {
  data.showClosedFunds = checked;
  saveData();
  renderInvestments();
}

function onStockSortChange(val) {
  data.stocksSortOrder = val;
  saveData();
  renderInvestments();
}

function onFundSortChange(val) {
  data.fundsSortOrder = val;
  saveData();
  renderInvestments();
}

function updateStockLivePrice(sym, val) {
  data.stockPrices[sym] = parseFloat(val) || 0;
  saveData();
  renderInvestments();
  renderDashboard();
}

function updateStockLiveYield(sym, val) {
  data.stockYields[sym] = parseFloat(val) || 0;
  saveData();
  renderInvestments();
}

function updateFundLivePrice(name, val) {
  data.fundPrices[name] = parseFloat(val) || 0;
  saveData();
  renderInvestments();
  renderDashboard();
}

function updateFundLiveRate(name, val) {
  data.fundRates[name] = parseFloat(val) || 1;
  saveData();
  renderInvestments();
  renderDashboard();
}

function updateFundLiveCurrency(name, val) {
  data.fundCurrencies[name] = val;
  data.fundRates[name] = getCurrencyRate(val);
  saveData();
  renderInvestments();
  renderDashboard();
}

function onEditModalCurrencyChange(val) {
  const rateInput = document.getElementById('editHoldingRate');
  const r = getCurrencyRate(val);
  rateInput.value = (val === 'JPY' || val === 'KRW') ? r.toFixed(4) : r.toFixed(2);
}

function openHoldingEdit(type, sym) {
  const computed = computePortfolioFromTransactions();
  document.getElementById('editHoldingType').value = type;
  document.getElementById('editHoldingSymbol').value = sym;
  document.getElementById('editHoldingNameDisplay').value = sym;

  if (type === 'stock') {
    const s = computed.stocks[sym] || {};
    const avgCost = s.shares > 0 ? (s.costTotal / s.shares) : 0;
    const curPrice = data.stockPrices[sym] !== undefined ? data.stockPrices[sym] : (s.latestPrice || 0);

    document.getElementById('editHoldingSharesLabel').textContent = '持有股數';
    document.getElementById('editHoldingCostLabel').textContent = '均價成本';
    document.getElementById('editHoldingPriceLabel').textContent = '現價';

    document.getElementById('editHoldingShares').value = s.shares || 0;
    document.getElementById('editHoldingCost').value = avgCost ? avgCost.toFixed(2) : 0;
    document.getElementById('editHoldingPrice').value = curPrice;

    document.getElementById('holdingYieldField').classList.remove('hidden');
    document.getElementById('holdingRateField').classList.add('hidden');
    document.getElementById('holdingCurrencyField').classList.add('hidden');

    let yld = data.stockYields[sym];
    if (yld === undefined && s.shares > 0 && curPrice > 0 && s.recentOneYearDividend > 0) {
      yld = ((s.recentOneYearDividend / (s.shares * curPrice)) * 100).toFixed(2);
    }
    document.getElementById('editHoldingYield').value = yld !== undefined ? yld : '';
  } else {
    const f = computed.funds[sym] || {};
    const cur = data.fundCurrencies[sym] || 'USD';
    const avgCost = f.units > 0 ? (f.costTotal / f.units) : 0;
    const curPrice = data.fundPrices[sym] !== undefined ? data.fundPrices[sym] : (f.latestPrice || 0);
    const curRate = getCurrencyRate(cur, data.fundRates[sym]);

    document.getElementById('editHoldingSharesLabel').textContent = '持有單位 (股數)';
    document.getElementById('editHoldingCostLabel').textContent = '均價成本 (原幣)';
    document.getElementById('editHoldingPriceLabel').textContent = '現價 (原幣淨值)';

    document.getElementById('editHoldingShares').value = f.units || 0;
    document.getElementById('editHoldingCost').value = avgCost ? avgCost.toFixed(2) : 0;
    document.getElementById('editHoldingPrice').value = curPrice;
    document.getElementById('editHoldingRate').value = curRate;

    document.getElementById('holdingYieldField').classList.add('hidden');
    document.getElementById('holdingRateField').classList.remove('hidden');
    document.getElementById('holdingCurrencyField').classList.remove('hidden');
    document.getElementById('editHoldingCurrency').value = cur;
  }
  openModal('holdingEditModal');
}

function saveHoldingEdit() {
  const type = document.getElementById('editHoldingType').value;
  const sym = document.getElementById('editHoldingSymbol').value;

  if (type === 'stock') {
    const shares = parseFloat(document.getElementById('editHoldingShares').value) || 0;
    const avgCost = parseFloat(document.getElementById('editHoldingCost').value) || 0;
    const price = parseFloat(document.getElementById('editHoldingPrice').value) || 0;
    const yld = parseFloat(document.getElementById('editHoldingYield').value);

    if (!data.stockCustomOverrides) data.stockCustomOverrides = {};
    data.stockCustomOverrides[sym] = { shares, avgCost, price };
    data.stockPrices[sym] = price;
    if (!isNaN(yld)) data.stockYields[sym] = yld;
  } else {
    const units = parseFloat(document.getElementById('editHoldingShares').value) || 0;
    const avgCost = parseFloat(document.getElementById('editHoldingCost').value) || 0;
    const price = parseFloat(document.getElementById('editHoldingPrice').value) || 0;
    const cur = document.getElementById('editHoldingCurrency').value;
    const rate = parseFloat(document.getElementById('editHoldingRate').value) || 1;

    if (!data.fundCustomOverrides) data.fundCustomOverrides = {};
    data.fundCustomOverrides[sym] = { units, avgCost, price };
    data.fundPrices[sym] = price;
    data.fundCurrencies[sym] = cur;
    data.fundRates[sym] = cur === 'TWD' ? 1 : rate;
  }
  saveData();
  closeModal('holdingEditModal');
  renderInvestments();
  renderDashboard();
}

function deleteHolding(sym) {
  if (!confirm(`確定將「${sym}」從投資清單移除？`)) return;
  if (!data.ignoredHoldings) data.ignoredHoldings = [];
  data.ignoredHoldings.push(sym);
  saveData();
  renderInvestments();
  renderDashboard();
}

function sortHoldingsList(list, sortOrder, type) {
  const sorted = [...list];
  if (sortOrder === 'name_asc') {
    sorted.sort((a, b) => (type === 'stock' ? a.symbol : a.name).localeCompare(type === 'stock' ? b.symbol : b.name));
  } else if (sortOrder === 'name_desc') {
    sorted.sort((a, b) => (type === 'stock' ? b.symbol : b.name).localeCompare(type === 'stock' ? a.symbol : a.name));
  } else if (sortOrder === 'mv_desc') {
    sorted.sort((a, b) => {
      const mvA = type === 'stock'
        ? a.shares * (data.stockPrices[a.symbol] || a.latestPrice || 0)
        : a.units * (data.fundPrices[a.name] || a.latestPrice || 0) * getCurrencyRate(a.currency, data.fundRates[a.name]);
      const mvB = type === 'stock'
        ? b.shares * (data.stockPrices[b.symbol] || b.latestPrice || 0)
        : b.units * (data.fundPrices[b.name] || b.latestPrice || 0) * getCurrencyRate(b.currency, data.fundRates[b.name]);
      return mvB - mvA;
    });
  } else if (sortOrder === 'shares_desc' || sortOrder === 'units_desc') {
    sorted.sort((a, b) => (type === 'stock' ? b.shares - a.shares : b.units - a.units));
  } else if (sortOrder === 'recent_tx') {
    sorted.sort((a, b) => (b.lastTxDate || '').localeCompare(a.lastTxDate || ''));
  }
  return sorted;
}

function renderInvestments() {
  const computed = computePortfolioFromTransactions();

  const divToggle = document.getElementById('dividendToggle');
  const divBody = document.getElementById('dividendBody');
  divToggle.classList.toggle('on', data.showDividendGoal !== false);

  let estMonthly = 0;
  let stocksTotal = 0;

  let stockList = Object.values(computed.stocks);
  if (!data.showClosedStocks) stockList = stockList.filter(s => s.shares > 0);

  const stockSortSel = document.getElementById('stocksSortOrder');
  if (stockSortSel) stockSortSel.value = data.stocksSortOrder || 'custom';
  stockList = sortHoldingsList(stockList, data.stocksSortOrder || 'custom', 'stock');

  document.getElementById('showClosedStocksCheck').checked = !!data.showClosedStocks;

  document.getElementById('stocksTableBody').innerHTML = stockList.map(s => {
    const isClosed = s.shares === 0;
    const price = data.stockPrices[s.symbol] !== undefined ? data.stockPrices[s.symbol] : (s.latestPrice || 0);
    const avgCost = s.shares > 0 ? (s.costTotal / s.shares) : 0;
    const mv = s.shares * price;
    
    let pl = 0;
    if (isClosed) {
      pl = (s.totalSoldIncome + s.totalDividend) - s.totalBoughtCost;
    } else {
      pl = mv - s.costTotal;
    }

    let yldDisplay = '';
    if (data.stockYields[s.symbol] !== undefined) {
      yldDisplay = data.stockYields[s.symbol];
    } else if (s.shares > 0 && mv > 0 && s.recentOneYearDividend > 0) {
      yldDisplay = ((s.recentOneYearDividend / mv) * 100).toFixed(2);
    }

    stocksTotal += mv;
    const numericYld = parseFloat(yldDisplay) || 0;
    if (!isClosed && numericYld > 0) estMonthly += mv * (numericYld / 100) / 12;

    return `
      <tr class="whitespace-nowrap ${isClosed ? 'opacity-40' : ''}">
        <td class="bold">${s.symbol} ${isClosed ? '<span class="badge-closed ml-1.5">已結清</span>' : ''}</td>
        <td class="tabular text-right">${s.shares}</td>
        <td class="tabular text-right">${avgCost.toFixed(2)}</td>
        <td class="tabular text-right">
          <div class="flex justify-end">
            <input type="number" step="any" class="input py-1 px-2 text-xs w-20 text-right tabular" value="${price}" onchange="updateStockLivePrice('${s.symbol}', this.value)" />
          </div>
        </td>
        <td class="tabular bold text-right">${formatMoney(mv)}</td>
        <td class="text-right">${formatPLHtml(pl)}</td>
        <td class="tabular text-right">
          <div class="flex justify-end items-center gap-1">
            <input type="number" step="any" class="input py-1 px-2 text-xs w-16 text-right tabular" value="${yldDisplay}" onchange="updateStockLiveYield('${s.symbol}', this.value)" />
            <span>%</span>
          </div>
        </td>
        <td class="text-center">
          <button onclick="openHoldingEdit('stock', '${s.symbol}')" class="text-xs font-bold mr-1" style="color:var(--text-muted)">編</button>
          <button onclick="deleteHolding('${s.symbol}')" class="text-xs font-bold" style="color:var(--text-muted)">刪</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無股票交易資料</td></tr>';
  document.getElementById('stocksTotalValue').textContent = formatMoney(stocksTotal);

  let fundsTotal = 0;
  let fundList = Object.values(computed.funds);
  if (!data.showClosedFunds) fundList = fundList.filter(f => f.units > 0);

  const fundSortSel = document.getElementById('fundsSortOrder');
  if (fundSortSel) fundSortSel.value = data.fundsSortOrder || 'custom';
  fundList = sortHoldingsList(fundList, data.fundsSortOrder || 'custom', 'fund');

  document.getElementById('showClosedFundsCheck').checked = !!data.showClosedFunds;

  document.getElementById('fundsTableBody').innerHTML = fundList.map(f => {
    const isClosed = f.units === 0;
    const cur = f.currency || 'USD';
    const price = data.fundPrices[f.name] !== undefined ? data.fundPrices[f.name] : (f.latestPrice || 0);
    const rate = getCurrencyRate(cur, data.fundRates[f.name]);

    const avgCost = f.units > 0 ? (f.costTotal / f.units) : 0;
    const mv = f.units * price * rate;
    fundsTotal += mv;

    let pl = 0;
    if (isClosed) {
      pl = (f.totalSoldIncome + f.totalDividend) - f.totalBoughtCost;
    } else {
      pl = mv - (f.costTotal * rate);
    }

    return `
      <tr class="whitespace-nowrap ${isClosed ? 'opacity-40' : ''}">
        <td class="bold">${f.name} ${isClosed ? '<span class="badge-closed ml-1.5">已結清</span>' : ''}</td>
        <td>
          <select class="input py-1 px-2 text-xs w-20 tabular" onchange="updateFundLiveCurrency('${f.name}', this.value)">
            <option value="TWD" ${cur === 'TWD' ? 'selected' : ''}>TWD</option>
            <option value="USD" ${cur === 'USD' ? 'selected' : ''}>USD</option>
            <option value="JPY" ${cur === 'JPY' ? 'selected' : ''}>JPY</option>
            <option value="EUR" ${cur === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="CNY" ${cur === 'CNY' ? 'selected' : ''}>CNY</option>
            <option value="GBP" ${cur === 'GBP' ? 'selected' : ''}>GBP</option>
            <option value="KRW" ${cur === 'KRW' ? 'selected' : ''}>KRW</option>
          </select>
        </td>
        <td class="tabular text-right">${f.units}</td>
        <td class="tabular text-right">${avgCost.toFixed(2)}</td>
        <td class="tabular text-right">
          <div class="flex justify-end">
            <input type="number" step="any" class="input py-1 px-2 text-xs w-20 text-right tabular" value="${price}" onchange="updateFundLivePrice('${f.name}', this.value)" />
          </div>
        </td>
        <td class="tabular text-right">
          <div class="flex justify-end">
            <input type="number" step="any" class="input py-1 px-2 text-xs w-20 text-right tabular" value="${rate}" ${cur === 'TWD' ? 'disabled' : ''} onchange="updateFundLiveRate('${f.name}', this.value)" />
          </div>
        </td>
        <td class="tabular bold text-right">${formatMoney(mv)}</td>
        <td class="text-right">${formatPLHtml(pl)}</td>
        <td class="text-center">
          <button onclick="openHoldingEdit('fund', '${f.name}')" class="text-xs font-bold mr-1" style="color:var(--text-muted)">編</button>
          <button onclick="deleteHolding('${f.name}')" class="text-xs font-bold" style="color:var(--text-muted)">刪</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無基金交易資料</td></tr>';
  document.getElementById('fundsTotalValue').textContent = formatMoney(fundsTotal);

  if (data.showDividendGoal === false) {
    divBody.classList.add('hidden');
  } else {
    divBody.classList.remove('hidden');
    const goal = data.dividendGoal || 10000;
    const pct = Math.min(100, (estMonthly / goal) * 100);
    document.getElementById('estMonthlyDividend').textContent = formatMoney(Math.round(estMonthly));
    document.getElementById('dividendTargetDisplay').textContent = formatMoney(goal);
    document.getElementById('dividendProgressPct').textContent = pct.toFixed(1) + '%';
    document.getElementById('dividendProgressBar').style.width = pct + '%';
  }
}

function onAssetTypeChange() {
  const assetType = document.getElementById('stxAssetType').value;
  const feeInput = document.getElementById('stxFee');
  if (assetType === '基金') {
    feeInput.value = '0';
    document.getElementById('stxTax').value = '0';
  } else {
    const type = document.getElementById('stxType').value;
    feeInput.value = type === '配息' ? '10' : '1';
  }
  calcStockInputs();
}

function onStxTypeChange() {
  const type = document.getElementById('stxType').value;
  const assetType = document.getElementById('stxAssetType').value;
  const feeInput = document.getElementById('stxFee');
  if (assetType === '股票') {
    feeInput.value = type === '配息' ? '10' : '1';
  }
  calcStockInputs();
}

function calcStockInputs() {
  const type = document.getElementById('stxType').value;
  const assetType = document.getElementById('stxAssetType').value;
  const shares = Math.abs(parseFloat(document.getElementById('stxShares').value) || 0);
  const price = Math.abs(parseFloat(document.getElementById('stxPrice').value) || 0);
  const fee = Math.abs(parseFloat(document.getElementById('stxFee').value) || 0);
  const tax = Math.abs(parseFloat(document.getElementById('stxTax').value) || 0);

  let total = shares * price;
  if (assetType === '股票') total = Math.floor(total);
  else total = Math.round(total * 100) / 100;

  let totalCost = total;
  if (type === '買入') totalCost = total + fee + tax;
  else if (type === '賣出') totalCost = total - fee - tax;
  else if (type === '配息') totalCost = Math.max(0, (total || shares) - fee);

  document.getElementById('stxTotal').value = total || '';
  document.getElementById('stxTotalCost').value = totalCost ? Math.floor(totalCost) : '';
}

function calcEditStockInputs() {
  const type = document.getElementById('editStxType').value;
  const assetType = document.getElementById('editStxAssetType').value;
  const shares = Math.abs(parseFloat(document.getElementById('editStxShares').value) || 0);
  const price = Math.abs(parseFloat(document.getElementById('editStxPrice').value) || 0);
  const fee = Math.abs(parseFloat(document.getElementById('editStxFee').value) || 0);
  const tax = Math.abs(parseFloat(document.getElementById('editStxTax').value) || 0);

  let total = shares * price;
  if (assetType === '股票') total = Math.floor(total);
  else total = Math.round(total * 100) / 100;

  let totalCost = total;
  if (type === '買入') totalCost = total + fee + tax;
  else if (type === '賣出') totalCost = total - fee - tax;
  else if (type === '配息') totalCost = Math.max(0, (total || shares) - fee);

  document.getElementById('editStxTotal').value = total || '';
  document.getElementById('editStxTotalCost').value = totalCost ? Math.floor(totalCost) : '';
}

function applyStockTxAccountOnly(tx, isReverse = false) {
  const mult = isReverse ? -1 : 1;
  const account = tx.account;
  const totalCost = Math.abs(tx.totalCost !== undefined ? tx.totalCost : (tx.total + (tx.fee || 0) + (tx.tax || 0)));

  if (tx.type === '買入') {
    data.accounts[account] = (data.accounts[account] || 0) - (totalCost * mult);
  } else if (tx.type === '賣出') {
    data.accounts[account] = (data.accounts[account] || 0) + (totalCost * mult);
  } else if (tx.type === '配息') {
    data.accounts[account] = (data.accounts[account] || 0) + (totalCost * mult);
    if (!isReverse) {
      data.transactions.push({
        id: uid(), date: tx.date, name: tx.symbol + ' 配息', amount: totalCost, category: '息', account, necessary: 'necessary', note: tx.note || '股息入帳', envelopeId: '', projectId: '', receipt: ''
      });
      if (tx.date.startsWith(currentMonthStr())) {
        data.tithePool = (data.tithePool || 0) + Math.round(totalCost * 0.1);
      }
    } else {
      data.transactions = data.transactions.filter(t => !(t.name.includes(tx.symbol) && t.category === '息' && t.date === tx.date));
      if (tx.date.startsWith(currentMonthStr())) {
        data.tithePool = Math.max(0, (data.tithePool || 0) - Math.round(totalCost * 0.1));
      }
    }
  }
}

function addStockTransaction() {
  const date = document.getElementById('stxDate').value || todayStr();
  const account = document.getElementById('stxAccount').value;
  const assetType = document.getElementById('stxAssetType').value;
  const type = document.getElementById('stxType').value;
  const symbol = document.getElementById('stxSymbol').value.trim();
  const shares = Math.abs(parseFloat(document.getElementById('stxShares').value) || 0);
  const price = Math.abs(parseFloat(document.getElementById('stxPrice').value) || 0);
  const fee = Math.abs(parseFloat(document.getElementById('stxFee').value) || 0);
  const tax = Math.abs(parseFloat(document.getElementById('stxTax').value) || 0);
  const total = Math.abs(parseFloat(document.getElementById('stxTotal').value) || (shares * price));
  const totalCost = Math.abs(parseFloat(document.getElementById('stxTotalCost').value) || (type === '買入' ? total + fee + tax : (type === '配息' ? total - fee : total - fee - tax)));
  const note = document.getElementById('stxNote').value.trim();

  if (!symbol) return alert('請輸入標的名稱');

  if (data.ignoredHoldings) {
    data.ignoredHoldings = data.ignoredHoldings.filter(x => x !== symbol);
  }
  if (assetType === '基金' && data.fundCustomOverrides && data.fundCustomOverrides[symbol]) {
    delete data.fundCustomOverrides[symbol];
  } else if (assetType !== '基金' && data.stockCustomOverrides && data.stockCustomOverrides[symbol]) {
    delete data.stockCustomOverrides[symbol];
  }

  const tx = { id: uid(), date, account, assetType, type, symbol, shares, price, total, fee, tax, totalCost, note };
  applyStockTxAccountOnly(tx, false);

  data.stockTransactions.push(tx);
  saveData();

  document.getElementById('stxSymbol').value = '';
  document.getElementById('stxShares').value = '';
  document.getElementById('stxPrice').value = '';
  document.getElementById('stxFee').value = type === '配息' ? '10' : '1';
  document.getElementById('stxTax').value = '0';
  document.getElementById('stxTotal').value = '';
  document.getElementById('stxTotalCost').value = '';
  document.getElementById('stxNote').value = '';

  renderStockTransactions();
  renderInvestments();
  renderDashboard();
}

function openStockTxEditModal(id) {
  const tx = data.stockTransactions.find(t => t.id === id);
  if (!tx) return;
  document.getElementById('editStxId').value = tx.id;
  document.getElementById('editStxDate').value = tx.date;
  document.getElementById('editStxAccount').value = tx.account;
  document.getElementById('editStxAssetType').value = tx.assetType || '股票';
  document.getElementById('editStxType').value = tx.type;
  document.getElementById('editStxSymbol').value = tx.symbol;
  document.getElementById('editStxShares').value = Math.abs(tx.shares || 0);
  document.getElementById('editStxPrice').value = Math.abs(tx.price || 0);
  document.getElementById('editStxFee').value = Math.abs(tx.fee || 0);
  document.getElementById('editStxTax').value = Math.abs(tx.tax || 0);
  document.getElementById('editStxTotal').value = Math.abs(tx.total || 0);
  document.getElementById('editStxTotalCost').value = Math.abs(tx.totalCost !== undefined ? tx.totalCost : tx.total);
  document.getElementById('editStxNote').value = tx.note || '';
  openModal('stxEditModal');
}

function saveStockTxEdit() {
  const id = document.getElementById('editStxId').value;
  const tx = data.stockTransactions.find(t => t.id === id);
  if (!tx) return;

  const symbol = document.getElementById('editStxSymbol').value.trim();
  if (!symbol) return alert('請輸入標的');

  applyStockTxAccountOnly(tx, true);

  tx.date = document.getElementById('editStxDate').value || todayStr();
  tx.account = document.getElementById('editStxAccount').value;
  tx.assetType = document.getElementById('editStxAssetType').value;
  tx.type = document.getElementById('editStxType').value;
  tx.symbol = symbol;
  tx.shares = Math.abs(parseFloat(document.getElementById('editStxShares').value) || 0);
  tx.price = Math.abs(parseFloat(document.getElementById('editStxPrice').value) || 0);
  tx.fee = Math.abs(parseFloat(document.getElementById('editStxFee').value) || 0);
  tx.tax = Math.abs(parseFloat(document.getElementById('editStxTax').value) || 0);
  tx.total = Math.abs(parseFloat(document.getElementById('editStxTotal').value) || (tx.shares * tx.price));
  tx.totalCost = Math.abs(parseFloat(document.getElementById('editStxTotalCost').value) || (tx.type === '買入' ? tx.total + tx.fee + tx.tax : (tx.type === '配息' ? tx.total - tx.fee : tx.total - tx.fee - tx.tax)));
  tx.note = document.getElementById('editStxNote').value.trim();

  applyStockTxAccountOnly(tx, false);

  saveData();
  closeModal('stxEditModal');
  renderStockTransactions();
  renderInvestments();
  renderDashboard();
}

function deleteStockTransaction(id) {
  const tx = data.stockTransactions.find(t => t.id === id);
  if (!tx) return;
  if (!confirm(`確定刪除此筆「${tx.type}」紀錄？帳戶與庫存將自動回滾`)) return;

  applyStockTxAccountOnly(tx, true);

  data.stockTransactions = data.stockTransactions.filter(t => t.id !== id);
  saveData();
  renderStockTransactions();
  renderInvestments();
  renderDashboard();
}

function setStxViewMode(mode) {
  data.stxViewMode = mode;
  document.getElementById('stxView_card').classList.toggle('active', mode === 'card');
  document.getElementById('stxView_table').classList.toggle('active', mode === 'table');
  saveData();
  renderStockTransactions();
}

function toggleStxDateSort() {
  data.stxDateSortAsc = !data.stxDateSortAsc;
  saveData();
  renderStockTransactions();
}

function clearStxFilters() {
  document.getElementById('filterStxMonth').value = '';
  document.getElementById('filterStxType').value = '';
  document.getElementById('filterStxKeyword').value = '';
  renderStockTransactions();
}

function renderStockTransactions() {
  const month = document.getElementById('filterStxMonth').value;
  const type = document.getElementById('filterStxType').value;
  const kw = document.getElementById('filterStxKeyword').value.trim().toLowerCase();

  let list = [...data.stockTransactions];
  if (month) list = list.filter(t => t.date && t.date.startsWith(month));
  if (type) list = list.filter(t => t.type === type);
  if (kw) list = list.filter(t => (t.symbol || '').toLowerCase().includes(kw) || (t.account || '').toLowerCase().includes(kw) || (t.note || '').toLowerCase().includes(kw) || t.type.includes(kw));

  list.sort((a, b) => {
    return data.stxDateSortAsc
      ? (a.date || '').localeCompare(b.date || '')
      : (b.date || '').localeCompare(a.date || '');
  });

  const arrowEl = document.getElementById('stxSortArrow');
  if (arrowEl) arrowEl.textContent = data.stxDateSortAsc ? '▲' : '▼';

  const buyTotal = list.filter(t => t.type === '買入').reduce((s, t) => s + (t.totalCost !== undefined ? t.totalCost : t.total), 0);
  const sellTotal = list.filter(t => t.type === '賣出').reduce((s, t) => s + (t.totalCost !== undefined ? t.totalCost : t.total), 0);
  const divTotal = list.filter(t => t.type === '配息').reduce((s, t) => s + (t.totalCost !== undefined ? t.totalCost : t.total), 0);
  const plTotal = (sellTotal + divTotal) - buyTotal;

  const summaryDiv = document.getElementById('stxPeriodSummaryText');
  summaryDiv.innerHTML = `
    <div class="pill p-2"><span style="color:var(--text-muted)">總買入</span> <strong class="block bold text-sm mt-0.5" style="color:var(--text)">${formatMoney(buyTotal)}</strong></div>
    <div class="pill p-2"><span style="color:var(--text-muted)">總賣出</span> <strong class="block bold text-sm mt-0.5" style="color:var(--text)">${formatMoney(sellTotal)}</strong></div>
    <div class="pill p-2"><span style="color:var(--text-muted)">總配息</span> <strong class="block bold text-sm mt-0.5" style="color:var(--text)">${formatMoney(divTotal)}</strong></div>
    <div class="pill p-2"><span style="color:var(--text-muted)">結算損益</span> <strong class="block bold text-sm mt-0.5">${formatPLHtml(plTotal)}</strong></div>
  `;

  const isCard = data.stxViewMode === 'card';
  document.getElementById('stxTableView').classList.toggle('hidden', isCard);
  document.getElementById('stxCardView').classList.toggle('hidden', !isCard);

  if (isCard) {
    document.getElementById('stxCardView').innerHTML = list.map(t => `
      <div class="pill p-3 space-y-1.5 text-xs">
        <div class="flex justify-between items-center">
          <div>
            <span class="tabular font-bold">${t.date}</span>
            <span class="badge ${t.type === '買入' ? 'badge-nec' : 'badge-non'} ml-1">${t.type}</span>
            <strong class="text-sm bold ml-1.5">${t.symbol}</strong>
          </div>
          <div class="flex gap-2">
            <button onclick="openStockTxEditModal('${t.id}')" class="font-bold" style="color:var(--text-muted)">編</button>
            <button onclick="deleteStockTransaction('${t.id}')" class="font-bold" style="color:var(--text-muted)">刪</button>
          </div>
        </div>
        <div class="flex justify-between items-center tabular font-semibold" style="color:var(--text-muted)">
          <span>${t.shares} 股/單位 × $${t.price} ｜ 費 $${t.fee} · 稅 $${t.tax} ｜ <span style="color:var(--text-muted); font-weight:500">${t.account}</span></span>
          <strong class="bold text-sm" style="color:var(--text)">${formatMoney(t.totalCost !== undefined ? t.totalCost : t.total)}</strong>
        </div>
        ${t.note ? `<div class="text-[11px] font-semibold" style="color:var(--text-muted)">備註：${t.note}</div>` : ''}
      </div>
    `).join('') || '<p class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無交易紀錄</p>';
  } else {
    document.getElementById('stockTxTableBody').innerHTML = list.map(t => `
      <tr class="whitespace-nowrap">
        <td class="px-3 tabular bold sticky-col" style="color:var(--text-muted)">${t.date}</td>
        <td class="px-3 font-semibold">${t.account}</td>
        <td class="px-2"><span class="badge ${t.type === '買入' ? 'badge-nec' : 'badge-non'}">${t.type}</span></td>
        <td class="px-3 bold">${t.symbol}</td>
        <td class="px-3 tabular text-right">${t.shares || 0}</td>
        <td class="px-3 tabular text-right">${t.price || 0}</td>
        <td class="px-3 tabular text-right">${formatMoney(t.total)}</td>
        <td class="px-3 tabular text-right">${formatMoney(t.fee)}</td>
        <td class="px-3 tabular text-right">${formatMoney(t.tax)}</td>
        <td class="px-3 tabular bold text-right" style="color:var(--text)">${formatMoney(t.totalCost !== undefined ? t.totalCost : t.total)}</td>
        <td class="px-3 text-center">
          <button onclick="openStockTxEditModal('${t.id}')" class="text-xs font-bold mr-1.5" style="color:var(--text-muted)">編</button>
          <button onclick="deleteStockTransaction('${t.id}')" class="btn text-xs px-2 py-0.5">刪</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="11" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無交易紀錄</td></tr>';
  }
}

function openProjectModal(id = null) {
  document.getElementById('projectEditId').value = id || '';
  document.getElementById('projectModalTitle').textContent = id ? '編輯專案' : '新增專案';
  if (id) {
    const p = data.projects.find(x => x.id === id);
    if (p) {
      document.getElementById('projectName').value = p.name;
      document.getElementById('projectBudget').value = p.budget;
      document.getElementById('projectStatus').value = p.status || 'active';
      document.getElementById('projectNote').value = p.note || '';
    }
  } else {
    document.getElementById('projectName').value = '';
    document.getElementById('projectBudget').value = '';
    document.getElementById('projectStatus').value = 'active';
    document.getElementById('projectNote').value = '';
  }
  openModal('projectModal');
}

function saveProject() {
  const id = document.getElementById('projectEditId').value;
  const name = document.getElementById('projectName').value.trim();
  const budget = parseFloat(document.getElementById('projectBudget').value) || 0;
  const status = document.getElementById('projectStatus').value;
  const note = document.getElementById('projectNote').value.trim();
  if (!name) return alert('請輸入專案名稱');
  if (id) {
    const p = data.projects.find(x => x.id === id);
    if (p) { p.name = name; p.budget = budget; p.status = status; p.note = note; }
  } else {
    data.projects.push({ id: uid(), name, budget, status, note, createdAt: Date.now() });
  }
  saveData();
  closeModal('projectModal');
  renderFixedSection();
  populateProjectSelect();
}

function deleteProject(id) {
  if (!confirm('確定刪除專案？')) return;
  data.projects = data.projects.filter(p => p.id !== id);
  saveData();
  renderFixedSection();
  populateProjectSelect();
}

function toggleProjectViewMode() {
  data.projectViewMode = data.projectViewMode === 'table' ? 'card' : 'table';
  saveData();
  renderFixedSection();
}

function toggleShowArchivedProjects(checked) {
  data.showArchivedProjects = checked;
  saveData();
  renderFixedSection();
}

function setFreelanceFilter(filter) {
  data.freelanceFilter = filter;
  saveData();
  renderFixedSection();
}

function openFreelanceModal(id = null) {
  document.getElementById('freelanceEditId').value = id || '';
  document.getElementById('freelanceModalTitle').textContent = id ? '編輯接案' : '新增接案';
  if (id) {
    const f = data.freelances.find(x => x.id === id);
    if (f) {
      document.getElementById('freelanceName').value = f.name;
      document.getElementById('freelanceExecDate').value = f.execDate || '';
      document.getElementById('freelancePayDate').value = f.payDate || '';
      document.getElementById('freelanceAmount').value = f.amount;
      document.getElementById('freelanceStatus').value = f.status;
      document.getElementById('freelanceAccount').value = f.account;
      document.getElementById('freelanceNote').value = f.note || '';
    }
  } else {
    document.getElementById('freelanceName').value = '';
    document.getElementById('freelanceExecDate').value = todayStr();
    document.getElementById('freelancePayDate').value = '';
    document.getElementById('freelanceAmount').value = '';
    document.getElementById('freelanceStatus').value = '待收款';
    document.getElementById('freelanceNote').value = '';
  }
  openModal('freelanceModal');
}

function saveFreelance() {
  const id = document.getElementById('freelanceEditId').value;
  const name = document.getElementById('freelanceName').value.trim();
  const execDate = document.getElementById('freelanceExecDate').value;
  const payDate = document.getElementById('freelancePayDate').value;
  const effectiveDate = payDate || execDate || todayStr();
  const amount = parseFloat(document.getElementById('freelanceAmount').value) || 0;
  const status = document.getElementById('freelanceStatus').value;
  const account = document.getElementById('freelanceAccount').value;
  const note = document.getElementById('freelanceNote').value.trim();
  if (!name) return alert('請輸入案件名稱');

  if (id) {
    const f = data.freelances.find(x => x.id === id);
    if (f) {
      const linkedTx = (data.transactions || []).find(t =>
        (f.linkedTxId && t.id === f.linkedTxId) ||
        (t.name === f.name + '（接案收款）')
      );

      if (status === '已收款') {
        if (f.status !== '已收款' || !linkedTx) {
          const newTxId = uid();
          f.linkedTxId = newTxId;
          data.accounts[account] = (data.accounts[account] || 0) + amount;
          if (effectiveDate.startsWith(currentMonthStr())) {
            data.tithePool = (data.tithePool || 0) + Math.round(amount * 0.1);
          }
          data.transactions.push({
            id: newTxId, date: effectiveDate, name: name + '（接案收款）',
            amount, category: '收', account, necessary: 'necessary', note, envelopeId: '', projectId: '', receipt: ''
          });
        } else if (linkedTx) {
          data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
          data.accounts[account] = (data.accounts[account] || 0) + amount;
          linkedTx.date = effectiveDate;
          linkedTx.name = name + '（接案收款）';
          linkedTx.amount = amount;
          linkedTx.account = account;
          linkedTx.note = note;
          f.linkedTxId = linkedTx.id;
        }
      } else if (f.status === '已收款' && linkedTx) {
        data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
        data.transactions = data.transactions.filter(t => t.id !== linkedTx.id);
        f.linkedTxId = '';
      }

      f.name = name; f.execDate = execDate; f.payDate = payDate; f.amount = amount; f.status = status; f.account = account; f.note = note;
    }
  } else {
    const newTxId = status === '已收款' ? uid() : '';
    data.freelances.push({ id: uid(), name, execDate, payDate, amount, status, account, note, linkedTxId: newTxId, createdAt: Date.now() });
    if (status === '已收款') {
      data.accounts[account] = (data.accounts[account] || 0) + amount;
      if (effectiveDate.startsWith(currentMonthStr())) {
        data.tithePool = (data.tithePool || 0) + Math.round(amount * 0.1);
      }
      data.transactions.push({
        id: newTxId, date: effectiveDate, name: name + '（接案收款）',
        amount, category: '收', account, necessary: 'necessary', note, envelopeId: '', projectId: '', receipt: ''
      });
    }
  }
  saveData();
  closeModal('freelanceModal');
  renderFixedSection();
  renderDashboard();
  renderTransactions();
}

function deleteFreelance(id) {
  const f = data.freelances.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`確定刪除接案「${f.name}」？`)) return;
  data.freelances = data.freelances.filter(x => x.id !== id);
  saveData();
  renderFixedSection();
}

function openFixedModal(id = null) {
  document.getElementById('fixedEditId').value = id || '';
  document.getElementById('fixedModalTitle').textContent = id ? '編輯固定項目' : '新增固定項目';
  if (id) {
    const f = data.fixedItems.find(x => x.id === id);
    if (f) {
      document.getElementById('fixedName').value = f.name;
      document.getElementById('fixedAmount').value = f.amount;
      document.getElementById('fixedAccount').value = f.account;
      document.getElementById('fixedCategory').value = f.category;
      document.getElementById('fixedNote').value = f.note || '';
    }
  } else {
    document.getElementById('fixedName').value = '';
    document.getElementById('fixedAmount').value = '';
    document.getElementById('fixedNote').value = '';
  }
  openModal('fixedModal');
}

function saveFixed() {
  const id = document.getElementById('fixedEditId').value;
  const name = document.getElementById('fixedName').value.trim();
  const amount = parseFloat(document.getElementById('fixedAmount').value) || 0;
  const account = document.getElementById('fixedAccount').value;
  const category = document.getElementById('fixedCategory').value;
  const note = document.getElementById('fixedNote').value.trim();
  if (!name) return alert('請輸入名稱');
  if (id) {
    const f = data.fixedItems.find(x => x.id === id);
    if (f) { f.name = name; f.amount = amount; f.account = account; f.category = category; f.note = note; }
  } else {
    data.fixedItems.push({ id: uid(), name, amount, account, category, note, createdAt: Date.now() });
  }
  saveData();
  closeModal('fixedModal');
  renderFixedSection();
}

function deleteFixed(id) {
  data.fixedItems = data.fixedItems.filter(f => f.id !== id);
  saveData();
  renderFixedSection();
}

function applyFixed(id) {
  const f = data.fixedItems.find(x => x.id === id);
  if (!f) return;
  data.accounts[f.account] = (data.accounts[f.account] || 0) + f.amount;
  data.transactions.push({ id: uid(), date: todayStr(), name: f.name + '（固定）', amount: f.amount, category: f.category, account: f.account, necessary: 'necessary', note: f.note || '', envelopeId: '', projectId: '', receipt: '' });
  saveData();
  renderDashboard();
  alert('已計入本月帳務');
}

function sortListByCriteria(list, criteria, nameField) {
  const res = [...list];
  if (criteria === 'name_asc') {
    res.sort((a, b) => (a[nameField] || '').localeCompare(b[nameField] || ''));
  } else if (criteria === 'name_desc') {
    res.sort((a, b) => (b[nameField] || '').localeCompare(a[nameField] || ''));
  } else if (criteria === 'date_asc') {
    res.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } else {
    res.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return res;
}

function renderFixedSection() {
  if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };

  // 1. 固定收支
  const fixOpen = data.sectionsOpen.fixed !== false;
  document.getElementById('fixedArrow').textContent = fixOpen ? '▼' : '▶';
  document.getElementById('fixedBody').style.display = fixOpen ? 'block' : 'none';
  if (fixOpen) {
    const fixKw = (document.getElementById('filterFixedKeyword')?.value || '').trim().toLowerCase();
    const fixSortSel = document.getElementById('fixedSortOrder');
    if (fixSortSel) fixSortSel.value = data.fixedSortOrder || 'date_desc';

    let fixList = sortListByCriteria(data.fixedItems || [], data.fixedSortOrder || 'date_desc', 'name');
    if (fixKw) {
      fixList = fixList.filter(f => (f.name || '').toLowerCase().includes(fixKw) || (f.account || '').toLowerCase().includes(fixKw) || (f.category || '').toLowerCase().includes(fixKw));
    }

    document.getElementById('fixedList').innerHTML = fixList.map(f => `
      <div class="pill p-3 flex justify-between items-center text-xs">
        <div>
          <span class="bold">${f.name}</span>
          <span class="tabular heavy ml-2">${formatMoney(f.amount)}</span>
          <span class="ml-2 font-semibold" style="color:var(--text-muted)">${f.account} · ${f.category}</span>
        </div>
        <div class="flex gap-2">
          <button onclick="applyFixed('${f.id}')" class="bold text-xs">計入本月</button>
          <button onclick="openFixedModal('${f.id}')" class="font-bold" style="color:var(--text-muted)">編</button>
          <button onclick="deleteFixed('${f.id}')" class="font-bold" style="color:var(--text-muted)">刪</button>
        </div>
      </div>
    `).join('') || '<p class="text-xs font-semibold text-center py-2" style="color:var(--text-muted)">尚無固定收支項目</p>';
  }

  // 2. 數位信封預算折疊
  const envOpen = data.sectionsOpen.envelopes !== false;
  document.getElementById('envelopesArrow').textContent = envOpen ? '▼' : '▶';
  document.getElementById('envelopesBody').style.display = envOpen ? 'block' : 'none';

  // 3. 特殊專案
  const projOpen = data.sectionsOpen.project !== false;
  document.getElementById('projectArrow').textContent = projOpen ? '▼' : '▶';
  document.getElementById('projectBody').style.display = projOpen ? 'block' : 'none';
  if (projOpen) {
    const isTable = data.projectViewMode === 'table';
    document.getElementById('projViewModeBtn').textContent = isTable ? '切換卡片' : '切換表格';
    document.getElementById('projectsTableView').classList.toggle('hidden', !isTable);
    document.getElementById('projectsCardView').classList.toggle('hidden', isTable);

    const projKw = (document.getElementById('filterProjectsKeyword')?.value || '').trim().toLowerCase();
    const projSortSel = document.getElementById('projectsSortOrder');
    if (projSortSel) projSortSel.value = data.projectsSortOrder || 'date_desc';

    document.getElementById('showArchivedProjectsCheck').checked = !!data.showArchivedProjects;

    let projList = sortListByCriteria(data.projects || [], data.projectsSortOrder || 'date_desc', 'name');
    if (!data.showArchivedProjects) {
      projList = projList.filter(p => p.status !== 'archived');
    }
    if (projKw) {
      projList = projList.filter(p => (p.name || '').toLowerCase().includes(projKw) || (p.note || '').toLowerCase().includes(projKw));
    }

    if (isTable) {
      document.getElementById('projectsTableBody').innerHTML = projList.map(p => {
        const spent = data.transactions.filter(t => t.projectId === p.id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
        const remain = p.budget - spent;
        return `
          <tr class="whitespace-nowrap ${p.status === 'archived' ? 'opacity-40' : ''}">
            <td class="bold">${p.name}</td>
            <td><span class="badge ${p.status === 'archived' ? 'badge-non' : 'badge-nec'}">${p.status === 'archived' ? '已結束' : '進行中'}</span></td>
            <td class="tabular text-right">${formatMoney(p.budget)}</td>
            <td class="tabular text-right">${formatMoney(spent)}</td>
            <td class="tabular heavy text-right">${formatMoney(remain)}</td>
            <td class="text-center">
              <button onclick="openProjectModal('${p.id}')" class="text-xs font-bold mr-1.5" style="color:var(--text-muted)">編</button>
              <button onclick="deleteProject('${p.id}')" class="btn text-xs px-2 py-0.5">刪</button>
            </td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="6" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無專案項目</td></tr>';
    } else {
      document.getElementById('projectsCardView').innerHTML = projList.map(p => {
        const spent = data.transactions.filter(t => t.projectId === p.id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
        const remain = p.budget - spent;
        return `
          <div class="pill p-4 space-y-2 text-xs ${p.status === 'archived' ? 'opacity-40' : ''}">
            <div class="flex justify-between items-center">
              <div>
                <span class="bold text-sm">${p.name}</span>
                <span class="badge ${p.status === 'archived' ? 'badge-non' : 'badge-nec'} ml-2">${p.status === 'archived' ? '已結束' : '進行中'}</span>
              </div>
              <div class="flex gap-2">
                <button onclick="openProjectModal('${p.id}')" class="font-bold" style="color:var(--text-muted)">編</button>
                <button onclick="deleteProject('${p.id}')" class="font-bold" style="color:var(--text-muted)">刪</button>
              </div>
            </div>
            <div class="flex justify-between tabular font-semibold" style="color:var(--text-muted)">
              <span>預算 ${formatMoney(p.budget)} · 已花 ${formatMoney(spent)}</span>
              <span class="heavy">剩餘 ${formatMoney(remain)}</span>
            </div>
          </div>`;
      }).join('') || '<p class="text-xs font-semibold text-center py-2" style="color:var(--text-muted)">尚無專案項目</p>';
    }
  }

  // 4. 接案追蹤
  const freeOpen = data.sectionsOpen.freelance !== false;
  document.getElementById('freelanceArrow').textContent = freeOpen ? '▼' : '▶';
  document.getElementById('freelanceBody').style.display = freeOpen ? 'block' : 'none';
  if (freeOpen) {
    const freeKw = (document.getElementById('filterFreelanceKeyword')?.value || '').trim().toLowerCase();
    const filter = data.freelanceFilter || 'all';

    ['all', 'unpaid', 'paid'].forEach(k => {
      const btn = document.getElementById('flFilter_' + k);
      if (btn) btn.classList.toggle('active', k === filter);
    });

    const flSortSel = document.getElementById('freelanceSortOrder');
    if (flSortSel) flSortSel.value = data.freelanceSortOrder || 'date_desc';

    let freeList = [...(data.freelances || [])].sort((a, b) => {
      const dateA = a.payDate || a.execDate || '';
      const dateB = b.payDate || b.execDate || '';
      return (data.freelanceSortOrder === 'date_asc') ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });

    const unpaidItems = freeList.filter(f => f.status !== '已收款');
    const unpaidTotal = unpaidItems.reduce((s, f) => s + f.amount, 0);

    const summaryBox = document.getElementById('freelanceUnpaidSummary');
    if (filter === 'unpaid') {
      summaryBox.classList.remove('hidden');
      document.getElementById('flUnpaidCount').textContent = unpaidItems.length;
      document.getElementById('flUnpaidTotal').textContent = formatMoney(unpaidTotal);
    } else {
      summaryBox.classList.add('hidden');
    }

    if (filter === 'unpaid') {
      freeList = freeList.filter(f => f.status !== '已收款');
    } else if (filter === 'paid') {
      freeList = freeList.filter(f => f.status === '已收款');
    }

    if (freeKw) {
      freeList = freeList.filter(f => (f.name || '').toLowerCase().includes(freeKw) || (f.account || '').toLowerCase().includes(freeKw) || (f.note || '').toLowerCase().includes(freeKw));
    }

    document.getElementById('freelanceList').innerHTML = freeList.map(f => {
      const isUnpaid = f.status !== '已收款';
      return `
        <div class="pill p-3 flex justify-between items-center text-xs">
          <div>
            <span class="bold">${f.name}</span>
            <span class="tabular heavy ml-2">${formatMoney(f.amount)}</span>
            <span class="badge ${isUnpaid ? 'badge-nec' : 'badge-non'} ml-2">${f.status}</span>
            <div class="text-[11px] mt-0.5 tabular font-semibold" style="color:var(--text-muted)">
              執行: ${f.execDate || '--'} · 收款: ${f.payDate || f.execDate || '--'} ${f.account ? `(${f.account})` : ''}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="openFreelanceModal('${f.id}')" class="font-bold" style="color:var(--text-muted)">編</button>
            <button onclick="deleteFreelance('${f.id}')" class="font-bold" style="color:var(--text-muted)">刪</button>
          </div>
        </div>
      `;
    }).join('') || '<p class="text-xs font-semibold text-center py-2" style="color:var(--text-muted)">尚無相符接案紀錄</p>';
  }
}

const STATIC_PALETTES = {
  p1: ['#B5C0D0', '#EED3D9', '#CCD3CA', '#F5E8DD', '#8392A5', '#C7A9B0', '#96A393', '#D6C2B2'],
  p2: ['#7895B2', '#F5EFE6', '#AEBDCA', '#E8DFCA', '#55718C', '#C7B9A1', '#8FA2B3', '#B0A48E'],
  p3: ['#4B6587', '#F0E5CF', '#C8C6C6', '#F7F6F2', '#738BA8', '#D1C2A5', '#8C8A8A', '#2F435E']
};

function generateAdaptiveGrayPalette(count, isDark) {
  if (count <= 1) return isDark ? ['#4E4E58'] : ['#E0E0E6'];

  const darkPalette = [
    '#383840', '#9E9EA8', '#4E4E58', '#C0C0CB',
    '#62626E', '#DFDFE8', '#787886', '#F2F2F6'
  ];
  const lightPalette = [
    '#EAEAEF', '#62626E', '#DFDFE8', '#4E4E58',
    '#C0C0CB', '#383840', '#9E9EA8', '#1C1C22'
  ];

  const base = isDark ? darkPalette : lightPalette;
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(base[i % base.length]);
  }
  return result;
}

function setChartPalette(key) {
  data.chartPalette = key;
  saveData();
  renderCharts();
}

function setChartTimeRange(range) {
  data.chartTimeRange = range;
  ['chartRangeMonth', 'chartRangeYear', 'chartRangeAll'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById('chartRange' + range.charAt(0).toUpperCase() + range.slice(1));
  if (activeBtn) activeBtn.classList.add('active');
  saveData();
  renderCharts();
}

function toggleChartsInvestMode() {
  data.chartsIncludeInvest = !data.chartsIncludeInvest;
  document.getElementById('chartsIncludeInvestToggle').classList.toggle('on', data.chartsIncludeInvest);
  saveData();
  renderCharts();
}

function renderCharts() {
  const cm = currentMonthStr();
  const cy = new Date().getFullYear().toString();
  const range = data.chartTimeRange || 'month';
  const pKey = data.chartPalette || 'gray';

  ['gray', 'p1', 'p2', 'p3'].forEach(k => {
    const btn = document.getElementById('paletteBtn_' + k);
    if (!btn) return;
    btn.classList.toggle('active', k === pKey);
  });

  document.getElementById('chartsIncludeInvestToggle').classList.toggle('on', !!data.chartsIncludeInvest);

  let txList = data.transactions.filter(t => {
    if (t.amount >= 0) return false;
    if (isExcludedFromDailyExpense(t)) return false;
    if (t.category === '投') return false;
    return true;
  });

  if (range === 'month') txList = txList.filter(t => t.date && t.date.startsWith(cm));
  else if (range === 'year') txList = txList.filter(t => t.date && t.date.startsWith(cy));

  const catMap = {};
  const accMap = {};
  let nec = 0, non = 0;

  txList.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount);
    accMap[t.account] = (accMap[t.account] || 0) + Math.abs(t.amount);
    if (t.necessary === 'necessary') nec += Math.abs(t.amount);
    else non += Math.abs(t.amount);
  });

  if (data.chartsIncludeInvest) {
    let stxList = data.stockTransactions.filter(t => t.type === '買入');
    if (range === 'month') stxList = stxList.filter(t => t.date && t.date.startsWith(cm));
    else if (range === 'year') stxList = stxList.filter(t => t.date && t.date.startsWith(cy));

    stxList.forEach(t => {
      const cost = Math.abs(t.totalCost !== undefined ? t.totalCost : t.total);
      catMap['投'] = (catMap['投'] || 0) + cost;
      accMap[t.account] = (accMap[t.account] || 0) + cost;
      nec += cost;
    });
  }

  if (categoryChart) categoryChart.destroy();
  if (necessaryChart) necessaryChart.destroy();
  if (accountChart) accountChart.destroy();

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#98989f' : '#1c1c1e';
  const borderColor = isDark ? '#1c1c1e' : '#ffffff';

  const sortedCatEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const catLabels = sortedCatEntries.map(e => e[0]);
  const catValues = sortedCatEntries.map(e => e[1]);
  const catTotal = catValues.reduce((s, v) => s + v, 0) || 1;

  const sortedAccEntries = Object.entries(accMap).sort((a, b) => b[1] - a[1]);
  const accLabels = sortedAccEntries.map(e => e[0]);
  const accValues = sortedAccEntries.map(e => e[1]);
  const accTotal = accValues.reduce((s, v) => s + v, 0) || 1;

  let catColors, accColors;
  if (pKey === 'gray') {
    catColors = generateAdaptiveGrayPalette(catValues.length, isDark);
    accColors = generateAdaptiveGrayPalette(accValues.length, isDark);
  } else {
    const palette = STATIC_PALETTES[pKey] || STATIC_PALETTES.p1;
    catColors = catValues.map((_, i) => palette[i % palette.length]);
    accColors = accValues.map((_, i) => palette[i % palette.length]);
  }

  const tooltipCallback = (total) => ({
    label: function(context) {
      const label = context.label || '';
      const val = context.raw || 0;
      const pct = ((val / total) * 100).toFixed(1);
      return `${label}：${pct}% ($${Math.round(val).toLocaleString('zh-TW')})`;
    }
  });

  categoryChart = new Chart(document.getElementById('categoryPieChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['無支出'],
      datasets: [{
        data: catValues.length ? catValues : [1],
        backgroundColor: catLabels.length ? catColors : ['#8e8e93'],
        borderColor: borderColor,
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, weight: 'bold' } } },
        tooltip: { callbacks: tooltipCallback(catTotal) }
      },
      cutout: '65%'
    }
  });

  accountChart = new Chart(document.getElementById('accountPieChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: accLabels.length ? accLabels : ['無支出'],
      datasets: [{
        data: accValues.length ? accValues : [1],
        backgroundColor: accLabels.length ? accColors : ['#8e8e93'],
        borderColor: borderColor,
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, weight: 'bold' } } },
        tooltip: { callbacks: tooltipCallback(accTotal) }
      },
      cutout: '60%'
    }
  });

  const necTotal = (nec + non) || 1;
  const necPalette = pKey === 'gray'
    ? (isDark ? ['#4E4E58', '#C0C0CB'] : ['#DFDFE8', '#4E4E58'])
    : (STATIC_PALETTES[pKey] ? [STATIC_PALETTES[pKey][0], STATIC_PALETTES[pKey][1]] : ['#B5C0D0', '#EED3D9']);

  necessaryChart = new Chart(document.getElementById('necessaryPieChart').getContext('2d'), {
    type: 'pie',
    data: {
      labels: ['必要', '非必要'],
      datasets: [{
        data: [nec || 0.1, non || 0.1],
        backgroundColor: necPalette,
        borderColor: borderColor,
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11, weight: 'bold' } } },
        tooltip: { callbacks: tooltipCallback(necTotal) }
      }
    }
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '資產財務備份_' + todayStr() + '.json';
  a.click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const incoming = JSON.parse(e.target.result);

      if (Array.isArray(incoming)) {
        let count = 0;
        const existingStxIds = new Set((data.stockTransactions || []).map(t => t.id));
        incoming.forEach(tx => {
          if (!existingStxIds.has(tx.id)) {
            if (typeof applyStockTxAccountOnly === 'function') applyStockTxAccountOnly(tx, false);
            data.stockTransactions.push(tx);
            count++;
          }
        });
        saveData();
        renderStockTransactions();
        renderInvestments();
        renderDashboard();
        alert(`🎉 成功追加匯入 ${count} 筆股票交易！原有資料皆完整保留。`);
        return;
      }

      const choice = confirm(
        "【匯入模式確認】\n\n" +
        "• 點「確定」：【智慧合併】（自動補齊兩台裝置相異的記帳、接案、股票，並更新餘額與匯率）\n" +
        "• 點「取消」：【完全覆蓋】（以匯入檔案為準，清除本機相異紀錄並完整還原所有帳戶與接案）"
      );

      if (choice) {
        let txAdded = 0;
        let stxAdded = 0;
        let freeAdded = 0;

        const existingTxIds = new Set((data.transactions || []).map(t => t.id));
        (incoming.transactions || []).forEach(tx => {
          if (!existingTxIds.has(tx.id)) {
            data.transactions.push(tx);
            txAdded++;
          }
        });

        const existingStxIds = new Set((data.stockTransactions || []).map(t => t.id));
        (incoming.stockTransactions || []).forEach(stx => {
          if (!existingStxIds.has(stx.id)) {
            data.stockTransactions.push(stx);
            stxAdded++;
          }
        });

        const existingFreeIds = new Set((data.freelances || []).map(f => f.id));
        (incoming.freelances || []).forEach(f => {
          if (!existingFreeIds.has(f.id)) {
            if (f.status === '進行中') f.status = '待收款';
            data.freelances.push(f);
            freeAdded++;
          }
        });

        if (incoming.accounts) {
          Object.keys(incoming.accounts).forEach(acc => {
            data.accounts[acc] = incoming.accounts[acc];
          });
        }
        if (incoming.accountList) data.accountList = incoming.accountList;
        if (incoming.fxCash) data.fxCash = Object.assign({}, data.fxCash, incoming.fxCash);
        if (incoming.fxRates) data.fxRates = Object.assign({}, data.fxRates, incoming.fxRates);
        if (incoming.fxExchanges) data.fxExchanges = incoming.fxExchanges;
        if (incoming.projects) data.projects = incoming.projects;
        if (incoming.fixedItems) data.fixedItems = incoming.fixedItems;
        if (incoming.envelopes) data.envelopes = incoming.envelopes;
        if (incoming.monthlyBudget !== undefined) data.monthlyBudget = incoming.monthlyBudget;
        if (incoming.dividendGoal !== undefined) data.dividendGoal = incoming.dividendGoal;

        saveData();
        populateAllAccountSelects();
        populateProjectSelect();
        switchTab('dashboard');
        alert(`🎉 智慧合併完成！\n新增 ${txAdded} 筆帳務、${stxAdded} 筆股票、${freeAdded} 筆接案，帳戶餘額與換匯資產已全數同步！`);
      } else {
        data = Object.assign({}, DEFAULT_DATA, incoming);
        saveData();
        loadData();
        populateAllAccountSelects();
        populateProjectSelect();
        switchTab('dashboard');
        alert('已依照匯入檔案完全覆蓋更新！所有接案與帳戶餘額已完整還原！');
      }
    } catch (err) {
      alert('解析失敗：' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetAllData() {
  if (!confirm('確定要清除全部資料？此動作無法復原！')) return;
  data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  saveData();
  populateAllAccountSelects();
  populateProjectSelect();
  switchTab('dashboard');
  alert('已重置為初始狀態');
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  populateAllAccountSelects();
  populateProjectSelect();
  switchTab('dashboard');
});