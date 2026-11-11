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

// 報表 3 階灰階色彩定義（取自黃點標記高對比階梯）
const GRAY_PALETTE = ['#8C8C8C', '#595959', '#383838'];

const DEFAULT_ACCOUNTS = ['中信', '國泰', '聯邦', '元大', '富邦莊敬', '富邦仁愛', '現金', '他人支付'];
const DEFAULT_FREELANCE_CATS = ['演唱會攝影', '平面攝影', '動態錄影', '視訊執行', '剪輯後製', '社群', '其他'];

const DEFAULT_DATA = {
  accounts: Object.fromEntries(DEFAULT_ACCOUNTS.map(a => [a, 0])),
  accountList: [...DEFAULT_ACCOUNTS],
  freelanceCategories: [...DEFAULT_FREELANCE_CATS],
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
  txViewMode: 'card',
  stxViewMode: 'table',
  fxViewMode: 'card',
  freelanceViewMode: 'card',
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
  holdingOverrides: {},
  fundPrices: {},
  fundRates: {},
  fundCurrencies: {},
  sectionsOpen: { fixed: true, envelopes: true, project: true, freelance: true },
  tithePool: 0,
  titheDonatedThisMonth: 0,
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
let currentFixedSign = 'exp';
let activeReceiptUrl = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return '$0';
  const s = n < 0 ? '-' : '';
  return s + '$' + Math.abs(Math.round(n)).toLocaleString('zh-TW');
}

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

function formatShortDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '--';
  const p = dateStr.split('-');
  if (p.length === 3) return `${p[0].slice(-2)}/${p[1]}/${p[2]}`;
  return dateStr;
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

function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

async function handleReceiptFileSelect(input, spanId) {
  const span = document.getElementById(spanId);
  if (input.files && input.files[0]) {
    span.textContent = input.files[0].name + ' (已壓縮準備)';
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
      if (!data.freelanceCategories || !data.freelanceCategories.length) data.freelanceCategories = [...DEFAULT_FREELANCE_CATS];
      data.accountList.forEach(a => { if (data.accounts[a] === undefined) data.accounts[a] = 0; });
      if (!data.fxExchanges) data.fxExchanges = [];
      if (!data.holdingOverrides) data.holdingOverrides = {};
      if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };

      let fixedTimestamps = false;
      (data.fixedItems || []).forEach((f, idx) => {
        if (!f.createdAt) { f.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
      });
      (data.projects || []).forEach((proj, idx) => {
        if (!proj.createdAt) { proj.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
      });
      (data.freelances || []).forEach((fl, idx) => {
        if (!fl.createdAt) { fl.createdAt = Date.now() - (idx * 1000); fixedTimestamps = true; }
      });
      if (fixedTimestamps) saveData();
    } catch {
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
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
  populateFreelanceCategorySelect();

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
    if (!document.getElementById('filterStxDateFrom').value) {
      resetStxMonthFilter();
    } else {
      renderStockTransactions();
    }
  }
  if (tab === 'fx') renderFxPage();
  if (tab === 'fixed') {
    renderEnvelopes();
    renderFixedSection();
  }
  if (tab === 'charts') renderCharts();
}

function populateAllAccountSelects() {
  const selects = ['txAccount', 'filterAccount', 'stxAccount', 'fixedAccount', 'freelanceAccount', 'fxFromAccount', 'fxToAccount', 'editTxAccount', 'editStxAccount', 'projTxAccount'];
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

function populateEnvelopeSelect() {
  const sel = document.getElementById('txEnvelope');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">不指定</option>';
  (data.envelopes || []).forEach(e => {
    sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
  });
  sel.value = cur;
}

function populateFreelanceCategorySelect() {
  const sel = document.getElementById('freelanceCategorySelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = (data.freelanceCategories || DEFAULT_FREELANCE_CATS).map(c => `<option value="${c}">${c}</option>`).join('');
  if (cur) sel.value = cur;
}

function onCategoryChange() {
  const cat = document.getElementById('txCategory').value;
  const env = (data.envelopes || []).find(e => e.category === cat);
  if (env) {
    document.getElementById('txEnvelope').value = env.id;
  }
}

// 台灣電子發票 QR Code 解析
function parseTaiwanInvoiceQR(text) {
  if (!text || text.length < 29) return null;
  const invoiceNum = text.slice(0, 10);
  const rocDate = text.slice(10, 17);
  const hexTotal = text.slice(29, 37);
  
  if (/^[A-Z]{2}\d{8}$/.test(invoiceNum) && /^\d{7}$/.test(rocDate)) {
    const rocYear = parseInt(rocDate.slice(0, 3), 10);
    const month = rocDate.slice(3, 5);
    const day = rocDate.slice(5, 7);
    const ceYear = rocYear + 1911;
    const dateFormatted = `${ceYear}-${month}-${day}`;
    const amount = parseInt(hexTotal, 16);

    return {
      name: `發票 ${invoiceNum}`,
      date: dateFormatted,
      amount: isNaN(amount) ? 0 : amount,
      invoiceNum
    };
  }
  return null;
}

function openScanModal() {
  openModal('scanModal');
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      const inv = parseTaiwanInvoiceQR(decodedText);
      if (inv) {
        document.getElementById('txName').value = inv.name;
        document.getElementById('txAmount').value = '-' + inv.amount;
        document.getElementById('txDateText').value = inv.date;
        document.getElementById('txDateNative').value = inv.date;
        document.getElementById('txNote').value = '發票QR碼解析開立日：' + inv.date;
        stopScanner();
        alert(`🎉 發票解析成功！\n號碼：${inv.invoiceNum}\n金額：$${inv.amount}\n日期：${inv.date}`);
      } else {
        document.getElementById('txNote').value = decodedText;
        document.getElementById('txName').value = '掃碼：' + decodedText.slice(0, 10);
        stopScanner();
        alert('掃碼完成，已將原始編號填入備註');
      }
    },
    () => {}
  ).catch(() => {
    alert('無法開啟相機，請檢查相機權限');
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

// 換匯計算與歷史記錄
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

    const linkedTx = data.transactions.find(t => oldFx.linkedTxId && t.id === oldFx.linkedTxId);
    if (linkedTx) {
      linkedTx.date = date;
      linkedTx.name = txTitle;
      linkedTx.amount = fromCur === 'TWD' ? -fromAmt : (toCur === 'TWD' ? toAmt : 0);
      linkedTx.account = fromAcc;
      linkedTx.note = note;
    }
    cancelFxEdit();
  } else {
    const linkedTxId = uid();
    const newFx = { id: uid(), date, fromCur, fromAcc, fromAmt, toCur, toAcc, toAmt, rate, note, linkedTxId, createdAt: Date.now() };
    applyFxBalanceChange(newFx, false);
    data.fxExchanges.push(newFx);

    data.transactions.push({
      id: linkedTxId, date,
      name: txTitle,
      amount: fromCur === 'TWD' ? -fromAmt : (toCur === 'TWD' ? toAmt : 0),
      category: '轉帳/換匯', account: fromAcc,
      necessary: 'necessary', note, envelopeId: '', projectId: '', receipt: ''
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

function setFxViewMode(mode) {
  data.fxViewMode = mode;
  document.getElementById('fxView_card').classList.toggle('active', mode === 'card');
  document.getElementById('fxView_table').classList.toggle('active', mode === 'table');
  saveData();
  renderFxPage();
}

function renderFxPage() {
  if (data.fxRates) {
    document.getElementById('fx_usd_display').textContent = `USD ${(data.fxRates.USD || 32.85).toFixed(2)}`;
    document.getElementById('fx_eur_display').textContent = `EUR ${(data.fxRates.EUR || 35.42).toFixed(2)}`;
    document.getElementById('fx_gbp_display').textContent = `GBP ${(data.fxRates.GBP || 42.15).toFixed(2)}`;
    document.getElementById('fx_cny_display').textContent = `CNY ${(data.fxRates.CNY || 4.91).toFixed(2)}`;
    document.getElementById('fx_jpy_display').textContent = `JPY ${(data.fxRates.JPY || 0.2075).toFixed(4)}`;
    document.getElementById('fx_krw_display').textContent = `KRW ${(data.fxRates.KRW || 0.0238).toFixed(4)}`;
  }

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

  const sortedFx = [...data.fxExchanges].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const isCard = data.fxViewMode === 'card';
  document.getElementById('fxHistoryCardView').classList.toggle('hidden', !isCard);
  document.getElementById('fxHistoryTableView').classList.toggle('hidden', isCard);

  if (isCard) {
    document.getElementById('fxHistoryCardView').innerHTML = sortedFx.map(x => {
      const decimals = (x.toCur === 'JPY' || x.toCur === 'KRW') ? 4 : 2;
      return `
        <div class="pill p-3 text-xs space-y-1">
          <div class="flex justify-between items-center">
            <span class="bold tabular">${formatShortDate(x.date)} ｜ 匯率 ${(x.rate || 0).toFixed(decimals)}</span>
            <div class="flex items-center gap-1.5 shrink-0 text-xs font-semibold" style="color:var(--text-muted)">
              <button onclick="openFxEdit('${x.id}')">編</button>
              <span>｜</span>
              <button onclick="deleteFxExchange('${x.id}')">刪</button>
            </div>
          </div>
          <div class="bold text-sm tabular">
            ${x.fromAmt.toLocaleString()} ${x.fromCur} ➔ ${x.toAmt.toLocaleString()} ${x.toCur}
          </div>
          <div class="font-normal text-[11px]" style="color:var(--text-muted)">
            ${x.fromAcc} ➔ ${x.toAcc}
          </div>
          ${x.note ? `<div class="text-[11px] font-semibold pt-0.5" style="color:var(--text-muted)">備註：${x.note}</div>` : ''}
        </div>
      `;
    }).join('') || '<p class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無換匯紀錄</p>';
  } else {
    document.getElementById('fxHistoryTableBody').innerHTML = sortedFx.map(x => {
      const decimals = (x.toCur === 'JPY' || x.toCur === 'KRW') ? 4 : 2;
      const twdCost = x.fromCur === 'TWD' ? x.fromAmt : (x.toCur === 'TWD' ? x.toAmt : Math.round(x.fromAmt * (data.fxRates[x.fromCur] || 1)));
      return `
        <tr class="whitespace-nowrap">
          <td class="tabular font-bold">${formatShortDate(x.date)}</td>
          <td class="tabular text-right">${x.fromAmt.toLocaleString()} ${x.fromCur}</td>
          <td class="tabular text-right">${x.toAmt.toLocaleString()} ${x.toCur}</td>
          <td class="tabular font-bold text-left">${(x.rate || 0).toFixed(decimals)}</td>
          <td class="tabular heavy text-right">${formatMoney(twdCost)}</td>
          <td class="font-normal text-left" style="color:var(--text-muted)">${x.fromAcc} ➔ ${x.toAcc}</td>
          <td class="text-left" style="color:var(--text-muted)">${x.note || '-'}</td>
          <td class="text-center">
            <span class="text-xs font-semibold" style="color:var(--text-muted)">
              <button onclick="openFxEdit('${x.id}')">編</button> ｜ <button onclick="deleteFxExchange('${x.id}')">刪</button>
            </span>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="8" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無換匯紀錄</td></tr>';
  }
}

async function refreshAllAssets() {
  const icon = document.getElementById('refreshAssetIcon');
  if (icon) icon.classList.add('spinning');
  await updateFxRates();
  await updateStockPrices();
  setTimeout(() => {
    if (icon) icon.classList.remove('spinning');
    alert('🎉 已完成最新股票報價與外幣匯率同步！');
  }, 750);
}

// 交易流水帳篩選
function setStxFilterRange(range) {
  const btnMonth = document.getElementById('stxRange_month');
  const btnAll = document.getElementById('stxRange_all');
  if (range === 'month') {
    btnMonth.classList.add('active');
    btnAll.classList.remove('active');
    resetStxMonthFilter();
  } else {
    btnAll.classList.add('active');
    btnMonth.classList.remove('active');
    document.getElementById('filterStxDateFrom').value = '';
    document.getElementById('filterStxDateTo').value = '';
    renderStockTransactions();
  }
}

function resetStxMonthFilter() {
  const cm = currentMonthStr();
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  document.getElementById('filterStxDateFrom').value = `${cm}-01`;
  document.getElementById('filterStxDateTo').value = `${cm}-${String(lastDay).padStart(2, '0')}`;
  renderStockTransactions();
}

function resetStxFilters() {
  document.getElementById('filterStxDateFrom').value = '';
  document.getElementById('filterStxDateTo').value = '';
  document.getElementById('filterStxType').value = '';
  document.getElementById('filterStxKeyword').value = '';
  document.getElementById('stxRange_all').classList.add('active');
  document.getElementById('stxRange_month').classList.remove('active');
  renderStockTransactions();
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

function renderStockTransactions() {
  const from = document.getElementById('filterStxDateFrom').value;
  const to = document.getElementById('filterStxDateTo').value;
  const type = document.getElementById('filterStxType').value;
  const kw = document.getElementById('filterStxKeyword').value.trim().toLowerCase();

  let list = [...data.stockTransactions];
  if (from) list = list.filter(t => t.date >= from);
  if (to) list = list.filter(t => t.date <= to);
  if (type) list = list.filter(t => t.type === type);
  if (kw) list = list.filter(t => (t.symbol || '').toLowerCase().includes(kw) || (t.account || '').toLowerCase().includes(kw) || (t.note || '').toLowerCase().includes(kw));

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

  document.getElementById('stxPeriodSummaryText').innerHTML = `
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
            <span class="tabular font-bold">${formatShortDate(t.date)}</span>
            <span class="badge ${t.type === '買入' ? 'badge-nec' : 'badge-non'} ml-1">${t.type}</span>
            <strong class="text-sm bold ml-1.5">${t.symbol}</strong>
          </div>
          <div class="flex items-center gap-1.5 font-semibold text-xs" style="color:var(--text-muted)">
            <button onclick="openStockTxEditModal('${t.id}')">編</button>
            <span>｜</span>
            <button onclick="deleteStockTransaction('${t.id}')">刪</button>
          </div>
        </div>
        <div class="flex justify-between items-center tabular font-semibold" style="color:var(--text-muted)">
          <span>${t.shares} 股/單位 × $${t.price} ｜ ${t.account}</span>
          <strong class="bold text-sm" style="color:var(--text)">${formatMoney(t.totalCost !== undefined ? t.totalCost : t.total)}</strong>
        </div>
        ${t.note ? `<div class="text-[11px] font-semibold" style="color:var(--text-muted)">備註：${t.note}</div>` : ''}
      </div>
    `).join('') || '<p class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無交易紀錄</p>';
  } else {
    document.getElementById('stockTxTableBody').innerHTML = list.map(t => `
      <tr class="whitespace-nowrap">
        <td class="px-3 tabular bold sticky-col" style="color:var(--text-muted)">${formatShortDate(t.date)}</td>
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
          <span class="text-xs font-semibold" style="color:var(--text-muted)">
            <button onclick="openStockTxEditModal('${t.id}')">編</button> ｜ <button onclick="deleteStockTransaction('${t.id}')">刪</button>
          </span>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="11" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無交易紀錄</td></tr>';
  }
}

// 固定收支
function setFixedSign(sign) {
  currentFixedSign = sign;
  document.getElementById('fixedSign_exp').classList.toggle('active', sign === 'exp');
  document.getElementById('fixedSign_inc').classList.toggle('active', sign === 'inc');
}

function openFixedModal(id = null) {
  document.getElementById('fixedEditId').value = id || '';
  document.getElementById('fixedModalTitle').textContent = id ? '編輯固定收支項目' : '新增固定收支項目';
  if (id) {
    const f = data.fixedItems.find(x => x.id === id);
    if (f) {
      document.getElementById('fixedName').value = f.name;
      setFixedSign(f.amount < 0 ? 'exp' : 'inc');
      document.getElementById('fixedAmount').value = Math.abs(f.amount);
      document.getElementById('fixedAccount').value = f.account;
      document.getElementById('fixedCategory').value = f.category;
      document.getElementById('fixedNote').value = f.note || '';
    }
  } else {
    document.getElementById('fixedName').value = '';
    setFixedSign('exp');
    document.getElementById('fixedAmount').value = '';
    document.getElementById('fixedNote').value = '';
  }
  openModal('fixedModal');
}

function saveFixed() {
  const id = document.getElementById('fixedEditId').value;
  const name = document.getElementById('fixedName').value.trim();
  const rawAmt = Math.abs(parseFloat(document.getElementById('fixedAmount').value) || 0);
  const amount = currentFixedSign === 'exp' ? -rawAmt : rawAmt;
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
  data.transactions.push({
    id: uid(), date: todayStr(), name: f.name + '（固定）',
    amount: f.amount, category: f.category, account: f.account, necessary: 'necessary', note: f.note || '', envelopeId: '', projectId: '', receipt: ''
  });
  saveData();
  renderDashboard();
  renderTransactions();
  alert('已計入本月帳務');
}

// 特殊專案
function openProjectTxModal(projId) {
  const proj = data.projects.find(p => p.id === projId);
  if (!proj) return;
  document.getElementById('projTxProjectId').value = proj.id;
  document.getElementById('projTxProjectName').value = proj.name;
  document.getElementById('projTxDate').value = todayStr();
  document.getElementById('projTxName').value = '';
  document.getElementById('projTxAmount').value = '';
  populateAllAccountSelects();
  openModal('projectTxModal');
}

function saveProjectTx() {
  const projId = document.getElementById('projTxProjectId').value;
  const proj = data.projects.find(p => p.id === projId);
  if (!proj) return;

  const date = document.getElementById('projTxDate').value || todayStr();
  const name = document.getElementById('projTxName').value.trim();
  const rawAmt = Math.abs(parseFloat(document.getElementById('projTxAmount').value) || 0);
  const account = document.getElementById('projTxAccount').value;
  const category = document.getElementById('projTxCategory').value;

  if (!name || rawAmt <= 0) return alert('請輸入有效的項目名稱與金額');

  const syncToMain = confirm('是否同步記到記帳明細並扣除帳戶餘額？\n• 點「確定」：同步記帳並扣款\n• 點「取消」：僅算在此專案支出');

  data.transactions.push({
    id: uid(), date,
    name: `[${proj.name}] ${name}`,
    amount: -rawAmt,
    category, account, necessary: 'necessary',
    note: syncToMain ? '專案同步扣款' : '專案獨立統計',
    envelopeId: '', projectId: proj.id, receipt: ''
  });

  if (syncToMain) {
    data.accounts[account] = (data.accounts[account] || 0) - rawAmt;
  }

  saveData();
  closeModal('projectTxModal');
  renderFixedSection();
  renderDashboard();
  renderTransactions();
}

function onFreelanceSortChange(val) {
  data.freelanceSortOrder = val;
  saveData();
  renderFixedSection();
}

function onFixedSortChange(val) {
  data.fixedSortOrder = val;
  saveData();
  renderFixedSection();
}

function onProjectSortChange(val) {
  data.projectsSortOrder = val;
  saveData();
  renderFixedSection();
}

function setFreelanceViewMode(mode) {
  data.freelanceViewMode = mode;
  document.getElementById('flView_card').classList.toggle('active', mode === 'card');
  document.getElementById('flView_table').classList.toggle('active', mode === 'table');
  saveData();
  renderFixedSection();
}

function setProjectViewMode(mode) {
  data.projectViewMode = mode;
  document.getElementById('projView_card').classList.toggle('active', mode === 'card');
  document.getElementById('projView_table').classList.toggle('active', mode === 'table');
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

function viewReceipt(imgData) {
  if (!imgData) return;
  activeReceiptUrl = imgData;
  document.getElementById('receiptImagePreview').src = imgData;
  openModal('receiptModal');
}

function downloadReceiptImage() {
  if (!activeReceiptUrl) return;
  const a = document.createElement('a');
  a.href = activeReceiptUrl;
  a.download = '收據照片_' + todayStr() + '.jpg';
  a.click();
}

// 工作類別自訂管理
function openFreelanceCatModal() {
  renderFreelanceCatList();
  openModal('freelanceCatModal');
}

function renderFreelanceCatList() {
  const container = document.getElementById('freelanceCatList');
  container.innerHTML = (data.freelanceCategories || DEFAULT_FREELANCE_CATS).map((cat, idx) => `
    <div class="flex items-center justify-between p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 drag-item" draggable="true" data-index="${idx}">
      <div class="flex items-center gap-2">
        <span class="drag-handle select-none" style="color:var(--text-muted)">⠿</span>
        <span class="font-bold text-xs">${cat}</span>
      </div>
      <button onclick="deleteFreelanceCat('${cat}')" class="text-xs font-bold" style="color:var(--text-muted)">刪除</button>
    </div>
  `).join('');
  setupFreelanceCatDragAndDrop();
}

function setupFreelanceCatDragAndDrop() {
  const container = document.getElementById('freelanceCatList');
  let draggedEl = null;

  container.querySelectorAll('.drag-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      draggedEl = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      if (draggedEl) draggedEl.classList.remove('dragging');
      draggedEl = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.drag-item');
      if (target && target !== draggedEl) {
        const rect = target.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        container.insertBefore(draggedEl, next ? target.nextSibling : target);
      }
    });
  });
}

function addFreelanceCatItem() {
  const inp = document.getElementById('newFreelanceCatInput');
  const val = inp.value.trim();
  if (!val) return;
  if (!data.freelanceCategories) data.freelanceCategories = [...DEFAULT_FREELANCE_CATS];
  if (data.freelanceCategories.includes(val)) return alert('此工作類別已存在');
  data.freelanceCategories.push(val);
  inp.value = '';
  saveData();
  renderFreelanceCatList();
  populateFreelanceCategorySelect();
}

function deleteFreelanceCat(cat) {
  if (!confirm(`確定刪除類別「${cat}」？`)) return;
  data.freelanceCategories = data.freelanceCategories.filter(c => c !== cat);
  saveData();
  renderFreelanceCatList();
  populateFreelanceCategorySelect();
}

function saveFreelanceCats() {
  const container = document.getElementById('freelanceCatList');
  const newList = [];
  container.querySelectorAll('.drag-item').forEach(el => {
    const nameEl = el.querySelector('.font-bold');
    if (nameEl) newList.push(nameEl.textContent.trim());
  });
  if (newList.length) data.freelanceCategories = newList;
  saveData();
  populateFreelanceCategorySelect();
  closeModal('freelanceCatModal');
}

function openFreelanceModal(id = null) {
  document.getElementById('freelanceEditId').value = id || '';
  document.getElementById('freelanceModalTitle').textContent = id ? '編輯接案' : '新增接案';
  document.getElementById('flReceiptFileName').textContent = '未選擇任何檔案';
  document.getElementById('flReceiptFileName').style.color = 'var(--text-muted)';
  populateFreelanceCategorySelect();

  if (id) {
    const f = data.freelances.find(x => x.id === id);
    if (f) {
      document.getElementById('freelanceName').value = f.name;
      document.getElementById('freelanceCategorySelect').value = f.category || '';
      document.getElementById('freelanceExecDate').value = f.execDate || '';
      document.getElementById('freelancePayDate').value = f.payDate || '';
      document.getElementById('freelanceAmount').value = f.amount;
      document.getElementById('freelanceStatus').value = f.status;
      document.getElementById('freelanceAccount').value = f.account;
      document.getElementById('freelanceNote').value = f.note || '';
      if (f.receipt) {
        document.getElementById('flReceiptFileName').textContent = '已保存憑證照片 (可重選替換)';
      }
    }
  } else {
    document.getElementById('freelanceName').value = '';
    document.getElementById('freelanceCategorySelect').value = '平面攝影';
    document.getElementById('freelanceExecDate').value = todayStr();
    document.getElementById('freelancePayDate').value = '';
    document.getElementById('freelanceAmount').value = '';
    document.getElementById('freelanceStatus').value = '待收款';
    document.getElementById('freelanceNote').value = '';
  }
  openModal('freelanceModal');
}

async function saveFreelance() {
  const id = document.getElementById('freelanceEditId').value;
  const name = document.getElementById('freelanceName').value.trim();
  const category = document.getElementById('freelanceCategorySelect').value || '其他';
  const execDate = document.getElementById('freelanceExecDate').value;
  const payDate = document.getElementById('freelancePayDate').value;
  const effectiveDate = payDate || execDate || todayStr();
  const amount = parseFloat(document.getElementById('freelanceAmount').value) || 0;
  const status = document.getElementById('freelanceStatus').value;
  const account = document.getElementById('freelanceAccount').value;
  const note = document.getElementById('freelanceNote').value.trim();
  const fileInput = document.getElementById('flReceiptInput');

  if (!name) return alert('請輸入案件名稱');

  let receiptData = null;
  if (fileInput && fileInput.files && fileInput.files[0]) {
    receiptData = await compressImage(fileInput.files[0]);
  }

  if (id) {
    const f = data.freelances.find(x => x.id === id);
    if (f) {
      const linkedTx = (data.transactions || []).find(t => f.linkedTxId && t.id === f.linkedTxId);
      if (status === '已收款') {
        if (f.status !== '已收款' || !linkedTx) {
          const newTxId = uid();
          f.linkedTxId = newTxId;
          data.accounts[account] = (data.accounts[account] || 0) + amount;
          data.transactions.push({
            id: newTxId, date: effectiveDate, name: `${name}（接案收款）`,
            amount, category: '收', account, necessary: 'necessary', note, envelopeId: '', projectId: '', receipt: receiptData || f.receipt || ''
          });
        } else if (linkedTx) {
          data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
          data.accounts[account] = (data.accounts[account] || 0) + amount;
          linkedTx.date = effectiveDate;
          linkedTx.name = `${name}（接案收款）`;
          linkedTx.amount = amount;
          linkedTx.account = account;
          linkedTx.note = note;
          if (receiptData) linkedTx.receipt = receiptData;
        }
      } else if (f.status === '已收款' && linkedTx) {
        data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
        data.transactions = data.transactions.filter(t => t.id !== linkedTx.id);
        f.linkedTxId = '';
      }

      f.name = name;
      f.category = category;
      f.execDate = execDate;
      f.payDate = payDate;
      f.amount = amount;
      f.status = status;
      f.account = account;
      f.note = note;
      if (receiptData) f.receipt = receiptData;
    }
  } else {
    const newTxId = status === '已收款' ? uid() : '';
    data.freelances.push({
      id: uid(), name, category, execDate, payDate, amount, status, account, note,
      receipt: receiptData || '', linkedTxId: newTxId, createdAt: Date.now()
    });
    if (status === '已收款') {
      data.accounts[account] = (data.accounts[account] || 0) + amount;
      data.transactions.push({
        id: newTxId, date: effectiveDate, name: `${name}（接案收款）`,
        amount, category: '收', account, necessary: 'necessary', note, envelopeId: '', projectId: '', receipt: receiptData || ''
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

// 專案總頁籤（接案 ➔ 固定 ➔ 特殊專案 ➔ 數位信封）
function renderFixedSection() {
  if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };

  // 1. 接案追蹤
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

    const isCard = data.freelanceViewMode === 'card';
    document.getElementById('flView_card').classList.toggle('active', isCard);
    document.getElementById('flView_table').classList.toggle('active', !isCard);
    document.getElementById('freelanceCardView').classList.toggle('hidden', !isCard);
    document.getElementById('freelanceTableView').classList.toggle('hidden', isCard);

    let freeList = [...(data.freelances || [])].sort((a, b) => {
      const timeA = new Date(a.payDate || a.execDate || 0).getTime() || a.createdAt || 0;
      const timeB = new Date(b.payDate || b.execDate || 0).getTime() || b.createdAt || 0;
      return (data.freelanceSortOrder === 'date_asc') ? timeA - timeB : timeB - timeA;
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

    if (filter === 'unpaid') freeList = freeList.filter(f => f.status !== '已收款');
    else if (filter === 'paid') freeList = freeList.filter(f => f.status === '已收款');

    if (freeKw) {
      freeList = freeList.filter(f => (f.name || '').toLowerCase().includes(freeKw) || (f.category || '').toLowerCase().includes(freeKw) || (f.account || '').toLowerCase().includes(freeKw));
    }

    if (isCard) {
      document.getElementById('freelanceCardView').innerHTML = freeList.map(f => {
        const isUnpaid = f.status !== '已收款';
        // 沒照片時完全隱藏留白，有照片才顯示圖示
        const receiptBtn = f.receipt
          ? `<button onclick="viewReceipt('${f.receipt}')" class="text-xs">📸</button>`
          : '';
        return `
          <div class="pill p-3 space-y-1 text-xs">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-1.5">
                <span class="badge ${isUnpaid ? 'badge-nec' : 'badge-non'}">${f.status}</span>
                <span class="heavy text-sm tabular">${formatMoney(f.amount)}</span>
              </div>
              <div class="flex items-center gap-2 font-semibold text-xs" style="color:var(--text-muted)">
                ${receiptBtn}
                <button onclick="openFreelanceModal('${f.id}')">編</button>
                <span>｜</span>
                <button onclick="deleteFreelance('${f.id}')">刪</button>
              </div>
            </div>
            <div class="bold text-sm">
              <span class="badge-closed mr-1.5">${f.category || '接案'}</span>${f.name}
            </div>
            <div class="text-[11px] tabular font-normal" style="color:var(--text-muted)">
              執行：${formatShortDate(f.execDate)} · 收款：${formatShortDate(f.payDate || f.execDate)} · ${f.account}
            </div>
          </div>
        `;
      }).join('') || '<p class="text-xs font-semibold text-center py-2" style="color:var(--text-muted)">尚無接案紀錄</p>';
    } else {
      document.getElementById('freelanceTableBody').innerHTML = freeList.map(f => {
        const isUnpaid = f.status !== '已收款';
        // 沒照片時留空 '-'
        const receiptBtn = f.receipt ? `<button onclick="viewReceipt('${f.receipt}')" class="text-xs font-bold">📸</button>` : '-';
        return `
          <tr class="whitespace-nowrap">
            <td><span class="badge ${isUnpaid ? 'badge-nec' : 'badge-non'}">${f.status}</span></td>
            <td class="bold">${f.name}</td>
            <td><span class="badge-closed">${f.category || '其他'}</span></td>
            <td class="tabular heavy text-right">${formatMoney(f.amount)}</td>
            <td class="tabular">${formatShortDate(f.execDate)}</td>
            <td class="tabular">${formatShortDate(f.payDate || f.execDate)}</td>
            <td>${f.account}</td>
            <td class="text-center">${receiptBtn}</td>
            <td class="text-center">
              <span class="text-xs font-semibold" style="color:var(--text-muted)">
                <button onclick="openFreelanceModal('${f.id}')">編</button> ｜ <button onclick="deleteFreelance('${f.id}')">刪</button>
              </span>
            </td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="9" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無接案紀錄</td></tr>';
    }
  }

  // 2. 固定收支
  const fixOpen = data.sectionsOpen.fixed !== false;
  document.getElementById('fixedArrow').textContent = fixOpen ? '▼' : '▶';
  document.getElementById('fixedBody').style.display = fixOpen ? 'block' : 'none';
  if (fixOpen) {
    const fixKw = (document.getElementById('filterFixedKeyword')?.value || '').trim().toLowerCase();
    let fixList = [...(data.fixedItems || [])].sort((a, b) => {
      if (data.fixedSortOrder === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (data.fixedSortOrder === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (data.fixedSortOrder === 'date_asc') return (a.createdAt || 0) - (b.createdAt || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (fixKw) fixList = fixList.filter(f => (f.name || '').toLowerCase().includes(fixKw) || (f.account || '').toLowerCase().includes(fixKw));

    document.getElementById('fixedList').innerHTML = fixList.map(f => `
      <div class="pill p-3 flex justify-between items-center text-xs">
        <div>
          <span class="bold">${f.name}</span>
          <span class="tabular heavy ml-2">${formatMoney(f.amount)}</span>
          <span class="ml-2 font-normal" style="color:var(--text-muted)">${f.account} · ${f.category}</span>
        </div>
        <div class="flex items-center gap-2 font-semibold" style="color:var(--text-muted)">
          <button onclick="applyFixed('${f.id}')" class="bold text-xs" style="color:var(--text)">計入本月</button>
          <span>｜</span>
          <button onclick="openFixedModal('${f.id}')">編</button>
          <span>｜</span>
          <button onclick="deleteFixed('${f.id}')">刪</button>
        </div>
      </div>
    `).join('') || '<p class="text-xs font-semibold text-center py-2" style="color:var(--text-muted)">尚無固定收支項目</p>';
  }

  // 3. 特殊專案
  const projOpen = data.sectionsOpen.project !== false;
  document.getElementById('projectArrow').textContent = projOpen ? '▼' : '▶';
  document.getElementById('projectBody').style.display = projOpen ? 'block' : 'none';
  if (projOpen) {
    const isTable = data.projectViewMode === 'table';
    document.getElementById('projView_card').classList.toggle('active', !isTable);
    document.getElementById('projView_table').classList.toggle('active', isTable);
    document.getElementById('projectsTableView').classList.toggle('hidden', !isTable);
    document.getElementById('projectsCardView').classList.toggle('hidden', isTable);

    const projKw = (document.getElementById('filterProjectsKeyword')?.value || '').trim().toLowerCase();
    let projList = [...(data.projects || [])].sort((a, b) => {
      if (data.projectsSortOrder === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (data.projectsSortOrder === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (data.projectsSortOrder === 'date_asc') return (a.createdAt || 0) - (b.createdAt || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (!data.showArchivedProjects) projList = projList.filter(p => p.status !== 'archived');
    if (projKw) projList = projList.filter(p => (p.name || '').toLowerCase().includes(projKw));

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
              <span class="text-xs font-semibold" style="color:var(--text-muted)">
                <button onclick="openProjectTxModal('${p.id}')" style="color:var(--text)">記一筆</button> ｜ 
                <button onclick="openProjectModal('${p.id}')">編</button> ｜ 
                <button onclick="deleteProject('${p.id}')">刪</button>
              </span>
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
              <div class="flex items-center gap-2 font-semibold" style="color:var(--text-muted)">
                <button onclick="openProjectTxModal('${p.id}')" class="bold text-xs" style="color:var(--text)">＋ 記一筆</button>
                <span>｜</span>
                <button onclick="openProjectModal('${p.id}')">編</button>
                <span>｜</span>
                <button onclick="deleteProject('${p.id}')">刪</button>
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

  // 4. 數位信封預算
  const envOpen = data.sectionsOpen.envelopes !== false;
  document.getElementById('envelopesArrow').textContent = envOpen ? '▼' : '▶';
  document.getElementById('envelopesBody').style.display = envOpen ? 'block' : 'none';
}

function toggleSection(sec) {
  if (!data.sectionsOpen) data.sectionsOpen = { fixed: true, envelopes: true, project: true, freelance: true };
  data.sectionsOpen[sec] = !data.sectionsOpen[sec];
  saveData();
  renderFixedSection();
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
          <div class="flex gap-2 text-xs font-semibold" style="color:var(--text-muted)">
            <button onclick="openEnvelopeModal('${e.id}')">編</button>
            <span>｜</span>
            <button onclick="deleteEnvelope('${e.id}')">刪</button>
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
  data.transactions.forEach(t => { if (t.envelopeId === id) t.envelopeId = ''; });
  saveData();
  renderEnvelopes();
  populateEnvelopeSelect();
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
  if (!confirm('確定刪除此專案？專案明細仍會保留於記帳歷史中')) return;
  data.projects = data.projects.filter(p => p.id !== id);
  data.transactions.forEach(t => { if (t.projectId === id) t.projectId = ''; });
  saveData();
  renderFixedSection();
  populateProjectSelect();
}

// 報表：3 階灰階輪播與純文字點擊連動提示
function renderCharts() {
  const cm = currentMonthStr();
  const cy = new Date().getFullYear().toString();
  const range = data.chartTimeRange || 'month';

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
  const borderColor = isDark ? '#1c1c1e' : '#ffffff';

  const sortedCatEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const catLabels = sortedCatEntries.map(e => e[0]);
  const catValues = sortedCatEntries.map(e => e[1]);
  const catTotal = catValues.reduce((s, v) => s + v, 0) || 1;

  const sortedAccEntries = Object.entries(accMap).sort((a, b) => b[1] - a[1]);
  const accLabels = sortedAccEntries.map(e => e[0]);
  const accValues = sortedAccEntries.map(e => e[1]);
  const accTotal = accValues.reduce((s, v) => s + v, 0) || 1;

  // 使用 3 階灰階循環輪播取色
  const catColors = catValues.map((_, i) => GRAY_PALETTE[i % GRAY_PALETTE.length]);
  const accColors = accValues.map((_, i) => GRAY_PALETTE[i % GRAY_PALETTE.length]);

  const cleanTooltip = (total) => ({
    title: () => '',
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
        legend: { display: false },
        tooltip: { callbacks: cleanTooltip(catTotal) }
      },
      cutout: '65%'
    }
  });

  // 渲染純文字圖例流（點擊文字聚焦扇形並彈出 Tooltip）
  renderTextLegend('categoryTextLegend', catLabels, categoryChart);

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
        legend: { display: false },
        tooltip: { callbacks: cleanTooltip(accTotal) }
      },
      cutout: '60%'
    }
  });
  renderTextLegend('accountTextLegend', accLabels, accountChart);

  const necTotal = (nec + non) || 1;
  const necPalette = [GRAY_PALETTE[0], GRAY_PALETTE[2]];

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
        legend: { display: false },
        tooltip: { callbacks: cleanTooltip(necTotal) }
      }
    }
  });
  renderTextLegend('necessaryTextLegend', ['必要', '非必要'], necessaryChart);
}

// 產生「食 ｜ 衣 ｜ 住 ｜ 行」純文字互動圖例流
function renderTextLegend(containerId, labels, chartInstance) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!labels || !labels.length || (labels.length === 1 && labels[0] === '無支出')) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = labels.map((label, idx) => {
    const sep = idx < labels.length - 1 ? '<span class="chart-text-legend-sep">｜</span>' : '';
    return `
      <span class="chart-text-legend-item" onclick="focusChartSegment('${containerId}', ${idx})">${label}</span>
      ${sep}
    `;
  }).join('');

  // 儲存實例參照供點擊觸發
  container._chart = chartInstance;
}

function focusChartSegment(containerId, index) {
  const container = document.getElementById(containerId);
  if (!container || !container._chart) return;
  const chart = container._chart;

  // 觸發該扇形的 Tooltip 與高亮
  chart.setActiveElements([{ datasetIndex: 0, index: index }]);
  chart.tooltip.setActiveElements([{ datasetIndex: 0, index: index }], { x: 0, y: 0 });
  chart.update();

  container.querySelectorAll('.chart-text-legend-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
}

// 記帳明細
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
    receiptData = await compressImage(fileInput.files[0]);
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
  document.getElementById('editTxReceiptFileName').textContent = tx.receipt ? '已保存原照片 (可選擇替換)' : '未選擇任何檔案';
  openModal('txEditModal');
}

async function saveTxEdit() {
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
  const fileInput = document.getElementById('editTxReceiptInput');

  if (!newName) return alert('請輸入項目名稱');

  if (fileInput && fileInput.files && fileInput.files[0]) {
    tx.receipt = await compressImage(fileInput.files[0]);
  }

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

function resetTxFilters() {
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterAccount').value = '';
  document.getElementById('filterNecessary').value = '';
  document.getElementById('filterKeyword').value = '';
  document.getElementById('txRange_all').classList.add('active');
  document.getElementById('txRange_month').classList.remove('active');
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
      const receiptBtn = t.receipt ? `<button onclick="viewReceipt('${t.receipt}')" class="text-xs px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 font-bold">📸 查看</button>` : '';
      return `
        <div class="pill p-3 space-y-2 text-xs">
          <div class="flex justify-between items-center">
            <div>
              <span class="tabular font-bold" style="color:var(--text-muted)">${formatShortDate(t.date)}</span>
              <span class="badge ${t.necessary === 'necessary' ? 'badge-nec' : 'badge-non'} ml-1.5">${t.category}</span>
              <strong class="text-sm bold ml-2">${t.name}</strong>
            </div>
            <div>
              <strong class="heavy text-sm tabular">${formatMoney(t.amount)}</strong>
            </div>
          </div>
          <div class="flex justify-between items-center text-[11px] font-semibold" style="color:var(--text-muted)">
            <span>${t.account} · ${t.necessary === 'necessary' ? '必要' : '非必要'} ${tag ? `· ${tag}` : ''}</span>
            <div class="flex items-center gap-1.5 text-xs font-semibold">
              ${receiptBtn}
              <button onclick="openTxEditModal('${t.id}')">編</button>
              <span>｜</span>
              <button onclick="deleteTransaction('${t.id}')">刪</button>
            </div>
          </div>
          ${t.note ? `<div class="text-[11px] font-semibold pt-0.5" style="color:var(--text-muted)">備註：${t.note}</div>` : ''}
        </div>
      `;
    }).join('') || '<p class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無明細紀錄</p>';
  } else {
    document.getElementById('txTableBody').innerHTML = list.map(t => {
      const env = data.envelopes.find(e => e.id === t.envelopeId);
      const proj = data.projects.find(p => p.id === t.projectId);
      const tag = proj ? `[專] ${proj.name}` : (env ? env.name : '');
      const receiptBtn = t.receipt ? `<button onclick="viewReceipt('${t.receipt}')" class="text-xs font-bold">📸</button>` : '-';
      return `
        <tr class="whitespace-nowrap">
          <td class="tabular font-bold" style="color:var(--text-muted)">${formatShortDate(t.date)}</td>
          <td class="bold">${t.name}</td>
          <td class="tabular heavy text-right">${formatMoney(t.amount)}</td>
          <td>${t.category}</td>
          <td>${t.account}</td>
          <td><span class="badge ${t.necessary === 'necessary' ? 'badge-nec' : 'badge-non'}">${t.necessary === 'necessary' ? '必要' : '非必要'}</span></td>
          <td style="color:var(--text-muted)">${tag}</td>
          <td class="text-center">${receiptBtn}</td>
          <td style="color:var(--text-muted)">${t.note || ''}</td>
          <td class="text-center">
            <span class="text-xs font-semibold" style="color:var(--text-muted)">
              <button onclick="openTxEditModal('${t.id}')">編</button> ｜ <button onclick="deleteTransaction('${t.id}')">刪</button>
            </span>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="10" class="text-center py-6 text-xs font-semibold" style="color:var(--text-muted)">尚無明細紀錄</td></tr>';
  }
}

function deleteTransaction(id) {
  if (!confirm('確定刪除此筆記錄？帳戶餘額將自動回滾')) return;
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;
  data.accounts[tx.account] = (data.accounts[tx.account] || 0) - tx.amount;
  data.transactions = data.transactions.filter(t => t.id !== id);
  saveData();
  renderTransactions();
  renderDashboard();
  renderFixedSection();
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
    .filter(t => t.date && t.date.startsWith(cm) && t.amount < 0 && !isExcludedFromDailyExpense(t) && (!t.projectId || t.note?.includes('專案同步扣款')))
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

function getCurrencyRate(cur, customRate) {
  if (cur === 'TWD') return 1;
  if (customRate !== undefined && customRate !== null && !isNaN(customRate)) return customRate;
  return (data.fxRates && data.fxRates[cur]) || DEFAULT_DATA.fxRates[cur] || 1;
}

// 投資波段結算與成本隔離
function computePortfolioFromTransactions() {
  const stocks = {};
  const funds = {};
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  const sortedTxs = [...data.stockTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  sortedTxs.forEach(t => {
    const sym = (t.symbol || '').trim();
    if (!sym) return;

    const shares = Math.abs(t.shares || 0);
    const cost = Math.abs(t.totalCost !== undefined ? t.totalCost : (t.total + (t.fee || 0) + (t.tax || 0)));
    const assetType = t.assetType || '股票';

    if (assetType === '基金') {
      const cur = data.fundCurrencies[sym] || 'USD';
      if (!funds[sym]) {
        funds[sym] = {
          name: sym, currency: cur, units: 0, costTotal: 0,
          totalBoughtCost: 0, totalSoldIncome: 0, totalDividend: 0,
          latestPrice: t.price || 0, lastTxDate: t.date || ''
        };
      }
      funds[sym].lastTxDate = t.date || '';
      if (t.type === '買入') {
        if (funds[sym].units === 0) funds[sym].costTotal = 0; // 波段成本歸零隔離
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
        if (stocks[sym].shares === 0) stocks[sym].costTotal = 0; // 波段成本歸零隔離
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

  return { stocks, funds };
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
    const override = data.holdingOverrides[s.symbol];
    const shares = (override && override.isLocked) ? override.shares : s.shares;
    const price = data.stockPrices[s.symbol] !== undefined ? data.stockPrices[s.symbol] : (s.latestPrice || 0);
    invest += shares * price;
  });

  Object.values(computed.funds).forEach(f => {
    const override = data.holdingOverrides[f.name];
    const units = (override && override.isLocked) ? override.shares : f.units;
    const price = data.fundPrices[f.name] !== undefined ? data.fundPrices[f.name] : (f.latestPrice || 0);
    const rate = getCurrencyRate(f.currency, data.fundRates[f.name]);
    invest += units * price * rate;
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

// 投資清單與殖利率換算
function renderInvestments() {
  const computed = computePortfolioFromTransactions();
  const stocks = Object.values(computed.stocks);
  const funds = Object.values(computed.funds);

  let estTotalYearlyDividend = 0;
  let totalStockMv = 0;
  let totalFundMv = 0;

  // 股票排序
  const sOrder = data.stocksSortOrder || 'custom';
  let sortedStocks = [...stocks];
  if (sOrder === 'name_asc') sortedStocks.sort((a, b) => a.symbol.localeCompare(b.symbol));
  else if (sOrder === 'name_desc') sortedStocks.sort((a, b) => b.symbol.localeCompare(a.symbol));
  else if (sOrder === 'mv_desc') {
    sortedStocks.sort((a, b) => {
      const getMv = x => {
        const ov = data.holdingOverrides[x.symbol];
        const sh = (ov && ov.isLocked) ? ov.shares : x.shares;
        return sh * (data.stockPrices[x.symbol] || x.latestPrice || 0);
      };
      return getMv(b) - getMv(a);
    });
  } else if (sOrder === 'shares_desc') {
    sortedStocks.sort((a, b) => {
      const shA = (data.holdingOverrides[a.symbol]?.isLocked) ? data.holdingOverrides[a.symbol].shares : a.shares;
      const shB = (data.holdingOverrides[b.symbol]?.isLocked) ? data.holdingOverrides[b.symbol].shares : b.shares;
      return shB - shA;
    });
  } else if (sOrder === 'recent_tx') sortedStocks.sort((a, b) => (b.lastTxDate || '').localeCompare(a.lastTxDate || ''));

  if (!data.showClosedStocks) {
    sortedStocks = sortedStocks.filter(s => {
      const ov = data.holdingOverrides[s.symbol];
      const sh = (ov && ov.isLocked) ? ov.shares : s.shares;
      return sh > 0;
    });
  }

  document.getElementById('stocksTableBody').innerHTML = sortedStocks.map(s => {
    const ov = data.holdingOverrides[s.symbol];
    const isLocked = ov && ov.isLocked;
    const shares = isLocked ? ov.shares : s.shares;
    const costTotal = isLocked ? ov.cost : s.costTotal;

    const price = data.stockPrices[s.symbol] !== undefined ? data.stockPrices[s.symbol] : (s.latestPrice || 0);
    const avgCost = shares > 0 ? (costTotal / shares) : 0;
    const mv = shares * price;
    totalStockMv += mv;

    let pl = 0;
    if (shares === 0) {
      // 結清標的顯示波段已實現損益
      pl = s.totalSoldIncome + s.totalDividend - s.totalBoughtCost;
    } else {
      pl = mv - costTotal;
    }

    // 殖利率計算：手動輸入優先，否則取年化配息 ÷ 市值
    let yld = data.stockYields[s.symbol] || 0;
    if (yld === 0 && mv > 0 && s.recentOneYearDividend > 0) {
      yld = (s.recentOneYearDividend / mv) * 100;
    }
    if (shares > 0) {
      if (yld > 0) estTotalYearlyDividend += mv * (yld / 100);
      else estTotalYearlyDividend += s.recentOneYearDividend;
    }

    return `
      <tr class="whitespace-nowrap ${shares === 0 ? 'opacity-40' : ''}">
        <td class="bold">
          ${s.symbol} ${isLocked ? '<span class="text-xs" title="手動鎖定模式">🔒</span>' : ''}
        </td>
        <td class="tabular text-right">${shares.toLocaleString()}</td>
        <td class="tabular text-right">${avgCost.toFixed(2)}</td>
        <td class="tabular text-right">${price.toFixed(2)}</td>
        <td class="tabular heavy text-right">${formatMoney(mv)}</td>
        <td class="tabular text-right">${formatPLHtml(pl)}</td>
        <td class="tabular text-right">${yld > 0 ? yld.toFixed(2) + '%' : '--'}</td>
        <td class="text-center">
          <button onclick="openHoldingEditModal('${s.symbol}', '股票')" class="text-xs font-semibold" style="color:var(--text-muted)">設定</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無股票部位</td></tr>';

  document.getElementById('stocksTotalValue').textContent = formatMoney(totalStockMv);

  // 基金排序
  const fOrder = data.fundsSortOrder || 'custom';
  let sortedFunds = [...funds];
  if (fOrder === 'name_asc') sortedFunds.sort((a, b) => a.name.localeCompare(b.name));
  else if (fOrder === 'name_desc') sortedFunds.sort((a, b) => b.name.localeCompare(a.name));
  else if (fOrder === 'mv_desc') {
    sortedFunds.sort((a, b) => {
      const getMv = x => {
        const ov = data.holdingOverrides[x.name];
        const un = (ov && ov.isLocked) ? ov.shares : x.units;
        return un * (data.fundPrices[x.name] || x.latestPrice || 0) * getCurrencyRate(x.currency, data.fundRates[x.name]);
      };
      return getMv(b) - getMv(a);
    });
  } else if (fOrder === 'units_desc') {
    sortedFunds.sort((a, b) => {
      const unA = (data.holdingOverrides[a.name]?.isLocked) ? data.holdingOverrides[a.name].shares : a.units;
      const unB = (data.holdingOverrides[b.name]?.isLocked) ? data.holdingOverrides[b.name].shares : b.units;
      return unB - unA;
    });
  } else if (fOrder === 'recent_tx') sortedFunds.sort((a, b) => (b.lastTxDate || '').localeCompare(a.lastTxDate || ''));

  if (!data.showClosedFunds) {
    sortedFunds = sortedFunds.filter(f => {
      const ov = data.holdingOverrides[f.name];
      const un = (ov && ov.isLocked) ? ov.shares : f.units;
      return un > 0;
    });
  }

  document.getElementById('fundsTableBody').innerHTML = sortedFunds.map(f => {
    const ov = data.holdingOverrides[f.name];
    const isLocked = ov && ov.isLocked;
    const units = isLocked ? ov.shares : f.units;
    const costTotal = isLocked ? ov.cost : f.costTotal;

    const price = data.fundPrices[f.name] !== undefined ? data.fundPrices[f.name] : (f.latestPrice || 0);
    const rate = getCurrencyRate(f.currency, data.fundRates[f.name]);
    const avgCost = units > 0 ? (costTotal / units) : 0;
    const mv = units * price * rate;
    totalFundMv += mv;

    let pl = 0;
    if (units === 0) {
      pl = f.totalSoldIncome + f.totalDividend - f.totalBoughtCost;
    } else {
      pl = mv - costTotal;
    }

    return `
      <tr class="whitespace-nowrap ${units === 0 ? 'opacity-40' : ''}">
        <td class="bold">
          ${f.name} ${isLocked ? '<span class="text-xs" title="手動鎖定模式">🔒</span>' : ''}
        </td>
        <td>${f.currency}</td>
        <td class="tabular text-right">${units.toFixed(2)}</td>
        <td class="tabular text-right">${avgCost.toFixed(2)}</td>
        <td class="tabular text-right">${price.toFixed(2)}</td>
        <td class="tabular text-right">${rate.toFixed(2)}</td>
        <td class="tabular heavy text-right">${formatMoney(mv)}</td>
        <td class="tabular text-right">${formatPLHtml(pl)}</td>
        <td class="text-center">
          <button onclick="openHoldingEditModal('${f.name}', '基金')" class="text-xs font-semibold" style="color:var(--text-muted)">設定</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" class="text-center py-4 text-xs font-semibold" style="color:var(--text-muted)">尚無基金部位</td></tr>';

  document.getElementById('fundsTotalValue').textContent = formatMoney(totalFundMv);

  const estMonthly = Math.round(estTotalYearlyDividend / 12);
  const goal = data.dividendGoal || 10000;
  const pct = goal > 0 ? Math.min(100, Math.round((estMonthly / goal) * 100)) : 0;

  document.getElementById('estMonthlyDividend').textContent = formatMoney(estMonthly);
  document.getElementById('dividendTargetDisplay').textContent = formatMoney(goal);
  document.getElementById('dividendProgressPct').textContent = pct + '%';
  document.getElementById('dividendProgressBar').style.width = pct + '%';
  document.getElementById('dividendToggle').classList.toggle('on', data.showDividendGoal !== false);
  document.getElementById('dividendBody').style.display = (data.showDividendGoal !== false) ? 'block' : 'none';
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

// 標的設定彈窗與手動覆蓋邏輯
function setHoldingOverrideMode(isManual) {
  document.getElementById('overrideBtn_manual').classList.toggle('active', isManual);
  document.getElementById('overrideBtn_auto').classList.toggle('active', !isManual);

  const sharesInput = document.getElementById('editHoldingShares');
  const costInput = document.getElementById('editHoldingCost');
  const refText = document.getElementById('holdingLedgerRefText');

  sharesInput.disabled = !isManual;
  costInput.disabled = !isManual;

  if (isManual) {
    refText.textContent = '🔒 已鎖定為手動自訂數值（現價與匯率仍自動更新）';
    refText.style.color = 'var(--text)';
  } else {
    refText.textContent = '🔓 目前跟隨交易流水帳自動累算';
    refText.style.color = 'var(--text-muted)';
    // 還原為流水帳原始值
    const sym = document.getElementById('editHoldingSymbol').value;
    const type = document.getElementById('editHoldingType').value;
    const computed = computePortfolioFromTransactions();
    if (type === '股票') {
      const s = computed.stocks[sym] || { shares: 0, costTotal: 0 };
      sharesInput.value = s.shares;
      costInput.value = s.costTotal;
    } else {
      const f = computed.funds[sym] || { units: 0, costTotal: 0 };
      sharesInput.value = f.units;
      costInput.value = f.costTotal;
    }
  }
}

function openHoldingEditModal(symbol, type) {
  document.getElementById('editHoldingSymbol').value = symbol;
  document.getElementById('editHoldingType').value = type;
  document.getElementById('editHoldingNameDisplay').value = symbol;

  const isStock = type === '股票';
  document.getElementById('holdingYieldField').classList.toggle('hidden', !isStock);
  document.getElementById('holdingRateField').classList.toggle('hidden', isStock);
  document.getElementById('holdingCurrencyField').classList.toggle('hidden', isStock);

  document.getElementById('editHoldingSharesLabel').textContent = isStock ? '持有股數' : '持有單位數';
  document.getElementById('editHoldingCostLabel').textContent = '總投入成本 (台幣)';
  document.getElementById('editHoldingPriceLabel').textContent = isStock ? '現價' : '現價 (原幣淨值)';

  const computed = computePortfolioFromTransactions();
  const ov = data.holdingOverrides[symbol] || { isLocked: false, shares: 0, cost: 0 };

  if (isStock) {
    const s = computed.stocks[symbol] || { shares: 0, costTotal: 0, latestPrice: 0 };
    document.getElementById('editHoldingShares').value = ov.isLocked ? ov.shares : s.shares;
    document.getElementById('editHoldingCost').value = ov.isLocked ? ov.cost : s.costTotal;
    document.getElementById('editHoldingPrice').value = data.stockPrices[symbol] || s.latestPrice || 0;
    document.getElementById('editHoldingYield').value = data.stockYields[symbol] || '';
  } else {
    const f = computed.funds[symbol] || { units: 0, costTotal: 0, latestPrice: 0, currency: 'USD' };
    document.getElementById('editHoldingShares').value = ov.isLocked ? ov.shares : f.units;
    document.getElementById('editHoldingCost').value = ov.isLocked ? ov.cost : f.costTotal;
    document.getElementById('editHoldingPrice').value = data.fundPrices[symbol] || f.latestPrice || 0;
    document.getElementById('editHoldingRate').value = data.fundRates[symbol] || getCurrencyRate(f.currency);
    document.getElementById('editHoldingCurrency').value = data.fundCurrencies[symbol] || f.currency || 'USD';
  }

  setHoldingOverrideMode(ov.isLocked);
  openModal('holdingEditModal');
}

function onEditModalCurrencyChange(cur) {
  document.getElementById('editHoldingRate').value = getCurrencyRate(cur);
}

function saveHoldingEdit() {
  const sym = document.getElementById('editHoldingSymbol').value;
  const type = document.getElementById('editHoldingType').value;
  const isManual = document.getElementById('overrideBtn_manual').classList.contains('active');

  if (isManual) {
    const sh = parseFloat(document.getElementById('editHoldingShares').value) || 0;
    const co = parseFloat(document.getElementById('editHoldingCost').value) || 0;
    data.holdingOverrides[sym] = { isLocked: true, shares: sh, cost: co };
  } else {
    if (data.holdingOverrides[sym]) {
      data.holdingOverrides[sym].isLocked = false;
    }
  }

  if (type === '股票') {
    const price = parseFloat(document.getElementById('editHoldingPrice').value);
    const yld = parseFloat(document.getElementById('editHoldingYield').value);
    if (!isNaN(price)) data.stockPrices[sym] = price;
    if (!isNaN(yld)) data.stockYields[sym] = yld;
  } else {
    const price = parseFloat(document.getElementById('editHoldingPrice').value);
    const rate = parseFloat(document.getElementById('editHoldingRate').value);
    const cur = document.getElementById('editHoldingCurrency').value;
    if (!isNaN(price)) data.fundPrices[sym] = price;
    if (!isNaN(rate)) data.fundRates[sym] = rate;
    if (cur) data.fundCurrencies[sym] = cur;
  }

  saveData();
  closeModal('holdingEditModal');
  renderInvestments();
  renderDashboard();
}

// 投資交易
function onAssetTypeChange() {
  const isFund = document.getElementById('stxAssetType').value === '基金';
  document.getElementById('stxTax').value = isFund ? '0' : '0';
  calcStockInputs();
}

function onStxTypeChange() {
  const type = document.getElementById('stxType').value;
  if (type === '賣出' && document.getElementById('stxAssetType').value === '股票') {
    const shares = parseFloat(document.getElementById('stxShares').value) || 0;
    const price = parseFloat(document.getElementById('stxPrice').value) || 0;
    document.getElementById('stxTax').value = Math.round(shares * price * 0.003);
  } else {
    document.getElementById('stxTax').value = '0';
  }
  calcStockInputs();
}

function calcStockInputs() {
  const shares = parseFloat(document.getElementById('stxShares').value) || 0;
  const price = parseFloat(document.getElementById('stxPrice').value) || 0;
  const fee = parseFloat(document.getElementById('stxFee').value) || 0;
  const tax = parseFloat(document.getElementById('stxTax').value) || 0;
  const type = document.getElementById('stxType').value;

  const total = Math.round(shares * price);
  document.getElementById('stxTotal').value = total;

  let cost = total;
  if (type === '買入') cost = total + fee;
  else if (type === '賣出') cost = total - fee - tax;
  else if (type === '配息') cost = total - fee;
  document.getElementById('stxTotalCost').value = Math.max(0, cost);
}

function addStockTransaction() {
  const date = document.getElementById('stxDate').value || todayStr();
  const account = document.getElementById('stxAccount').value;
  const assetType = document.getElementById('stxAssetType').value;
  const type = document.getElementById('stxType').value;
  const symbol = document.getElementById('stxSymbol').value.trim();
  const shares = parseFloat(document.getElementById('stxShares').value) || 0;
  const price = parseFloat(document.getElementById('stxPrice').value) || 0;
  const fee = parseFloat(document.getElementById('stxFee').value) || 0;
  const tax = parseFloat(document.getElementById('stxTax').value) || 0;
  const total = parseFloat(document.getElementById('stxTotal').value) || 0;
  const totalCost = parseFloat(document.getElementById('stxTotalCost').value) || 0;
  const note = document.getElementById('stxNote').value.trim();

  if (!symbol) return alert('請輸入標的代號或名稱');
  if (shares <= 0 && type !== '配息') return alert('請輸入有效股數');

  const linkedTxId = uid();
  data.stockTransactions.push({
    id: uid(), date, account, assetType, type, symbol, shares, price, fee, tax, total, totalCost, note, linkedTxId
  });

  let txAmt = 0;
  let txCat = '投';
  if (type === '買入') {
    txAmt = -totalCost;
    txCat = '投';
  } else if (type === '賣出') {
    txAmt = totalCost;
    txCat = '折';
  } else if (type === '配息') {
    txAmt = totalCost;
    txCat = '息';
  }

  data.accounts[account] = (data.accounts[account] || 0) + txAmt;
  data.transactions.push({
    id: linkedTxId, date, name: `${symbol}（${type}）`,
    amount: txAmt, category: txCat, account, necessary: 'necessary', note: `${shares}股 @ $${price} ${note}`,
    envelopeId: '', projectId: '', receipt: ''
  });

  saveData();
  document.getElementById('stxSymbol').value = '';
  document.getElementById('stxShares').value = '';
  document.getElementById('stxPrice').value = '';
  document.getElementById('stxTotal').value = '';
  document.getElementById('stxTotalCost').value = '';
  document.getElementById('stxNote').value = '';
  renderStockTransactions();
  renderInvestments();
  renderDashboard();
  renderTransactions();
}

function openStockTxEditModal(id) {
  const t = data.stockTransactions.find(x => x.id === id);
  if (!t) return;
  document.getElementById('editStxId').value = t.id;
  document.getElementById('editStxDate').value = t.date;
  document.getElementById('editStxAccount').value = t.account;
  document.getElementById('editStxAssetType').value = t.assetType || '股票';
  document.getElementById('editStxType').value = t.type;
  document.getElementById('editStxSymbol').value = t.symbol;
  document.getElementById('editStxShares').value = t.shares;
  document.getElementById('editStxPrice').value = t.price;
  document.getElementById('editStxFee').value = t.fee;
  document.getElementById('editStxTax').value = t.tax;
  document.getElementById('editStxTotal').value = t.total;
  document.getElementById('editStxTotalCost').value = t.totalCost !== undefined ? t.totalCost : t.total;
  document.getElementById('editStxNote').value = t.note || '';
  openModal('stxEditModal');
}

function calcEditStockInputs() {
  const shares = parseFloat(document.getElementById('editStxShares').value) || 0;
  const price = parseFloat(document.getElementById('editStxPrice').value) || 0;
  const fee = parseFloat(document.getElementById('editStxFee').value) || 0;
  const tax = parseFloat(document.getElementById('editStxTax').value) || 0;
  const type = document.getElementById('editStxType').value;

  const total = Math.round(shares * price);
  document.getElementById('editStxTotal').value = total;

  let cost = total;
  if (type === '買入') cost = total + fee;
  else if (type === '賣出') cost = total - fee - tax;
  else if (type === '配息') cost = total - fee;
  document.getElementById('editStxTotalCost').value = Math.max(0, cost);
}

function saveStockTxEdit() {
  const id = document.getElementById('editStxId').value;
  const t = data.stockTransactions.find(x => x.id === id);
  if (!t) return;

  const newDate = document.getElementById('editStxDate').value || todayStr();
  const newAccount = document.getElementById('editStxAccount').value;
  const newAssetType = document.getElementById('editStxAssetType').value;
  const newType = document.getElementById('editStxType').value;
  const newSymbol = document.getElementById('editStxSymbol').value.trim();
  const newShares = parseFloat(document.getElementById('editStxShares').value) || 0;
  const newPrice = parseFloat(document.getElementById('editStxPrice').value) || 0;
  const newFee = parseFloat(document.getElementById('editStxFee').value) || 0;
  const newTax = parseFloat(document.getElementById('editStxTax').value) || 0;
  const newTotal = parseFloat(document.getElementById('editStxTotal').value) || 0;
  const newTotalCost = parseFloat(document.getElementById('editStxTotalCost').value) || 0;
  const newNote = document.getElementById('editStxNote').value.trim();

  const linkedTx = data.transactions.find(x => t.linkedTxId && x.id === t.linkedTxId);
  if (linkedTx) {
    data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
    let newTxAmt = 0;
    let newCat = '投';
    if (newType === '買入') { newTxAmt = -newTotalCost; newCat = '投'; }
    else if (newType === '賣出') { newTxAmt = newTotalCost; newCat = '折'; }
    else if (newType === '配息') { newTxAmt = newTotalCost; newCat = '息'; }

    linkedTx.date = newDate;
    linkedTx.account = newAccount;
    linkedTx.name = `${newSymbol}（${newType}）`;
    linkedTx.amount = newTxAmt;
    linkedTx.category = newCat;
    linkedTx.note = `${newShares}股 @ $${newPrice} ${newNote}`;
    data.accounts[newAccount] = (data.accounts[newAccount] || 0) + newTxAmt;
  }

  t.date = newDate;
  t.account = newAccount;
  t.assetType = newAssetType;
  t.type = newType;
  t.symbol = newSymbol;
  t.shares = newShares;
  t.price = newPrice;
  t.fee = newFee;
  t.tax = newTax;
  t.total = newTotal;
  t.totalCost = newTotalCost;
  t.note = newNote;

  saveData();
  closeModal('stxEditModal');
  renderStockTransactions();
  renderInvestments();
  renderDashboard();
  renderTransactions();
}

function deleteStockTransaction(id) {
  if (!confirm('確定刪除此交易？關聯的記帳明細將同步刪除且帳戶回滾')) return;
  const t = data.stockTransactions.find(x => x.id === id);
  if (!t) return;
  if (t.linkedTxId) {
    const linkedTx = data.transactions.find(x => x.id === t.linkedTxId);
    if (linkedTx) {
      data.accounts[linkedTx.account] = (data.accounts[linkedTx.account] || 0) - linkedTx.amount;
      data.transactions = data.transactions.filter(x => x.id !== t.linkedTxId);
    }
  }
  data.stockTransactions = data.stockTransactions.filter(x => x.id !== id);
  saveData();
  renderStockTransactions();
  renderInvestments();
  renderDashboard();
  renderTransactions();
}

// 帳戶排序與外幣管理
function openAccountEditModal() {
  const container = document.getElementById('accountEditFields');
  container.innerHTML = (data.accountList || DEFAULT_ACCOUNTS).map((name, idx) => `
    <div class="flex items-center gap-2 drag-item" draggable="true" data-index="${idx}">
      <span class="drag-handle text-base select-none px-1" style="color:var(--text-muted)">⠿</span>
      <input type="text" class="input flex-1 py-1 px-3 text-xs" value="${name}" data-old-name="${name}" onchange="renameAccount('${name}', this.value)" />
      <input type="number" class="input w-28 py-1 px-3 text-xs tabular" value="${data.accounts[name] || 0}" onchange="updateAccountBalance('${name}', this.value)" />
      <button onclick="deleteAccount('${name}')" class="font-bold text-xs px-2" style="color:var(--text-muted)">刪除</button>
    </div>
  `).join('');

  setupAccountDragAndDrop();

  FX_CURRENCIES.forEach(c => {
    const inp = document.getElementById('fxCashInput_' + c);
    if (inp) inp.value = (data.fxCash && data.fxCash[c]) || 0;
  });

  openModal('accountModal');
}

function setupAccountDragAndDrop() {
  const container = document.getElementById('accountEditFields');
  let draggedEl = null;

  container.querySelectorAll('.drag-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      draggedEl = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      if (draggedEl) draggedEl.classList.remove('dragging');
      draggedEl = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.drag-item');
      if (target && target !== draggedEl) {
        const rect = target.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        container.insertBefore(draggedEl, next ? target.nextSibling : target);
      }
    });
  });
}

function renameAccount(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName) return;
  if (data.accounts[newName] !== undefined) return alert('帳戶名稱已存在');

  const idx = data.accountList.indexOf(oldName);
  if (idx !== -1) data.accountList[idx] = newName;
  data.accounts[newName] = data.accounts[oldName];
  delete data.accounts[oldName];

  data.transactions.forEach(t => { if (t.account === oldName) t.account = newName; });
  data.stockTransactions.forEach(t => { if (t.account === oldName) t.account = newName; });
  data.fixedItems.forEach(f => { if (f.account === oldName) f.account = newName; });
  data.freelances.forEach(f => { if (f.account === oldName) f.account = newName; });
  data.fxExchanges.forEach(x => {
    if (x.fromAcc === oldName) x.fromAcc = newName;
    if (x.toAcc === oldName) x.toAcc = newName;
  });
}

function updateAccountBalance(name, val) {
  data.accounts[name] = parseFloat(val) || 0;
}

function addNewAccount() {
  const name = document.getElementById('newAccountName').value.trim();
  if (!name) return;
  if (data.accounts[name] !== undefined) return alert('帳戶已存在');
  data.accountList.push(name);
  data.accounts[name] = 0;
  document.getElementById('newAccountName').value = '';
  openAccountEditModal();
}

function deleteAccount(name) {
  if (!confirm(`確定刪除「${name}」？`)) return;
  data.accountList = data.accountList.filter(a => a !== name);
  delete data.accounts[name];
  openAccountEditModal();
}

function saveAccounts() {
  const container = document.getElementById('accountEditFields');
  const newList = [];
  container.querySelectorAll('.drag-item').forEach(el => {
    const input = el.querySelector('input[data-old-name]');
    if (input) newList.push(input.value.trim());
  });
  if (newList.length) data.accountList = newList;

  if (!data.fxCash) data.fxCash = {};
  FX_CURRENCIES.forEach(c => {
    const val = parseFloat(document.getElementById('fxCashInput_' + c).value);
    data.fxCash[c] = isNaN(val) ? 0 : val;
  });

  saveData();
  closeModal('accountModal');
  populateAllAccountSelects();
  renderDashboard();
}

function importInvoiceCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n');
    let count = 0;
    for (let line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const date = parts[0].trim();
        const name = parts[1].trim();
        const amt = parseFloat(parts[2].trim());
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && name && !isNaN(amt)) {
          data.transactions.push({
            id: uid(), date, name, amount: -Math.abs(amt), category: '雜', account: '現金', necessary: 'necessary', note: 'CSV匯入', envelopeId: '', projectId: '', receipt: ''
          });
          data.accounts['現金'] = (data.accounts['現金'] || 0) - Math.abs(amt);
          count++;
        }
      }
    }
    saveData();
    renderTransactions();
    renderDashboard();
    alert(`成功匯入 ${count} 筆發票資料！`);
  };
  reader.readAsText(file);
  event.target.value = '';
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

function setChartTimeRange(range) {
  data.chartTimeRange = range;
  ['chartRangeMonth', 'chartRangeYear', 'chartRangeAll'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
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
      data = Object.assign({}, DEFAULT_DATA, incoming);
      saveData();
      loadData();
      populateAllAccountSelects();
      populateProjectSelect();
      populateFreelanceCategorySelect();
      switchTab('dashboard');
      alert('已依照匯入檔案完全覆蓋更新！所有接案與帳戶餘額已完整還原！');
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
  populateFreelanceCategorySelect();
  switchTab('dashboard');
  alert('已重置為初始狀態');
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  populateAllAccountSelects();
  populateProjectSelect();
  populateFreelanceCategorySelect();
  switchTab('dashboard');
});