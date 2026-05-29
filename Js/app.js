/* ============================================================
   SmartStock Pro — app.js
   Complete application JavaScript
   Sections:
     - Config & Constants
     - Permissions & Auth
     - UI Utilities (toast, confirm, drawers)
     - Admin & Change Requests
     - Login & Session Management
     - Dashboard
     - Sales / POS
     - Products & Inventory
     - Firebase Sync
     - Expenses
     - Gallery
     - Salary
     - Credits / Debtors
     - Business Settings & Team
     - Reports & Daily Report
     - Customers
     - AI Assistant
     - Team Chat
     - PWA & Service Worker
     - Stock Management
     - Quotations
     - Warehouses
     - Suppliers
     - Order Fulfillment
     - Initialization
   ============================================================ */





'use strict';
const CSYM={USD:'$',LRD:'L$',EUR:'€',GBP:'£',NGN:'₦',GHS:'₵',ZAR:'R',KES:'Ksh'};
const CATI={Tiles:'🟦',Cement:'🏗',Tools:'🔧',Paint:'🎨',Plumbing:'🚰',Electrical:'⚡',Accessories:'🔩',Other:'📦',General:'📦'};
const MODS=['products','sales','stock','expenses','salary','reports'];
const MLBL={products:'Products',sales:'Sales',stock:'Stock',expenses:'Expenses',salary:'Salary',reports:'Reports'};
const RLBL={primaryAdmin:'Primary Admin',admin:'Admin',dataOperator:'Data Operator',viewer:'Viewer'};
const RCLS={primaryAdmin:'rpa',admin:'rad',dataOperator:'rdo',viewer:'rvi'};
const PROD_LOCK_HRS=3;  // hours before product edit requires approval (was 8)
const RECORD_LOCK_HRS=3; // hours before sales/expense edit requires approval (was 8)
const DEL_GRACE=5*60*60*1000;
let DB={businesses:[],currentBizId:1,users:[],inviteCodes:[],notifications:[],deleteRequests:[],changeRequests:[],adminLog:[],nextBizId:2,nextUserId:3,nextCodeId:1,nextNotifId:1,nextReqId:1,nextLogId:1,nextCRId:1};
let CU=null,CBI=1,confFn=null,toastTmr=null;
let cartItems=[],siItems=[],siIdx=0,soItems=[],soIdx=0,puItems=[],puIdx=0;
let currentPayMode='Cash',saleMode='quick';
let saleFilter='all',expFilter='all',prodCat='all',galCat='all';
let payingCrId=null,editProdId=null,editEmpId=null,curSalRecId=null;
let pendingRecCR={type:null,id:null,label:null}; // for sale/expense change requests
let editingExpId=null,editingSaleId=null,pendingCRProdId=null;
let pinCallback=null,pinCancelCb=null;
let calcRooms=[{id:1,name:'Room 1',l:0,w:0,area:0}],calcRId=2;
let permSel={manual:MODS.slice(),invite:MODS.slice()};
let adminTabActive='requests';
let curTheme='dark';

const biz=()=>{if(!DB||!DB.businesses||!DB.businesses.length)return null;return DB.businesses.find(b=>b.id===CBI)||DB.businesses[0];};
const today=()=>new Date().toISOString().split('T')[0];
const yesterday=()=>{var d=new Date();d.setDate(d.getDate()-1);return d.toISOString().split('T')[0];};
const calcTrend=(curr,prev)=>{
  if(prev<=0&&curr<=0)return 0;
  if(prev<=0)return 100;
  return Math.round(((curr-prev)/prev)*100);
};
const trendHtml=pct=>{
  if(pct===0||isNaN(pct))return '';
  var up=pct>0;
  return '<div class="trend '+(up?'trend-up':'trend-dn')+'">'+(up?'↑':'↓')+Math.abs(pct)+'%</div>';
};
const thisMonth=()=>today().slice(0,7);
const sym=()=>{const b=biz();return({"USD":"$","LRD":"L$","EUR":"€","GBP":"£","NGN":"₦","GHS":"₵","ZAR":"R","KES":"Ksh"})[b&&b.currency?b.currency:'USD']||'$';};
const f$=v=>sym()+Number(v||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const fN=v=>Number(v||0).toLocaleString();
const isToday=d=>d===today();
const isWeek=d=>{
  if(!d)return false;
  var t=new Date(d+'T12:00:00');
  return(Date.now()-t.getTime())<=7*24*3600000;
};
const isMon=d=>d&&d.startsWith(today().slice(0,7));
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const em=m=>`<div class="empty"><div class="ei">📦</div><div class="et">Nothing here</div><div class="es">${m}</div></div>`;
const ago=ts=>{const d=(Date.now()-ts)/1000;if(d<60)return Math.floor(d)+'s ago';if(d<3600)return Math.floor(d/60)+'m ago';if(d<86400)return Math.floor(d/3600)+'h ago';return Math.floor(d/86400)+'d ago';};
const fmtDate=ts=>new Date(ts).toLocaleString();
const mkInit=n=>String(n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const sTotal=s=>Math.max(0,s.items.reduce((a,b)=>a+b.qty*b.unitPrice,0)-(s.discount||0));
const sDue=s=>Math.max(0,sTotal(s)-(s.paid||0));
const sSt=s=>{const d=sDue(s);return d<=0?'PAID':(s.paid||0)>0?'PARTIAL':'CREDIT';};
const crBal=c=>(c.totalOwed||0)-(c.totalPaid||0); // Outstanding balance (can be 0)
const canAccess=m=>{if(!CU)return false;if(CU.role==='primaryAdmin'||CU.role==='admin')return true;return(CU.allowedModules||[]).includes(m);};
const isAdmin=()=>CU&&(CU.role==='primaryAdmin'||CU.role==='admin');
// ─── PRIMARY ADMIN: only the original account creator
const isPrimary=()=>CU&&CU.role==='primaryAdmin';

// ─── PERMISSION SYSTEM ───
// Each toggleable permission has a key. Primary admin can grant these per-user.
// 9 toggleable permissions (the ones the user selected)
const PERM_KEYS = [
  'see_dashboard_cards',     // Dashboard revenue/profit cards (overall)
  'see_net_profit',          // Hero: Today's Net Profit strip
  'see_expenses_card',       // Dashboard: Expenses card
  'see_inventory_value',     // Dashboard: Inventory Value card
  'see_weekly_revenue',      // Dashboard: Weekly Revenue chart
  'see_all_sales',           // See ALL sales (not just own) — also drives Today Sales total
  'see_product_price',       // See product selling prices
  'see_financial_reports',   // Reports page (P&L, profit analysis)
  'see_sales_totals',        // Sales totals + due amounts on sales page
  'see_product_cost',        // Product cost prices
  'see_expenses',            // Expenses page (full access)
  'see_salary_management',   // Salary Management menu access
  'export_reports',          // Export Excel
  'print_daily_report',      // Print daily summary
  'manage_team',             // Manage team (approve, promote)
  'manage_settings'          // Business Settings
];
const PERM_LABELS = {
  see_dashboard_cards:   'View Dashboard (general)',
  see_net_profit:        'View Today\'s Net Profit',
  see_expenses_card:     'View Expenses card',
  see_inventory_value:   'View Inventory Value card',
  see_weekly_revenue:    'View Weekly Revenue chart',
  see_all_sales:         'View ALL sales (not just own)',
  see_product_price:     'View product selling prices',
  see_financial_reports: 'View Financial Reports',
  see_sales_totals:      'View Sales totals + due amounts',
  see_product_cost:      'View product cost prices',
  see_expenses:          'View Expenses page',
  see_salary_management: 'Access Salary Management',
  export_reports:        'Export Sales / Reports to Excel',
  print_daily_report:    'Print Daily Report',
  manage_team:           'Manage Team',
  manage_settings:       'Manage Business Settings'
};


// ═══════════════════════════════════════════════════════════════════
//  WORKING-DAY ALLOCATION SYSTEM
//  Used by Documentation Expense & Salary Allocation modules
// ═══════════════════════════════════════════════════════════════════

// Holiday calendar per country (MM-DD format, repeated every year)
// "*" before date = fixed annual date. Some holidays vary year-to-year — those use full YYYY-MM-DD.
const COUNTRY_HOLIDAYS = {
  Liberia: {
    name: 'Liberia',
    flag: '🇱🇷',
    workWeek: [1,2,3,4,5,6], // Mon-Sat (0=Sun, 6=Sat)
    fixed: [
      {date:'01-01', name:'New Year\'s Day'},
      {date:'02-11', name:'Armed Forces Day'},
      {date:'03-15', name:'Decoration Day'},
      {date:'03-15', name:'J.J. Roberts\' Birthday'},
      {date:'04-12', name:'Fast & Prayer Day'},
      {date:'05-14', name:'National Unification Day'},
      {date:'07-26', name:'Independence Day'},
      {date:'08-24', name:'Flag Day'},
      {date:'11-29', name:'President Tubman\'s Birthday'},
      {date:'12-25', name:'Christmas Day'},
    ]
  },
  Ghana: {
    name: 'Ghana',
    flag: '🇬🇭',
    workWeek: [1,2,3,4,5,6],
    fixed: [
      {date:'01-01', name:'New Year\'s Day'},
      {date:'01-07', name:'Constitution Day'},
      {date:'03-06', name:'Independence Day'},
      {date:'05-01', name:'Workers\' Day'},
      {date:'05-25', name:'Africa Unity Day'},
      {date:'07-01', name:'Republic Day'},
      {date:'09-21', name:'Founder\'s Day'},
      {date:'12-25', name:'Christmas Day'},
      {date:'12-26', name:'Boxing Day'},
    ]
  },
  Nigeria: {
    name: 'Nigeria',
    flag: '🇳🇬',
    workWeek: [1,2,3,4,5,6],
    fixed: [
      {date:'01-01', name:'New Year\'s Day'},
      {date:'05-01', name:'Workers\' Day'},
      {date:'05-29', name:'Democracy Day'},
      {date:'06-12', name:'Democracy Day (Public)'},
      {date:'10-01', name:'Independence Day'},
      {date:'12-25', name:'Christmas Day'},
      {date:'12-26', name:'Boxing Day'},
    ]
  },
  USA: {
    name: 'United States',
    flag: '🇺🇸',
    workWeek: [1,2,3,4,5], // Mon-Fri
    fixed: [
      {date:'01-01', name:'New Year\'s Day'},
      {date:'07-04', name:'Independence Day'},
      {date:'11-11', name:'Veterans Day'},
      {date:'12-25', name:'Christmas Day'},
    ]
  },
  Other: {
    name: 'Other',
    flag: '🌍',
    workWeek: [1,2,3,4,5,6],
    fixed: []
  }
};

function getBizCountry(){
  const b = (typeof biz === 'function') ? biz() : null;
  if (!b) return 'Liberia';
  return b.country || 'Liberia';
}

function getHolidaySet(year, country){
  country = country || getBizCountry();
  const data = COUNTRY_HOLIDAYS[country] || COUNTRY_HOLIDAYS.Liberia;
  const set = new Set();
  (data.fixed || []).forEach(function(h){
    set.add(year + '-' + h.date);
  });
  // Custom business holidays (if added)
  const b = (typeof biz === 'function') ? biz() : null;
  if (b && Array.isArray(b.customHolidays)) {
    b.customHolidays.forEach(function(h){
      if (h && h.date) set.add(h.date);
    });
  }
  return set;
}

function isWorkingDay(dateStr, country){
  // dateStr = 'YYYY-MM-DD'
  if (!dateStr) return false;
  country = country || getBizCountry();
  const data = COUNTRY_HOLIDAYS[country] || COUNTRY_HOLIDAYS.Liberia;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const dow = d.getDay(); // 0=Sun..6=Sat
  if (!(data.workWeek || []).includes(dow)) return false;
  const year = d.getFullYear();
  const holidays = getHolidaySet(year, country);
  if (holidays.has(dateStr)) return false;
  return true;
}


// ─── Get day count using allocation method (calendar OR working days) ───
function getAllocDayCount(startDateStr, endDateStr){
  // Always uses working days only (Mon-Sat, excludes holidays)
  return countWorkingDays(startDateStr, endDateStr);
}

// ─── Check if a date counts for allocation (respects method setting) ───
function isAllocationDay(dateStr){
  // Allocation only happens on working days (Mon-Sat, no holidays)
  return isWorkingDay(dateStr);
}

function countWorkingDays(startDateStr, endDateStr, country){
  // Inclusive on both ends
  if (!startDateStr || !endDateStr) return 0;
  country = country || getBizCountry();
  var start = new Date(startDateStr + 'T00:00:00');
  var end = new Date(endDateStr + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (start > end) return 0;
  // Walk year by year for efficiency (cache holidays per year)
  var holidayCache = {};
  var data = COUNTRY_HOLIDAYS[country] || COUNTRY_HOLIDAYS.Liberia;
  var ww = new Set(data.workWeek || []);
  var count = 0;
  var cur = new Date(start);
  while (cur <= end) {
    var yr = cur.getFullYear();
    if (!holidayCache[yr]) holidayCache[yr] = getHolidaySet(yr, country);
    if (ww.has(cur.getDay())) {
      var iso = cur.toISOString().split('T')[0];
      if (!holidayCache[yr].has(iso)) count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── Per-document/per-salary daily allocation ───
function getDocDailyAmount(doc){
  if (!doc) return 0;
  if (!doc.cost || !doc.startDate || !doc.expiryDate) return 0;
  const total = getAllocDayCount(doc.startDate, doc.expiryDate);
  if (total <= 0) return 0;
  return doc.cost / total;
}

function getSalaryDailyAmount(emp){
  if (!emp) return 0;
  // Only allocate if both dates set AND toggle is enabled
  if (!emp.allocStart || !emp.allocEnd) return 0;
  // Validate dates
  if (emp.allocEnd <= emp.allocStart) return 0;
  var total = getAllocDayCount(emp.allocStart, emp.allocEnd);
  if (total <= 0) return 0;
  // Use allocCost if available; otherwise compute from monthly salary
  var cost = parseFloat(emp.allocCost || 0);
  if (cost <= 0) {
    // Fallback: compute from monthly salary × months
    var sD = new Date(emp.allocStart + 'T00:00:00');
    var eD = new Date(emp.allocEnd + 'T00:00:00');
    var months = (eD.getFullYear() - sD.getFullYear()) * 12 + (eD.getMonth() - sD.getMonth());
    var lms = new Date(eD.getFullYear(), eD.getMonth(), 1);
    months += (Math.floor((eD - lms)/(86400000)) + 1) / new Date(eD.getFullYear(),eD.getMonth()+1,0).getDate();
    months -= (sD.getDate()-1) / new Date(sD.getFullYear(),sD.getMonth()+1,0).getDate();
    if (months < 0.01) months = 0.01;
    cost = parseFloat(emp.monthlySalary || 0) * months;
  }
  if (cost <= 0) return 0;
  return cost / total;
}

function getDocAccruedAmount(doc, asOfDateStr){
  // How much has accrued from startDate to asOf (or today)
  if (!doc || !doc.startDate) return 0;
  asOfDateStr = asOfDateStr || today();
  const start = doc.startDate;
  // accrued = working days from start to min(asOf, expiry)... but user said "keep allocating until deleted"
  // We'll use min(asOf, expiry) for the strict version OR asOf for "keep going" — we picked KEEP GOING
  const end = asOfDateStr;
  const workedDays = countWorkingDays(start, end);
  const daily = getDocDailyAmount(doc);
  return workedDays * daily;
}

// ─── Aggregate daily allocations (called by getDailyNet) ───
function getDayAllocations(dateStr){
  // Returns {docs: $X, salary: $Y, total: $X+$Y, breakdown: [...]}
  const b = (typeof biz === 'function') ? biz() : null;
  if (!b) return {docs:0, salary:0, total:0, breakdown:[]};
  if (!dateStr) dateStr = today();
  // Skip only if allocation method = 'working' AND not a working day
  if (!isAllocationDay(dateStr)) return {docs:0, salary:0, total:0, breakdown:[]};

  var docs = 0;
  var docList = [];
  (b.docExpenses || []).forEach(function(d){
    if (d.status === 'deleted') return;
    if (!d.startDate || dateStr < d.startDate) return;
    // "Keep allocating until deleted/renewed" — so allocate even after expiry
    var amount = getDocDailyAmount(d);
    if (amount > 0) {
      docs += amount;
      docList.push({type:'doc', name:d.name, amount:amount, id:d.id});
    }
  });

  var salary = 0;
  var salList = [];
  (b.employees || []).forEach(function(emp){
    if (emp.deleted) return;
    if (!emp.allocStart || !emp.allocEnd) return;
    if (dateStr < emp.allocStart || dateStr > emp.allocEnd) return;
    var amount = getSalaryDailyAmount(emp);
    if (amount > 0) {
      salary += amount;
      salList.push({type:'salary', name:emp.name, amount:amount, id:emp.id});
    }
  });

  return {
    docs: docs,
    salary: salary,
    total: docs + salary,
    breakdown: docList.concat(salList)
  };
}


const PERM_ICONS = {
  see_dashboard_cards:   '📊',
  see_net_profit:        '💚',
  see_expenses_card:     '💸',
  see_inventory_value:   '📦',
  see_weekly_revenue:    '📈',
  see_all_sales:         '🧾',
  see_product_price:     '💲',
  see_financial_reports: '💰',
  see_sales_totals:      '🧾',
  see_product_cost:      '🏷',
  see_expenses:          '💸',
  see_salary_management: '💼',
  export_reports:        '📥',
  print_daily_report:    '🖨',
  manage_team:           '👥',
  manage_settings:       '⚙'
};

// Default permissions when user is created.
// Primary admin gets all. Admin gets a sensible default. dataOperator/viewer get nothing.
function defaultPermsFor(role) {
  if (role === 'primaryAdmin') {
    var p = {}; PERM_KEYS.forEach(function(k){ p[k] = true; }); return p;
  }
  if (role === 'admin') {
    // Admins by default can view but not export. Primary admin can adjust.
    return {
      see_dashboard_cards: true,
      see_net_profit: true,
      see_expenses_card: true,
      see_inventory_value: true,
      see_weekly_revenue: true,
      see_all_sales: true,
      see_product_price: true,
      see_financial_reports: true,
      see_sales_totals: true,
      see_product_cost: false,
      see_expenses: true,
      see_salary_management: true,
      export_reports: false,
      print_daily_report: false,
      manage_team: false,
      manage_settings: false
    };
  }
  // Staff / viewers — nothing financial by default
  var p2 = {}; PERM_KEYS.forEach(function(k){ p2[k] = false; });
  // But they need to see product prices to make sales
  p2.see_product_price = true;
  return p2;
}

// CHECK if current user has a given permission
// Primary admin ALWAYS has all permissions (cannot be revoked).
function hasPerm(permKey) {
  if (!CU) return false;
  if (CU.role === 'primaryAdmin') return true;
  // Make sure user has perms object
  if (!CU.perms) {
    var u = (DB.users || []).find(function(x){ return x.id === CU.id; });
    CU.perms = (u && u.perms) ? u.perms : defaultPermsFor(CU.role);
  }
  return !!CU.perms[permKey];
}

// Show a friendly "locked" toast and explanation
function permDenied(permKey) {
  var label = PERM_LABELS[permKey] || permKey;
  var icon = PERM_ICONS[permKey] || '🔒';
  toast(icon + ' Locked: "' + label + '" — ask admin for access', 'er');
}

// Set permission on a user (only primary admin can do this)
function setUserPerm(userId, permKey, value) {
  if (!isPrimary()) { toast('Only primary admin can change permissions', 'er'); return false; }
  if (PERM_KEYS.indexOf(permKey) < 0) return false;
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return false; }
  if (u.role === 'primaryAdmin') { toast('Cannot change primary admin permissions', 'er'); return false; }
  u.perms = u.perms || defaultPermsFor(u.role);
  u.perms[permKey] = !!value;
  u.updatedAt = Date.now();
  // Audit
  if (typeof addAdminLog === 'function') {
    addAdminLog('perm_change',
      (value ? 'Granted' : 'Revoked') + ' "' + PERM_LABELS[permKey] + '" for ' + u.name,
      CU.name);
  }
  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}
  return true;
}

// Migration: ensure all users have a perms object
function migrateUserPerms() {
  if (!DB.users) return;
  DB.users.forEach(function(u){
    if (!u.perms) u.perms = defaultPermsFor(u.role);
    // Make sure all known keys exist
    PERM_KEYS.forEach(function(k){
      if (typeof u.perms[k] === 'undefined') u.perms[k] = defaultPermsFor(u.role)[k];
    });
  });
}

// Password gate for sensitive actions — asks EVERY time (most secure)
function requirePassword(actionName, onSuccess) {
  if (!CU) { toast('Not signed in', 'er'); return; }
  var msg = 'Enter YOUR password to confirm: ' + (actionName || 'this sensitive action');
  requireAdminPin(onSuccess, null, msg);
}
const canDel=()=>isAdmin();
const payBadge=st=>st==='PAID'?'<span class="bdg bok0">✓ PAID</span>':st==='PARTIAL'?'<span class="bdg bwa0">◑ PARTIAL</span>':'<span class="bdg ber0">○ CREDIT</span>';
const g6=()=>{const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let i=0;i<6;i++)r+=c[Math.floor(Math.random()*c.length)];return r;};
const rb=r=>`<span class="rb0 ${{"primaryAdmin":"rpa","admin":"rad","dataOperator":"rdo","viewer":"rvi"}[r]||'rvi'}">${RLBL[r]||r}</span>`;
const el=id=>document.getElementById(id);
const gv=function(id){var e=document.getElementById(id);return e?(e.value||'').trim():'';}
const sv=function(id,v){var e=document.getElementById(id);if(e)e.value=(v===null||v===undefined)?'':v;};
const months=()=>{const m=[];for(let i=0;i<12;i++){const d=new Date();d.setMonth(d.getMonth()-i);m.push(d.toISOString().slice(0,7));}return m;};
const isProdLocked=p=>{if(!p||!p.createdAt||p.adminUnlocked)return false;return(Date.now()-p.createdAt)<PROD_LOCK_HRS*3600000;};
const prodLockRem=p=>{const rem=PROD_LOCK_HRS*3600000-(Date.now()-p.createdAt);if(rem<=0)return'0h';const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`;};
// Record lock: sales and expenses older than 3 hours require admin approval to edit/delete
const isRecordLocked=rec=>{if(!rec||!rec.createdAt||rec.adminUnlocked)return false;return(Date.now()-rec.createdAt)>RECORD_LOCK_HRS*3600000;};
const recLockAgo=rec=>{const h=Math.floor((Date.now()-rec.createdAt)/3600000);return h>=24?Math.floor(h/24)+'d ago':h+'h ago';};
const hasPendingCR=(type,id)=>(DB.changeRequests||[]).some(r=>r.bizId===CBI&&r.recordType===type&&r.recordId===id&&r.status==='pending');

// ── THEME ──
// renderProducts called inside saveProd

function initTheme(){curTheme=localStorage.getItem('ss_theme')||'dark';applyTheme(curTheme);}
function applyTheme(t){curTheme=t;document.documentElement.setAttribute('data-theme',t);localStorage.setItem('ss_theme',t);const mc=el('themecolor');if(mc)mc.content=t==='light'?'#F5F0E8':'#080808';}


// ── STORAGE ──
function dbSave(){
  // Always save locally first — encrypted if key is available
  try {
    if (typeof dbSaveEncrypted === 'function') {
      dbSaveEncrypted();
    } else {
      localStorage.setItem('ss_v4', JSON.stringify(DB));
    }
  } catch(e) {}
  // Then push to Firebase if connected (syncs all other devices)
  if (FB_READY) {
    setSyncStatus('saving');
    fbPush();
  }
}
function dbLoad(){
  var loaded = false;
  try {
    var rawData = null;
    if (typeof dbLoadDecrypted === 'function') {
      rawData = dbLoadDecrypted();
    } else {
      var r = localStorage.getItem('ss_v4');
      if (r) rawData = JSON.parse(r);
    }
    if (rawData) {
      DB = rawData;
      migrateDB();
      // Auto-purge expired trash items (older than 30 days)
      try { if(typeof purgExpiredTrash === 'function') purgExpiredTrash(); } catch(e){}
      loaded = true;
    }
  } catch(e) {}

  if (!loaded) {
    // ── FRESH DEVICE: Try to pull data from Firebase before doing anything ──
    // Don't seed demo data — connect to Firebase and pull real data first
    seedDB();  // set up empty DB structure
    // Auto-connect using hardcoded config (always available)
    if (typeof FB_DEFAULT_CONFIG !== 'undefined' && FB_DEFAULT_CONFIG) {
      try {
        FB_CONFIG = FB_DEFAULT_CONFIG;
        localStorage.setItem('ss_fb_config', JSON.stringify(FB_CONFIG));
      } catch(e){}
    }
    setTimeout(function(){
      if (typeof fbInit === 'function') fbInit();
    }, 1200);
    return;
  }

  // ── EXISTING DEVICE: If no real users exist, don't create demo accounts ──
  // (they were removed for security — each installation sets its own accounts)
  if (!DB.users) DB.users = [];

  // Connect Firebase for real-time sync
  if (fbLoadConfig()) {
    setTimeout(function() { fbInit(); }, 1500);
  } else if (typeof FB_DEFAULT_CONFIG !== 'undefined' && FB_DEFAULT_CONFIG) {
    // Use hardcoded config as fallback
    try {
      FB_CONFIG = FB_DEFAULT_CONFIG;
      localStorage.setItem('ss_fb_config', JSON.stringify(FB_CONFIG));
    } catch(e){}
    setTimeout(function(){ if(typeof fbInit==='function') fbInit(); }, 1500);
  } else {
    setSyncStatus('local');
  }
}
function migrateDB(){
  // Make sure top-level arrays exist
  if (!DB.notifications) DB.notifications = [];
  if (!DB.users) DB.users = [];
  if (!DB.businesses) DB.businesses = [];
  if (!DB.changeRequests) DB.changeRequests = [];
  if (!DB.adminLog) DB.adminLog = [];
  if (!DB.chatMessages) DB.chatMessages = [];
  if (!DB.inviteCodes) DB.inviteCodes = [];
  // Make sure each business has the new fields
  (DB.businesses || []).forEach(function(b){
    if (!b.docExpenses) b.docExpenses = [];
    if (!b.customHolidays) b.customHolidays = [];
    if (!b.country) b.country = 'Liberia';
    if (!b.nextDocId) b.nextDocId = 1;
  });
  if (typeof DB.nextNotifId !== 'number' || isNaN(DB.nextNotifId)) DB.nextNotifId = (DB.notifications || []).length + 1;
  if (typeof migrateUserPerms === 'function') migrateUserPerms();
  if(!DB.changeRequests)DB.changeRequests=[];if(!DB.adminLog)DB.adminLog=[];if(!DB.nextCRId)DB.nextCRId=1;
  DB.businesses.forEach(b=>{
    ['expenses','employees','salaryRecords','stockHistory','purchases','stockOuts','credits'].forEach(k=>{if(!b[k])b[k]=[];});
    ['nextExpId','nextEmpId','nextSalId','nextHistId','nextSoId','nextCrId'].forEach(k=>{if(!b[k])b[k]=1;});
    (b.products||[]).forEach(p=>{if(!p.imgData)p.imgData='';if(!p.createdAt)p.createdAt=Date.now()-PROD_LOCK_HRS*3600001;if(!p.updatedAt)p.updatedAt=p.createdAt;if(!p.status)p.status='active';});
    (b.sales||[]).forEach(s=>{if(!s.createdAt)s.createdAt=Date.now()-RECORD_LOCK_HRS*3600001;if(!s.updatedAt)s.updatedAt=s.createdAt;if(!s.status)s.status='active';if(!s.contact)s.contact='';if(!s.editLog)s.editLog=[];if(!s.fulfillments)s.fulfillments=[];if(!s.fulStatus)s.fulStatus='Pending';if(s.assignedStaff===undefined)s.assignedStaff='';});
    (b.expenses||[]).forEach(e=>{if(!e.createdAt)e.createdAt=Date.now()-RECORD_LOCK_HRS*3600001;if(!e.updatedAt)e.updatedAt=e.createdAt;if(!e.status)e.status='active';if(!e.editLog)e.editLog=[];});
    // New features migration
    if(!b.warehouses||!b.warehouses.length) b.warehouses=[{id:1,name:'Main Warehouse',location:'',isDefault:true,createdAt:Date.now()}];
    if(!b.nextWhId)    b.nextWhId    = (b.warehouses.reduce((a,w)=>Math.max(a,w.id),0))+1;
    if(!b.suppliers)   b.suppliers   = [];
    if(!b.nextSuppId)  b.nextSuppId  = 1;
    if(!b.suppInvoices)b.suppInvoices= [];
    if(!b.nextSInvId)  b.nextSInvId  = 1;
    if(!b.quotations)  b.quotations  = [];
    if(!b.nextQuoteId) b.nextQuoteId = 1;
    if(!b.stockHistory)b.stockHistory= [];
    if(!b.nextHistId)  b.nextHistId  = 1;
    if(!b.nextFulId)   b.nextFulId   = 1;
    // Ensure sales have fulfillment fields
    (b.sales||[]).forEach(function(s){
      if(!s.fulfillments)  s.fulfillments  = [];
      if(!s.fulStatus)     s.fulStatus     = 'Pending';
      if(!s.assignedStaff) s.assignedStaff = '';
    });
    // Ensure all products have warehouseStock
    (b.products||[]).forEach(function(p){
      if(!p.warehouseStock){
        p.warehouseStock={};
        p.warehouseStock[b.warehouses[0].id]=p.qty||0;
      }
    });
  });
}
function seedDB(){
  const ts=Date.now();
  const b={id:1,name:'SmartStock Store',currency:'USD',address:'Main Street',phone:'',logoType:'initials',logoData:'',lowStock:5,
    products:[
      {id:1,name:'Ceramic Floor Tile 60x60 Grey',sku:'T-6060-GRY',category:'Tiles',cost:18,price:28.50,qty:85,unit:'Box',lowLevel:10,desc:'6 tiles per box',size:'60x60cm',imgData:'',createdAt:ts-9*3600000,updatedAt:ts-9*3600000,status:'active'},
      {id:2,name:'White Wall Tile 30x60',sku:'T-3060-WHT',category:'Tiles',cost:12,price:19,qty:4,unit:'Box',lowLevel:10,desc:'',size:'30x60cm',imgData:'',createdAt:ts-5*3600000,updatedAt:ts-5*3600000,status:'active'},
      {id:3,name:'Portland Cement 50kg',sku:'C-PORT-50',category:'Cement',cost:8.5,price:13,qty:3,unit:'Bag',lowLevel:15,desc:'',size:'',imgData:'',createdAt:ts-24*3600000,updatedAt:ts-24*3600000,status:'active'},
      {id:4,name:'Tile Adhesive 20kg',sku:'C-ADH-20',category:'Cement',cost:6,price:10.50,qty:22,unit:'Bag',lowLevel:10,desc:'',size:'',imgData:'',createdAt:ts-24*3600000,updatedAt:ts-24*3600000,status:'active'},
      {id:5,name:'NEW: Mosaic Tile (LOCKED 🔒)',sku:'T-MOS-2',category:'Tiles',cost:35,price:55,qty:12,unit:'Box',lowLevel:5,desc:'Recently added — locked for 8h',size:'2x2cm',imgData:'',createdAt:ts-3600000,updatedAt:ts-3600000,status:'active'},
    ],nextProdId:6,
    sales:[
      {id:1,inv:'INV-0001',date:today(),customer:'James Owens',contact:'555-1001',items:[{prodId:1,name:'Ceramic Floor Tile 60x60 Grey',qty:3,unitPrice:28.50,cost:18}],discount:0,paid:85.50,paymode:'Cash',createdAt:ts-3600000,updatedAt:ts-3600000,status:'active',editLog:[]},
      {id:2,inv:'INV-0002',date:today(),customer:'Sara Lee',contact:'555-1002',items:[{prodId:3,name:'Portland Cement 50kg',qty:5,unitPrice:13,cost:8.5}],discount:10,paid:0,paymode:'Credit',createdAt:ts-1800000,updatedAt:ts-1800000,status:'active',editLog:[]},
    ],nextSaleId:3,
    expenses:[
      {id:1,date:today(),amount:25.00,description:'Fuel for delivery run',category:'Transport',by:'admin',createdAt:ts-7200000,updatedAt:ts-7200000,status:'active',editLog:[]},
      {id:2,date:today(),amount:15.50,description:'Office supplies',category:'Supplies',by:'admin',createdAt:ts-3600000,updatedAt:ts-3600000,status:'active',editLog:[]},
    ],nextExpId:3,
    employees:[{id:1,name:'Maria Santos',role:'Cashier',phone:'555-2001',monthlySalary:800,type:'Employee',startDate:'2024-01-01',createdAt:ts},{id:2,name:'John Doe',role:'Warehouse',phone:'555-2002',monthlySalary:600,type:'Employee',startDate:'2024-01-01',createdAt:ts}],nextEmpId:3,
    salaryRecords:[{id:1,empId:1,month:thisMonth(),baseSalary:800,deductions:[],paid:false,paidDate:null,createdAt:ts},{id:2,empId:2,month:thisMonth(),baseSalary:600,deductions:[{date:today(),amount:50,reason:'Absence',type:'Absence',addedBy:'admin'}],paid:false,paidDate:null,createdAt:ts}],nextSalId:3,
    stockHistory:[{id:1,date:today(),type:'IN',prodName:'Ceramic Floor Tile 60x60 Grey',qty:20,by:'admin',ref:'PO-001',notes:'Initial stock',ts:ts-86400000}],nextHistId:2,purchases:[],stockOuts:[],
    credits:[{id:1,name:'Sara Lee',ref:'INV-0002',date:today(),totalOwed:55,totalPaid:0,paymode:'Credit',status:'OPEN',payments:[],contact:'555-1002'}],nextSoId:1,nextCrId:2};
  DB.businesses=[b];
  DB.users=[];  // No default accounts — each installation creates its own via signup
  DB.nextUserId=3;dbSave();
}

// ── TOAST ──
function toast(msg,type='ok'){el('tico').textContent=type==='ok'?'✓':type==='gd'?'★':type==='wa'?'⚠':'✕';el('tmsg').textContent=msg;const t=el('toast');t.className='show '+type;clearTimeout(toastTmr);toastTmr=setTimeout(()=>t.className='',3400);}

// ── CONFIRM ──
function showConf(ico,ttl,msg,fn){el('mico').textContent=ico;el('mttl').textContent=ttl;el('mmsg').textContent=msg;confFn=fn;el('mconf').classList.add('on');}
function closeModal(){el('mconf').classList.remove('on');el('m-adminpin').classList.remove('on');}
function runConf(){if(confFn)confFn();closeModal();}

// ── ADMIN PIN ──
function requireAdminPin(onSuccess,onCancel,message){
  pinCallback=onSuccess;pinCancelCb=onCancel;
  el('pin-msg').textContent=message||'Enter your admin password to proceed';
  sv('pin-input','');el('m-adminpin').classList.add('on');
  setTimeout(()=>el('pin-input')?.focus(),200);
}
async function verifyAdminPin(){
  var pw = el('pin-input') ? el('pin-input').value : '';
  var u  = (DB.users||[]).find(function(x){ return x.id === (CU && CU.id); });
  if (!u) { toast('User not found','er'); return; }
  if (!pw) { toast('Enter your password','er'); el('pin-input') && el('pin-input').focus(); return; }
  // Verify password correctly — supports both hashed and plain-text (migration)
  var ok = await verifyPassword(pw, u.password);
  if (!ok) {
    toast('Incorrect password','er');
    if(el('pin-input')){ el('pin-input').value=''; el('pin-input').focus(); }
    return;
  }
  el('m-adminpin').classList.remove('on');
  var cb = pinCallback;
  pinCallback = null; pinCancelCb = null;
  if (cb) cb();
}
function cancelAdminPin(){el('m-adminpin').classList.remove('on');if(pinCancelCb)pinCancelCb();pinCallback=null;pinCancelCb=null;}

// ── ADMIN LOG ──
function addAdminLog(action,detail,by){
  const b=biz();DB.adminLog.unshift({id:DB.nextLogId++,action,detail,bizId:b?b.id:CBI,by:by||CU?.name||'system',ts:Date.now()});
  if(DB.adminLog.length>500)DB.adminLog=DB.adminLog.slice(0,500);
}

// ── CHANGE REQUESTS ──
function submitChangeRequest(){
  if(!pendingCRProdId)return;const b=biz();const p=(b.products||[]).find(x=>x.id===pendingCRProdId);if(!p)return;
  const changes=gv('cr-changes'),urgency=el('cr-urgency')?.value||'normal';
  if(!changes){toast('Describe the changes needed','er');return;}
  if(!DB.changeRequests)DB.changeRequests=[];if(!DB.nextCRId)DB.nextCRId=1;
  DB.changeRequests.unshift({id:DB.nextCRId++,bizId:CBI,recordType:'product',recordId:p.id,prodId:p.id,prodName:p.name,label:p.name,action:'edit',requestedBy:CU?.name||'unknown',requestedById:CU?.id,changes,urgency,status:'pending',ts:Date.now(),resolvedBy:null,resolvedAt:null,originalData:JSON.parse(JSON.stringify(p))});
  addNotif('warn',`🔒 Change request from ${CU?.name} for "${p.name}"`);
  dbSave();closeD('d-changereq');toast('Change request submitted — Admin will review','wa');checkNotif();updateAdminBell();
}

// New: submit change request for Sales or Expenses (8-hour lock)
function openRecordChangeRequest(type,id,label){
  pendingRecCR={type,id,label};
  el('rec-cr-title').textContent=`Request Change: ${type}`;
  el('rec-cr-sub').textContent=`"${label}" — requires admin approval`;
  el('rec-cr-info').textContent=`This ${type.toLowerCase()} record was created more than ${RECORD_LOCK_HRS} hours ago. Edits and deletes require admin approval.`;
  sv('rec-cr-changes','');sv('rec-cr-action','edit');sv('rec-cr-urgency','normal');
  openD('d-rec-cr');
  setTimeout(()=>el('rec-cr-changes')?.focus(),300);
}
function submitRecordChangeRequest(){
  const{type,id,label}=pendingRecCR;if(!type||!id){toast('Error: no record selected','er');return;}
  const changes=gv('rec-cr-changes');if(!changes){toast('Describe the change needed','er');return;}
  const action=el('rec-cr-action')?.value||'edit';const urgency=el('rec-cr-urgency')?.value||'normal';
  const b=biz();
  // Get original data snapshot
  let originalData=null;
  if(type==='sale')originalData=JSON.parse(JSON.stringify((b.sales||[]).find(x=>x.id===id)||{}));
  else if(type==='expense')originalData=JSON.parse(JSON.stringify((b.expenses||[]).find(x=>x.id===id)||{}));
  if(!DB.changeRequests)DB.changeRequests=[];if(!DB.nextCRId)DB.nextCRId=1;
  DB.changeRequests.unshift({id:DB.nextCRId++,bizId:CBI,recordType:type,recordId:id,label,action,requestedBy:CU?.name||'unknown',requestedById:CU?.id,changes,urgency,status:'pending',ts:Date.now(),resolvedBy:null,resolvedAt:null,originalData});
  addNotif('warn',`⏳ ${type} change request from ${CU?.name}: "${label}"`);
  dbSave();closeD('d-rec-cr');toast(`Change request submitted for admin approval`,'wa');checkNotif();updateAdminBell();
}
function openAdminPanel(){
  if(!isAdmin()){toast('Admin access required','er');return;}
  switchAdminTab('requests');renderAdminRequests();openD('d-admin');
}
function switchAdminTab(tab){
  adminTabActive=tab;
  el('ap-tab-req').classList.toggle('on',tab==='requests');el('ap-tab-log').classList.toggle('on',tab==='log');
  el('admin-tab-requests').style.display=tab==='requests'?'':'none';el('admin-tab-log').style.display=tab==='log'?'':'none';
  if(tab==='requests')renderAdminRequests();else renderAdminLog();
}
function renderAdminRequests(){
  const reqs=(DB.changeRequests||[]).filter(r=>r.bizId===CBI).sort((a,b)=>b.ts-a.ts);
  const pending=reqs.filter(r=>r.status==='pending');
  const badge=el('req-count-badge');if(badge)badge.innerHTML=pending.length?`<span class="bdg ber0" style="margin-left:4px">${pending.length}</span>`:'';
  if(!reqs.length){el('admin-tab-requests').innerHTML=em('No change requests yet');return;}
  const typeIco={product:'🔒',sale:'🧾',expense:'💸'};
  const actionCls={edit:'bwa0',delete:'ber0'};
  el('admin-tab-requests').innerHTML=reqs.map(r=>{
    const ico=typeIco[r.recordType||'product']||'📋';
    const label=r.label||r.prodName||'Record';
    const actionLabel=(r.action||'edit').toUpperCase();
    return `<div class="req-card">
      <div class="req-header">
        <div>
          <div class="req-title">${ico} ${esc(label)}</div>
          <div class="req-meta">
            <span class="bdg ${actionCls[r.action]||'bwa0'}" style="font-size:9px;margin-right:4px">${actionLabel}</span>
            <span class="bdg bdf" style="font-size:9px;margin-right:4px">${(r.recordType||'product').toUpperCase()}</span>
            by ${esc(r.requestedBy)} · ${ago(r.ts)} ·
            <span class="bdg ${r.urgency==='critical'?'ber0':r.urgency==='high'?'bwa0':'bdf'}" style="font-size:9px">${r.urgency}</span>
          </div>
        </div>
        <span class="bdg ${r.status==='pending'?'bwa0':r.status==='approved'||r.status==='completed'?'bok0':'ber0'}">${r.status.toUpperCase()}</span>
      </div>
      <div class="req-changes"><strong>Request:</strong><br>${esc(r.changes)}</div>
      ${r.status==='pending'?`
        <div class="req-actions">
          <button type="button" class="btn bok bsm" onclick="approveAnyRequest(${r.id})">✓ Approve</button>
          <button type="button" class="btn ber bsm" onclick="rejectChangeRequest(${r.id})">✕ Reject</button>
          ${(r.recordType==='product'||!r.recordType)?`<button type="button" class="btn bin bsm" onclick="viewLockedProduct(${r.prodId||r.recordId})">View</button>`:''}
        </div>`:
        `<div style="font-size:12px;color:var(--t3);padding-top:4px">Resolved by ${esc(r.resolvedBy||'—')} ${r.resolvedAt?'· '+ago(r.resolvedAt):''}</div>`
      }
    </div>`;
  }).join('');
}
function approveChangeRequest(id){approveAnyRequest(id);}
function approveAnyRequest(id){
  const req=DB.changeRequests.find(r=>r.id===id);if(!req)return;
  requireAdminPin(()=>{
    const b=biz();const now=Date.now();
    req.status='approved';req.resolvedBy=CU.name;req.resolvedAt=now;
    const type=req.recordType||'product';
    if(type==='product'){
      const p=(b.products||[]).find(x=>x.id===(req.prodId||req.recordId));
      if(p){p.adminUnlocked=true;p.adminUnlockedBy=CU.name;p.adminUnlockedAt=now;}
      addAdminLog('approve_cr',`Approved product change: "${req.label||req.prodName}"`,CU.name);
      addNotif('info',`✓ Product change approved: "${req.label||req.prodName}"`);
      dbSave();renderAdminRequests();checkNotif();updateAdminBell();
      toast('Approved! Product unlocked.','ok');
      if(p)setTimeout(()=>openEditProd(p.id),400);
    } else if(type==='sale'){
      const s=(b.sales||[]).find(x=>x.id===req.recordId);
      if(s){s.adminUnlocked=true;s.adminUnlockedBy=CU.name;s.adminUnlockedAt=now;}
      if(req.action==='delete'&&s){
        b.sales=(b.sales||[]).filter(x=>x.id!==req.recordId);
        toast('Sale deleted per approved request');
      } else {
        toast('Sale unlocked — admin can now edit.','ok');
        if(s)setTimeout(()=>openEditSale(req.recordId),400);
      }
      addAdminLog('approve_cr',`Approved sale change: "${req.label}"`,CU.name);
      dbSave();renderAdminRequests();renderSales();renderDash();checkNotif();updateAdminBell();
    } else if(type==='expense'){
      const e=(b.expenses||[]).find(x=>x.id===req.recordId);
      if(e){e.adminUnlocked=true;e.adminUnlockedBy=CU.name;e.adminUnlockedAt=now;}
      if(req.action==='delete'&&e){
        b.expenses=(b.expenses||[]).filter(x=>x.id!==req.recordId);
        toast('Expense deleted per approved request');
      } else {
        toast('Expense unlocked — admin can now edit.','ok');
        if(e)setTimeout(()=>openEditExp(req.recordId),400);
      }
      addAdminLog('approve_cr',`Approved expense change: "${req.label}"`,CU.name);
      dbSave();renderAdminRequests();renderExpenses();renderDash();checkNotif();updateAdminBell();
    }
  },null,'Confirm approval — enter admin password');
}
function rejectChangeRequest(id){
  const req=DB.changeRequests.find(r=>r.id===id);if(!req)return;
  showConf('✕','Reject Request?',`Reject change request for "${req.prodName}"?`,()=>{
    req.status='rejected';req.resolvedBy=CU.name;req.resolvedAt=Date.now();
    addAdminLog('reject_cr',`Rejected change request for "${req.prodName}"`,CU.name);
    dbSave();renderAdminRequests();updateAdminBell();toast('Request rejected');
  });
}
function viewLockedProduct(prodId){closeD('d-admin');setTimeout(()=>openEditProd(prodId),300);}
function renderAdminLog(){
  const logs=(DB.adminLog||[]).filter(l=>l.bizId===CBI).slice(0,100);
  if(!logs.length){el('admin-tab-log').innerHTML=em('No admin actions logged yet');return;}
  el('admin-tab-log').innerHTML='<div class="card" style="border-radius:0;border:none">'+logs.map(l=>`<div class="admin-log-item"><div class="ali-dot" style="background:var(--g)"></div><div class="ali-msg">${esc(l.detail)}<br><span style="font-size:10px;color:var(--t3)">by ${esc(l.by)}</span></div><div class="ali-time">${ago(l.ts)}</div></div>`).join('')+'</div>';
}
function updateAdminBell(){
  const pending=(DB.changeRequests||[]).filter(r=>r.bizId===CBI&&r.status==='pending').length;
  const dot=el('req-dot');if(dot)dot.style.display=pending>0?'block':'none';
  const badge=el('admin-req-badge');if(badge){badge.innerHTML=pending>0?`<span class="bdg ber0">${pending}</span>`:'';badge.style.display=pending>0?'':'none';}
  // Update nav badge on expenses if there are pending expense requests
  const expPend=(DB.changeRequests||[]).filter(r=>r.bizId===CBI&&r.status==='pending'&&r.recordType==='expense').length;
  const salPend=(DB.changeRequests||[]).filter(r=>r.bizId===CBI&&r.status==='pending'&&r.recordType==='sale').length;
  // Show pending count in More tools
  const moreReqBadge=el('admin-req-badge');
  if(moreReqBadge){moreReqBadge.textContent=pending>0?pending:'';moreReqBadge.style.display=pending>0?'':'none';}
}

// ── DRAWER ──
function closeAllDrawers(){
  document.querySelectorAll('.dov.on').forEach(function(d){
    d.classList.remove('on');
  });
}
function openD(id){
  // Close any open drawer first to prevent overlap
  document.querySelectorAll('.dov.on').forEach(function(d){
    if(d.id !== id) d.classList.remove('on');
  });
  var el2=document.getElementById(id);
  if(el2) el2.classList.add('on');
}
function closeD(id){
  var el2=document.getElementById(id);
  if(el2) el2.classList.remove('on');
}

// ── LOGIN ──

// ════════════════════════════════════════════════════════
//  AUTH MODULE — Google + Form Sign-In/Sign-Up
// ════════════════════════════════════════════════════════

// ── Show/hide panels ──
function showLogin() {
  var l = document.getElementById('lsec');
  var r = document.getElementById('rsec');
  var t1 = document.getElementById('tab-signin');
  var t2 = document.getElementById('tab-signup');
  if (l) l.style.display = 'block';
  if (r) r.style.display = 'none';
  if (t1) { t1.style.background = 'linear-gradient(135deg,#D4A520,#A07810)'; t1.style.color = '#060810'; }
  if (t2) { t2.style.background = 'transparent'; t2.style.color = '#505A72'; }
}

function showReg() {
  var lsec = document.getElementById('lsec');
  var rsec = document.getElementById('rsec');
  var lt   = document.getElementById('tab-signin');
  var rt   = document.getElementById('tab-signup');
  if (lsec) lsec.style.display = 'none';
  if (rsec) rsec.style.display = '';
  if (lt) { lt.style.background = 'transparent'; lt.style.color = '#505A72'; }
  if (rt) { rt.style.background = 'linear-gradient(135deg,#D4A520,#A07810)'; rt.style.color = '#060810'; }
  // Always reset to role-selection step
  var s1 = document.getElementById('reg-step1');
  var so = document.getElementById('reg-step-owner');
  var ss = document.getElementById('reg-step-staff');
  var sp = document.getElementById('reg-step-pending');
  if (s1) s1.style.display = '';
  if (so) so.style.display = 'none';
  if (ss) ss.style.display = 'none';
  if (sp) sp.style.display = 'none';
  // Clear errors
  var e1 = document.getElementById('register-err');
  var e2 = document.getElementById('staff-register-err');
  if (e1) e1.style.display = 'none';
  if (e2) e2.style.display = 'none';
}

function togglePwVis(inputId, btn) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  var hidden = inp.type === 'password';
  inp.type = hidden ? 'text' : 'password';
  btn.innerHTML = hidden ? '&#128064;' : '&#128065;';
}

// ── Form Sign In ──
function loginErr(msg) {
  // Show error on login page (works even when shell is hidden)
  var errEl = document.getElementById('login-err');
  var regErr = document.getElementById('register-err');
  if (errEl)  { errEl.textContent = msg;  errEl.style.display  = ''; }
  if (regErr) { regErr.textContent = msg; regErr.style.display = ''; }
  // Also try toast
  try { toast(msg, 'er'); } catch(e) {}
}

async function doLogin() {
  var errEl = document.getElementById('login-err');
  if (errEl) errEl.style.display = 'none';

  try {
    var uEl = document.getElementById('lu');
    var pEl = document.getElementById('lp');
    var u   = uEl ? uEl.value.trim() : '';
    var p   = pEl ? pEl.value : '';

    if (!u) { loginErr('Please enter your username or email'); return; }
    if (!p) { loginErr('Please enter your password'); return; }

    if (!DB || !DB.users || DB.users.length === 0) {
      loginErr('Syncing data… please wait a moment and try again.');
      setTimeout(function() { try { dbLoad(); } catch(e2) {} }, 500);
      return;
    }

    // ── RATE LIMIT CHECK ──
    var lockUntil = isAccountLocked(u);
    if (lockUntil) {
      loginErr('🔒 Account locked — too many failed attempts. Try again in ' + getRemainingLockout(lockUntil));
      // Update countdown every second
      if (window._lockTimer) clearInterval(window._lockTimer);
      window._lockTimer = setInterval(function(){
        var lu2 = isAccountLocked(u);
        if (lu2) {
          loginErr('🔒 Account locked. Try again in ' + getRemainingLockout(lu2));
        } else {
          clearInterval(window._lockTimer);
          var errEl2 = document.getElementById('login-err');
          if (errEl2) errEl2.style.display = 'none';
        }
      }, 1000);
      return;
    }

    // ── FIND USER by username OR email (case-insensitive) ──
    var matchedUser = null;
    var isEmailLogin = u.includes('@');
    for (var i = 0; i < DB.users.length; i++) {
      var usr = DB.users[i];
      var usernameMatch = usr.username && usr.username.toLowerCase() === u.toLowerCase();
      var emailMatch    = isEmailLogin && usr.email && usr.email.toLowerCase() === u.toLowerCase();
      if (usernameMatch || emailMatch) {
        var ok = await verifyPassword(p, usr.password);
        if (ok) { matchedUser = usr; break; }
      }
    }

    if (!matchedUser) {
      var failCount = recordFailedAttempt(u);
      var attemptsLeft = MAX_ATTEMPTS - failCount;
      if (attemptsLeft <= 0) {
        loginErr('🔒 Account locked for 15 minutes after too many failed attempts.');
      } else if (attemptsLeft <= 2) {
        loginErr('Wrong username or password. ' + attemptsLeft + ' attempt' + (attemptsLeft===1?'':'s') + ' remaining before lockout.');
      } else {
        loginErr('Wrong username or password.');
      }
      return;
    }

    if (matchedUser.status === 'pending') {
      loginErr('Your account is pending admin approval. Please wait.');
      return;
    }
    if (matchedUser.status === 'rejected') {
      loginErr('Your account access was rejected. Contact your admin.');
      return;
    }
    if (matchedUser.status === 'inactive') {
      loginErr('🚫 Your account has been deactivated. Contact your admin to reactivate it.');
      return;
    }

    // ── EMAIL VERIFICATION CHECK ──
    // If logging in with email, Firebase Auth must verify it first
    // SKIP this check on local files (content:// or file://) — Firebase doesn't work locally
    var isLocalFile = window._isLocalFile ||
      window.location.protocol === 'file:' ||
      window.location.href.indexOf('content://') === 0;

    // ALL users with email must be verified (not just email-login users)
    if (matchedUser.email && !isLocalFile && FB_AUTH) {
      try {
        var fbCred = await FB_AUTH.signInWithEmailAndPassword(matchedUser.email, p);
        if (fbCred && fbCred.user && !fbCred.user.emailVerified) {
          var _as = { url: 'https://smartstock-pro.netlify.app?verified=1', handleCodeInApp: false };
          try { await fbCred.user.sendEmailVerification(_as); } catch(e){}
          try { FB_AUTH.signOut(); } catch(e){}
          loginErr('📧 Email not verified. A new verification link has been sent to ' + matchedUser.email + '. Check your inbox and spam folder, then sign in again.');
          return;
        }
      } catch(fbErr) {
        if (fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/invalid-login-credentials') {
          fbAuthSignIn(matchedUser.email, p).catch(function(){});
        } else if (fbErr.code === 'auth/user-not-found') {
          fbAuthCreateUser(matchedUser.email, p).catch(function(){});
        } else {
          console.warn('[Firebase Auth] Verification check:', fbErr.code);
        }
      }
    } else if (!matchedUser.email && !isLocalFile) {
      loginErr('📧 Your account needs a verified email. Please contact your admin to add an email to your account.');
      return;
    }

    // ── SUCCESS — clear failed attempts, upgrade hash if needed ──
    clearFailedAttempts(u);
    await upgradePasswordIfNeeded(matchedUser, p);
    loginAs(matchedUser);
    resetSessionTimer();
    // Sync Firebase Auth session
    if (matchedUser.email && !isEmailLogin) {
      // Username login — sign into Firebase Auth silently
      fbAuthSignIn(matchedUser.email, p).catch(function(){});
    }

  } catch(e) {
    loginErr('Login error: ' + e.message);
    console.error('[Login]', e);
  }
}

// ── Form Register (no invite code — open signup) ──
async function doRegister() {
  try {
    // OWNER PATH — creates new business + Primary Admin
    var bizName = gv('reg-biz-name');
    var name    = gv('rn');
    var email   = gv('reg-email');
    var dob     = gv('reg-dob');
    var location= gv('reg-location');
    var un      = gv('ru');
    var pEl     = document.getElementById('rp');
    var pw      = pEl ? pEl.value : '';

    if (!bizName) { regErrOwner('Business name is required'); return; }
    if (!name)    { regErrOwner('Your full name is required'); return; }
    if (!email)   { regErrOwner('Email is required'); return; }
    if (!isValidEmail(email)) { regErrOwner('Please enter a valid email address'); return; }
    if (!dob)     { regErrOwner('Date of birth is required'); return; }
    if (!isAdult(dob)) { regErrOwner('You must be at least 13 years old'); return; }
    if (!location){ regErrOwner('Location is required'); return; }
    if (!un)      { regErrOwner('Username is required'); return; }
    if (!isValidUsername(un)) { regErrOwner('Username: 3-20 letters, numbers or underscores'); return; }
    if (!pw || pw.length < 6) { regErrOwner('Password must be at least 6 characters'); return; }
    // Block common weak passwords
    var WEAK_PWS = ['123456','111111','000000','123123','password','654321','112233','1234567','12345678'];
    if (WEAK_PWS.indexOf(pw) !== -1 || /^(.)+$/.test(pw)) {
      regErrOwner('Password is too weak — avoid repeated digits or obvious patterns'); return;
    }

    // Check email not already used
    var emailLower = email.toLowerCase().trim();
    for (var ei = 0; ei < DB.users.length; ei++) {
      if ((DB.users[ei].email || '').toLowerCase() === emailLower) {
        regErrOwner(
          'That email is already registered. ' +
          'If you forgot your password, use the "Forgot password?" link on the Sign In screen. ' +
          'Or use a different email to create a new account.'
        );
        return;
      }
    }

    // Check business name not taken (case-insensitive)
    var bizNameLower = bizName.toLowerCase().trim();
    for (var bi = 0; bi < (DB.businesses || []).length; bi++) {
      if ((DB.businesses[bi].name || '').toLowerCase().trim() === bizNameLower) {
        regErrOwner('That business name is already registered. Try a different name.');
        return;
      }
    }

    // Check username not taken
    for (var i = 0; i < DB.users.length; i++) {
      if ((DB.users[i].username || '').toLowerCase() === un.toLowerCase()) {
        regErrOwner('Username already taken — try another');
        return;
      }
    }

    // Create new business
    var newBizId = DB.nextBizId || ((DB.businesses || []).length + 1);
    DB.nextBizId = newBizId + 1;
    var newBiz = {
      id:        newBizId,
      name:      bizName.trim(),
      currency:  'USD',
      address:   '',
      phone:     '',
      logoType:  'initials',
      logoData:  '',
      products:  [],
      sales:     [],
      expenses:  [],
      customers: [],
      credits:   [],
      stockMoves:[],
      salaries:  [],
      docExpenses:[],
      customHolidays:[],
      country: 'Liberia',
      nextProdId:1, nextSaleId:1, nextExpId:1, nextCustId:1,
      nextCreditId:1, nextStockId:1, nextSalId:1, nextDocId:1,
      createdAt: Date.now()
    };
    (DB.businesses = DB.businesses || []).push(newBiz);

    // Create Primary Admin user for this business
    var recoveryCode = generateRecoveryCode();
    var _ownerPw = pw;
    try { _ownerPw = await hashPassword(pw); } catch(e) { _ownerPw = pw; }
    var newUser = {
      id:             DB.nextUserId++,
      username:       un,
      password:       _ownerPw,
      name:           name,
      email:          email.toLowerCase().trim(),
      dob:            dob,
      location:       location.trim(),
      role:           'primaryAdmin',
      status:         'active',
      businessIds:    [newBizId],
      allowedModules: (typeof MODS !== 'undefined' ? MODS : ['products','sales','stock','expenses','customers','salary','reports']),
      phone:          '',
      recoveryCode:   recoveryCode,
      usernameChangedAt: 0,
      profileComplete:   true,
      createdAt:      Date.now(),
      signupMethod:   'form-owner'
    };
    // ── FINAL VALIDATION before saving to Firebase ──
    if (!newUser.username || !newUser.password || !newUser.email) {
      regErrOwner('Internal error: user data incomplete. Please try again.');
      return;
    }
    if (newUser.password.length < 10) {
      // Hashed password should be much longer (sha256: + 64 hex chars)
      regErrOwner('Password not properly hashed. Please try again.');
      return;
    }
    if (!newUser.email.includes('@') || !newUser.email.includes('.')) {
      regErrOwner('Invalid email format. Please check and try again.');
      return;
    }

    DB.users.push(newUser);
    DB.currentBizId = newBizId;
    dbSave();
    if (typeof fbPush === 'function') try { fbPush(); } catch(e){}
    // Create Firebase Auth account + send verification email
    if (typeof fbAuthCreateUser === 'function' && newUser.email) {
      fbAuthCreateUser(newUser.email, pw)
        .then(function(cred) {
          if (cred && cred.user) {
            console.log('[Signup] Firebase Auth account ready for:', newUser.email);
          }
        })
        .catch(function(err) {
          console.warn('[Signup] Firebase Auth creation failed:', err);
        });
    }

    // Show recovery code BEFORE logging in so user sees it
    var rcEl = document.getElementById('recovery-code-display');
    if (rcEl) rcEl.textContent = recoveryCode;
    openD('d-recovery-code');

    // After user dismisses recovery code dialog, log them in
    window._pendingLoginUser = newUser;
    window._pendingBizName   = bizName;
    // Show congrats + email verification screen when recovery code is dismissed
    // Hook into the drawer close event for d-recovery-code
    var _onRcClose = function() {
      document.removeEventListener('d-recovery-code-closed', _onRcClose);
      var pendUser = window._pendingLoginUser;
      var pendBiz  = window._pendingBizName;
      window._pendingLoginUser = null;
      window._pendingBizName   = null;
      if (pendUser && typeof showCongratsScreen === 'function') {
        showCongratsScreen(pendUser, pendBiz);
      } else if (pendUser) {
        loginAs(pendUser);
        resetSessionTimer();
        toast('🎉 Welcome to SmartStock Pro!', 'gd');
      }
    };
    document.addEventListener('d-recovery-code-closed', _onRcClose, { once: true });
  } catch(e) {
    regErrOwner('Registration error: ' + e.message);
  }
}

async function doStaffRegister() {
  try {
    // STAFF PATH — joins existing business, status=pending until admin approves
    var bizName = gv('staff-biz-name');
    var name    = gv('staff-name');
    var email   = gv('staff-email');
    var dob     = gv('staff-dob');
    var location= gv('staff-location');
    var un      = gv('staff-username');
    var pEl     = document.getElementById('staff-password');
    var pw      = pEl ? pEl.value : '';

    if (!bizName) { regErrStaff('Business name is required'); return; }
    if (!name)    { regErrStaff('Your full name is required'); return; }
    if (!email)   { regErrStaff('Email is required'); return; }
    if (!isValidEmail(email)) { regErrStaff('Please enter a valid email address'); return; }
    if (!dob)     { regErrStaff('Date of birth is required'); return; }
    if (!isAdult(dob)) { regErrStaff('You must be at least 13 years old'); return; }
    if (!location){ regErrStaff('Location is required'); return; }
    if (!un)      { regErrStaff('Username is required'); return; }
    if (!isValidUsername(un)) { regErrStaff('Username: 3-20 letters, numbers or underscores'); return; }
    if (!pw || pw.length < 6) { regErrStaff('Password must be at least 6 characters'); return; }
    var WEAK_PW_STAFF = ['123456','111111','000000','123123','password','654321','112233','1234567','12345678'];
    if (WEAK_PW_STAFF.indexOf(pw) !== -1) {
      regErrStaff('Password is too weak — avoid common patterns like 123456 or 111111'); return;
    }

    // Check email not already used
    var emailLower = email.toLowerCase().trim();
    for (var ei2 = 0; ei2 < DB.users.length; ei2++) {
      if ((DB.users[ei2].email || '').toLowerCase() === emailLower) {
        regErrStaff('That email is already registered. Try Sign In, or use a different email.');
        return;
      }
    }

    // Find business by exact name (case-insensitive)
    var bizNameLower = bizName.toLowerCase().trim();
    var matchedBiz = null;
    for (var bi = 0; bi < (DB.businesses || []).length; bi++) {
      if ((DB.businesses[bi].name || '').toLowerCase().trim() === bizNameLower) {
        matchedBiz = DB.businesses[bi];
        break;
      }
    }
    if (!matchedBiz) {
      regErrStaff('Business "' + bizName + '" not found. Check the exact name with your admin.');
      return;
    }

    // Check username not taken
    for (var i = 0; i < DB.users.length; i++) {
      if ((DB.users[i].username || '').toLowerCase() === un.toLowerCase()) {
        // Allow if it's a previously rejected pending user re-trying
        if (DB.users[i].status === 'pending' && DB.users[i].name === name) {
          // Update existing pending request
          DB.users[i].password   = pw;
          DB.users[i].email      = email.toLowerCase().trim();
          DB.users[i].dob        = dob;
          DB.users[i].location   = location.trim();
          DB.users[i].businessIds= [matchedBiz.id];
          DB.users[i].rejectedAt = null;
          DB.users[i].profileComplete = true;
          DB.users[i].createdAt  = Date.now();
          dbSave();
          notifyAdminsOfSignup(matchedBiz, DB.users[i]);
          showPendingScreen(matchedBiz.name);
          return;
        }
        regErrStaff('Username already taken — try another');
        return;
      }
    }

    // Create pending staff account
    var newUser = {
      id:             DB.nextUserId++,
      username:       un,
      password:       await (async function(){ try{ return await hashPassword(pw); }catch(e){ return pw; } })(),
      name:           name,
      email:          email.toLowerCase().trim(),
      dob:            dob,
      location:       location.trim(),
      role:           'dataOperator',
      status:         'pending',
      businessIds:    [matchedBiz.id],
      allowedModules: ['products','sales','stock','expenses','customers'],
      phone:          '',
      usernameChangedAt: 0,
      profileComplete:   true,
      createdAt:      Date.now(),
      signupMethod:   'form-staff'
    };
    // ── FINAL VALIDATION before saving to Firebase ──
    if (!newUser.username || !newUser.password || !newUser.email) {
      regErrStaff('Internal error: user data incomplete. Please try again.');
      return;
    }
    if (newUser.password.length < 10) {
      regErrStaff('Password not properly hashed. Please try again.');
      return;
    }
    if (!newUser.email.includes('@') || !newUser.email.includes('.')) {
      regErrStaff('Invalid email format. Please check and try again.');
      return;
    }

    DB.users.push(newUser);
    dbSave();

    // Create Firebase Auth account + send verification email
    if (typeof fbAuthCreateUser === 'function' && newUser.email) {
      fbAuthCreateUser(newUser.email, pw)
        .then(function(cred) {
          if (cred && cred.user) {
            console.log('[Staff Signup] Firebase Auth account ready for:', newUser.email);
          }
        })
        .catch(function(err) {
          console.warn('[Staff Signup] Firebase Auth creation failed:', err);
        });
    }

    // Notify all admins of this business
    notifyAdminsOfSignup(matchedBiz, newUser);

    // Show pending screen
    showPendingScreen(matchedBiz.name);
    toast('Request sent! Waiting for admin approval.', 'gd');
  } catch(e) {
    regErrStaff('Registration error: ' + e.message);
  }
}

function notifyAdminsOfSignup(biz, user) {
  if (!biz || !user) return;
  DB.notifications = DB.notifications || [];
  if (typeof DB.nextNotifId !== 'number' || isNaN(DB.nextNotifId)) DB.nextNotifId = 1;

  // Add ONE business-wide notification (so all admins see it on opening the bell)
  DB.notifications.unshift({
    id:        DB.nextNotifId++,
    type:      'user_signup',
    msg:       '👤 ' + user.name + ' (@' + user.username + ') wants to join as staff. Approve in More → Team Management.',
    pendingUserId: user.id,
    bizId:     biz.id,
    read:      false,
    ts:        Date.now()
  });
  dbSave();
  // Push to Firebase so admins on other devices see it immediately
  if (typeof fbPush === 'function') {
    try { fbPush(); } catch(e) {}
  }
  // Update the bell dot if admin is currently viewing
  if (typeof checkNotif === 'function') {
    try { checkNotif(); } catch(e) {}
  }
}

function showPendingScreen(bizName) {
  document.getElementById('reg-step1').style.display       = 'none';
  document.getElementById('reg-step-owner').style.display  = 'none';
  document.getElementById('reg-step-staff').style.display  = 'none';
  var pendEl = document.getElementById('reg-step-pending');
  if (pendEl) pendEl.style.display = '';
  var bizEl  = document.getElementById('pending-biz');
  if (bizEl) bizEl.textContent = bizName;
}

function selectRole(role) {
  document.getElementById('reg-step1').style.display = 'none';
  if (role === 'owner') {
    document.getElementById('reg-step-owner').style.display = '';
    setTimeout(function(){
      var f = document.getElementById('reg-biz-name');
      if (f) f.focus();
    }, 150);
  } else if (role === 'staff') {
    document.getElementById('reg-step-staff').style.display = '';
    setTimeout(function(){
      var f = document.getElementById('staff-biz-name');
      if (f) f.focus();
    }, 150);
  }
}

function backToStep1() {
  document.getElementById('reg-step-owner').style.display   = 'none';
  document.getElementById('reg-step-staff').style.display   = 'none';
  document.getElementById('reg-step-pending').style.display = 'none';
  document.getElementById('reg-step1').style.display = '';
}

function regErrOwner(msg) {
  var e = document.getElementById('register-err');
  if (e) { e.textContent = msg; e.style.display = ''; }
  if (typeof toast === 'function') toast(msg, 'er');
}
function regErrStaff(msg) {
  var e = document.getElementById('staff-register-err');
  if (e) { e.textContent = msg; e.style.display = ''; }
  if (typeof toast === 'function') toast(msg, 'er');
}

function loginAs(user) {
  try {
    CU = user;
    // ── PERSIST SESSION — stay logged in until manual sign out ──
    try { localStorage.setItem('ss_session', JSON.stringify({uid: user.id, ts: Date.now()})); } catch(e){}
    // ── SET ENCRYPTION KEY (derived from password) ──
    try {
      if (typeof setEncryptionKey === 'function' && user.password) {
        setEncryptionKey(user.password);
      }
    } catch(e){}
    // Apply permission-based CSS classes
    setTimeout(function(){ try { if (typeof applySalesPermStyles === 'function') applySalesPermStyles(); } catch(e){} }, 100);
    // Load permissions from DB (in case they changed since last login)
    try {
      if (typeof defaultPermsFor === 'function' && typeof PERM_KEYS !== 'undefined') {
        var freshUser = (DB.users || []).find(function(x){ return x.id === user.id; });
        if (freshUser) {
          if (!freshUser.perms) freshUser.perms = defaultPermsFor(freshUser.role);
          PERM_KEYS.forEach(function(k){
            if (typeof freshUser.perms[k] === 'undefined') freshUser.perms[k] = defaultPermsFor(freshUser.role)[k];
          });
          CU.perms = freshUser.perms;
        }
      }
    } catch(e) { console.warn('[loginAs] perms load:', e); }
    // Profile-complete gate: forces existing users to fill missing fields
    try { if (typeof checkProfileComplete === 'function') setTimeout(checkProfileComplete, 1000); } catch(e){}
    // Auto-connect to Firebase if config exists but not connected
    try {
      if (typeof FB_DB === 'undefined' || !FB_DB) {
        if (typeof fbInit === 'function') fbInit();
      } else if (typeof fbPush === 'function') {
        // Connected - push our local state to make sure server has latest
        setTimeout(function(){ try { fbPush(); } catch(e){} }, 800);
      }
    } catch(e) { console.warn('[Login] Firebase auto-connect:', e); }
    var bids  = user.businessIds || [];
    var found = false;
    for (var i = 0; i < bids.length; i++) {
      if (bids[i] === DB.currentBizId) { found = true; break; }
    }
    CBI = found ? DB.currentBizId : (bids[0] || 1);
    DB.currentBizId = CBI;

    var loginEl = document.getElementById('login');
    var shellEl = document.getElementById('shell');
    if (loginEl) loginEl.style.display = 'none';
    if (shellEl) shellEl.style.display = 'flex';

    // Set avatar — use Google photo or initials
    var uavEl = document.getElementById('uav');
    if (uavEl) {
      if (user.photoURL) {
        uavEl.innerHTML = '<img src="' + user.photoURL + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      } else {
        uavEl.textContent = mkInit(user.name);
      }
    }
    sv('suname', user.name);
    sv('surole', RLBL[user.role] || user.role);
    updateTopbar();
    updateAdminUI();
    checkNotif();
    updateAdminBell();
    // ── Restore to last visited page (not always 'dash') ──
    var _lastPage = 'dash';
    try {
      var _saved = localStorage.getItem('ss_last_page');
      var _validPages = ['dash','sales','products','customers','expenses',
                         'reports','gallery','salary','docexp','calc','chat'];
      if (_saved && _validPages.indexOf(_saved) !== -1) {
        _lastPage = _saved;
      }
    } catch(e){}
    goTo(_lastPage);
    // Start session timeout timer
    try { if(typeof resetSessionTimer === 'function') resetSessionTimer(); } catch(e){}
    // Start PIN lock timer (only if user has a PIN set)
    try { if(typeof startPinTimer === 'function') startPinTimer(); } catch(e){}
    // Check document expirations + show warnings
    try { if(typeof checkDocExpirations === 'function') checkDocExpirations(); } catch(e){}
  } catch(e) {
    alert('Error loading app: ' + e.message + '\nPlease reload.');
  }
}

// ── doLogout — also sign out of Google ──
function doLogout() {
  // Stop session timeout timer
  try { if(typeof stopSessionTimer === 'function') stopSessionTimer(); } catch(e){}
  // Clear encryption key on logout
  try { if(typeof clearEncryptionKey === 'function') clearEncryptionKey(); } catch(e){}
  // Sign out of Firebase Auth
  try { if(typeof fbAuthSignOut === 'function') fbAuthSignOut(); } catch(e){}
  CU = null;
  // ── CLEAR PERSISTED SESSION + PAGE ──
  try { localStorage.removeItem('ss_session'); } catch(e){}
  try { localStorage.removeItem('ss_last_page'); } catch(e){}
  var loginEl = document.getElementById('login');
  var shellEl = document.getElementById('shell');
  var sp = document.getElementById('splash-restore');
  if (loginEl) loginEl.style.display = 'flex';
  if (shellEl) shellEl.style.display = 'none';
  if (sp) sp.style.display = 'none';
  var lp = document.getElementById('lp');
  if (lp) lp.value = '';
  showLogin();
}




// ── TOPBAR ──
function updateTopbar(){
  const b=biz();if(!b)return;el('tbn').textContent=b.name;el('tbs').textContent=DB.businesses.length>1?'Tap to switch':'Tap for settings';
  const init=mkInit(b.name),hasImg=b.logoType==='image'&&b.logoData;
  ['tbl','ll'].forEach(id=>{const e=el(id);if(!e)return;e.innerHTML=hasImg?`<img src="${b.logoData}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:init;});
  const lt=el('lbt');if(lt)lt.textContent=b.name;
}
function updateAdminUI(){
  const a=isAdmin();
  // Guard every el() lookup — some elements have been removed since this was written
  const adminlbl=el('adminlbl');   if(adminlbl)   adminlbl.style.display=a?'':'none';
  const admintools=el('admintools'); if(admintools) admintools.style.display=a?'':'none';
  const adminbell=el('admin-bell'); if(adminbell) adminbell.style.display=a?'':'none';
  if(el('pfab'))el('pfab').style.display=canAccess('products')?'':'none';
  if(el('sfab'))el('sfab').style.display=canAccess('sales')?'':'none';
  if(el('addempbtn'))el('addempbtn').style.display=a?'':'none';
  if(el('addbtn'))el('addbtn').style.display=a?'':'none';
  if(el('mpaybtn'))el('mpaybtn').style.display=a?'':'none';
}

// ── NOTIFICATIONS ──
function addAdminLogAlias(type,detail,by){addAdminLog(type,detail,by);}
function addNotif(type,msg){const b=biz();DB.notifications.unshift({id:DB.nextNotifId++,type,msg,read:false,bizId:b?b.id:CBI,ts:Date.now()});checkNotif();}
function checkNotif(){
  const b=biz();if(!b)return;
  if(!DB.notifications) DB.notifications=[];
  const unread=DB.notifications.filter(n=>!n.read&&n.bizId===b.id).length;
  const dot=el('ndot');if(dot)dot.style.display=unread>0?'block':'none';
  // Update sidebar menu dot too (pending signups + change requests)
  try {
    if(typeof isAdmin === 'function' && isAdmin()){
      var pending = 0;
      if(typeof getPendingSignups === 'function') pending += getPendingSignups().length;
      pending += (DB.changeRequests || []).filter(function(r){
        return r.bizId === CBI && r.status === 'pending';
      }).length;
      var md = document.getElementById('menu-dot');
      if(md) md.style.display = pending > 0 ? '' : 'none';
    }
  } catch(e){}
}
function openNotif(){
  const b=biz();if(!b)return;DB.notifications.filter(n=>n.bizId===b.id).forEach(n=>n.read=true);dbSave();checkNotif();
  const notifs=DB.notifications.filter(n=>n.bizId===b.id).slice(0,30);
  const tc={info:'var(--in)',warn:'var(--wa)',product:'var(--g)',sale:'var(--ok)',user:'var(--pu)',expense:'var(--er)'};
  let h=`<div style="padding:10px 13px;border-bottom:1px solid var(--bd)"><div class="sh" style="margin-bottom:8px">Alerts</div>`;
  h+=notifs.length?notifs.map(n=>`<div class="aitem"><div class="adot" style="background:${tc[n.type]||'var(--t2)'}"></div><div class="amsg">${esc(n.msg)}</div><div class="atime">${ago(n.ts)}</div></div>`).join(''):`<div style="padding:8px 0;font-size:12px;color:var(--t3)">No alerts</div>`;h+=`</div>`;
  el('notifbody').innerHTML=h;el('notifsub').textContent=notifs.length+' alerts';openD('d-notif');
}

// ── NAVIGATION (Back to Home always available) ──
function goTo(p){
  ['dash','sales','products','customers','expenses','reports','gallery','salary','docexp','more','calc','chat'].forEach(x=>{el('pg-'+x)?.classList.toggle('on',x===p);el('bn-'+x)?.classList.toggle('on',x===p);});
  if(p==='dash')renderDash();if(p==='sales'){fillSalesSummary();renderSales();}if(p==='products')renderProducts();
  if(p==='customers')renderCustomers();if(p==='reports'){fillFinMonths();renderFinReports();}
  if(p==='expenses'){fillExpSummary();renderExpenses();}if(p==='gallery')renderGallery();
  if(p==='salary'){fillSalMonths();renderSalary();}
  if(p==='chat'){try{renderGroupChat();}catch(e){}}if(p==='docexp'){renderDocExp();}if(p==='calc')initCalc();
  if(p==='chat'){ if(typeof renderChat === 'function') renderChat(); }
  el('pc')&&(el('pc').scrollTop=0);
  // ── Remember last page for session restore ──
  try { localStorage.setItem('ss_last_page', p); } catch(e){}
}

// ── DAILY NET ──
function getDailyNet(date){
  const b=biz();if(!b)return{gross:0,exp:0,net:0,actualExp:0,allocExp:0};
  const gross=(b.sales||[]).filter(s=>s.date===date&&s.status!=='cancelled').reduce((a,s)=>a+sTotal(s),0);
  const actualExp=(b.expenses||[]).filter(e=>e.date===date&&e.status!=='cancelled').reduce((a,e)=>a+(e.amount||0),0);
  // ── Add daily allocations from docs + salaries (ONLY IF TOGGLE IS ON) ──
  var allocEnabled = (b.allocationsEnabled !== false);  // default ON
  var allocExp = 0;
  if (allocEnabled && typeof getDayAllocations === 'function') {
    var alloc = getDayAllocations(date);
    allocExp = (alloc && alloc.total) || 0;
  }
  var totalExp = actualExp + allocExp;
  return{gross:gross,exp:totalExp,actualExp:actualExp,allocExp:allocExp,net:gross-totalExp};
}

// ── DASHBOARD ──
function renderDash(){
  var b=biz();if(!b)return;
  var prods=b.products||[];
  var sales=(b.sales||[]).filter(function(s){ if(s.status==='deleted') return false;return s.status!=='cancelled';});
  var exps=(b.expenses||[]).filter(function(e){return e.status!=='cancelled';});
  var dn=getDailyNet(today());
  var ynDn=getDailyNet(yesterday());
  var low=prods.filter(function(p){return p.qty<=(p.lowLevel||b.lowStock||5);});
  var todaySales=sales.filter(function(s){return isToday(s.date);});
  var todayExps=exps.filter(function(e){return isToday(e.date);});
  var invVal=prods.reduce(function(a,p){return a+(p.qty||0)*(p.price||0);},0);

  // ── Hero Net ──
  var netEl=el('dn');
  if(netEl){
    netEl.textContent=f$(dn.net);
    var netColor=dn.net<0?'var(--er)':dn.net>=dn.gross*0.7?'var(--ok)':dn.net>0?'var(--wa)':'var(--er)';
    netEl.style.color=netColor;
  }
  if(el('dg'))el('dg').textContent=f$(dn.gross);
  if(el('de'))el('de').textContent=f$(dn.exp);

  // Margin pill
  var marginPct=dn.gross>0?Math.round((dn.net/dn.gross)*100):0;  // can be negative
  var mpEl=el('d-margin-pill');
  if(mpEl){
    mpEl.textContent=marginPct+'% margin';
    mpEl.style.color=marginPct>=60?'var(--ok)':marginPct>=30?'var(--wa)':'var(--er)';
  }

  // Profit bar proportions
  if(dn.gross>0){
    var expPct = Math.min((dn.exp/dn.gross)*100, 100);
    var netPct = Math.max(0, (dn.net/dn.gross)*100);
    var grossPct = Math.max(0, 100-expPct-netPct);
    if(el('pb-gross')) el('pb-gross').style.width = grossPct+'%';
    if(el('pb-exp'))   el('pb-exp').style.width   = expPct+'%';
    var netBarEl=el('pb-net');
    if(netBarEl){
      netBarEl.style.width = netPct+'%';
      // Color: green if profit>70%, amber if >30%, red if loss/low
      var nc = dn.net<0?'var(--er)':netPct>=60?'var(--ok)':netPct>=30?'var(--wa)':'var(--er)';
      netBarEl.style.background = nc;
    }
    var pblDot=el('pbl-net-dot');
    if(pblDot) pblDot.style.background = dn.net<0?'var(--er)':netPct>=60?'var(--ok)':netPct>=30?'var(--wa)':'var(--er)';
  } else if(dn.exp>0) {
    // All expenses, no sales — show full red bar
    if(el('pb-gross')) el('pb-gross').style.width='0%';
    if(el('pb-exp'))   el('pb-exp').style.width='100%';
    if(el('pb-net'))   el('pb-net').style.width='0%';
  }

  // ── KPI Cards ──
  // Today Sales: if user lacks see_all_sales, show ONLY their own sales total
  var canSeeAllSales = (typeof hasPerm === 'function') ? hasPerm('see_all_sales') : true;
  var displayedSales, displayedSalesCount;
  if (canSeeAllSales) {
    displayedSales = dn.gross;
    displayedSalesCount = todaySales.length;
  } else {
    // Filter to current user's own sales only
    var mySales = todaySales.filter(function(s){
      return CU && s.createdBy && s.createdBy === CU.id;
    });
    displayedSales = mySales.reduce(function(a,s){ return a + (typeof sTotal==='function' ? sTotal(s) : 0); }, 0);
    displayedSalesCount = mySales.length;
  }
  if(el('ks'))  el('ks').textContent = f$(displayedSales);
  if(el('ke'))  el('ke').textContent = f$(dn.exp);
  // ── Expenses breakdown (actual + allocated) ──
  try {
    var keSubEl = null;
    var keCard = document.getElementById('ke');
    if (keCard) {
      var kcard = keCard.closest('.kcard-v2');
      if (kcard) keSubEl = kcard.querySelector('.kcard-v2-sub');
    }
    // Only show 'allocated' if allocations are actually enabled
    var allocOn = (b.allocationsEnabled !== false);
    var isTodayWD = (typeof isWorkingDay === 'function') ? isWorkingDay(today()) : true;
    if (keSubEl) {
      if (!allocOn) {
        keSubEl.textContent = 'alloc off';
        keSubEl.style.color = '';
      } else if (!isTodayWD) {
        keSubEl.textContent = 'rest day · no allocation';
        keSubEl.style.color = 'var(--t3)';
      } else if (dn.allocExp > 0.01) {
        keSubEl.innerHTML = '<span style="color:var(--t3)">today · </span><span style="color:var(--wa);font-weight:700">' + f$(dn.allocExp) + ' allocated</span>';
        keSubEl.style.color = '';
      } else {
        keSubEl.textContent = 'today';
        keSubEl.style.color = '';
      }
    }
  } catch(e){}
  if(el('kiv')) el('kiv').textContent = f$(invVal);
  if(el('kl'))  el('kl').textContent = low.length;
  if(el('kp'))  el('kp').textContent = prods.length+' SKUs';
  if(el('ksc')) {
    var lbl = canSeeAllSales
      ? (displayedSalesCount + ' order' + (displayedSalesCount!==1?'s':''))
      : ('your ' + displayedSalesCount + ' sale' + (displayedSalesCount!==1?'s':''));
    el('ksc').textContent = lbl;
  }
  // Also retitle the Today Sales card label to "My Sales" when restricted
  try {
    var tsLblEl = document.querySelector('.kcard-v2-lbl');
    // We need the SPECIFIC Today Sales label. Find by walking the kcard that contains #ks
    var ksCard = document.getElementById('ks');
    if (ksCard) {
      var card = ksCard.closest('.kcard-v2');
      if (card) {
        var lblEl = card.querySelector('.kcard-v2-lbl');
        if (lblEl) lblEl.textContent = canSeeAllSales ? 'Today Sales' : 'My Sales';
      }
    }
  } catch(e){}

  // ── Trend indicators ──
  var stTrend=calcTrend(dn.gross,ynDn.gross);
  var exTrend=calcTrend(dn.exp,ynDn.exp);
  if(el('ks-trend'))el('ks-trend').innerHTML=trendHtml(stTrend);
  if(el('ke-trend'))el('ke-trend').innerHTML=trendHtml(exTrend);

  // ── Alerts ──
  var alertEl=el('dalert');
  if(alertEl){
    alertEl.innerHTML=low.length?
      '<div style="display:flex;align-items:center;gap:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:var(--r10);padding:9px 13px;margin-bottom:10px;font-size:12px;font-weight:700;color:var(--wa)">'+
        '<span>⚠</span> '+low.length+' item'+(low.length>1?'s':'')+' running low — <span style="cursor:pointer;text-decoration:underline;margin-left:3px" onclick="goTo(\'products\')">View Products</span></div>':
      '';
  }
  var pending=(DB.changeRequests||[]).filter(function(r){return r.bizId===CBI&&r.status==='pending';}).length;
  var reorderEl=el('reorder-banner');
  if(reorderEl){
    if(low.length){
      reorderEl.style.display='';
      reorderEl.innerHTML='<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:var(--r10);padding:10px 14px;margin-bottom:12px">'+
        '<div style="font-size:10px;font-weight:700;color:var(--wa);text-transform:uppercase;letter-spacing:.1em;font-family:var(--fm);margin-bottom:7px">Reorder Suggestions</div>'+
        low.slice(0,4).map(function(p){return(
          '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid rgba(245,158,11,.1);color:var(--t2)">'+
            '<span>'+esc(p.name)+'</span>'+
            '<span style="color:var(--wa);font-weight:700;font-family:var(--fm)">'+p.qty+' '+p.unit+' left</span>'+
          '</div>');}).join('')+
      '</div>';
    }else reorderEl.style.display='none';
  }

  // ── Quick Actions ──
  // For admin/primaryAdmin: ALWAYS show ALL 6 quick actions, ignore canAccess.
  // For staff: respect canAccess + hasPerm.
  var qa=[];
  var __isAdminUser = (CU && (CU.role === 'primaryAdmin' || CU.role === 'admin'));
  if(__isAdminUser || canAccess('sales'))     qa.push({i:'🛒',l:'New Sale',    f:'openNewSale()',    bg:'rgba(34,197,94,.12)',  glow:'rgba(34,197,94,.12)'});
  if(__isAdminUser || canAccess('products'))  qa.push({i:'➕',l:'Add Product', f:'openAddProd()',    bg:'var(--gd)',             glow:'rgba(232,160,32,.12)'});
  if(__isAdminUser || canAccess('expenses'))  qa.push({i:'💸',l:'Add Expense', f:'openAddExp()',     bg:'rgba(239,68,68,.12)',  glow:'rgba(239,68,68,.12)'});
  if(__isAdminUser || canAccess('stock'))     qa.push({i:'📥',l:'Stock In',    f:'openStockIn()',    bg:'rgba(79,195,247,.12)', glow:'rgba(79,195,247,.12)'});
  // 5th action: admins ALWAYS get Daily Report (pending admin badge logic only adds to badge)
  qa.push({i:'📊',l:'Daily Report',f:'openDailyReport()',bg:'rgba(168,85,247,.12)',glow:'rgba(168,85,247,.12)',badge:(__isAdminUser&&pending>0?pending:0)});
  qa.push({i:'📐',l:'Tile Calc',   f:"goTo('calc')",      bg:'rgba(245,158,11,.12)',glow:'rgba(245,158,11,.12)'});

  var qgEl=el('qg');
  if(qgEl)qgEl.innerHTML=qa.slice(0,6).map(function(a){
    return '<div class="qa-btn" style="--qa-glow:'+a.glow+'" onclick="'+a.f+'">'+
      (a.badge?'<div class="qa-badge">'+a.badge+'</div>':'')+
      '<div class="qa-icon" style="background:'+a.bg+'">'+a.i+'</div>'+
      '<div class="qa-lbl">'+a.l+'</div>'+
    '</div>';
  }).join('');

  // ── Activity Feed (sales + expenses merged, today only) ──
  var recentSales=[...todaySales].sort(function(a,b){return b.id-a.id;}).slice(0,4);
  var drsEl=el('drs');
  if(drsEl){
    if(recentSales.length){
      drsEl.innerHTML=
        '<div style="padding:4px 0 2px;font-size:9px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.14em;font-family:var(--fm);padding:8px 16px 4px">Sales</div>'+
        recentSales.map(function(s){
          var due=sDue(s);var st=sSt(s);
          var stDot=st==='PAID'?'var(--ok)':st==='PARTIAL'?'var(--wa)':'var(--er)';
          return '<div class="activity-item" onclick="viewReceipt('+s.id+')">'+
            '<div class="act-dot" style="background:var(--gd)">🧾</div>'+
            '<div class="act-body">'+
              '<div class="act-name">'+esc(s.customer||'Walk-in')+'</div>'+
              '<div class="act-meta">'+esc(s.inv||'')+(s.contact?' · 📞 '+esc(s.contact):'')+'</div>'+
            '</div>'+
            '<div class="act-right">'+
              '<div class="act-amount" style="color:var(--g)">'+f$(sTotal(s))+'</div>'+
              '<div class="act-time"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+stDot+';margin-right:3px;vertical-align:middle"></span>'+st+'</div>'+
            '</div>'+
          '</div>';
        }).join('');
    }else{
      drsEl.innerHTML='<div style="padding:14px 16px;font-size:12px;color:var(--t3);text-align:center">No sales today yet</div>';
    }
  }

  var dreEl=el('dre');
  if(dreEl){
    if(todayExps.slice(0,3).length){
      dreEl.innerHTML=
        '<div style="border-top:1px solid rgba(255,255,255,.04);padding:8px 16px 4px;font-size:9px;font-weight:700;color:var(--er);text-transform:uppercase;letter-spacing:.14em;font-family:var(--fm)">Expenses</div>'+
        todayExps.slice(0,3).map(function(e){
          return '<div class="activity-item">'+
            '<div class="act-dot" style="background:rgba(239,68,68,.12)">💸</div>'+
            '<div class="act-body">'+
              '<div class="act-name">'+esc(e.description)+'</div>'+
              '<div class="act-meta">'+esc(e.category||'General')+'</div>'+
            '</div>'+
            '<div class="act-right">'+
              '<div class="act-amount" style="color:var(--er)">−'+f$(e.amount)+'</div>'+
            '</div>'+
          '</div>';
        }).join('');
    }else{
      dreEl.innerHTML='';
    }
  }

  // ── Chart & topbar ──
  renderWeekChart();
  updateTopbar();

  // ── PERMISSION ENFORCEMENT ──
  if (typeof enforceDashboardPerms === 'function') enforceDashboardPerms();
}


// ── SALES ──
function fillSalesSummary() {
  const b = biz(); if (!b) return;
  // SELL AGENT FILTER — only own sales count when user lacks see_all_sales
  const restrictToOwn = typeof hasPerm === 'function' && CU && !hasPerm('see_all_sales');
  const s = (b.sales || []).filter(x => {
    if (x.status === 'cancelled') return false;
    if (restrictToOwn && CU && x.createdBy && x.createdBy !== CU.id) return false;
    return true;
  });
  const ts = arr => arr.reduce((a, s) => a + sTotal(s), 0);
  const td = s.filter(x => isToday(x.date));
  const tw = s.filter(x => isWeek(x.date));
  const tm = s.filter(x => isMon(x.date));
  el('sst').textContent  = f$(ts(td));
  el('ssw').textContent  = f$(ts(tw));
  el('ssm').textContent  = f$(ts(tm));
  el('sst-c').textContent = td.length + ' order' + (td.length !== 1 ? 's' : '');
  el('ssw-c').textContent = tw.length + ' order' + (tw.length !== 1 ? 's' : '');
  el('ssm-c').textContent = tm.length + ' order' + (tm.length !== 1 ? 's' : '');
}

// ── FILTER TABS ──

function setSF(f, e) {
  saleFilter = f;
  document.querySelectorAll('.stab').forEach(c => c.classList.remove('on'));
  if (e) e.classList.add('on');
  renderSales();
}

// ── RENDER SALES LIST ──

function renderSales() {
  const b = biz(); if (!b) return;
  fillSalesSummary();
  const q = (gv('sq') || '').toLowerCase();
  // SELL AGENT FILTER — restrict to own sales when user lacks see_all_sales
  const restrictToOwn = typeof hasPerm === 'function' && CU && !hasPerm('see_all_sales');
  let sales = (b.sales || []).filter(s => {
    if (s.status === 'cancelled') return false;
    if (restrictToOwn && CU && s.createdBy && s.createdBy !== CU.id) return false;
    const mq = !q ||
      (s.customer || '').toLowerCase().includes(q) ||
      (s.inv || '').toLowerCase().includes(q) ||
      (s.contact || '').includes(q) ||
      (s.items || []).some(i => i.name.toLowerCase().includes(q));
    const mf =
      saleFilter === 'all' ||
      (saleFilter === 'today'  && isToday(s.date)) ||
      (saleFilter === 'week'   && isWeek(s.date)) ||
      (saleFilter === 'month'  && isMon(s.date)) ||
      (saleFilter === 'credit' && sSt(s) !== 'PAID');
    return mq && mf;
  }).sort((a, b) => b.id - a.id);

  const wrap = el('slist'); if (!wrap) return;

  if (!sales.length) {
    wrap.innerHTML = emS(
      '🛒', 'No Sales Yet',
      saleFilter === 'all'
        ? 'Tap the cart button below to create your first sale.'
        : 'No sales match this filter.',
      saleFilter === 'all'
        ? '<button type="button" class="btn bg bsm" onclick="openNewSale()">+ New Sale</button>'
        : ''
    );
    return;
  }

  wrap.innerHTML = sales.map(s => buildSaleCard(s)).join('');
}

function openEditSale(saleId) {
  const b = biz();
  const s = (b.sales || []).find(x => x.id === saleId);
  if (!s) return;
  if (isRecordLocked(s) && !isAdmin() && !s.adminUnlocked) {
    openRecordChangeRequest('sale', saleId, s.inv || 'Sale #' + saleId);
    return;
  }
  if (!isAdmin()) { toast('Admin access required to edit sales', 'er'); return; }

  // ── OPEN NEW SALE DRAWER pre-loaded with this sale's data ──
  function doOpenEdit() {
    editingSaleId = saleId;

    // Load cart items from the existing sale
    cartItems = (s.items || []).map(function(it) {
      return {
        prodId:    it.prodId,
        name:      it.name,
        qty:       it.qty,
        unitPrice: it.unitPrice,
        cost:      it.cost || 0,
        unit:      it.unit || 'Box',
        maxQty:    it.maxQty || 9999,
        category:  it.category || ''
      };
    });

    // Pre-fill header fields
    sv('sinv',  s.inv  || '');
    sv('sdate', s.date || today());
    sv('scust', s.customer || '');
    sv('scont', s.contact  || '');
    sv('sdisc', s.discount || '0');
    sv('spaid', s.paid     || '');

    // Set payment mode
    currentPayMode = s.paymode || 'Cash';
    var payBtns = document.querySelectorAll('.pay-mode-btn');
    payBtns.forEach(function(btn) {
      btn.classList.toggle('on', btn.dataset.mode === currentPayMode);
    });

    // Update the drawer title and subtitle
    var titleEl = document.querySelector('#d-sale .dtitle');
    var subEl   = document.querySelector('#d-sale .dsub');
    if (titleEl) titleEl.textContent = 'Edit Sale';
    if (subEl)   subEl.textContent   = (s.inv || 'Sale') + ' · ' + (s.customer || 'Walk-in') + ' — Admin Edit';

    // Change Complete Sale button to "Save Changes"
    var completeBtn = document.getElementById('complete-sale-btn');
    if (completeBtn) {
      completeBtn.textContent = '💾 Save Changes';
      completeBtn.style.background = '';
    }

    // Render cart and product grid
    renderCart();
    renderQuickProdGrid();
    updateCart();

    openD('d-sale');
  }

  // Skip PIN if within 3-hour grace window
  if (isAdmin() && !isRecordLocked(s)) {
    doOpenEdit();
    setTimeout(() => el('es-reason')?.focus(), 300);
    return;
  }
  requireAdminPin(
    () => { openD('d-editsale'); setTimeout(() => el('es-reason')?.focus(), 300); },
    null,
    `Edit Sale ${s.inv} — enter admin password (locked: older than ${RECORD_LOCK_HRS}h)`
  );
}

// ── SAVE EDITED SALE ──

function saveEditSale() {
  if (!isAdmin()) { toast('Admin access required', 'er'); return; }
  const b = biz();
  const s = (b.sales || []).find(x => x.id === editingSaleId);
  if (!s) return;
  const reason = gv('es-reason');
  if (!reason) { toast('Reason for edit is required', 'er'); return; }
  const before = { customer: s.customer, contact: s.contact, paymode: s.paymode, paid: s.paid, discount: s.discount };
  s.customer = gv('es-cust') || s.customer;
  s.contact  = gv('es-contact');
  s.paymode  = el('es-paymode')?.value || s.paymode;
  s.paid     = parseFloat(el('es-paid')?.value) || s.paid;
  s.discount = parseFloat(el('es-disc')?.value) || 0;
  s.due      = Math.max(0, sTotal(s) - (s.paid || 0));
  s.payStatus = sSt(s);
  s.updatedAt = Date.now();
  if (!s.editLog) s.editLog = [];
  s.editLog.push({ by: CU.name, at: Date.now(), reason, before });
  addAdminLog('edit_sale', `Edited Sale ${s.inv}: ${reason}`, CU.name);
  dbSave();
  closeD('d-editsale');
  renderSales();
  renderDash();
  toast('Sale updated', 'ok');
}

// ══════════════════════════════════════════════════════════
//  NEW SALE — OPEN
// ══════════════════════════════════════════════════════════

function deleteSale(saleId) {
  const b = biz();
  const s = (b.sales || []).find(x => x.id === saleId);
  if (!s) return;

  if (isRecordLocked(s) && !isAdmin() && !s.adminUnlocked) {
    openRecordChangeRequest('sale', saleId, s.inv || 'Sale #' + saleId);
    const a = el('rec-cr-action'); if (a) a.value = 'delete';
    return;
  }
  if (!canAccess('sales') && !isAdmin()) { toast('No access', 'er'); return; }

  // Require admin PIN before deleting
  requireAdminPin(function(){
    showConf('🗑️', 'Delete Sale?',
    'Delete ' + esc(s.inv || 'Sale #' + saleId) + ' — ' + esc(s.customer || 'Walk-in') + ' — ' + f$(sTotal(s)) + '? Stock quantities will be restored.',
    function(){
      // Soft delete — moves to recycle bin for 30 days
      var saleToDelete = (b.sales || []).find(function(x){ return x.id === saleId; });
      if (saleToDelete) { softDelete(saleToDelete); }
      (s.items || []).forEach(function(item) {
        var p = (b.products || []).find(function(x){ return x.id === item.prodId; });
        if (p) p.qty += item.qty;
      });
      addAdminLog('del_sale', 'Deleted Sale ' + (s.inv || saleId) + ' · ' + s.customer + ' · ' + f$(sTotal(s)), CU.name);
      dbSave();
      renderSales();
      renderProducts();
      renderDash();
      toast('Sale deleted');
    }
  );
  }, null, 'Delete Sale — enter admin PIN to confirm');
}

// ── OPEN EDIT SALE (admin) ──

function openNewSale() {
  if (!canAccess('sales')) { toast('No access to sales', 'er'); return; }
  const b = biz(); if (!b) return;

  // Reset state
  cartItems = [];
  currentPayMode = 'Cash';
  editingSaleId = null;

  // Set invoice number and date
  sv('sinv', 'INV-' + String(b.nextSaleId || 1).padStart(4, '0'));
  sv('sdate', today());

  // Clear fields
  ['scust', 'scont', 'spaid'].forEach(id => sv(id, ''));
  sv('sdisc', '0');
  sv('spay', 'Cash');

  // Reset payment mode buttons
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.pay === 'Cash');
  });
  var padw = el('paid-amount-wrap'); if (padw) padw.style.display = '';

  // Set title
  el('sale-dr-ttl').textContent = 'New Sale';

  // Start in quick grid mode
  saleMode = 'quick';
  const qg  = el('quick-prod-grid');
  const sw  = el('sale-search-wrap');
  const btn = el('sale-mode-btn');
  if (qg)  qg.style.display  = '';
  if (sw)  sw.style.display  = 'none';
  if (btn) btn.textContent   = '🔍 Search';

  // Render components
  renderCart();
  renderQuickProdGrid();
  updateCart();

  openD('d-sale');
  setTimeout(() => el('scust')?.focus(), 300);
}

// ── PAYMENT MODE SELECTION ──

function renderSaleSearch() {
  const b = biz(); if (!b) return;
  const q   = (gv('spsq') || '').toLowerCase();
  const res = el('spres'); if (!res) return;
  if (!q) { res.style.display = 'none'; return; }

  const prods = (b.products || [])
    .filter(function(p){ return p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q); })
    .slice(0, 8);

  if (!prods.length) {
    res.style.display = '';
    res.innerHTML = '<div style="padding:12px;text-align:center;font-size:12px;color:var(--t3)">No products found</div>';
    return;
  }
  res.style.display = '';
  res.innerHTML = prods.map(function(p) {
    var oos      = p.qty <= 0;
    var _imgSrc  = getProductImgSrc(p); var imgHtml = _imgSrc ? '<img src="' + _imgSrc + '" style="width:100%;height:100%;object-fit:cover">' : (CATI[p.category]||'📦');
    var clickEvt = oos ? '' : ' onclick="addToCart(' + p.id + ')"';
    var stockStr = oos ? 'OUT OF STOCK' : p.qty + ' in stock';
    var stockClr = oos ? 'var(--er)' : 'var(--t3)';
    return '<div class="psearch-item"' + (oos ? ' style="opacity:.5;pointer-events:none"' : '') + clickEvt + '>' +
      '<div class="psearch-thumb">' + imgHtml + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="psearch-name">' + esc(p.name) + '</div>' +
        '<div style="font-size:10px;color:var(--t3)">' + esc(p.category) + ' · ' + esc(p.unit) + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div class="psearch-price">' + f$(p.price) + '</div>' +
        '<div class="psearch-stock" style="color:' + stockClr + '">' + stockStr + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  CART MANAGEMENT
// ══════════════════════════════════════════════════════════

function addToCart(id) {
  const b = biz();
  const p = (b.products || []).find(x => x.id === id);
  if (!p) return;

  // ── NO STOCK GATE — allow adding even out-of-stock items (qty can go negative) ──
  const existing = cartItems.find(c => c.prodId === id);
  if (existing) {
    existing.qty++;
  } else {
    cartItems.push({
      prodId:    id,
      name:      p.name,
      qty:       1,
      unitPrice: p.price,
      cost:      p.cost || 0,
      unit:      p.unit,
      maxQty:    p.qty,   // kept for reference only
      category:  p.category
    });
  }

  // Clear search and close results
  if (saleMode === 'search') {
    sv('spsq', '');
    var res = el('spres'); if (res) res.style.display = 'none';
  }

  renderCart();
  renderQuickProdGrid(); // update in-cart highlights
  toast(p.name + ' added', 'gd');
}

// ── +/- button helpers — always read CURRENT field value ──
function cartInc(i) {
  var inp = el('qty-' + i);
  var cur = inp ? (parseInt(inp.value) || 1) : (cartItems[i] ? cartItems[i].qty : 1);
  updateCartItemQty(i, cur + 1);
}
function cartDec(i) {
  var inp = el('qty-' + i);
  var cur = inp ? (parseInt(inp.value) || 1) : (cartItems[i] ? cartItems[i].qty : 1);
  if (cur > 1) updateCartItemQty(i, cur - 1);
}

function updateCartItemQty(i, val) {
  const item = cartItems[i]; if (!item) return;
  let q = parseInt(val);
  if (isNaN(q) || q < 1) {
    q = 1;
  }
  // ── NO STOCK LIMIT — allow any quantity; stock will go negative ──
  item.qty = q;
  const inp = el('qty-' + i); if (inp) inp.value = q;
  const totalEl = el('line-total-' + i);
  if (totalEl) totalEl.textContent = f$(item.qty * item.unitPrice);
  updateCart();
  renderQuickProdGrid();
}

function updateCartItemPrice(i, val) {
  const item = cartItems[i]; if (!item) return;
  const p = parseFloat(val);
  if (isNaN(p) || p < 0) return;
  item.unitPrice = p;
  const totalEl = el('line-total-' + i);
  if (totalEl) totalEl.textContent = f$(item.qty * item.unitPrice);
  updateCart();
}

function removeCartItem(i) {
  cartItems.splice(i, 1);
  renderCart();
  renderQuickProdGrid();
  updateCart();
}

function renderCart() {
  const wrap = el('cartitems'); if (!wrap) return;
  const cnt  = el('cart-count');

  if (!cartItems.length) {
    wrap.innerHTML =
      '<div class="cart-empty">' +
      '<div class="cart-empty-icon">🛒</div>' +
      '<div class="cart-empty-txt">Cart is empty</div>' +
      '<div class="cart-empty-sub">Tap a product above to add it</div>' +
      '</div>';
    if (cnt) cnt.textContent = '0 items';
    updateCart();
    return;
  }

  if (cnt) cnt.textContent = cartItems.length + ' item' + (cartItems.length !== 1 ? 's' : '');

  wrap.innerHTML = cartItems.map(function(item, i) {
    var lineTotal = f$(item.qty * item.unitPrice);
    var name = esc(item.name);
    return '<div class="cart-v2-item">' +
      '<div class="cart-v2-left">' +
        '<div class="cart-v2-name">' + name + '</div>' +
        '<div class="cart-v2-unit">' +
          '<span class="cart-unit-lbl">Unit price:</span>' +
          '<input class="cart-price-field" id="price-' + i + '" type="number"' +
            ' value="' + item.unitPrice.toFixed(2) + '" min="0" step="0.01"' +
            ' onchange="updateCartItemPrice(' + i + ',this.value)"' +
            ' oninput="updateCartItemPrice(' + i + ',this.value)"' +
            ' onclick="this.select()">' +
        '</div>' +
      '</div>' +
      '<div class="cart-v2-controls">' +
        '<div class="qty-btn" onclick="cartDec(' + i + ')">−</div>' +
        '<input class="qty-field" id="qty-' + i + '" type="number"' +
          ' value="' + item.qty + '" min="1" inputmode="numeric"' +
          ' onchange="updateCartItemQty(' + i + ',this.value)"' +
          ' oninput="updateCartItemQty(' + i + ',this.value)"' +
          ' onclick="this.select()">' +
        '<div class="qty-btn" onclick="cartInc(' + i + ')">+</div>' +
      '</div>' +
      '<div class="cart-v2-total" id="line-total-' + i + '">' + lineTotal + '</div>' +
      '<div class="cart-v2-del" onclick="removeCartItem(' + i + ')" title="Remove">✕</div>' +
    '</div>';
  }).join('');

  updateCart();
}

function updateCart() {
  var sub  = cartItems.reduce(function(a,b){ return a + b.qty * b.unitPrice; }, 0);
  var disc = parseFloat(el('sdisc') ? el('sdisc').value : 0) || 0;
  var tot  = Math.max(0, sub - disc);
  var paid = currentPayMode === 'Credit' ? 0 : (parseFloat(el('spaid') ? el('spaid').value : 0) || 0);
  var due  = Math.max(0, tot - paid);
  var st   = due <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'CREDIT';

  if (el('csub'))   el('csub').textContent  = f$(sub);
  if (el('ctotal')) el('ctotal').textContent = f$(tot);

  var dueWrap = el('cart-due-wrap');
  var dueEl   = el('cdue');
  var bdgEl   = el('cpbdg');

  // Always show the due row so user can track status
  if (dueWrap) dueWrap.style.display = '';
  if (dueEl) {
    dueEl.textContent = 'Due: ' + f$(due);
    dueEl.style.color = due <= 0 ? 'var(--ok)' : due < tot ? 'var(--wa)' : 'var(--er)';
  }
  if (bdgEl) {
    bdgEl.innerHTML = st === 'PAID'
      ? '<span class="sb-paid">\u2713 PAID</span>'
      : st === 'PARTIAL'
      ? '<span class="sb-partial">&#9681; PARTIAL</span>'
      : '<span class="sb-credit">&#9675; CREDIT</span>';
  }

  // Enable/disable complete button
  var btn = el('complete-sale-btn');
  if (btn) btn.disabled = cartItems.length === 0;
}

// ══════════════════════════════════════════════════════════
//  COMPLETE SALE
// ══════════════════════════════════════════════════════════

function completeSale() {
  const b = biz(); if (!b) return;

  // ── Validation ──
  if (!cartItems.length) { toast('Cart is empty — add products first', 'er'); return; }
  const inv = gv('sinv');
  if (!inv) { toast('Invoice number is required', 'er'); return; }

  // Check for duplicate invoice (skip current sale in edit mode)
  if ((b.sales || []).some(s => s.inv === inv && s.status !== 'cancelled' && s.id !== editingSaleId)) {
    toast('Invoice ' + inv + ' already exists', 'er');
    return;
  }

  // Stock check removed — overselling allowed, stock goes negative

  const customer = (gv('scust') || 'Walk-in').trim();
  const contact  = gv('scont');
  const date     = el('sdate')?.value || today();
  const paymode  = currentPayMode;
  const disc     = parseFloat(el('sdisc')?.value) || 0;
  const sub      = cartItems.reduce((a, b) => a + b.qty * b.unitPrice, 0);
  const total    = Math.max(0, sub - disc);
  const paid     = paymode === 'Credit' ? 0 : (parseFloat(el('spaid')?.value) || total);
  const due      = Math.max(0, total - paid);
  const st       = due <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'CREDIT';
  const now      = Date.now();

  const sale = {
    id:         b.nextSaleId || 1,
    inv,
    date,
    customer,
    contact,
    paymode,
    discount:   disc,
    subtotal:   sub,
    total,
    paid,
    due,
    payStatus:  st,
    items:      cartItems.map(c => ({
      prodId:    c.prodId,
      name:      c.name,
      qty:       c.qty,
      unitPrice: c.unitPrice,
      cost:      c.cost || 0,
      total:     c.qty * c.unitPrice
    })),
    createdAt:  now,
    updatedAt:  now,
    status:     'active',
    editLog:    [],
    createdBy:     (CU ? CU.id : null),
    createdByName: (CU ? (CU.name || CU.username) : 'System'),
    fulfillments:  [],
    fulStatus:     'Pending',
    assignedStaff: ''
  };

  // ── EDIT MODE: update existing sale ──
  if (editingSaleId !== null) {
    var existingSale = (b.sales||[]).find(function(x){ return x.id === editingSaleId; });
    if (existingSale) {
      // Restore old stock first
      (existingSale.items||[]).forEach(function(it){
        var pr=(b.products||[]).find(function(x){return x.id===it.prodId;});
        if(pr){ pr.qty+=it.qty; if(pr.qty>=0) pr.wentNegativeAt=null; }
      });
      // Update sale fields
      existingSale.date=date; existingSale.customer=customer; existingSale.contact=contact;
      existingSale.paymode=paymode; existingSale.discount=disc; existingSale.subtotal=sub;
      existingSale.total=total; existingSale.paid=paid; existingSale.due=due;
      existingSale.payStatus=st; existingSale.updatedAt=now; existingSale.updatedBy=CU?CU.name:'Unknown';
      existingSale.items=sale.items;
      if(!existingSale.editLog) existingSale.editLog=[];
      existingSale.editLog.push({at:now,by:CU?CU.name:'Unknown',action:'full_cart_edit'});
      // Deduct new stock
      sale.items.forEach(function(item){
        var p=(b.products||[]).find(function(x){return x.id===item.prodId;});
        if(p){var prev=p.qty;p.qty-=item.qty;if(p.qty<0&&prev>=0)p.wentNegativeAt=Date.now();if(p.qty>=0)p.wentNegativeAt=null;}
      });
    }
  } else {
    // ── CREATE MODE: new sale ──
    if (!b.sales) b.sales = [];
    b.sales.unshift(sale);
    b.nextSaleId = (b.nextSaleId || 1) + 1;

    // Reduce stock
    sale.items.forEach(item => {
      const p = (b.products || []).find(x => x.id === item.prodId);
      if (p) {
          var prevQty2 = p.qty;
          p.qty = p.qty - item.qty;  // allow negative
          if (p.qty < 0 && prevQty2 >= 0) p.wentNegativeAt = Date.now();
          if (p.qty >= 0) p.wentNegativeAt = null;
        }
      // Stock history
      if (!b.stockHistory) b.stockHistory = [];
      if (!b.nextHistId) b.nextHistId = 1;
      b.stockHistory.unshift({
        id: b.nextHistId++,
        date,
        type:     'SALE',
        prodName: item.name,
        qty:      -item.qty,
        by:       CU?.name || 'unknown',
        ref:      inv,
        notes:    customer,
        ts:       now
      });
    });
  }

  // Auto-create credit record if needed
  if (due > 0) {
    if (!b.credits) b.credits = [];
    const existing = b.credits.find(c => c.name.toLowerCase() === customer.toLowerCase() && c.status !== 'SETTLED');
    if (existing) {
      existing.totalOwed += due;
    } else {
      if (!b.nextCrId) b.nextCrId = 1;
      b.credits.push({ id: b.nextCrId++, name: customer, ref: inv, date, totalOwed: due, totalPaid: 0, paymode, status: 'OPEN', payments: [], contact });
    }
  }

  // Auto-create customer if new
  if (customer !== 'Walk-in' && !(b.customers || []).find(c => c.name.toLowerCase() === customer.toLowerCase())) {
    if (!b.customers)  b.customers  = [];
    if (!b.nextCustId) b.nextCustId = 1;
    b.customers.push({ id: b.nextCustId++, name: customer, phone: contact || '', email: '', address: '', notes: 'Added via sale', createdAt: now });
  }

  addAdminLog('sale', 'Sale ' + inv + ' · ' + customer + ' · ' + f$(total) + ' · ' + st, CU ? CU.name : 'system');

  dbSave();
  // Reset drawer
  var _titleEl = document.querySelector('#d-sale .dtitle');
  var _subEl   = document.querySelector('#d-sale .dsub');
  var _btn     = document.getElementById('complete-sale-btn');
  if(_titleEl) _titleEl.textContent='New Sale';
  if(_subEl)   _subEl.textContent='Add products to cart';
  if(_btn)     _btn.textContent='✓ Complete Sale';
  var _wasEdit = (editingSaleId !== null);
  var _saleId  = _wasEdit ? editingSaleId : (b.sales && b.sales[0] ? b.sales[0].id : null);
  editingSaleId = null;
  cartItems = [];
  closeD('d-sale');
  toast(_wasEdit ? ('✅ Sale ' + inv + ' updated — ' + f$(total)) : ('Sale ' + inv + ' completed — ' + f$(total)), 'gd');
  renderSales();
  renderProducts();
  renderDash();
  // Show receipt
  if(_saleId) setTimeout(function(){ viewReceipt(_saleId); }, 400);
}

// ── PRODUCTS (8-hour lock system) ──
function renderProducts(){
  var b=biz();if(!b)return;
  var q=(document.getElementById('pq')?document.getElementById('pq').value||'':'').toLowerCase();
  var allProds=b.products||[];
  var prods=allProds.filter(function(p){
    return !q||
      p.name.toLowerCase().includes(q)||
      (p.sku||'').toLowerCase().includes(q)||
      (p.size||'').toLowerCase().includes(q);
  });
  if(prodCat!=='all') prods=prods.filter(function(p){return p.category===prodCat;});

  // Category chips
  var cats=['all'].concat([...new Set(allProds.map(function(p){return p.category;}))]);
  var pchips=el('pchips');
  if(pchips) pchips.innerHTML=cats.map(function(c){
    return '<div class="chip'+(prodCat===c?' on':'')+'" onclick="setProdCat(\''+c+'\')">'+
      (c==='all'?'All Products ('+allProds.length+')':c)+'</div>';
  }).join('');

  var e=el('plist');if(!e)return;
  var lv=b.lowStock||5;
  var adminUser=isAdmin();

  if(!prods.length){
    e.innerHTML='<div style="padding:40px 20px;text-align:center">'+
      '<div style="font-size:44px;margin-bottom:12px;opacity:.25">📦</div>'+
      '<div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--t3);margin-bottom:6px">No Products Yet</div>'+
      '<div style="font-size:12px;color:var(--t4)">Tap the + button to add your first product</div></div>';
    return;
  }

  // Build the product list
  e.innerHTML='<div class="card">'+prods.map(function(p){
    var neg    = p.qty < 0;   // oversold — needs restocking
    var low    = !neg && p.qty<=(p.lowLevel||lv);
    var out    = !neg && p.qty<=0;
    var locked = isProdLocked(p);
    var margin = (p.price>0&&p.cost>0) ? Math.round(((p.price-p.cost)/p.price)*100) : -1;

    // Icon/image
    var imgHtml = getProductImgSrc(p)
      ? '<div class="ci" style="padding:0;overflow:hidden;border:none;flex-shrink:0">'+
          '<img src="'+getProductImgSrc(p)+'" style="width:40px;height:40px;object-fit:cover;border-radius:var(--r10)"></div>'
      : '<div class="ci" style="background:'+(neg?'rgba(239,68,68,.25)':out?'var(--erb)':low?'var(--wab)':'var(--gd)')+';flex-shrink:0">'+
          (locked?'🔒':(CATI[p.category]||'📦'))+'</div>';

    // Status badges
    var badges = '<span class="bdg bdf">'+esc(p.category)+'</span>';
    if(p.sku)   badges += ' <span class="bdg bdf mono">'+esc(p.sku)+'</span>';
    if(p.size)  badges += ' <span class="bdg bg0">'+esc(p.size)+'</span>';
    if(out)     badges += ' <span class="bdg ber0">OUT</span>';
    else if(low)badges += ' <span class="bdg bwa0">LOW</span>';
    if(locked)  badges += ' <span class="bdg bloc" style="font-size:9px">🔒</span>';

    // Margin pill
    var marginHtml = '';
    if(margin >= 0){
      var mc = margin>=40?'var(--ok)':margin>=20?'var(--wa)':'var(--er)';
      var mb = margin>=40?'var(--okb)':margin>=20?'var(--wab)':'var(--erb)';
      marginHtml = '<div style="font-size:9px;font-weight:700;color:'+mc+';background:'+mb+';padding:1px 6px;border-radius:99px;margin-top:3px;display:inline-block;font-family:var(--fm)">'+margin+'% margin</div>';
    }

    // Admin action buttons (always visible for admin)
    var adminBtns = adminUser
      ? '<div style="display:flex;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--bd)">' +
          '<button type="button" class="act-btn" style="flex:1;justify-content:center" onclick="event.stopPropagation();openEditProd('+p.id+')">✏️ Edit</button>' +
          '<button type="button" class="act-btn danger" style="flex:1;justify-content:center" onclick="event.stopPropagation();reqDelProdById('+p.id+',\''+esc(p.name).replace(/'/g,"\\'")+'\')" >🗑️ Delete</button>' +
        '</div>'
      : '';

    return '<div class="cr" style="flex-direction:column;align-items:stretch;padding:12px 14px;border-bottom:1px solid var(--bd);cursor:pointer" onclick="openEditProd('+p.id+')">'+
      '<div style="display:flex;align-items:center;gap:11px">'+
        imgHtml+
        '<div style="flex:1;min-width:0">'+
          '<div class="ct">'+esc(p.name)+'</div>'+
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">'+badges+'</div>'+
        '</div>'+
        '<div style="text-align:right;flex-shrink:0">'+
          '<div class="cv c-g prod-price">'+ ((typeof hasPerm==='function' && !hasPerm('see_product_price')) ? '<span style="color:var(--t3);font-size:12px">🔒</span>' : f$(p.price)) +'</div>'+
          (function(){
      if(!neg) return '<div class="cm" style="color:'+(out?'var(--er)':low?'var(--wa)':'var(--t3)')+'">'+p.qty+' '+p.unit+'</div>';
      var shortage = Math.abs(p.qty);
      var restockCost = (p.cost > 0) ? (shortage * p.cost) : -1;
      var daysAgo = '';
      if(p.wentNegativeAt){
        var d = Math.floor((Date.now()-p.wentNegativeAt)/(1000*60*60*24));
        daysAgo = d <= 0 ? ' · today' : ' · '+d+' day'+(d!==1?'s':'')+' ago';
      }
      return '<div style="margin-top:4px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:6px 8px">'+
        '<div style="font-size:11px;font-weight:800;color:var(--er);display:flex;align-items:center;gap:5px">'+
          '<span>⚠</span><span>SHORT '+shortage+' '+p.unit+daysAgo+'</span>'+
        '</div>'+
        (restockCost>0?'<div style="font-size:10px;color:var(--t3);margin-top:2px">Est. restock cost: '+f$(restockCost)+'</div>':'')+
        '<div style="font-size:10px;color:var(--wa);margin-top:2px;font-weight:600">▲ Add stock to cover shortage</div>'+
      '</div>';
    })() +
          marginHtml+
        '</div>'+
      '</div>'+
      adminBtns+
    '</div>';
  }).join('')+'</div>';
}




// ════════════════════════════════════════════════════════
//  FIREBASE REAL-TIME SYNC ENGINE
//  All staff see the same data on all devices, live.
// ════════════════════════════════════════════════════════
var FB_APP    = null;
var FB_DB     = null;
var FB_REF    = null;
var FB_AUTH    = null;   // Firebase Authentication
var FB_STORAGE = null;   // Firebase Storage (product photos)
var FB_CONFIG  = null;
var FB_READY  = false;
var FB_SYNCING = false;

// ── Load saved Firebase config ──
// ── Hardcoded Firebase config (auto-connects on every load) ──
var FB_DEFAULT_CONFIG = {"apiKey": "AIzaSyDkLLktUImqCsmfqUymkJRkbioiZObLwFY", "authDomain": "smart-stock-cc2a1.firebaseapp.com", "databaseURL": "https://smart-stock-cc2a1-default-rtdb.firebaseio.com", "projectId": "smart-stock-cc2a1", "storageBucket": "smart-stock-cc2a1.firebasestorage.app", "messagingSenderId": "610390619990", "appId": "1:610390619990:web:7a79521319e57d2446c8f7", "measurementId": "G-7CXT3TY4Z4"};

function fbLoadConfig() {
  // Always use the hardcoded config (no manual paste needed)
  FB_CONFIG = FB_DEFAULT_CONFIG;
  // Also persist to localStorage as backup
  try { localStorage.setItem('ss_fb_config', JSON.stringify(FB_CONFIG)); } catch(e) {}
  return true;
}

// ── Save Firebase config ──
function fbSaveConfig(cfg) {
  try { localStorage.setItem('ss_fb_config', JSON.stringify(cfg)); } catch(e) {}
  FB_CONFIG = cfg;
}

// ── Initialize Firebase ──
function fbInit() {
  if (!FB_CONFIG) return false;
  // If Firebase SDK not loaded yet, retry after a short delay
  if (typeof firebase === 'undefined') {
    console.warn('[Firebase] SDK not ready, retrying in 1s...');
    setTimeout(fbInit, 1000);
    return false;
  }
  try {
    // Avoid re-initializing
    if (firebase.apps && firebase.apps.length > 0) {
      FB_APP = firebase.apps[0];
    } else {
      FB_APP = firebase.initializeApp(FB_CONFIG);
    }
    FB_DB  = firebase.database(FB_APP);
    FB_REF = FB_DB.ref('smartstock');
    // Initialize Firebase Auth
    FB_AUTH = firebase.auth(FB_APP);
    // Initialize Firebase Storage
    try {
      FB_STORAGE = firebase.storage(FB_APP);
      console.log('[Firebase Storage] Ready ✓');
    } catch(e) {
      console.warn('[Firebase Storage] Not available:', e.message);
    }
    FB_AUTH.languageCode = 'en';
    // Listen for auth state changes
    FB_AUTH.onAuthStateChanged(function(user) {
      if (user) {
        console.log('[Firebase Auth] User signed in:', user.email);
        // Store Firebase UID in session for reference
        try {
          var sess = JSON.parse(localStorage.getItem('ss_session') || '{}');
          if (sess && sess.uid) {
            sess.fbUid = user.uid;
            localStorage.setItem('ss_session', JSON.stringify(sess));
          }
        } catch(e){}
      } else {
        console.log('[Firebase Auth] User signed out');
      }
    });
    FB_READY = true;
    fbSetupListener();
    setSyncStatus('connected');
    console.log('[Firebase] Connected ✓');
    // If we're on login screen with no users, show sync notice
    try {
      if ((!DB.users || DB.users.length === 0) && !CU) {
        var note = document.getElementById('login-sync-note');
        if (note) note.style.display = '';
      }
    } catch(e){}
    return true;
  } catch(e) {
    console.warn('[Firebase] Init failed:', e.message);
    setSyncStatus('error');
    return false;
  }
}

// ── Real-time listener — updates ALL devices instantly ──
function fbSetupListener() {
  if (!FB_REF) return;
  FB_REF.on('value', function(snapshot) {
    var data = snapshot.val();
    if (!data) { return; }
    if (FB_SYNCING) return;
    try {
      var remote = typeof data === 'string' ? JSON.parse(data) : data;
      if (remote && remote.businesses) {
        // ── ALWAYS keep local users — local is authoritative for passwords ──
        // Firebase stores business data; users/passwords are local-first
        var localUsers      = DB.users && DB.users.length > 0 ? DB.users : null;
        var localNextUserId = DB.nextUserId || 1;

        DB = remote;

        // ALWAYS restore local users (never let Firebase overwrite passwords)
        if (localUsers && localUsers.length > 0) {
          // Merge: use local users as base, add any NEW users from Firebase
          // that don't exist locally (e.g. new staff signed up on another device)
          var mergedUsers = localUsers.slice();  // start with local
          (remote.users || []).forEach(function(remoteUser) {
            var existsLocally = mergedUsers.some(function(lu) {
              return lu.id === remoteUser.id || lu.username === remoteUser.username;
            });
            if (!existsLocally) {
              // Genuinely new user from another device — add them
              mergedUsers.push(remoteUser);
            }
            // If user exists locally: keep local version (preserves password changes)
          });
          DB.users = mergedUsers;
          DB.nextUserId = Math.max(localNextUserId, remote.nextUserId || 1);
        } else if (!DB.users || DB.users.length === 0) {
          // No local users AND no remote users — fresh install
          DB.users = [];
          DB.nextUserId = 1;
        }
        // else: remote has users and we have none locally — keep remote users

        migrateDB();
        try { refreshCurrentPage(); } catch(e2) {}
        setSyncStatus('synced');
      }
    } catch(e) {
      console.warn('[Firebase] Parse error:', e.message);
    }
  }, function(err) {
    console.warn('[Firebase] Listener error:', err.message);
    setSyncStatus('offline');
  });
}

// ── Push local data to Firebase ──
function fbPush() {
  if (!FB_READY || !FB_REF) return;
  if (typeof firebase === 'undefined') return;

  // ── VALIDATE DATA before pushing to Firebase ──
  if (!DB || typeof DB !== 'object') {
    console.warn('[Firebase] Invalid DB — skipping push');
    return;
  }
  // Users array must be valid
  if (DB.users && !Array.isArray(DB.users)) {
    console.warn('[Firebase] DB.users is not an array — skipping push');
    return;
  }
  // All users must have required fields
  var invalidUser = (DB.users || []).find(function(u) {
    return !u || !u.id || !u.username || !u.password;
  });
  if (invalidUser) {
    console.warn('[Firebase] Invalid user data — skipping push:', invalidUser);
    return;
  }
  // All passwords must be hashed (or marked for migration)
  var unhashedUser = (DB.users || []).find(function(u) {
    return u.password && !u.password.startsWith('sha256:') && u.password.length < 60;
    // Plain passwords are shorter than hashes — these need upgrade
  });
  if (unhashedUser && unhashedUser.password.length < 20) {
    // Very short — likely plain text, log warning but allow (migration)
    console.warn('[Firebase] Plain-text password detected for:', unhashedUser.username, '(will upgrade on next login)');
  }

  FB_SYNCING = true;
  FB_REF.set(DB, function(err) {
    FB_SYNCING = false;
    if (err) {
      console.warn('[Firebase] Push failed:', err.message);
      setSyncStatus('offline');
    } else {
      setSyncStatus('synced');
    }
  });
}

// Push ONLY the users array (for password changes — faster + no race condition)
function fbPushUsers() {
  if (!FB_READY || !FB_REF) return;
  if (typeof firebase === 'undefined') return;
  // Validate users before pushing
  if (!Array.isArray(DB.users)) {
    console.warn('[Firebase] Users is not an array — skipping push');
    return;
  }
  // All users must have at minimum: id, username, password
  var allValid = DB.users.every(function(u) {
    return u && u.id && u.username && u.password;
  });
  if (!allValid) {
    console.warn('[Firebase] Some users are invalid — skipping push');
    return;
  }
  try {
    FB_REF.child('users').set(DB.users);
    FB_REF.child('nextUserId').set(DB.nextUserId || 1);
  } catch(e) {
    console.warn('[Firebase] fbPushUsers failed:', e.message);
  }
}

// ── Refresh whichever page is currently showing ──
function refreshCurrentPage() {
  var pages = ['dash','sales','products','customers','expenses','reports','salary','calc','more','gallery'];
  for (var i = 0; i < pages.length; i++) {
    var pg = document.getElementById('pg-' + pages[i]);
    if (pg && pg.classList.contains('on')) {
      try { goTo(pages[i]); } catch(e) {}
      break;
    }
  }
}

// ── Sync status indicator ──
function setSyncStatus(status) {
  var dot  = document.getElementById('sync-dot');
  var lbl  = document.getElementById('sync-lbl');
  var dot2 = document.getElementById('fb-status-dot');
  var txt2 = document.getElementById('fb-status-text');
  var disconnWrap = document.getElementById('fb-disconnect-wrap');

  var states = {
    connected: { color:'#22C55E', text:'Live',    title:'Connected to shared database',        label:'Connected — syncing live' },
    synced:    { color:'#22C55E', text:'Synced',  title:'All changes saved and synced',        label:'All data synced ✓' },
    saving:    { color:'#F59E0B', text:'Saving…', title:'Saving to database…',                 label:'Saving to database…' },
    offline:   { color:'#EF4444', text:'Offline', title:'No internet — changes saved locally', label:'Offline — saved locally' },
    error:     { color:'#EF4444', text:'Error',   title:'Database error — check config',       label:'Error — check config' },
    local:     { color:'#6B7280', text:'Local',   title:'Using local storage (no Firebase)',   label:'Not configured' }
  };
  var s = states[status] || states.local;

  if (dot)  { dot.style.background  = s.color; dot.title = s.title; }
  if (lbl)  { lbl.textContent = s.text; }
  if (dot2) { dot2.style.background = s.color; }
  if (txt2) { txt2.textContent = s.label; txt2.style.color = s.color; }
  if (disconnWrap) {
    disconnWrap.style.display = (status !== 'local') ? '' : 'none';
  }
}

// ── Open Firebase Setup UI ──
function openFBSetup() {
  // ── DATABASE SYNC HIDDEN ──
  // The Firebase config menu has been removed from the app UI for everyone.
  // Firebase still auto-connects silently on startup from saved localStorage config.
  // This function is kept as a no-op so any legacy calls don\'t crash.
  // To re-enable manual access, restore the menu item in the sidebar and remove this gate.
  console.log("[openFBSetup] Menu is hidden — auto-connect runs silently.");
  return;
}

// ── Save Firebase config from UI ──
function saveFBConfig() {
  var input = document.getElementById('fb-config-input');
  if (!input || !input.value.trim()) { toast('Paste your Firebase config first', 'er'); return; }
  var raw = input.value.trim();
  // Accept both JSON object and the firebaseConfig = {...} format
  raw = raw.replace(/^.*?=\s*/, '').replace(/;?\s*$/, '');
  try {
    var cfg = JSON.parse(raw);
    if (!cfg.apiKey || !cfg.databaseURL) {
      toast('Config missing apiKey or databaseURL', 'er');
      return;
    }
    fbSaveConfig(cfg);
    document.getElementById('d-fbsetup').classList.remove('on');
    // Re-initialize with new config
    FB_APP = null; FB_DB = null; FB_REF = null; FB_READY = false;
    // Delete existing app if present, then re-init
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebase.apps[0].delete().then(function() { setTimeout(fbInit, 300); });
      } else {
        setTimeout(fbInit, 300);
      }
    } catch(e) {
      setTimeout(fbInit, 500);
    }
    // Push current local data to the new database
    setTimeout(fbPush, 1000);
    toast('Firebase connected! Syncing data…', 'gd');
  } catch(e) {
    toast('Invalid config — paste the full JSON object', 'er');
  }
}

// ── Disconnect Firebase ──
function fbDisconnect() {
  localStorage.removeItem('ss_fb_config');
  FB_CONFIG = null; FB_READY = false;
  if (FB_REF) { try { FB_REF.off(); } catch(e) {} }
  FB_REF = null; FB_DB = null; FB_APP = null;
  setSyncStatus('local');
  toast('Disconnected — using local storage');
  document.getElementById('d-fbsetup').classList.remove('on');
}

// ── Export / import full backup ──
function exportBackup() {
  var json = JSON.stringify(DB, null, 2);
  var blob = new Blob([json], {type:'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'SmartStock_backup_' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded!', 'gd');
}


// ════════════════════════════════════════════════════════
//  IMAGE CROPPER ENGINE
//  Touch + mouse support, pinch-to-zoom, drag to pan
// ════════════════════════════════════════════════════════
var _cropCallback = null;
var _cropImg      = new Image();
var _cropCtx      = null;
var _cropCanvas   = null;
var _cropFrame    = null;
var _cropScale    = 1.0;
var _cropOffX     = 0;
var _cropOffY     = 0;
var _cropDragging = false;
var _cropLastX    = 0;
var _cropLastY    = 0;
var _cropPinchDist = 0;
var _cropFrameSize = 0;

function openCropModal(imageSrc, callback) {
  _cropCallback = callback;
  _cropCanvas   = document.getElementById('crop-canvas');
  _cropFrame    = document.getElementById('crop-frame');
  _cropCtx      = _cropCanvas ? _cropCanvas.getContext('2d') : null;
  if (!_cropCanvas || !_cropCtx) {
    // Fallback: no canvas support, use image directly
    callback(imageSrc);
    return;
  }

  _cropImg = new Image();
  _cropImg.onload = function() {
    // Set canvas size to fill the viewport
    var wrap = document.getElementById('crop-canvas-wrap');
    var ww   = wrap ? wrap.offsetWidth  : window.innerWidth;
    var wh   = wrap ? wrap.offsetHeight : window.innerHeight - 160;
    _cropCanvas.width  = ww;
    _cropCanvas.height = wh;

    // Frame = square, 80% of smaller dimension
    _cropFrameSize = Math.floor(Math.min(ww, wh) * 0.80);
    var fx = (ww - _cropFrameSize) / 2;
    var fy = (wh - _cropFrameSize) / 2;
    if (_cropFrame) {
      _cropFrame.style.left   = fx + 'px';
      _cropFrame.style.top    = fy + 'px';
      _cropFrame.style.width  = _cropFrameSize + 'px';
      _cropFrame.style.height = _cropFrameSize + 'px';
    }

    // Fit image to fill the frame initially
    var imgAspect = _cropImg.width / _cropImg.height;
    if (imgAspect >= 1) {
      _cropScale = _cropFrameSize / _cropImg.height;
    } else {
      _cropScale = _cropFrameSize / _cropImg.width;
    }
    // Center image
    _cropOffX = (ww - _cropImg.width * _cropScale) / 2;
    _cropOffY = (wh - _cropImg.height * _cropScale) / 2;

    // Reset zoom slider
    var slider = document.getElementById('crop-zoom-slider');
    if (slider) slider.value = 100;

    drawCrop();
    setupCropEvents();
    document.getElementById('crop-modal').classList.add('on');
  };
  _cropImg.src = imageSrc;
}

function drawCrop() {
  if (!_cropCtx || !_cropCanvas) return;
  var w = _cropCanvas.width;
  var h = _cropCanvas.height;
  _cropCtx.clearRect(0, 0, w, h);
  _cropCtx.drawImage(
    _cropImg,
    _cropOffX, _cropOffY,
    _cropImg.width * _cropScale,
    _cropImg.height * _cropScale
  );
}

function setupCropEvents() {
  var c = _cropCanvas;
  if (!c) return;

  // Remove old listeners by cloning
  var newC = c.cloneNode(true);
  c.parentNode.replaceChild(newC, c);
  _cropCanvas = newC;
  _cropCtx    = _cropCanvas.getContext('2d');

  // Touch events (mobile)
  _cropCanvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      _cropDragging = true;
      _cropLastX = e.touches[0].clientX;
      _cropLastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      _cropPinchDist = getPinchDist(e);
    }
  }, { passive: false });

  _cropCanvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (e.touches.length === 1 && _cropDragging) {
      var dx = e.touches[0].clientX - _cropLastX;
      var dy = e.touches[0].clientY - _cropLastY;
      _cropOffX += dx;
      _cropOffY += dy;
      _cropLastX = e.touches[0].clientX;
      _cropLastY = e.touches[0].clientY;
      drawCrop();
    } else if (e.touches.length === 2) {
      var newDist = getPinchDist(e);
      if (_cropPinchDist > 0) {
        var ratio = newDist / _cropPinchDist;
        var cx = (_cropCanvas.width  / 2 - _cropOffX) / _cropScale;
        var cy = (_cropCanvas.height / 2 - _cropOffY) / _cropScale;
        _cropScale = Math.max(0.3, Math.min(5, _cropScale * ratio));
        _cropOffX  = _cropCanvas.width  / 2 - cx * _cropScale;
        _cropOffY  = _cropCanvas.height / 2 - cy * _cropScale;
        var slider = document.getElementById('crop-zoom-slider');
        if (slider) slider.value = Math.round(_cropScale * 100);
        drawCrop();
      }
      _cropPinchDist = newDist;
    }
  }, { passive: false });

  _cropCanvas.addEventListener('touchend', function(e) {
    _cropDragging = false;
    _cropPinchDist = 0;
  });

  // Mouse events (desktop)
  _cropCanvas.addEventListener('mousedown', function(e) {
    _cropDragging = true;
    _cropLastX = e.clientX;
    _cropLastY = e.clientY;
  });
  _cropCanvas.addEventListener('mousemove', function(e) {
    if (!_cropDragging) return;
    _cropOffX += e.clientX - _cropLastX;
    _cropOffY += e.clientY - _cropLastY;
    _cropLastX = e.clientX;
    _cropLastY = e.clientY;
    drawCrop();
  });
  _cropCanvas.addEventListener('mouseup', function() { _cropDragging = false; });
}

function getPinchDist(e) {
  var dx = e.touches[0].clientX - e.touches[1].clientX;
  var dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

function onCropZoom(val) {
  var newScale = val / 100;
  var cx = (_cropCanvas.width  / 2 - _cropOffX) / _cropScale;
  var cy = (_cropCanvas.height / 2 - _cropOffY) / _cropScale;
  _cropScale = Math.max(0.3, Math.min(5, newScale));
  _cropOffX  = _cropCanvas.width  / 2 - cx * _cropScale;
  _cropOffY  = _cropCanvas.height / 2 - cy * _cropScale;
  drawCrop();
}

function applyCrop() {
  if (!_cropCanvas || !_cropCtx || !_cropCallback) { closeCropModal(); return; }
  var w   = _cropCanvas.width;
  var h   = _cropCanvas.height;
  var fs  = _cropFrameSize;
  var fx  = (w - fs) / 2;
  var fy  = (h - fs) / 2;

  // Create output canvas (square 600×600 for good quality)
  var out = document.createElement('canvas');
  out.width  = 600;
  out.height = 600;
  var octx = out.getContext('2d');
  octx.drawImage(_cropCanvas, fx, fy, fs, fs, 0, 0, 600, 600);

  var result = out.toDataURL('image/jpeg', 0.85);
  closeCropModal();
  _cropCallback(result);
}

function closeCropModal() {
  var modal = document.getElementById('crop-modal');
  if (modal) modal.classList.remove('on');
  _cropCallback  = null;
  _cropDragging  = false;
  _cropPinchDist = 0;
}


// ════════════════════════════════════════════════════════
//  LIVE PRODUCT PREVIEW
// ════════════════════════════════════════════════════════
function updateProdPreview() {
  var card = document.getElementById('prod-preview-card');
  if (!card) return;

  // Read all field values
  var name   = gv('pname');
  var sku    = gv('psku');
  var catEl  = document.getElementById('pcat');
  var cat    = catEl ? catEl.value : 'Other';
  if (cat === '__custom__') { var cc = gv('pcat-custom'); if (cc) cat = cc; }
  var cost   = parseFloat(document.getElementById('pcost')  ? document.getElementById('pcost').value  : 0) || 0;
  var price  = parseFloat(document.getElementById('pprice') ? document.getElementById('pprice').value : 0) || 0;
  var qty    = parseInt(document.getElementById('pqty')    ? document.getElementById('pqty').value    : 0) || 0;
  var unitEl = document.getElementById('punit');
  var unit   = unitEl ? unitEl.value : 'Box';
  var size   = gv('psize');
  var lowEl  = document.getElementById('plow');
  var low    = parseInt(lowEl ? lowEl.value : 5) || 5;

  // Check if there's anything to preview
  var hasContent = name || price > 0 || qty > 0 || sku;
  card.style.display = hasContent ? '' : 'none';
  if (!hasContent) return;

  // ── Name ──
  var nameEl = document.getElementById('prev-name');
  if (nameEl) nameEl.textContent = name || 'Product Name';

  // ── Category badge + icon ──
  var catBadge = document.getElementById('prev-cat-badge');
  var catIcon  = document.getElementById('prev-cat-icon');
  if (catBadge) catBadge.textContent = cat;
  if (catIcon) {
    var CATI2 = {Tiles:'🟦',Cement:'🏗️',Tools:'🔧',Paint:'🎨',Plumbing:'🚰',Electrical:'⚡',Accessories:'🔩',Other:'📦',General:'📦'};
    catIcon.textContent = CATI2[cat] || '📦';
  }

  // ── Image preview in card ──
  var imgWrap = document.getElementById('prev-img-wrap');
  var thumb   = document.getElementById('pimgthumb');
  if (imgWrap) {
    if (thumb && thumb.src && thumb.src.length > 100) {
      imgWrap.innerHTML = '<img src="' + thumb.src + '" style="width:100%;height:100%;object-fit:cover">';
    } else {
      var CATI3 = {Tiles:'🟦',Cement:'🏗️',Tools:'🔧',Paint:'🎨',Plumbing:'🚰',Electrical:'⚡',Accessories:'🔩',Other:'📦',General:'📦'};
      imgWrap.innerHTML = '<span id="prev-cat-icon" style="font-size:22px">' + (CATI3[cat] || '📦') + '</span>';
    }
  }

  // ── SKU badge ──
  var skuBadge = document.getElementById('prev-sku-badge');
  if (skuBadge) {
    skuBadge.textContent = sku;
    skuBadge.style.display = sku ? '' : 'none';
  }

  // ── Size badge ──
  var sizeBadge = document.getElementById('prev-size-badge');
  if (sizeBadge) {
    sizeBadge.textContent = size;
    sizeBadge.style.display = size ? '' : 'none';
  }

  // ── Stock badge ──
  var stockBadge = document.getElementById('prev-stock-badge');
  if (stockBadge) {
    if (qty <= 0) {
      stockBadge.textContent = 'OUT OF STOCK';
      stockBadge.style.background = 'var(--erb)';
      stockBadge.style.color      = 'var(--er)';
      stockBadge.style.border     = '1px solid var(--erbd)';
      stockBadge.style.display    = '';
    } else if (qty <= low) {
      stockBadge.textContent = 'LOW STOCK';
      stockBadge.style.background = 'var(--wab)';
      stockBadge.style.color      = 'var(--wa)';
      stockBadge.style.border     = '1px solid var(--wabd)';
      stockBadge.style.display    = '';
    } else {
      stockBadge.textContent = 'IN STOCK';
      stockBadge.style.background = 'var(--okb)';
      stockBadge.style.color      = 'var(--ok)';
      stockBadge.style.border     = '1px solid var(--okbd)';
      stockBadge.style.display    = '';
    }
  }

  // ── Price ──
  var priceEl = document.getElementById('prev-price');
  if (priceEl) {
    priceEl.textContent = price > 0 ? f$(price) : '--';
    priceEl.style.color = 'var(--g)';
  }

  // ── Qty ──
  var qtyEl = document.getElementById('prev-qty');
  if (qtyEl) {
    qtyEl.textContent = qty + ' ' + unit;
    qtyEl.style.color = qty <= 0 ? 'var(--er)' : qty <= low ? 'var(--wa)' : 'var(--t3)';
  }

  // ── Margin bar ──
  var barWrap   = document.getElementById('prev-margin-bar-wrap');
  var costBar   = document.getElementById('prev-cost-bar');
  var marginPct = document.getElementById('prev-margin-pct');
  var costLbl   = document.getElementById('prev-cost-lbl');
  var priceLbl2 = document.getElementById('prev-price-lbl');
  var marginEl  = document.getElementById('prev-margin');

  if (cost > 0 && price > 0) {
    if (barWrap) barWrap.style.display = '';
    var pct    = Math.round(((price - cost) / price) * 100);
    var costPc = Math.round((cost / price) * 100);
    if (costBar)   costBar.style.width   = Math.min(costPc, 100) + '%';
    if (costLbl)   costLbl.textContent   = f$(cost);
    if (priceLbl2) priceLbl2.textContent = f$(price);
    if (marginPct) {
      marginPct.textContent = pct + '% margin';
      marginPct.style.color = pct >= 40 ? 'var(--ok)' : pct >= 20 ? 'var(--wa)' : 'var(--er)';
    }
    if (marginEl) {
      marginEl.style.display    = '';
      marginEl.textContent      = pct + '%';
      marginEl.style.background = pct >= 40 ? 'var(--okb)'  : pct >= 20 ? 'var(--wab)'  : 'var(--erb)';
      marginEl.style.color      = pct >= 40 ? 'var(--ok)'   : pct >= 20 ? 'var(--wa)'   : 'var(--er)';
    }
  } else {
    if (barWrap) barWrap.style.display = 'none';
    if (marginEl) marginEl.style.display = 'none';
  }
}



// ── RESTORED PRODUCT FUNCTIONS ──
function openAddProd(){
  if(!canAccess('products')){toast('No access','er');return;}
  editProdId=null;el('dp-ttl').textContent='Add Product';el('psavebtn').textContent='Save Product';el('prod-lock-banner').style.display='none';
  ['pname','psku','pcost','pprice','pqty','plow','pdesc','psize'].forEach(id=>sv(id,''));sv('pcat','Tiles');sv('punit','Box');
  el('pdelbtn').style.display='none';el('pshtbtn').style.display='none';if(el('pcat-custom'))el('pcat-custom').style.display='none';if(el('pcat'))el('pcat').value='Tiles';clearProdImg();openD('d-prod');setTimeout(()=>el('pname')?.focus(),300);
}

function saveProd(_saveMode){
  const b=biz();if(!b)return;const name=gv('pname'),price=parseFloat(el('pprice')?.value)||0;
  if(!name){toast('Product name required','er');return;}if(price<=0){toast('Selling price required','er');return;}
  const imgDataRaw=getProdImgData();const now=Date.now();
  const prod={name,sku:gv('psku'),category:getProdCat(),cost:parseFloat(el('pcost')?.value)||0,price,qty:parseFloat(el('pqty')?.value)||0,unit:el('punit')?.value||'Box',lowLevel:parseInt(el('plow')?.value)||(b.lowStock||5),desc:gv('pdesc'),size:gv('psize'),imgData:imgDataRaw,imgUrl:'',updatedAt:now,status:'active'};
  if(editProdId!==null){
    const i=(b.products||[]).findIndex(x=>x.id===editProdId);
    if(i>-1){
      const oldName=b.products[i].name;
      b.products[i]={...b.products[i],...prod};
      if(b.products[i].adminUnlocked){delete b.products[i].adminUnlocked;delete b.products[i].adminUnlockedBy;}
      DB.changeRequests.filter(r=>r.prodId===editProdId&&r.status==='approved').forEach(r=>{r.status='completed';r.resolvedAt=now;});
      // Sync name change to all existing sales
      if(oldName!==name){
        (b.sales||[]).forEach(function(s){
          (s.items||[]).forEach(function(it){if(it.prodId===editProdId)it.name=name;});
        });
      }
    }
    addAdminLog('edit_prod','Edited: '+name,CU.name);toast('Product updated!');
  }else{
    if(!b.products)b.products=[];prod.id=b.nextProdId++;prod.createdAt=now;b.products.unshift(prod);
    addAdminLog('add_prod','Added: '+name,CU.name);addNotif('product','📦 New: '+name+' by '+CU.name);toast('Product added!');
  }
  dbSave();renderProducts();renderDash();renderGallery();checkNotif();
  if(_saveMode==='addnew'){ toast('Saved! Add another product','gd'); setTimeout(function(){openAddProd();},150); }
  else { closeD('d-prod'); }
}

function setProdCat(c){prodCat=c;renderProducts();}

function clearProdImg(){['pimg-cam','pimg-gal'].forEach(id=>{const e=el(id);if(e){e.dataset.img='';e.value='';}});const w=el('pimg-prev-wrap');if(w)w.style.display='none';const u=el('pimg-upload-area');if(u)u.style.display='';}

function openEditProd(id){
  if(!canAccess('products')){toast('No access','er');return;}
  const b=biz();const p=(b.products||[]).find(x=>x.id===id);if(!p)return;
  const locked=isProdLocked(p);
  if(locked&&!isAdmin()){
    pendingCRProdId=id;el('cr-prod-name').textContent=`"${p.name}" — locked for ${prodLockRem(p)} more`;
    sv('cr-changes','');sv('cr-urgency','normal');openD('d-changereq');return;
  }
  editProdId=id;el('dp-ttl').textContent='Edit Product';el('psavebtn').textContent='Update Product';
  el('prod-lock-banner').style.display=locked&&isAdmin()?'':'none';
  sv('pname',p.name);sv('psku',p.sku||'');sv('pcat-custom','');
  const stdCats=['Tiles','Cement','Tools','Paint','Plumbing','Electrical','Accessories','Other'];
  const catSel=el('pcat');
  if(catSel){if(stdCats.includes(p.category))catSel.value=p.category;else{catSel.value='__custom__';sv('pcat-custom',p.category);if(el('pcat-custom'))el('pcat-custom').style.display='';}};sv('pcost',p.cost);sv('pprice',p.price);sv('pqty',p.qty);sv('punit',p.unit);sv('plow',p.lowLevel||'');sv('pdesc',p.desc||'');sv('psize',p.size||'');
  el('pdelbtn').style.display=canDel()?'':'none';el('pshtbtn').style.display='';
  if(p.imgData){['pimg-cam','pimg-gal'].forEach(x=>{const e2=el(x);if(e2)e2.dataset.img=p.imgData;});el('pimgthumb').src=p.imgData;el('pimg-prev-wrap').style.display='';el('pimg-upload-area').style.display='none';}else clearProdImg();
  openD('d-prod');
}

function reqDelProd(){
  const b=biz();const p=(b.products||[]).find(x=>x.id===editProdId);if(!p)return;
  showConf('🗑️','Delete Product?',`"${p.name}" will be permanently removed.`,()=>{
    b.products=b.products.filter(x=>x.id!==p.id);addAdminLog('del_prod','Deleted: '+p.name,CU.name);
    dbSave();closeD('d-prod');renderProducts();renderGallery();renderDash();toast('Product deleted');
  });
}

function downloadSheet(){
  const b=biz();const p=(b.products||[]).find(x=>x.id===editProdId);if(!p)return;
  const w=window.open('','_blank');if(!w)return;const mg=p.price-p.cost,mp=p.cost>0?((mg/p.price)*100).toFixed(1):0;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${p.name}</title><style>body{font-family:Georgia,serif;max-width:580px;margin:36px auto;padding:20px;color:#111}*{box-sizing:border-box}h1{font-size:19px;font-weight:900;color:#B8900A}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:13px 0}.fl{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.1em;display:block;margin-bottom:3px}.fv{font-size:17px;font-weight:900;color:#D4A520}.img{width:100px;height:100px;border-radius:10px;border:2px solid #D4A520;display:flex;align-items:center;justify-content:center;font-size:38px;background:#f5f0e6;float:left;margin:0 14px 10px 0;overflow:hidden}.img img{width:100%;height:100%;object-fit:cover;border-radius:8px}hr{border:none;border-top:3px solid #D4A520;margin:11px 0}.foot{text-align:center;font-size:10px;color:#999;margin-top:11px}@media print{button{display:none}}</style></head><body><div class="img">${p.imgData?`<img src="${p.imgData}">`:(CATI[p.category]||'📦')}</div><h1>${p.name}</h1><div style="font-size:11px;color:#B8900A;font-family:monospace;margin-bottom:4px">SKU: ${p.sku||'N/A'}</div>${p.size?`<div style="font-size:12px;color:#666;margin-bottom:5px">Size: <strong>${p.size}</strong></div>`:''}<span style="background:#f5f0e6;border:1px solid #D4A520;border-radius:99px;padding:2px 11px;font-size:11px;font-weight:700;color:#B8900A">${p.category}</span><hr style="clear:both"><div class="grid"><div><span class="fl">Cost</span><span class="fv">${sym()}${p.cost.toFixed(2)}</span></div><div><span class="fl">Sell Price</span><span class="fv">${sym()}${p.price.toFixed(2)}</span></div><div><span class="fl">Margin</span><span class="fv">${mp}%</span></div><div><span class="fl">In Stock</span><span class="fv">${p.qty} ${p.unit}</span></div><div><span class="fl">Low Alert</span><span class="fv">${p.lowLevel||b.lowStock||5}</span></div><div><span class="fl">Status</span><span class="fv" style="color:${p.qty<=0?'#EF4444':p.qty<=(p.lowLevel||5)?'#F59E0B':'#22C55E'}">${p.qty<=0?'OUT':p.qty<=(p.lowLevel||5)?'LOW':'OK'}</span></div></div>${p.desc?`<div style="background:#f9f7f2;border:1px solid #e8e0cc;border-radius:8px;padding:11px;font-size:13px;color:#555;line-height:1.6;margin-bottom:11px">${p.desc}</div>`:''}<div class="foot">${b.name} · Printed ${new Date().toLocaleString()}</div><br><button onclick="window.print()" style="background:#D4A520;color:#000;border:none;padding:9px 22px;border-radius:8px;font-weight:700;cursor:pointer">🖨 Print</button>` + '</bo' + 'dy></ht' + 'ml>');w.document.close();
}

// ── EXPENSES (admin edit) ──


function triggerPWAInstall() {
  if (window.triggerPWAInstall && window.triggerPWAInstall !== triggerPWAInstall) {
    window.triggerPWAInstall();
  } else {
    window.showManualInstallGuide ? window.showManualInstallGuide() :
    alert('Tap the 3-dot menu (⋮) in Chrome→ "Add to Home screen" → "Add"');
  }
}

// ── EXPENSES (admin edit) ──
function fillExpSummary(){const b=biz();if(!b)return;const e=(b.expenses||[]).filter(x=>x.status!=='cancelled');const ts=arr=>arr.reduce((a,b)=>a+(b.amount||0),0);el('et').textContent=f$(ts(e.filter(x=>isToday(x.date))));el('ew').textContent=f$(ts(e.filter(x=>isWeek(x.date))));el('em').textContent=f$(ts(e.filter(x=>isMon(x.date))));}
function setEF(f,e){expFilter=f;document.querySelectorAll('#pg-expenses .chip').forEach(c=>c.classList.remove('on'));e&&e.classList.add('on');renderExpenses();}
function renderExpenses(){
  var b=biz();if(!b)return;fillExpSummary();
  var exps=(b.expenses||[]).filter(function(e){
    return e.status!=='cancelled'&&(
      expFilter==='all'||
      (expFilter==='today'&&isToday(e.date))||
      (expFilter==='week' &&isWeek(e.date))||
      (expFilter==='month'&&isMon(e.date)));
  }).sort(function(a,b){return b.id-a.id;});
  var wrap=el('elist');if(!wrap)return;
  var dn=getDailyNet(today());
  var allocOn = (b.allocationsEnabled !== false);
  var allocCalcLine = '';
  if (allocOn && dn.allocExp > 0.01) {
    allocCalcLine =
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--t3);padding-left:10px"><span>↳ Cash expenses</span><span>'+f$(dn.actualExp)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--wa);padding-left:10px"><span>↳ 📋 Allocated</span><span>'+f$(dn.allocExp)+'</span></div>';
  }
  var h2=
    '<div class="card" style="margin-bottom:10px;padding:13px">'+
      '<div style="font-size:10px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.08em;margin-bottom:9px">Today\'s Net Calculation</div>'+
      '<div style="display:flex;flex-direction:column;gap:5px">'+
        '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--t2)">Gross Sales</span><span class="fw7 c-ok">'+f$(dn.gross)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--t2)">Total Expenses</span><span class="fw7 c-er">− '+f$(dn.exp)+'</span></div>'+
        allocCalcLine+
        '<div style="height:1px;background:var(--bd);margin:4px 0"></div>'+
        '<div style="display:flex;justify-content:space-between;font-size:15px"><span class="fw7">Net Sales</span>'+
          '<span class="fw9 disp" style="color:'+(dn.net>=dn.gross*0.7?'var(--ok)':'var(--wa)')+'">'+f$(dn.net)+'</span>'+
        '</div>'+
      '</div>'+
    '</div>';
  if(!exps.length && (!allocOn || dn.allocExp <= 0.01)){h2+=em('No expenses. Tap + to add.');wrap.innerHTML=h2;return;}
  h2+='<div class="card">';
  exps.forEach(function(e){
    var safeDesc=(e.description||'Expense').replace(/['"]/g,'');
    var editBadge=e.editLog&&e.editLog.length?' <span class="bdg bin0" style="font-size:9px">&#9999;'+e.editLog.length+'</span>':'';
    var lockBadge=(!isAdmin()&&isRecordLocked(e))?' <span class="bdg bwa0" style="font-size:9px">&#9203;</span>':'';
    var adminBtns=
      '<button type="button" class="edit-btn" style="margin-top:4px" onclick="openEditExp('+e.id+')">&#9998;</button> '+
      '<button type="button" class="edit-btn" style="margin-top:4px;color:var(--er);border-color:var(--erbd);background:var(--erb)" onclick="deleteExpense('+e.id+')">&#128465;</button>';
    var pendingBtns=hasPendingCR('expense',e.id)
      ?'<span class="pending-badge" style="margin-top:4px;display:block">&#9203; Pending</span>'
      :'<button type="button" class="edit-btn" style="margin-top:4px;color:var(--wa);border-color:var(--wabd);background:var(--wab)" onclick="openRecordChangeRequest(\'expense\','+e.id+',\''+safeDesc+'\')">&#9203; Req</button>';
    var editBtns=
      '<button type="button" class="edit-btn" style="margin-top:4px" onclick="openEditExp('+e.id+')">&#9998;</button> '+
      '<button type="button" class="edit-btn" style="margin-top:4px;color:var(--er);border-color:var(--erbd);background:var(--erb)" onclick="deleteExpense('+e.id+')">&#128465;</button>';
    var actionBtns=isAdmin()?adminBtns:(isRecordLocked(e)?pendingBtns:editBtns);
    h2+=
      '<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(212,165,32,.06)">'+
        '<div class="ci" style="background:var(--erb)">&#128424;</div>'+
        '<div class="cb">'+
          '<div class="ct">'+esc(e.description)+editBadge+lockBadge+'</div>'+
          '<div class="cs">'+esc(e.category||'General')+' · '+e.date+' · by '+esc(e.by||'')+'</div>'+
        '</div>'+
        '<div style="text-align:right;flex-shrink:0">'+
          '<div class="fw9 c-er" style="font-family:var(--fd);font-size:14px">&#8722;'+f$(e.amount)+'</div>'+
          actionBtns+
        '</div>'+
      '</div>';
  });
  h2+='</div>';
  // ── ALLOCATED ENTRIES (read-only, only when toggle ON) ──
  if (allocOn && typeof getDayAllocations === 'function') {
    // Determine date range based on filter
    var allocStart, allocEnd;
    if (expFilter === 'today') { allocStart = allocEnd = today(); }
    else if (expFilter === 'week') {
      var dW = new Date(today() + 'T00:00:00');
      var wa = new Date(dW); wa.setDate(dW.getDate() - 6);
      allocStart = wa.toISOString().split('T')[0];
      allocEnd = today();
    } else if (expFilter === 'month') {
      var dM = new Date(today() + 'T00:00:00');
      allocStart = new Date(dM.getFullYear(), dM.getMonth(), 1).toISOString().split('T')[0];
      allocEnd = today();
    } else { /* all */
      allocStart = '1900-01-01';
      allocEnd = today();
    }
    // Aggregate allocations per source across the range
    var sourceMap = {};
    var cur = new Date(allocStart + 'T00:00:00');
    var endD = new Date(allocEnd + 'T00:00:00');
    while (cur <= endD) {
      var iso = cur.toISOString().split('T')[0];
      var a = getDayAllocations(iso);
      if (a && a.breakdown && a.breakdown.length) {
        a.breakdown.forEach(function(b2){
          var key = b2.type + '-' + b2.id;
          if (!sourceMap[key]) {
            sourceMap[key] = { type: b2.type, name: b2.name, id: b2.id, days: 0, total: 0 };
          }
          sourceMap[key].days++;
          sourceMap[key].total += b2.amount;
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
    var allocList = Object.values(sourceMap);
    if (allocList.length) {
      h2 += '<div class="card" style="margin-top:14px">'+
        '<div style="padding:11px 14px;background:rgba(245,158,11,.06);border-bottom:1px solid rgba(245,158,11,.2);display:flex;align-items:center;justify-content:space-between">'+
          '<div>'+
            '<div style="font-size:11px;font-weight:800;color:var(--wa);text-transform:uppercase;letter-spacing:.08em;font-family:var(--fm)">📋 Allocated Expenses</div>'+
            '<div style="font-size:10px;color:var(--t3);margin-top:1px">Read-only · auto-calculated from documents &amp; salaries</div>'+
          '</div>'+
        '</div>';
      allocList.forEach(function(a){
        var icon = a.type === 'doc' ? '📋' : '👤';
        var sourceLbl = a.type === 'doc' ? 'Documentation' : 'Salary';
        var editPage = a.type === 'doc' ? 'docexp' : 'salary';
        h2 += '<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(212,165,32,.06)">'+
          '<div class="ci" style="background:rgba(245,158,11,.12)">'+icon+'</div>'+
          '<div class="cb">'+
            '<div class="ct">'+esc(a.name)+' <span class="bdg bwa0" style="font-size:9px">🔒 read-only</span></div>'+
            '<div class="cs">'+sourceLbl+' · '+a.days+' day'+(a.days!==1?'s':'')+' · '+
              (isAdmin() ? '<a onclick="closeSidebarMenu();goTo(\''+editPage+'\')" style="color:var(--in);cursor:pointer;text-decoration:underline">edit in '+sourceLbl+'</a>' : 'manage in '+sourceLbl)+
            '</div>'+
          '</div>'+
          '<div style="text-align:right;flex-shrink:0">'+
            '<div class="fw9 c-wa" style="font-family:var(--fd);font-size:14px">−'+f$(a.total)+'</div>'+
            '<div style="font-size:9px;color:var(--t3);margin-top:2px">'+f$(a.total/a.days)+'/day</div>'+
          '</div>'+
        '</div>';
      });
      h2 += '</div>';
    }
  }
  wrap.innerHTML=h2;
}
function openAddExp(){
  if(!canAccess('expenses')){toast('No access','er');return;}
  editingExpId=null;el('exp-dr-ttl').textContent='Add Expense';el('exp-reason-wrap').style.display='none';el('exp-save-btn').textContent='💸 Save Expense';el('exp-save-btn').className='btn ber bbl mt8';
  sv('exd',today());sv('exa','');sv('exdesc','');sv('exc','General');sv('exp-reason','');
  openD('d-exp');setTimeout(()=>el('exa')?.focus(),300);
}
function openEditExp(expId){
  const b=biz();const e=(b.expenses||[]).find(x=>x.id===expId);if(!e)return;
  // If record is locked AND user is not admin AND no admin unlock
  if(isRecordLocked(e)&&!isAdmin()&&!e.adminUnlocked){
    openRecordChangeRequest('expense',expId,e.description||('Expense #'+expId));return;
  }
  if(!isAdmin()){toast('Admin access required','er');return;}
  // Skip PIN if expense is within the 3-hour grace window
  var __doEditExp = function(){
    editingExpId=expId;el('exp-dr-ttl').textContent='Edit Expense (Admin)';el('exp-reason-wrap').style.display='';el('exp-save-btn').textContent='💾 Update Expense';el('exp-save-btn').className='btn bg bbl mt8';
    sv('exd',e.date);sv('exa',e.amount);sv('exdesc',e.description);sv('exc',e.category||'General');sv('exp-reason','');
    openD('d-exp');setTimeout(()=>el('exp-reason')?.focus(),300);
  };
  if (!isRecordLocked(e)) { __doEditExp(); return; }
  requireAdminPin(__doEditExp, null, 'Edit Expense — enter admin password (locked: older than 3h)');
}
function saveExpense(_saveMode){
  const b=biz();if(!b)return;const date=el('exd')?.value||today(),amount=parseFloat(el('exa')?.value)||0,desc=gv('exdesc'),cat=el('exc')?.value||'General';
  if(amount<=0){toast('Enter a valid amount','er');return;}if(!desc){toast('Description required','er');return;}const now=Date.now();
  if(editingExpId){
    const reason=gv('exp-reason');if(!reason){toast('Reason for edit required','er');return;}
    const e=(b.expenses||[]).find(x=>x.id===editingExpId);if(!e)return;
    const before={date:e.date,amount:e.amount,description:e.description,category:e.category};
    e.date=date;e.amount=amount;e.description=desc;e.category=cat;e.updatedAt=now;
    if(!e.editLog)e.editLog=[];e.editLog.push({by:CU.name,at:now,reason,before});
    addAdminLog('edit_exp',`Edited Expense: ${f$(amount)} — ${desc} (${reason})`,CU.name);toast('Expense updated!');
  }else{
    if(!b.expenses)b.expenses=[];if(!b.nextExpId)b.nextExpId=1;
    b.expenses.unshift({id:b.nextExpId++,date,amount,description:desc,category:cat,by:CU?.name||'unknown',createdAt:now,updatedAt:now,status:'active',editLog:[]});
    addAdminLog('add_exp',`Expense: ${f$(amount)} — ${desc}`,CU.name);addNotif('expense',`💸 ${f$(amount)} — ${desc}`);toast(`Expense ${f$(amount)} saved`);
  }
  dbSave();fillExpSummary();renderExpenses();renderDash();checkNotif();editingExpId=null;
  if(_saveMode==='addnew'){ toast('Saved! Add another expense','gd'); setTimeout(function(){openAddExp();},150); }
  else { closeD('d-exp'); }
}
function deleteExpense(id){
  if(!isAdmin()){
    const b=biz();const e=(b.expenses||[]).find(x=>x.id===id);
    if(!e)return;
    if(isRecordLocked(e)){openRecordChangeRequest('expense',id,e.description||('Expense #'+id));el('rec-cr-action').value='delete';return;}
    toast('Admin access required','er');return;
  }
  requireAdminPin(function(){
    showConf('🗑️','Delete Expense?','This expense will be permanently removed.',function(){
      var b=biz();
      var expToDelete=(b.expenses||[]).find(function(x){return x.id===id;});
      if(expToDelete){ softDelete(expToDelete); }
      addAdminLog('del_exp','Deleted expense',CU.name);dbSave();renderExpenses();fillExpSummary();renderDash();toast('Deleted');
    });
  }, null, 'Delete Expense — enter admin PIN to confirm');
}

// ── GALLERY ──
function setGalCat(c){galCat=c;renderGallery();}
function renderGallery(){
  const b=biz();if(!b)return;const q=(el('galq')?.value||'').toLowerCase(),sort=el('galsort')?.value||'def',stk=el('galstk')?.value||'all',lv=b.lowStock||5;
  const cats=['all',...new Set((b.products||[]).map(p=>p.category))];
  el('galchips').innerHTML=cats.map(c=>`<div class="chip${galCat===c?' on':''}" onclick="setGalCat('${c}')">${c==='all'?'All':c}</div>`).join('');
  let prods=(b.products||[]).filter(p=>{const mq=!q||p.name.toLowerCase().includes(q)||(p.size||'').toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q);const mc=galCat==='all'||p.category===galCat;const ms=stk==='all'||(stk==='in'&&p.qty>(p.lowLevel||lv))||(stk==='low'&&p.qty>0&&p.qty<=(p.lowLevel||lv))||(stk==='out'&&p.qty<=0);return mq&&mc&&ms;});
  if(sort==='az')prods=[...prods].sort((a,b)=>a.name.localeCompare(b.name));else if(sort==='qa')prods=[...prods].sort((a,b)=>a.qty-b.qty);else if(sort==='qd')prods=[...prods].sort((a,b)=>b.qty-a.qty);else if(sort==='new')prods=[...prods].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const wrap=el('galwrap');if(!wrap)return;
  if(!prods.length){wrap.innerHTML='<div style="padding:20px">'+em('No products match filters')+'</div>';return;}
  wrap.innerHTML=`<div class="gg">${prods.map(p=>{const isLow=p.qty>0&&p.qty<=(p.lowLevel||lv),isOut=p.qty<=0,locked=isProdLocked(p);const badge=isOut?'<div class="gbadge" style="background:var(--er);color:#fff">OUT</div>':isLow?'<div class="gbadge" style="background:var(--wa);color:#fff">LOW</div>':locked?'<div class="gbadge" style="background:var(--lock);color:#fff">🔒</div>':'';return `<div class="gcard${locked?' locked':''}" onclick="openGalDetail(${p.id})"><div class="gimg">${p.imgData?`<img src="${p.imgData}" alt="${esc(p.name)}">`:CATI[p.category]||'📦'}${badge}</div><div class="ginfo"><div class="gname">${esc(p.name)}</div><div class="gprice">${f$(p.price)}</div><div class="gqty" style="color:${isOut?'var(--er)':isLow?'var(--wa)':'var(--t3)'}">${p.qty} ${p.unit} in stock</div>${p.size?`<div><span class="bdg bg0" style="font-size:9px;margin-top:2px">${esc(p.size)}</span></div>`:''}</div></div>`;}).join('')}</div>`;
}
function openGalDetail(id){
  const b=biz();const p=(b.products||[]).find(x=>x.id===id);if(!p)return;const lv=p.lowLevel||b.lowStock||5,isLow=p.qty>0&&p.qty<=lv,isOut=p.qty<=0,locked=isProdLocked(p);
  el('gdttl').textContent=p.name;el('gdimg').innerHTML=p.imgData?`<img src="${p.imgData}" style="width:100%;height:200px;object-fit:cover">`:`<div style="width:100%;height:200px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:56px">${CATI[p.category]||'📦'}</div>`;
  el('gdinfo').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px"><div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r10);padding:11px;text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">In Stock</div><div class="fw9 disp" style="font-size:20px;color:${isOut?'var(--er)':isLow?'var(--wa)':'var(--ok)'}">${p.qty}<br><span style="font-size:10px;font-weight:400;color:var(--t3)">${p.unit}</span></div></div><div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r10);padding:11px;text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Price</div><div class="fw9 disp c-g" style="font-size:20px">${f$(p.price)}</div></div><div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r10);padding:11px;text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Category</div><div style="font-size:20px">${CATI[p.category]||'📦'}</div></div></div>${p.size?`<div style="margin-bottom:9px"><span class="bdg bg0">${esc(p.size)}</span></div>`:''}${p.sku?`<div style="margin-bottom:9px;font-family:var(--fm);font-size:12px;color:var(--t2)">SKU: ${esc(p.sku)}</div>`:''}${locked?`<div class="lock-banner"><div class="li">🔒</div><div class="lt">Locked · ${prodLockRem(p)} remaining<br>${isAdmin()?'Admin can override edit.':'Submit a change request.'}</div></div>`:''}<button type="button" class="btn bgh bsm" onclick="closeD('d-galdet');openEditProd(${p.id})">✏ Edit Product</button>`;
  openD('d-galdet');
}

// ── SALARY ──
function fillSalMonths(){const sel=el('smonsel');if(!sel)return;const ms=months();sel.innerHTML=ms.map(m=>`<option value="${m}">${m}</option>`).join('');sel.value=thisMonth();}
function renderSalary(){
  const b=biz();
  if(!b){ var sw=el('sallist'); if(sw) sw.innerHTML='<div style="padding:30px;text-align:center;color:var(--t3)"><div style="font-size:32px;margin-bottom:10px">⏳</div><div style="font-weight:700">Loading business data...</div><div style="font-size:12px;margin-top:6px">If this persists, check your connection or reload the app.</div></div>'; return; }
  const month=el('smonsel')?.value||thisMonth();const emps=b.employees||[];
  el('semp').textContent=emps.length;el('smon').textContent=month;
  if(!b.salaryRecords)b.salaryRecords=[];if(!b.nextSalId)b.nextSalId=1;
  emps.forEach(emp=>{if(!b.salaryRecords.find(r=>r.empId===emp.id&&r.month===month))b.salaryRecords.push({id:b.nextSalId++,empId:emp.id,month,baseSalary:emp.monthlySalary,deductions:[],paid:false,paidDate:null,createdAt:Date.now()});});
  const recs=(b.salaryRecords||[]).filter(r=>r.month===month);
  el('sal-pay').textContent=f$(recs.reduce((a,r)=>{const d=(r.deductions||[]).reduce((c,x)=>c+(x.amount||0),0);return a+Math.max(0,(r.baseSalary||0)-d);},0));
  const wrap=el('sallist');if(!wrap)return;
  if(!emps.length){wrap.innerHTML=em('No employees yet. Click + Employee to add.');return;}
  wrap.innerHTML=emps.map(emp=>{const rec=recs.find(r=>r.empId===emp.id)||{baseSalary:emp.monthlySalary,deductions:[],paid:false};const totalDed=(rec.deductions||[]).reduce((a,b)=>a+(b.amount||0),0);const net=Math.max(0,(rec.baseSalary||0)-totalDed);const over=totalDed>rec.baseSalary;
    return `<div class="ecard"><div style="display:flex;align-items:center;gap:11px;margin-bottom:11px"><div class="eavatar">${mkInit(emp.name)}</div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(emp.name)}</div><div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(emp.role)} · ${esc(emp.type||'Employee')}</div></div>${rec.paid?'<span class="bdg bok0">PAID</span>':'<span class="bdg bwa0">PENDING</span>'}</div><div class="salg"><div class="sali"><div class="sall">Base Salary</div><div class="salv c-g">${f$(rec.baseSalary||0)}</div></div><div class="sali"><div class="sall">Deductions</div><div class="salv c-er">−${f$(totalDed)}</div></div><div class="sali"><div class="sall">Net Pay</div><div class="salv" style="color:${over?'var(--er)':net<(rec.baseSalary||0)*0.7?'var(--wa)':'var(--ok)'}">${f$(net)}</div></div></div>${over?'<div style="margin-top:9px;padding:7px 11px;background:var(--erb);border-radius:var(--r10);font-size:11px;font-weight:600;color:var(--er)">⚠ Deductions exceed base salary!</div>':''}<div style="display:flex;gap:8px;margin-top:11px"><button type="button" class="btn bte bsm" onclick="openSalDetail(${emp.id},'${month}')">View Details</button>${canDel()?`<button type="button" class="btn bgh bsm" onclick="openEditEmp(${emp.id})">Edit</button>`:''}</div></div>`;
  }).join('');dbSave();
}
function openAddEmp(){if(!canDel()){toast('Admin required','er');return;}editEmpId=null;el('empttl').textContent='Add Employee';el('esavebtn').textContent='Save Employee';['ename','erole','ephone','esal'].forEach(id=>sv(id,''));sv('estart',today());sv('etype','Employee');openD('d-emp');setTimeout(()=>el('ename')?.focus(),300);}
function openEditEmp(id){if(!canDel()){toast('Admin required','er');return;}const b=biz();const emp=(b.employees||[]).find(x=>x.id===id);if(!emp)return;editEmpId=id;el('empttl').textContent='Edit Employee';el('esavebtn').textContent='Update';sv('ename',emp.name);sv('erole',emp.role);sv('ephone',emp.phone||'');sv('esal',emp.monthlySalary);sv('estart',emp.startDate||today());sv('etype',emp.type||'Employee');openD('d-emp');}
function saveEmployee(){if(!canDel()){toast('Admin required','er');return;}const b=biz();if(!b)return;const name=gv('ename'),role=gv('erole'),salary=parseFloat(el('esal')?.value)||0;if(!name||!role){toast('Name and role required','er');return;}if(salary<=0){toast('Salary required','er');return;}const emp={name,role,phone:gv('ephone'),monthlySalary:salary,type:el('etype')?.value||'Employee',startDate:el('estart')?.value||today()};if(!b.employees)b.employees=[];if(!b.nextEmpId)b.nextEmpId=1;if(editEmpId!==null){const i=b.employees.findIndex(x=>x.id===editEmpId);if(i>-1)b.employees[i]={...b.employees[i],...emp};toast('Employee updated!');}else{emp.id=b.nextEmpId++;emp.createdAt=Date.now();b.employees.push(emp);toast('Employee added!');}dbSave();closeD('d-emp');renderSalary();}
function openSalDetail(empId,month){const b=biz();if(!b)return;const emp=(b.employees||[]).find(x=>x.id===empId);if(!emp)return;const rec=(b.salaryRecords||[]).find(r=>r.empId===empId&&r.month===month);if(!rec)return;curSalRecId=rec.id;el('sdttl').textContent=emp.name;el('sdsub').textContent=`${month} · ${esc(emp.role)}`;const totalDed=(rec.deductions||[]).reduce((a,b)=>a+(b.amount||0),0);const net=Math.max(0,(rec.baseSalary||0)-totalDed);el('sdsum').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div style="text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Base</div><div class="fw9 disp c-g" style="font-size:19px">${f$(rec.baseSalary||0)}</div></div><div style="text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Deductions</div><div class="fw9 disp c-er" style="font-size:19px">−${f$(totalDed)}</div></div><div style="text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Net Pay</div><div class="fw9 disp" style="font-size:19px;color:${net<(rec.baseSalary||0)?'var(--wa)':'var(--ok)'}">${f$(net)}</div></div></div>`;el('sddeds').innerHTML=(rec.deductions||[]).length?`<div class="card" style="border-radius:0;border:none">${(rec.deductions||[]).map((d,i)=>`<div class="cr"><div class="ci" style="background:var(--erb);font-size:13px">−</div><div class="cb"><div class="ct">${esc(d.reason)}</div><div class="cs">${d.date} · ${esc(d.type||'')} · by ${esc(d.addedBy||'')}</div></div><div style="text-align:right"><div class="cv c-er">−${f$(d.amount)}</div>${canDel()?`<button type="button" class="btn ber bxs" style="margin-top:3px" onclick="removeDed(${curSalRecId},${i})">Del</button>`:''}</div></div>`).join('')}</div>`:em('No deductions');el('sdnet').innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:3px">Net Payable</div><div class="fw9 disp c-g" style="font-size:21px">${f$(net)}</div></div>${rec.paid?`<span class="bdg bok0" style="font-size:12px">✓ Paid ${rec.paidDate||''}</span>`:''}</div>`;if(el('addbtn'))el('addbtn').style.display=canDel()?'':'none';if(el('mpaybtn')){el('mpaybtn').textContent=rec.paid?'Mark as Unpaid':'Mark as Paid';el('mpaybtn').className=rec.paid?'btn bwa bbl':'btn bok bbl';el('mpaybtn').style.display=canDel()?'':'none';}openD('d-saldet');}
function openAddDed(){if(!canDel()){toast('Admin required','er');return;}const b=biz();const rec=(b.salaryRecords||[]).find(r=>r.id===curSalRecId);if(!rec)return;const totalDed=(rec.deductions||[]).reduce((a,b)=>a+(b.amount||0),0);const rem=Math.max(0,(rec.baseSalary||0)-totalDed);el('dedinfo').textContent=`Max allowed: ${f$(rem)}`;sv('dedd',today());sv('deda','');sv('dedr','');sv('dedt','Absence');openD('d-ded');setTimeout(()=>el('deda')?.focus(),300);}
function saveDeduction(){if(!canDel()){toast('Admin required','er');return;}const b=biz();const rec=(b.salaryRecords||[]).find(r=>r.id===curSalRecId);if(!rec)return;const amount=parseFloat(el('deda')?.value)||0,reason=gv('dedr');if(amount<=0){toast('Enter valid amount','er');return;}if(!reason){toast('Reason required','er');return;}const totalDed=(rec.deductions||[]).reduce((a,b)=>a+(b.amount||0),0);if(totalDed+amount>(rec.baseSalary||0)){toast(`Cannot exceed ${f$(rec.baseSalary)}. Remaining: ${f$(Math.max(0,rec.baseSalary-totalDed))}`,'er');return;}if(!rec.deductions)rec.deductions=[];rec.deductions.push({date:el('dedd')?.value||today(),amount,reason,type:el('dedt')?.value||'Other',addedBy:CU?.name||'admin'});addAdminLog('add_ded',`Deduction ${f$(amount)} — ${reason}`,CU.name);dbSave();closeD('d-ded');const emp=(b.employees||[]).find(x=>x.id===rec.empId);if(emp)openSalDetail(emp.id,rec.month);renderSalary();toast(`Deduction ${f$(amount)} added`);}
function removeDed(recId,idx){if(!canDel()){toast('Admin required','er');return;}const b=biz();const rec=(b.salaryRecords||[]).find(r=>r.id===recId);if(!rec)return;rec.deductions.splice(idx,1);dbSave();const emp=(b.employees||[]).find(x=>x.id===rec.empId);if(emp)openSalDetail(emp.id,rec.month);renderSalary();toast('Deduction removed');}
function markPaid(){if(!canDel()){toast('Admin required','er');return;}const b=biz();const rec=(b.salaryRecords||[]).find(r=>r.id===curSalRecId);if(!rec)return;rec.paid=!rec.paid;rec.paidDate=rec.paid?today():null;addAdminLog('salary_paid',`Salary ${rec.paid?'PAID':'UNPAID'} empId ${rec.empId}`,CU.name);dbSave();const emp=(b.employees||[]).find(x=>x.id===rec.empId);if(emp)openSalDetail(emp.id,rec.month);renderSalary();toast(rec.paid?'Marked Paid':'Marked Unpaid');}

// ── STOCK OPERATIONS ──
let _si=0,_so=0,_pu=0;
function prodOpts(onlyStock){const b=biz();return`<option value="">Select product...</option>`+((b.products||[]).filter(p=>!onlyStock||p.qty>0)).map(p=>`<option value="${p.id}">${esc(p.name)} (${p.qty} ${p.unit})</option>`).join('');}
function openStockIn(){
  if(!canAccess('stock')){toast('No access','er');return;}
  siItems=[];_si=0;
  ['sisupp','siref','sinotes'].forEach(id=>sv(id,''));
  sv('sidate',today());
  renderSiItems();
  // Reset shortage banner
  var banner = el('si-shortage-banner');
  if(banner) banner.style.display = 'none';
  openD('d-si');
}
function addSiItem(){siItems.push({idx:_si++,prodId:'',qty:1,cost:0});renderSiItems();}
function removeSiItem(idx){siItems=siItems.filter(i=>i.idx!==idx);renderSiItems();}
function renderSiItems(){const w=el('siitems');if(!w)return;if(!siItems.length){w.innerHTML='<div style="padding:11px;text-align:center;font-size:12px;color:var(--t3)">Tap "+ Add Product Row"</div>';el('sicnt').textContent='0';el('sitotal').textContent=f$(0);return;}w.innerHTML=siItems.map(i=>`<div class="mir"><div class="mip"><div class="mil">Product</div><select class="mii" id="sip${i.idx}" onchange="onSiProd(${i.idx})">${prodOpts(false)}</select></div><div class="miq"><div class="mil">Qty</div><input class="mii" type="number" id="siq${i.idx}" value="${i.qty||''}" min="1" oninput="updateSiItem(${i.idx})"></div><div class="miv"><div class="mil">Cost</div><input class="mii" type="number" id="sic${i.idx}" value="${i.cost||''}" step="0.01" oninput="updateSiItem(${i.idx})"></div><div class="mid" onclick="removeSiItem(${i.idx})">✕</div></div>`).join('');siItems.forEach(i=>{const s=el(`sip${i.idx}`);if(s&&i.prodId)s.value=i.prodId;});updateSiTotals();el('sicnt').textContent=siItems.length;}
function onSiProd(idx){
  const s=el('sip'+idx);
  const i=siItems.find(x=>x.idx===idx);if(!i)return;
  i.prodId=parseInt(s.value)||'';
  const b=biz();
  const p=(b&&b.products||[]).find(x=>x.id===i.prodId);
  if(p){
    i.cost=p.cost;
    const c=el('sic'+idx);if(c)c.value=p.cost.toFixed(2);
  }
  updateSiTotals();
  updateSiShortageBanner(idx);
}

function updateSiShortageBanner(idx){
  const banner = el('si-shortage-banner');
  const title  = el('si-shortage-title');
  const detail = el('si-shortage-detail');
  if(!banner||!title||!detail) return;

  // Find ALL short products across all rows
  var shortItems = [];
  siItems.forEach(function(row){
    if(!row.prodId) return;
    var b = biz();
    var p = (b&&b.products||[]).find(function(x){return x.id===row.prodId;});
    if(p && p.qty < 0){
      shortItems.push({prod:p, row:row});
    }
  });

  if(!shortItems.length){
    banner.style.display = 'none';
    return;
  }

  banner.style.display = '';

  if(shortItems.length === 1){
    var s = shortItems[0];
    var shortage = Math.abs(s.prod.qty);
    var restockCost = s.prod.cost > 0 ? shortage * s.prod.cost : 0;
    var daysAgo = '';
    if(s.prod.wentNegativeAt){
      var d = Math.floor((Date.now()-s.prod.wentNegativeAt)/(1000*60*60*24));
      daysAgo = d <= 0 ? ' (today)' : ' ('+d+' day'+(d!==1?'s':'')+' ago)';
    }
    title.textContent = '⚠ Shortage: ' + s.prod.name;
    detail.innerHTML =
      'You are short <strong style="color:var(--er)">' + shortage + ' ' + s.prod.unit + '</strong>' + daysAgo + '.<br>' +
      (restockCost > 0 ? 'Est. cost to recover: <strong style="color:var(--wa)">' + f$(restockCost) + '</strong><br>' : '') +
      '<span style="color:var(--t3)">Enter quantity below to see recovery math →</span>';
  } else {
    title.textContent = '⚠ ' + shortItems.length + ' products have shortages';
    detail.innerHTML = shortItems.map(function(s){
      return '• ' + esc(s.prod.name) + ': short <strong style="color:var(--er)">' + Math.abs(s.prod.qty) + ' ' + s.prod.unit + '</strong>';
    }).join('<br>');
  }

  // Show recovery math if qty already entered
  updateSiRecoveryMath();
}

function updateSiRecoveryMath(){
  var mathEl = el('si-recovery-math');
  if(!mathEl) return;

  var lines = [];
  siItems.forEach(function(row){
    if(!row.prodId || !row.qty) return;
    var b = biz();
    var p = (b&&b.products||[]).find(function(x){return x.id===row.prodId;});
    if(!p || p.qty >= 0) return;  // only show for short products

    var shortage = Math.abs(p.qty);
    var incoming = row.qty || 0;
    var netAfter = p.qty + incoming;  // p.qty is negative

    if(netAfter >= 0){
      lines.push(
        '<span style="color:var(--ok)">✓ '+esc(p.name)+':</span> ' +
        'Shortage of '+shortage+' covered' +
        (netAfter > 0 ? ' · <span style="color:var(--ok)">Surplus: +'+netAfter+' '+p.unit+'</span>' : ' · <span style="color:var(--t2)">Exactly zero</span>')
      );
    } else {
      lines.push(
        '<span style="color:var(--er)">✗ '+esc(p.name)+':</span> ' +
        'Receiving '+incoming+' · Still short: <strong style="color:var(--er)">'+Math.abs(netAfter)+' '+p.unit+'</strong>'
      );
    }
  });

  if(!lines.length){
    mathEl.style.display = 'none';
    return;
  }

  mathEl.style.display = '';
  mathEl.innerHTML = lines.join('<br>');
}
function updateSiItem(idx){
  const i=siItems.find(x=>x.idx===idx);if(!i)return;
  i.qty=parseFloat(el('siq'+idx)?.value)||0;
  i.cost=parseFloat(el('sic'+idx)?.value)||0;
  updateSiTotals();
  // Update recovery math live as qty is typed
  updateSiRecoveryMath();
}
function updateSiTotals(){el('sitotal').textContent=f$(siItems.reduce((a,b)=>a+(b.qty||0)*(b.cost||0),0));}
function saveStockIn(){const b=biz();if(!b)return;const supp=gv('sisupp');if(!supp){toast('Supplier required','er');return;}const ref=gv('siref'),date=el('sidate')?.value||today();siItems.forEach(i=>{const s=el(`sip${i.idx}`);if(s)i.prodId=parseInt(s.value)||'';const q=el(`siq${i.idx}`);if(q)i.qty=parseFloat(q.value)||0;const c=el(`sic${i.idx}`);if(c)i.cost=parseFloat(c.value)||0;});const valid=siItems.filter(i=>i.prodId&&i.qty>0);if(!valid.length){toast('Add at least one product','er');return;}valid.forEach(item=>{const p=(b.products||[]).find(x=>x.id===item.prodId);if(!p)return;
      var wasNeg = p.qty < 0;
      p.qty += item.qty;
      if(item.cost>0) p.cost = item.cost;
      // Clear shortage tracking if stock is now positive
      if(wasNeg && p.qty >= 0) {
        p.wentNegativeAt = null;
      }if(!b.stockHistory)b.stockHistory=[];b.stockHistory.unshift({id:b.nextHistId++,date,type:'IN',prodName:p.name,qty:item.qty,by:CU.name,ref,notes:'Supplier: '+supp,ts:Date.now()});});addAdminLog('stock_in',`Stock In · ${supp} · ${valid.length} products`,CU.name);dbSave();closeD('d-si');renderProducts();renderGallery();renderDash();toast(valid.length+' product(s) added to stock');}
function openStockOut(){if(!canAccess('stock')){toast('No access','er');return;}soItems=[];_so=0;['socust','sodisc','sopaid'].forEach(id=>sv(id,''));sv('sodate',today());sv('soreason','Sale');sv('sopaym','Cash');toggleSoPay();renderSoItems();openD('d-so');}
function toggleSoPay(){if(el('sopaysec'))el('sopaysec').style.display=el('soreason')?.value==='Sale'?'':'none';}
function addSoItem(){soItems.push({idx:_so++,prodId:'',qty:1,price:0});renderSoItems();}
function removeSoItem(idx){soItems=soItems.filter(i=>i.idx!==idx);renderSoItems();updateSoTotals();}
function renderSoItems(){const w=el('soitems');if(!w)return;if(!soItems.length){w.innerHTML='<div style="padding:11px;text-align:center;font-size:12px;color:var(--t3)">Tap "+ Add Product Row"</div>';el('socnt').textContent='0';updateSoTotals();return;}w.innerHTML=soItems.map(i=>`<div class="mir"><div class="mip"><div class="mil">Product</div><select class="mii" id="sop${i.idx}" onchange="onSoProd(${i.idx})">${prodOpts(true)}</select></div><div class="miq"><div class="mil">Qty</div><input class="mii" type="number" id="soq${i.idx}" value="${i.qty||''}" min="1" oninput="updateSoItem(${i.idx})"></div><div class="miv"><div class="mil">Price</div><input class="mii" type="number" id="sor${i.idx}" value="${i.price||''}" step="0.01" oninput="updateSoItem(${i.idx})"></div><div class="mid" onclick="removeSoItem(${i.idx})">✕</div></div>`).join('');soItems.forEach(i=>{const s=el(`sop${i.idx}`);if(s&&i.prodId)s.value=i.prodId;});updateSoTotals();el('socnt').textContent=soItems.length;}
function onSoProd(idx){const s=el(`sop${idx}`);const i=soItems.find(x=>x.idx===idx);if(!i)return;i.prodId=parseInt(s.value)||'';const p=(biz().products||[]).find(x=>x.id===i.prodId);if(p){i.price=p.price;const r=el(`sor${idx}`);if(r)r.value=p.price.toFixed(2);}updateSoTotals();}
function updateSoItem(idx){const i=soItems.find(x=>x.idx===idx);if(!i)return;i.qty=parseFloat(el(`soq${idx}`)?.value)||0;i.price=parseFloat(el(`sor${idx}`)?.value)||0;updateSoTotals();}
function updateSoTotals(){const sub=soItems.reduce((a,b)=>a+(b.qty||0)*(b.price||0),0),disc=parseFloat(el('sodisc')?.value)||0,total=Math.max(0,sub-disc),paid=parseFloat(el('sopaid')?.value)||0,due=Math.max(0,total-paid);if(el('sosub'))el('sosub').textContent=f$(sub);if(el('sototal'))el('sototal').textContent=f$(total);const dueEl=el('sodue');if(dueEl){dueEl.textContent=f$(due);dueEl.style.color=due<=0?'var(--ok)':paid>0?'var(--wa)':'var(--er)';}if(el('sobdg'))el('sobdg').innerHTML=payBadge(due<=0?'PAID':paid>0?'PARTIAL':'CREDIT');}
function saveStockOut(){
  const b=biz();if(!b)return;
  const date=el('sodate')?.value||today();
  const reason=el('soreason')?.value||'Adjustment';
  const notes=gv('sonotes');
  const ref='OUT-'+String(b.nextSoId||1).padStart(4,'0');
  // Collect items
  soItems.forEach(i=>{
    const s=el('sop'+i.idx);if(s)i.prodId=parseInt(s.value)||'';
    const q=el('soq'+i.idx);if(q)i.qty=parseFloat(q.value)||0;
  });
  const valid=soItems.filter(i=>i.prodId&&i.qty>0);
  if(!valid.length){toast('Add at least one product','er');return;}
  // Process each item
  valid.forEach(item=>{
    const p=(b.products||[]).find(x=>x.id===item.prodId);
    if(!p){toast('Product not found: '+item.prodId,'er');return;}
    var prevQty=p.qty;
    p.qty=p.qty-item.qty;
    if(p.qty<0&&prevQty>=0)p.wentNegativeAt=Date.now();
    if(p.qty>=0)p.wentNegativeAt=null;
    if(!b.stockHistory)b.stockHistory=[];
    b.stockHistory.unshift({
      id:b.nextHistId++,date,type:'OUT',
      prodName:p.name,qty:-item.qty,
      by:CU.name,ref,
      notes:reason+(notes?' · '+notes:''),
      ts:Date.now()
    });
  });
  // Log movement
  if(!b.stockOuts)b.stockOuts=[];
  b.stockOuts.unshift({
    id:b.nextSoId||1,ref,date,reason,notes,
    items:valid.map(i=>{const p=(b.products||[]).find(x=>x.id===i.prodId);return{name:p?p.name:'',qty:i.qty};}),
    by:CU.name,createdAt:Date.now()
  });
  b.nextSoId=(b.nextSoId||1)+1;
  addAdminLog('stock_out','Stock Out · '+reason+' · '+valid.length+' products',CU.name);
  dbSave();closeD('d-so');
  renderProducts();renderGallery();renderDash();
  toast(valid.length+' product(s) removed — '+reason,'gd');
}
function openPurchase(){if(!canAccess('stock')){toast('No access','er');return;}puItems=[];_pu=0;['pusupp','puinv'].forEach(id=>sv(id,''));sv('pudate',today());renderPuItems();openD('d-pu');}
function addPuItem(){puItems.push({idx:_pu++,prodId:'',qty:1,cost:0});renderPuItems();}
function removePuItem(idx){puItems=puItems.filter(i=>i.idx!==idx);renderPuItems();}
function renderPuItems(){const w=el('puitems');if(!w)return;if(!puItems.length){w.innerHTML='<div style="padding:11px;text-align:center;font-size:12px;color:var(--t3)">Tap "+ Add Product Row"</div>';el('putotal').textContent=f$(0);return;}w.innerHTML=puItems.map(i=>`<div class="mir"><div class="mip"><div class="mil">Product</div><select class="mii" id="pup${i.idx}" onchange="onPuProd(${i.idx})">${prodOpts(false)}</select></div><div class="miq"><div class="mil">Qty</div><input class="mii" type="number" id="puq${i.idx}" value="${i.qty||''}" min="1" oninput="updatePuItem(${i.idx})"></div><div class="miv"><div class="mil">Cost</div><input class="mii" type="number" id="puc${i.idx}" value="${i.cost||''}" step="0.01" oninput="updatePuItem(${i.idx})"></div><div class="mid" onclick="removePuItem(${i.idx})">✕</div></div>`).join('');puItems.forEach(i=>{const s=el(`pup${i.idx}`);if(s&&i.prodId)s.value=i.prodId;});updatePuTotals();}
function onPuProd(idx){const s=el(`pup${idx}`);const i=puItems.find(x=>x.idx===idx);if(!i)return;i.prodId=parseInt(s.value)||'';const p=(biz().products||[]).find(x=>x.id===i.prodId);if(p){i.cost=p.cost;const c=el(`puc${idx}`);if(c)c.value=p.cost.toFixed(2);}updatePuTotals();}
function updatePuItem(idx){const i=puItems.find(x=>x.idx===idx);if(!i)return;i.qty=parseFloat(el(`puq${idx}`)?.value)||0;i.cost=parseFloat(el(`puc${idx}`)?.value)||0;updatePuTotals();}
function updatePuTotals(){el('putotal').textContent=f$(puItems.reduce((a,b)=>a+(b.qty||0)*(b.cost||0),0));}
function savePurchase(){const b=biz();if(!b)return;const supp=gv('pusupp');if(!supp){toast('Supplier required','er');return;}const inv=gv('puinv'),date=el('pudate')?.value||today();puItems.forEach(i=>{const s=el(`pup${i.idx}`);if(s)i.prodId=parseInt(s.value)||'';const q=el(`puq${i.idx}`);if(q)i.qty=parseFloat(q.value)||0;const c=el(`puc${i.idx}`);if(c)i.cost=parseFloat(c.value)||0;});const valid=puItems.filter(i=>i.prodId&&i.qty>0);if(!valid.length){toast('Add at least one product','er');return;}if(!b.purchases)b.purchases=[];valid.forEach(item=>{const p=(b.products||[]).find(x=>x.id===item.prodId);if(!p)return;p.qty+=item.qty;if(item.cost>0)p.cost=item.cost;b.purchases.unshift({date,supplier:supp,prodName:p.name,qty:item.qty,cost:item.cost,inv});if(!b.stockHistory)b.stockHistory=[];b.stockHistory.unshift({id:b.nextHistId++,date,type:'PURCHASE',prodName:p.name,qty:item.qty,by:CU.name,ref:inv,notes:'Supplier: '+supp,ts:Date.now()});});addAdminLog('purchase',`Purchase · ${supp} · ${valid.length} products`,CU.name);dbSave();closeD('d-pu');renderProducts();renderGallery();renderDash();toast(valid.length+' product(s) received');}

// ── CREDITS ──
function showCredits(){const b=biz();if(!b)return;const credits=b.credits||[];const active=credits.filter(c=>crBal(c)>0);el('credsub').textContent=active.length+' outstanding · '+credits.length+' total';const tOwed=credits.reduce((a,b)=>a+(b.totalOwed||0),0),tPaid=credits.reduce((a,b)=>a+(b.totalPaid||0),0);let h=`<div style="display:flex;gap:10px;padding:11px 13px;border-bottom:1px solid var(--bd);background:var(--s2)"><div style="flex:1;text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Total Owed</div><div class="fw9 disp c-er" style="font-size:17px">${f$(tOwed-tPaid)}</div></div><div style="flex:1;text-align:center"><div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Collected</div><div class="fw9 disp c-ok" style="font-size:17px">${f$(tPaid)}</div></div></div>`;h+=credits.length?`<div class="card" style="border-radius:0;border:none">${credits.map(c=>{const bal=crBal(c),settled=bal<=0;return`<div class="cr"><div class="ci" style="background:${settled?'var(--okb)':'var(--erb)'}">${settled?'✓':'💳'}</div><div class="cb"><div class="ct">${esc(c.name)}</div><div class="cs">${esc(c.ref||'—')} · ${c.date}${c.contact?' · 📞 '+esc(c.contact):''}</div><div style="margin-top:3px"><span class="bdg ${settled?'bok0':c.totalPaid>0?'bwa0':'ber0'}">${settled?'SETTLED':c.totalPaid>0?'PARTIAL':'UNPAID'}</span></div></div><div style="text-align:right"><div class="cv" style="color:${settled?'var(--ok)':'var(--er)'}">${f$(bal)}</div>${settled?'':`<button type="button" class="btn bok bxs" style="margin-top:3px" onclick="openPayCred(${c.id})">Pay</button>`}</div></div>`;}).join('')}</div>`:em('No credit records');el('credbody').innerHTML=h;openD('d-cred');}
function openPayCred(id){payingCrId=id;const b=biz();const c=(b.credits||[]).find(x=>x.id===id);if(!c)return;const bal=crBal(c);el('pcsub').textContent=`${c.name} · Balance: ${f$(bal)}`;el('pcinfo').innerHTML=`<div class="fw7">${esc(c.name)}</div><div style="font-size:12px;color:var(--t2);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap"><span>Total: ${f$(c.totalOwed)}</span><span>Paid: ${f$(c.totalPaid||0)}</span><span style="color:var(--er)">Balance: ${f$(bal)}</span></div>`;sv('pcd',today());sv('pca','');sv('pcr','');openD('d-paycred');}
function saveCreditPay(){const b=biz();const c=(b.credits||[]).find(x=>x.id===payingCrId);if(!c)return;const amt=parseFloat(el('pca')?.value)||0;if(amt<=0){toast('Enter valid amount','er');return;}const bal=crBal(c);if(amt>bal+0.01){toast('Amount exceeds balance of '+f$(bal),'er');return;}c.totalPaid=(c.totalPaid||0)+amt;if(!c.payments)c.payments=[];c.payments.push({date:el('pcd')?.value||today(),amount:amt,mode:el('pcm')?.value||'Cash',ref:gv('pcr')});if(c.totalPaid>=c.totalOwed)c.status='SETTLED';addAdminLog('credit_pay',`Payment ${f$(amt)} from ${c.name}`,CU.name);dbSave();closeD('d-paycred');showCredits();renderDash();toast(`Payment ${f$(amt)} recorded`);}

// ── STOCK HISTORY ──
function showStockHist(){const b=biz();if(!b)return;const hist=[...(b.stockHistory||[])].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,100);const tIco={IN:'📥',OUT:'📤',SALE:'💸',PURCHASE:'🛒'};const tCl={IN:'c-ok',OUT:'c-er',SALE:'c-g',PURCHASE:'c-in'};el('histbody').innerHTML=hist.length?`<div class="card" style="border-radius:0;border:none">${hist.map(h=>`<div class="cr"><div class="ci" style="background:var(--s2)">${tIco[h.type]||'📋'}</div><div class="cb"><div class="ct">${esc(h.prodName)}</div><div class="cs">${h.date} · ${esc(h.ref||h.type)} · ${esc(h.by||'')}</div></div><div style="text-align:right"><div class="cv ${tCl[h.type]||''}">${h.qty>0?'+':''}${h.qty}</div><div class="cm">${h.type}</div></div></div>`).join('')}</div>`:em('No stock history yet');openD('d-hist');}

// ── BIZ SETTINGS ──
function openBizSettings(){if(!isAdmin()){toast('Admin required','er');return;}const b=biz();if(!b)return;sv('bizname',b.name);sv('bizaddr',b.address||'');sv('bizphone',b.phone||'');sv('bizcurr',b.currency||'USD');sv('bizlow',b.lowStock||5);if(el('bizcountry'))el('bizcountry').value=b.country||'Liberia';if(el('biz-alloc-toggle'))el('biz-alloc-toggle').checked=(b.allocationsEnabled!==false);

  el('bizsetsub').textContent='Editing: '+b.name;const prev=el('bizlogoprev');if(b.logoType==='image'&&b.logoData)prev.innerHTML=`<img src="${b.logoData}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;else prev.textContent=mkInit(b.name);['bizlogofile','bizlogofile2'].forEach(id=>{const e=el(id);if(e){e.value='';e.dataset.ld=b.logoData||'';e.dataset.lt=b.logoType||'initials';}});openD('d-bizset');}
function handleBizLogo(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{inp.dataset.ld=e.target.result;inp.dataset.lt='image';el('bizlogoprev').innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;};r.readAsDataURL(f);}
function clearBizLogo(){['bizlogofile','bizlogofile2'].forEach(id=>{const e=el(id);if(e){e.dataset.ld='';e.dataset.lt='initials';e.value='';}});const b=biz();el('bizlogoprev').textContent=mkInit(b?b.name:'S');}
function saveBizSettings(){const b=biz();if(!b)return;const name=gv('bizname');if(!name){toast('Business name required','er');return;}b.name=name;b.address=gv('bizaddr');b.phone=gv('bizphone');b.currency=el('bizcurr')?.value||'USD';b.lowStock=parseInt(el('bizlow')?.value)||5;b.country=el('bizcountry')?.value||'Liberia';b.allocationsEnabled=el('biz-alloc-toggle')?.checked!==false;
const lf=el('bizlogofile'),lf2=el('bizlogofile2');const src=lf2&&lf2.dataset.ld?lf2:lf;b.logoData=src.dataset.ld||'';b.logoType=src.dataset.lt||'initials';addAdminLog('settings','Settings updated: '+name,CU.name);
  dbSave();
  try { if(typeof fbPush==='function') fbPush(); } catch(e){}
  closeD('d-bizset');
  // Reflect settings changes across the entire app
  try { updateTopbar(); } catch(e){}
  try { if(typeof refreshSidebar==='function') refreshSidebar(); } catch(e){}
  try { if(typeof renderDash==='function') renderDash(); } catch(e){}
  try { if(typeof updateAllocToggleUI==='function') updateAllocToggleUI(); } catch(e){}
  // Update currency symbol everywhere
  try { if(typeof renderSales==='function' && typeof page!=='undefined' && page==='sales') renderSales(); } catch(e){}
  try { if(typeof renderProducts==='function' && typeof page!=='undefined' && page==='products') renderProducts(); } catch(e){}
  try { if(typeof renderExpenses==='function' && typeof page!=='undefined' && page==='expenses') renderExpenses(); } catch(e){}
  toast('✅ Settings saved and applied!');}
function addNewBiz(){const name=prompt('New business name:');if(!name||!name.trim())return;const b={id:DB.nextBizId++,name:name.trim(),currency:'USD',address:'',phone:'',logoType:'initials',logoData:'',lowStock:5,products:[],sales:[],expenses:[],employees:[],salaryRecords:[],stockHistory:[],purchases:[],stockOuts:[],credits:[],nextProdId:1,nextSaleId:1,nextExpId:1,nextEmpId:1,nextSalId:1,nextHistId:1,nextSoId:1,nextCrId:1};DB.businesses.push(b);const u=DB.users.find(x=>x.id===CU.id);if(u&&!u.businessIds.includes(b.id))u.businessIds.push(b.id);dbSave();toast('"'+b.name+'" created!','gd');closeD('d-bizset');}
function openBizSel(){if(DB.businesses.length<=1&&!isAdmin())return;const myBizs=DB.businesses.filter(b=>(CU.businessIds||[]).includes(b.id));el('bizself').innerHTML=myBizs.map(b=>`<div class="bizcard${b.id===CBI?' on':''}" onclick="switchBiz(${b.id})"><div class="bclogo">${b.logoType==='image'&&b.logoData?`<img src="${b.logoData}">`:mkInit(b.name)}</div><div style="flex:1"><div style="font-weight:700;color:var(--t1);font-size:14px">${esc(b.name)}${b.id===CBI?' ✓':''}</div><div style="font-size:11px;color:var(--t3);margin-top:2px">${(b.products||[]).length} products · ${b.currency||'USD'}</div></div></div>`).join('')+(isAdmin()?'<button type="button" class="btn bok bbl mt8" onclick="closeD(\'d-bizsel\');openBizSettings()">+ Add Business</button>':'');openD('d-bizsel');}
function switchBiz(id){CBI=id;DB.currentBizId=id;const u=DB.users.find(x=>x.id===CU.id);if(u&&!u.businessIds.includes(id))u.businessIds.push(id);dbSave();closeD('d-bizsel');updateTopbar();goTo('dash');toast('Switched to '+biz().name,'gd');}

// ── TEAM ──
function openTeam(){
  try {
    if(!CU){ toast('Please sign in first', 'er'); return; }
    if(CU.role !== 'primaryAdmin' && CU.role !== 'admin'){
      toast('Only admins can manage the team', 'er');
      return;
    }
    // Open drawer first so user sees something even if render fails
    openD('d-team');
    // Then render
    renderTeam();
  } catch(e){
    console.error('[openTeam]', e);
    toast('Team page error: ' + (e.message || 'unknown'), 'er');
    // Still show drawer with error message
    var tb = document.getElementById('teambody');
    if(tb) tb.innerHTML =
      '<div style="padding:30px 20px;text-align:center">' +
        '<div style="font-size:38px;margin-bottom:10px">⚠️</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--er);margin-bottom:8px">Team page error</div>' +
        '<div style="font-size:12px;color:var(--t3);margin-bottom:14px;line-height:1.5">' + esc(e.message || 'Unknown error') + '</div>' +
        '<button type="button" class="btn bg bsm" onclick="closeD(\'d-team\');setTimeout(openTeam,200)">Retry</button>' +
      '</div>';
  }
}

function renderTeam(){
  if(typeof CBI === 'undefined' || !CBI) {
    var tb0 = document.getElementById('teambody');
    if(tb0) tb0.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t3)">No business selected.</div>';
    return;
  }
  // Defensive: ensure DB shape
  DB.users = DB.users || [];
  DB.notifications = DB.notifications || [];
  DB.inviteCodes = DB.inviteCodes || [];
  const myUsers = DB.users.filter(function(u){
    return u && u.businessIds && u.businessIds.indexOf(CBI) >= 0;
  });
  const pending = myUsers.filter(u => u.status === 'pending');
  const active  = myUsers.filter(u => u.status !== 'pending');
  const codes   = (DB.inviteCodes||[]).filter(c => c.bizId===CBI && !c.used && (c.expiresAt===0 || c.expiresAt>Date.now()));
  const pendingResets = (DB.notifications||[]).filter(n => n.bizId===CBI && n.pendingResetUserId);

  let html = '';

  // ─── PENDING SIGNUPS SECTION ───
  if(pending.length){
    html += `<div style="padding:11px 13px;background:linear-gradient(135deg,rgba(245,158,11,.12),rgba(245,158,11,.04));border-bottom:1px solid rgba(245,158,11,.25)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:14px">⏳</span>
        <span style="font-size:11px;font-weight:800;color:var(--wa);text-transform:uppercase;letter-spacing:.12em;font-family:var(--fm)">Pending Approvals (${pending.length})</span>
      </div>
      <div style="font-size:11px;color:var(--t3)">These staff want to join your business. Approve or reject below.</div>
    </div>`;
    html += `<div>`;
    pending.forEach(function(u){
      const ago = u.createdAt ? timeAgo(u.createdAt) : '';
      const rejBadge = u.rejectedAt ? `<span class="bdg" style="background:rgba(239,68,68,.15);color:var(--er);font-size:9px;margin-left:6px">retry</span>` : '';
      html += `<div style="padding:13px;border-bottom:1px solid var(--bd);background:var(--s2)">
        <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px">
          <div class="av" style="width:42px;height:42px;font-size:13px;flex-shrink:0;background:linear-gradient(135deg,var(--wa),#d97706)">${mkInit(u.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(u.name)} ${rejBadge}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">@${esc(u.username)} ${ago ? '· requested '+ago : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn bg bsm" style="flex:1" onclick="approveStaffSignup(${u.id})">✓ Approve</button>
          <button type="button" class="btn ber bsm" style="flex:1" onclick="rejectStaffSignup(${u.id})">✕ Reject</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ─── PASSWORD RESET REQUESTS ───
  if(pendingResets.length){
    html += `<div style="padding:11px 13px;background:linear-gradient(135deg,rgba(79,195,247,.1),rgba(79,195,247,.04));border-bottom:1px solid rgba(79,195,247,.25);border-top:1px solid var(--bd)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:14px">🔑</span>
        <span style="font-size:11px;font-weight:800;color:var(--in);text-transform:uppercase;letter-spacing:.12em;font-family:var(--fm)">Password Reset Requests (${pendingResets.length})</span>
      </div>
    </div>`;
    pendingResets.forEach(function(n){
      const u = (DB.users||[]).find(x => x.id === n.pendingResetUserId);
      if(!u) return;
      html += `<div style="padding:13px;border-bottom:1px solid var(--bd);background:var(--s2)">
        <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px">
          <div class="av" style="width:36px;height:36px;font-size:11px;background:linear-gradient(135deg,var(--in),#0284c7)">${mkInit(u.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--t1)">${esc(u.name)}</div>
            <div style="font-size:11px;color:var(--t3)">@${esc(u.username)} needs a new password</div>
          </div>
        </div>
        <button type="button" class="btn bg bsm" style="width:100%" onclick="adminResetUserPassword(${u.id})">🔓 Reset Their Password</button>
      </div>`;
    });
  }

  // ─── ACTIVE TEAM SECTION (REDESIGNED) ───
  html += `<div style="padding:14px 14px 11px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--bd);border-top:1px solid var(--bd);background:linear-gradient(135deg,rgba(34,197,94,.04),transparent)">
    <div>
      <div style="font-size:11px;font-weight:800;color:var(--ok);text-transform:uppercase;letter-spacing:.12em;font-family:var(--fm);margin-bottom:2px">Active Team</div>
      <div style="font-size:10px;color:var(--t3)">${active.length} member${active.length!==1?'s':''}</div>
    </div>
    <button type="button" class="btn bg bsm" onclick="closeD('d-team');openAddUser()">+ Add Member</button>
  </div>`;

  html += `<div style="padding:10px 10px 12px">`;
  active.forEach(function(u){
    const isMe = u.id === CU.id;
    const isOwner = u.role === 'primaryAdmin';
    const isAdmin = u.role === 'admin';
    const canPromote = !isMe && !isOwner && !isAdmin && CU.role === 'primaryAdmin';
    const canDemote  = !isMe && !isOwner && isAdmin && CU.role === 'primaryAdmin';
    const canRemove  = !isMe && !isOwner;
    const canResetPw = !isMe && CU.role === 'primaryAdmin';

    // ── INLINE STATS ──
    var userSales = 0, userSalesAmt = 0;
    try {
      var b = biz();
      if (b && b.sales) {
        b.sales.forEach(function(s){
          if (s.createdBy === u.id && s.status !== 'cancelled') {
            userSales++;
            userSalesAmt += sTotal(s);
          }
        });
      }
    } catch(e){}
    var lastLoginText = '';
    if (u.lastLoginAt) {
      lastLoginText = timeAgo(u.lastLoginAt);
    } else if (u.createdAt) {
      lastLoginText = 'joined ' + timeAgo(u.createdAt);
    } else {
      lastLoginText = 'never logged in';
    }

    // ── ROLE BADGE ──
    var roleBadge;
    if (isOwner) {
      roleBadge = '<span style="background:linear-gradient(135deg,rgba(232,160,32,.2),rgba(232,160,32,.08));color:var(--g);border:1px solid rgba(232,160,32,.4);padding:2px 7px;border-radius:99px;font-size:9px;font-weight:800;font-family:var(--fm);letter-spacing:.04em">👑 OWNER</span>';
    } else if (isAdmin) {
      roleBadge = '<span style="background:rgba(232,160,32,.12);color:var(--g);border:1px solid rgba(232,160,32,.25);padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;font-family:var(--fm);letter-spacing:.04em">⭐ ADMIN</span>';
    } else if (u.role === 'dataOperator') {
      roleBadge = '<span style="background:rgba(79,195,247,.12);color:var(--in);border:1px solid rgba(79,195,247,.25);padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;font-family:var(--fm);letter-spacing:.04em">📊 STAFF</span>';
    } else {
      roleBadge = '<span style="background:var(--s3);color:var(--t2);border:1px solid var(--bd);padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;font-family:var(--fm);letter-spacing:.04em">👤 ' + (u.role||'VIEWER').toUpperCase() + '</span>';
    }

    // ── AVATAR COLOR (by role) ──
    var avBg;
    if (isOwner) avBg = 'linear-gradient(135deg,#e8a020,#c07010)';
    else if (isAdmin) avBg = 'linear-gradient(135deg,#22c55e,#15803d)';
    else if (u.role === 'dataOperator') avBg = 'linear-gradient(135deg,#4fc3f7,#1976d2)';
    else avBg = 'linear-gradient(135deg,#64748b,#334155)';

    // ── ACTION BUTTONS ──
    let actionBtns = '';
    if(isMe){
      actionBtns = '<span style="background:rgba(232,160,32,.15);color:var(--g);padding:3px 9px;border-radius:99px;font-size:10px;font-weight:700;font-family:var(--fm);border:1px solid rgba(232,160,32,.25)">YOU</span>';
    } else {
      let btnRow = '';
      if(canPromote) btnRow += `<button type="button" class="btn bg bxs" onclick="promoteToAdmin(${u.id})" title="Promote to Admin" style="padding:5px 8px">⬆ Admin</button>`;
      if(canDemote)  btnRow += `<button type="button" class="btn bgh bxs" onclick="demoteFromAdmin(${u.id})" title="Demote to Staff" style="padding:5px 8px">⬇ Staff</button>`;
      if(canResetPw) btnRow += `<button type="button" class="btn bin bxs" onclick="openAdminPwReset(${u.id})" title="Reset password" style="padding:5px 8px;min-width:32px">🔑</button>`;
      if(isPrimary() && u.role !== 'primaryAdmin') btnRow += `<button type="button" class="btn bg bxs" onclick="openUserPerms(${u.id})" title="Permissions" style="padding:5px 8px">🔐 Perms</button>`;
      if(canRemove)  btnRow += `<button type="button" class="btn ber bxs" onclick="removeUser(${u.id})" title="Remove user" style="padding:5px 8px;min-width:32px">✕</button>`;
      actionBtns = `<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">${btnRow}</div>`;
    }

    // ── CARD ──
    html += `<div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r10);padding:12px;margin-bottom:8px;transition:border-color .15s" onmouseover="this.style.borderColor='var(--bd2)'" onmouseout="this.style.borderColor='var(--bd)'">
      <!-- Top row: avatar + name + role badge -->
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:42px;height:42px;border-radius:50%;background:${avBg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.3)">${mkInit(u.name)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <div style="font-size:13px;font-weight:700;color:var(--t1)">${esc(u.name)}</div>
            ${roleBadge}
          </div>
          <div style="font-family:var(--fm);font-size:10px;color:var(--t3);margin-top:2px">@${esc(u.username)}</div>
        </div>
      </div>
      <!-- Inline stats row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">
        <div style="background:var(--s1);border-radius:8px;padding:7px 10px">
          <div style="font-size:8px;color:var(--t3);font-family:var(--fm);font-weight:700;letter-spacing:.06em">SALES MADE</div>
          <div style="font-size:14px;font-weight:800;color:var(--ok);font-family:var(--fd);margin-top:1px">${userSales}</div>
          <div style="font-size:9px;color:var(--t3);margin-top:1px">${f$(userSalesAmt)} total</div>
        </div>
        <div style="background:var(--s1);border-radius:8px;padding:7px 10px">
          <div style="font-size:8px;color:var(--t3);font-family:var(--fm);font-weight:700;letter-spacing:.06em">${u.lastLoginAt ? 'LAST SEEN' : 'STATUS'}</div>
          <div style="font-size:12px;font-weight:700;color:var(--t1);margin-top:2px">${lastLoginText}</div>
        </div>
      </div>
      ${actionBtns}
    </div>`;
  });
  html += `</div>`;

  // ─── ACTIVE INVITE CODES ───
  if(codes.length){
    html += `<div style="padding:9px 13px;border-top:1px solid var(--bd)">
      <div class="sh" style="margin-bottom:7px">Active Invite Codes</div>
    </div>`;
    codes.forEach(function(c){
      html += `<div style="padding:9px 13px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--bd)">
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--fm);font-size:17px;font-weight:700;color:var(--g);letter-spacing:.2em">${c.code}</div>
          <div style="font-size:11px;color:var(--t3)">${RLBL[c.role]||c.role}</div>
        </div>
        <button type="button" class="btn ber bxs" onclick="revokeCode('${c.code}')">Revoke</button>
      </div>`;
    });
  }

  const tb = document.getElementById('teambody');
  if(tb) tb.innerHTML = html;
}

// Helper: time ago in human format
function timeAgo(ts){
  if(!ts) return '';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60)+'m ago';
  if(s < 86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

function openAddUser(){switchUTab('manual');renderPG('manual');renderPG('invite');openD('d-adduser');}
function switchUTab(mode){el('utmanual').style.display=mode==='manual'?'':'none';el('utinvite').style.display=mode==='invite'?'':'none';el('utmc').classList.toggle('on',mode==='manual');el('utic').classList.toggle('on',mode==='invite');el('invres').style.display='none';}
function renderPG(tab){const role=el(tab==='manual'?'umrole':'uirole')?.value;const isAdm=role==='admin';const hint=el(tab==='manual'?'pmhint':'');if(hint)hint.textContent=isAdm?'Admins have full access.':'Select allowed modules.';const gridEl=el(tab==='manual'?'pmgrid':'pigrid');if(!gridEl)return;if(isAdm){gridEl.innerHTML='<div style="font-size:12px;color:var(--ok);font-weight:600">✓ Full access</div>';return;}if(!permSel[tab])permSel[tab]=MODS.slice();gridEl.innerHTML=MODS.map(m=>{const on=(permSel[tab]||[]).includes(m);return`<div class="pitem${on?' on':''}" onclick="togglePerm('${tab}','${m}')"><div class="pcb">${on?'✓':''}</div><div class="plbl">${MLBL[m]}</div></div>`;}).join('');}
function togglePerm(tab,mod){if(!permSel[tab])permSel[tab]=[];const i=permSel[tab].indexOf(mod);if(i>-1)permSel[tab].splice(i,1);else permSel[tab].push(mod);renderPG(tab);}
function saveUser(){const name=gv('umname'),un=gv('umuser'),pw=el('umpass')?.value||'',role=el('umrole')?.value||'dataOperator';if(!name||!un||!pw){toast('Fill all fields','er');return;}if(pw.length<4){toast('Password min 6 chars','er');return;}if(DB.users.find(u=>u.username===un)){toast('Username taken','er');return;}const mods=role==='admin'?MODS:(permSel['manual']||MODS);DB.users.push({id:DB.nextUserId++,username:un,password:pw,name,role,businessIds:[CBI],allowedModules:mods,phone:'',createdAt:Date.now()});addAdminLog('add_user','Added: '+name+' ('+RLBL[role]+')',CU.name);addNotif('user','New member: '+name);dbSave();closeD('d-adduser');openTeam();toast(name+' added!');}
function genInvite(){const role=el('uirole')?.value||'dataOperator',expH=parseInt(el('uiexp')?.value)||0,mods=role==='admin'?MODS:(permSel['invite']||MODS),code=g6();DB.inviteCodes.push({id:DB.nextCodeId++,code,role,mods,bizId:CBI,createdBy:CU.name,createdAt:Date.now(),expiresAt:expH===0?0:Date.now()+expH*3600000,used:false});dbSave();el('invres').style.display='';el('invres').innerHTML=`<div style="background:var(--gd);border:1.5px solid var(--bd2);border-radius:var(--r10);padding:13px;text-align:center"><div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px">Share this code</div><div style="font-family:var(--fm);font-size:26px;font-weight:900;color:var(--g);letter-spacing:.3em;margin-bottom:7px">${code}</div><div style="font-size:11px;color:var(--t3)">Role: ${RLBL[role]} · ${expH?'Expires in '+expH+'h':'No expiry'}</div></div>`;toast('Invite code generated!','gd');}
function revokeCode(code){DB.inviteCodes.filter(c=>c.code===code).forEach(c=>c.used=true);dbSave();openTeam();toast('Code revoked');}
function removeUser(userId){const u=DB.users.find(x=>x.id===userId);if(!u)return;showConf('👤','Remove Member?',u.name+' will lose access.',()=>{u.businessIds=u.businessIds.filter(id=>id!==CBI);dbSave();openTeam();toast('Member removed');});}

// ── ACCOUNT ──
function openChangePw(){sv('pwc','');sv('pwn','');sv('pwcf','');openD('d-pw');}
async function saveChangePw(){
  var cur = el('pwc') ? el('pwc').value : '';
  var nw  = el('pwn') ? el('pwn').value : '';
  var cf  = el('pwcf') ? el('pwcf').value : '';
  if(!cur||!nw||!cf){ toast('Fill all fields','er'); return; }
  // Verify current password (works with hashed AND plain-text)
  var curOk = await verifyPassword(cur, CU.password);
  if(!curOk){ toast('Current password is incorrect','er'); return; }
  // New password strength
  if(nw.length < 6){ toast('New password must be at least 6 characters','er'); return; }
  var WEAK_LIST = ['123456','111111','000000','123123','password','654321','112233'];
  if(WEAK_LIST.indexOf(nw) !== -1 || /^(.)+$/.test(nw)){
    toast('New password is too weak','er'); return;
  }
  if(nw !== cf){ toast('Passwords do not match','er'); return; }
  try {
    var hashed = await hashPassword(nw);
    var u = (DB.users||[]).find(function(x){ return x.id === CU.id; });
    if(u) u.password = hashed;
    CU.password = hashed;
    dbSave();
    // Push users immediately to Firebase so other devices get new password
    try{ if(typeof fbPushUsers==='function') fbPushUsers(); }catch(e){}
    // Also do full push to keep everything in sync
    try{ if(typeof fbPush==='function') setTimeout(fbPush, 500); }catch(e){}
    // Update Firebase Auth password
    try {
      if (FB_AUTH && FB_AUTH.currentUser) {
        FB_AUTH.currentUser.updatePassword(nw).then(function(){
          console.log('[Firebase Auth] Password updated in Firebase Auth');
        }).catch(function(err){
          console.warn('[Firebase Auth] Password update error:', err.code);
        });
      }
    } catch(e){}
    sv('pwc',''); sv('pwn',''); sv('pwcf','');
    closeD('d-pw');
    toast('✅ Password updated successfully!','gd');
  } catch(e) {
    toast('Error updating password: ' + e.message,'er');
  }
}
function openUserMenu(){el('umenubody').innerHTML=`<div style="padding:13px 17px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:11px"><div class="av" style="width:44px;height:44px;font-size:15px">${mkInit(CU.name)}</div><div><div class="fw7" style="font-size:15px">${esc(CU.name)}</div><div style="font-size:12px;color:var(--t3)">@${esc(CU.username)} · ${rb(CU.role)}</div></div></div><div style="padding:8px 13px"><button type="button" class="btn bgh bbl" style="justify-content:flex-start;gap:11px;margin-bottom:7px" onclick="closeD('d-umenu');openChangePw()">🔑 Change Password</button><button type="button" class="btn ber bbl" style="justify-content:flex-start;gap:11px" onclick="doLogout()">⏏ Sign Out</button></div>`;openD('d-umenu');}

// ── TILE CALCULATOR ──
function initCalc(){if(!el('calcrooms').children.length){calcRooms=[{id:1,name:'Room 1',l:0,w:0,area:0}];renderCalcRooms();}calcTiles();}
function addCalcRoom(){calcRooms.push({id:calcRId++,name:'Room '+calcRooms.length+1,l:0,w:0,area:0});renderCalcRooms();}
function removeCalcRoom(id){if(calcRooms.length<=1){toast('Need at least one room','er');return;}calcRooms=calcRooms.filter(r=>r.id!==id);renderCalcRooms();calcTiles();}
function renderCalcRooms(){const unit=el('tcu')?.value||'sqm',uL=unit==='sqft'?'ft':'m';el('calcrooms').innerHTML=calcRooms.map(r=>`<div class="calcroom"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:10px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.08em">${esc(r.name)}</span>${calcRooms.length>1?`<button type="button" onclick="removeCalcRoom(${r.id})" style="color:var(--er);font-size:12px;background:var(--erb);border:none;border-radius:var(--r99);padding:2px 10px;cursor:pointer">Remove</button>`:''}</div><div class="fr2"><div class="fg" style="margin:0"><label class="fl">Length (${uL})</label><input class="fi" type="number" id="cl${r.id}" placeholder="5" value="${r.l||''}" oninput="updateRoom(${r.id})"></div><div class="fg" style="margin:0"><label class="fl">Width (${uL})</label><input class="fi" type="number" id="cw${r.id}" placeholder="4" value="${r.w||''}" oninput="updateRoom(${r.id})"></div></div><div style="margin-top:5px;font-size:12px;color:var(--t3)" id="ca${r.id}">Area: —</div></div>`).join('');}
function updateRoom(id){const l=parseFloat(el(`cl${id}`)?.value)||0,w=parseFloat(el(`cw${id}`)?.value)||0;const r=calcRooms.find(x=>x.id===id);if(r){r.l=l;r.w=w;r.area=l*w;}const unit=el('tcu')?.value||'sqm';const aEl=el(`ca${id}`);if(aEl)aEl.textContent=`Area: ${r&&r.area>0?r.area.toFixed(2):'—'} ${unit==='sqft'?'ft²':'m²'}`;calcTiles();}
function calcTiles(){const tW=parseFloat(el('tcw')?.value)||60,tH=parseFloat(el('tch')?.value)||60,perBox=parseFloat(el('tcb')?.value)||6,unit=el('tcu')?.value||'sqm',waste=parseFloat(el('tcw2')?.value)||10;const tileSqm=(tW/100)*(tH/100);let totalArea=calcRooms.reduce((a,r)=>a+(r.area||0),0);if(unit==='sqft')totalArea*=0.0929;if(totalArea<=0){el('calcres').innerHTML='';return;}const areaW=totalArea*(1+waste/100),numTiles=Math.ceil(areaW/tileSqm),numBoxes=Math.ceil(numTiles/perBox);const roomSum=calcRooms.map(r=>`${esc(r.name)} (${(r.area||0).toFixed(1)}${unit==='sqft'?'ft²':'m²'})`).join(', ');el('calcres').innerHTML=`<div class="calcres"><div style="font-size:10px;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.1em;margin-bottom:9px">Result</div><div class="crgrid"><div class="cri"><div class="crl">Total Area</div><div class="crv">${totalArea.toFixed(2)}m²</div></div><div class="cri"><div class="crl">+${waste}% Waste</div><div class="crv">${areaW.toFixed(2)}m²</div></div><div class="cri"><div class="crl">Tiles Needed</div><div class="crv">${numTiles} pcs</div></div><div class="cri"><div class="crl">Boxes Needed</div><div class="crv">${numBoxes} box</div></div></div><div style="margin-top:11px;font-size:11px;opacity:.7">${tW}×${tH}cm · ${perBox}/box · ${roomSum}</div></div>`;}


// ── DAILY REPORT ──────────────────────────────────────────
function openDailyReport(){
  sv('report-date', today());
  switchRptTab('summary');
  renderDailyReport();
  openD('d-report');
}
function switchRptTab(tab){
  const tabs=['summary','cash','preview'];
  tabs.forEach(t=>{
    const pane=el('rpt-'+t);if(pane)pane.style.display=t===tab?'':'none';
    const chip=el('rpt-tab-'+t);if(chip)chip.classList.toggle('on',t===tab);
  });
  if(tab==='preview')buildPrintPreview();
}
// ── CASH COUNTING ──
function calcCash(){
  // USD row values
  var usdRows=[
    {id:'usd-100',  val:100},
    {id:'usd-50',   val:50},
    {id:'usd-20',   val:20},
    {id:'usd-10',   val:10},
    {id:'usd-5',    val:5},
    {id:'usd-1',    val:1},
    {id:'usd-coins',val:1},
  ];
  var usd=0;
  usdRows.forEach(function(r){
    var inp=document.getElementById(r.id);
    var qty=inp?parseFloat(inp.value)||0:0;
    var rowVal = (r.id === 'usd-coins') ? qty : qty * r.val;
    usd += rowVal;
    var valEl = document.getElementById(r.id+'-val');
    if(valEl) valEl.textContent = rowVal > 0 ? '$' + rowVal.toFixed(2) : '—';
  });

  // LRD row values
  var lrdRows=[
    {id:'lrd-1000', val:1000},
    {id:'lrd-500',  val:500},
    {id:'lrd-100',  val:100},
    {id:'lrd-50',   val:50},
    {id:'lrd-20',   val:20},
    {id:'lrd-10',   val:10},
    {id:'lrd-5',    val:5},
  ];
  var lrd=0;
  lrdRows.forEach(function(r){
    var inp=document.getElementById(r.id);
    var qty=inp?parseFloat(inp.value)||0:0;
    var rowVal=qty*r.val;
    lrd+=rowVal;
    var valEl=document.getElementById(r.id+'-val');
    if(valEl) valEl.textContent=rowVal>0?'L$'+rowVal.toFixed(0):'—';
  });

  var rate=parseFloat(document.getElementById('exch-rate')?document.getElementById('exch-rate').value:195)||195;
  var lrdInUsd=lrd/rate;
  var grand=usd+lrdInUsd;

  // Update totals
  var usdTot=document.getElementById('usd-total');
  var lrdTot=document.getElementById('lrd-total');
  var lrdUsd=document.getElementById('lrd-in-usd');
  var grandEl=document.getElementById('grand-total-usd');
  if(usdTot) usdTot.textContent='$'+usd.toFixed(2);
  if(lrdTot) lrdTot.textContent='L$'+lrd.toFixed(0);
  if(lrdUsd) lrdUsd.textContent='$'+lrdInUsd.toFixed(2);
  if(grandEl) grandEl.textContent='$'+grand.toFixed(2);

  // Reconciliation
  var b=biz();if(!b)return;
  var date=document.getElementById('report-date')?document.getElementById('report-date').value:today();
  var dayS=(b.sales||[]).filter(function(s){return s.date===date&&s.status!=='cancelled';});
  var dayE=(b.expenses||[]).filter(function(e){return e.date===date&&e.status!=='cancelled';});
  var expectedCash=dayS.reduce(function(a,s){return a+(s.paymode==='Cash'?(s.paid||0):0);},0);
  var totalExp=dayE.reduce(function(a,e){return a+(e.amount||0);},0);
  var netExpected=expectedCash-totalExp;
  var diff=grand-netExpected;

  var rcEl=document.getElementById('recon-cash');
  var reEl=document.getElementById('recon-exp');
  var rnEl=document.getElementById('recon-net');
  var rtEl=document.getElementById('recon-total');
  var rdEl=document.getElementById('recon-diff');
  if(rcEl) rcEl.textContent='$'+expectedCash.toFixed(2);
  if(reEl) reEl.textContent='-$'+totalExp.toFixed(2);
  if(rnEl) rnEl.textContent='$'+netExpected.toFixed(2);
  if(rtEl) rtEl.textContent='$'+grand.toFixed(2);
  if(rdEl){
    rdEl.textContent = (diff >= 0 ? '+$' : '-$') + Math.abs(diff).toFixed(2);
    rdEl.style.color = Math.abs(diff) < 0.01 ? 'var(--ok)' : diff > 0 ? 'var(--wa)' : 'var(--er)';
  }
  var rsEl = document.getElementById('recon-status');
  if(rsEl){
    if(Math.abs(diff) < 0.01){
      rsEl.textContent = '✓ BALANCED PERFECTLY';
      rsEl.style.background = 'var(--okb)';
      rsEl.style.color = 'var(--ok)';
      rsEl.style.border = '1px solid var(--okbd)';
    } else if(diff > 0){
      rsEl.textContent = '↑ SURPLUS · $' + diff.toFixed(2) + ' more than expected';
      rsEl.style.background = 'var(--wab)';
      rsEl.style.color = 'var(--wa)';
      rsEl.style.border = '1px solid var(--wabd)';
    } else {
      rsEl.textContent = '↓ SHORTAGE · $' + Math.abs(diff).toFixed(2) + ' less than expected';
      rsEl.style.background = 'var(--erb)';
      rsEl.style.color = 'var(--er)';
      rsEl.style.border = '1px solid var(--erbd)';
    }
  }
}
function resetCashCount(){
  ['usd-100','usd-50','usd-20','usd-10','usd-5','usd-1','usd-coins','lrd-1000','lrd-500','lrd-100','lrd-50','lrd-20','lrd-10','lrd-5'].forEach(id=>{const e=el(id);if(e)e.value=0;});
  calcCash();toast('Cash count reset');
}
function buildPrintPreview(){
  const b=biz();if(!b)return;
  const date=el('report-date')?.value||today();
  const dayS=(b.sales||[]).filter(s=>s.date===date&&s.status!=='cancelled');
  const dayE=(b.expenses||[]).filter(e=>e.date===date&&e.status!=='cancelled');
  const grossSales=dayS.reduce((a,s)=>a+sTotal(s),0);
  const totalPaid=dayS.reduce((a,s)=>a+(s.paid||0),0);
  const totalOwed=dayS.reduce((a,s)=>a+sDue(s),0);
  const totalExp=dayE.reduce((a,e)=>a+(e.amount||0),0);
  const profit=grossSales-totalExp;
  const rate=parseFloat(el('exch-rate')?.value)||195;
  // ── Cash totals — SAME source of truth as calcCash() ──
  const usdRows2=[
    {id:'usd-100',  val:100},
    {id:'usd-50',   val:50},
    {id:'usd-20',   val:20},
    {id:'usd-10',   val:10},
    {id:'usd-5',    val:5},
    {id:'usd-1',    val:1},
    {id:'usd-coins',val:1}
  ];
  const lrdRows2=[
    {id:'lrd-1000', val:1000},
    {id:'lrd-500',  val:500},
    {id:'lrd-100',  val:100},
    {id:'lrd-50',   val:50},
    {id:'lrd-20',   val:20},
    {id:'lrd-10',   val:10},
    {id:'lrd-5',    val:5}
  ];
  let usd=0;
  usdRows2.forEach(function(r){
    const inp=document.getElementById(r.id);
    const qty=inp?parseFloat(inp.value)||0:0;
    usd += (r.id==='usd-coins') ? qty : qty*r.val;
  });
  let lrd=0;
  lrdRows2.forEach(function(r){
    const inp=document.getElementById(r.id);
    const qty=inp?parseFloat(inp.value)||0:0;
    lrd += qty*r.val;
  });
  const lrdUSD=lrd/rate;
  const grandCash=usd+lrdUSD;
  const netExpected=totalPaid-totalExp;
  const diff=grandCash-netExpected;
  const prep=gv('sig-prep'),appr=gv('sig-appr'),notes=gv('rpt-notes');
  const itemMap={};dayS.forEach(s=>s.items.forEach(i=>{if(!itemMap[i.name])itemMap[i.name]={qty:0,total:0,cat:i.category||''};itemMap[i.name].qty+=i.qty;itemMap[i.name].total+=i.qty*i.unitPrice;}));
  const items=Object.entries(itemMap).sort((a,b)=>b[1].total-a[1].total);
  let pv=`<div id="printable-report" style="background:#fff;padding:20px;border:1px solid var(--bd);border-radius:var(--r14);color:#111;font-family:Georgia,serif;">
    <!-- HEADER -->
    <div style="text-align:center;border-bottom:3px solid #D4A520;padding-bottom:12px;margin-bottom:14px">
      <div style="font-family:sans-serif;font-size:24px;font-weight:900;color:#B8900A;letter-spacing:.04em">${esc(b.name)}</div>
      ${b.address?`<div style="font-size:11px;color:#666;margin-top:3px">${esc(b.address)}${b.phone?' · '+esc(b.phone):''}</div>`:''}
      <div style="font-size:13px;font-weight:700;color:#333;margin-top:6px;text-transform:uppercase;letter-spacing:.08em">Daily Cash Report</div>
      <div style="font-size:11px;color:#888;margin-top:3px">Date: ${date} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
    </div>
    <!-- BUSINESS SUMMARY -->
    <div style="margin-bottom:14px">
      <div style="font-family:sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin-bottom:10px">A. Business Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:sans-serif">
        <tr style="background:#f9f5ee"><td style="padding:7px 10px;border:1px solid #e0d5c0;font-weight:700">Gross Sales</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;font-weight:900;color:#B8900A">${f$(grossSales)}</td></tr>
        <tr><td style="padding:7px 10px;border:1px solid #e0d5c0">Total Expenses</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;color:#dc2626">(${f$(totalExp)})</td></tr>
        <tr style="background:#f9f5ee"><td style="padding:7px 10px;border:1px solid #e0d5c0">Amount Collected (Cash)</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;color:#16a34a">${f$(totalPaid)}</td></tr>
        <tr><td style="padding:7px 10px;border:1px solid #e0d5c0">Outstanding Credit</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;color:#d97706">${f$(totalOwed)}</td></tr>
        <tr><td style="padding:7px 10px;border:1px solid #e0d5c0">Total Transactions</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right">${dayS.length} sales, ${dayE.length} expenses</td></tr>
        <tr style="background:${profit>=0?'#dcfce7':'#fee2e2'}"><td style="padding:9px 10px;border:2px solid ${profit>=0?'#16a34a':'#dc2626'};font-size:13px;font-weight:900;font-family:sans-serif">NET PROFIT</td><td style="padding:9px 10px;border:2px solid ${profit>=0?'#16a34a':'#dc2626'};text-align:right;font-size:15px;font-weight:900;color:${profit>=0?'#16a34a':'#dc2626'}">${profit>=0?'+':''}${f$(profit)}</td></tr>
      </table>
    </div>`;
  // SALES LIST
  if(dayS.length){pv+=`<div style="margin-bottom:14px"><div style="font-family:sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin-bottom:10px">B. Sales Records (${dayS.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:sans-serif">
      <thead><tr style="background:#f5f0e6"><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Invoice</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Customer</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Items</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:right">Total</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:right">Paid</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:center">Status</th></tr></thead>
      <tbody>`;
    dayS.forEach((s,idx)=>{const st=sSt(s);pv+=`<tr style="background:${idx%2?'#fff':'#faf8f4'}"><td style="padding:6px 8px;border:1px solid #e8e0cc;font-family:monospace;font-size:10px">${esc(s.inv||'—')}</td><td style="padding:6px 8px;border:1px solid #e8e0cc">${esc(s.customer||'Walk-in')}${s.contact?'<br><small style="color:#888">'+esc(s.contact)+'</small>':''}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;font-size:10px">${s.items.map(i=>esc(i.name)+' ×'+i.qty).join('<br>')}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;font-weight:700;color:#B8900A">${f$(sTotal(s))}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;color:#16a34a">${f$(s.paid||0)}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:center"><span style="padding:1px 6px;border-radius:99px;font-size:9px;font-weight:700;background:${st==='PAID'?'#dcfce7':st==='PARTIAL'?'#fef3c7':'#fee2e2'};color:${st==='PAID'?'#166534':st==='PARTIAL'?'#92400e':'#991b1b'}">${st}</span></td></tr>`;});
    pv+=`</tbody><tfoot><tr style="background:#f5f0e6"><td colspan="3" style="padding:7px 8px;border:1px solid #e0d5c0;font-weight:700;font-size:11px">TOTALS</td><td style="padding:7px 8px;border:1px solid #e0d5c0;text-align:right;font-weight:900;color:#B8900A">${f$(grossSales)}</td><td style="padding:7px 8px;border:1px solid #e0d5c0;text-align:right;font-weight:900;color:#16a34a">${f$(totalPaid)}</td><td></td></tr></tfoot></table></div>`;}
  // EXPENSES LIST
  if(dayE.length){pv+=`<div style="margin-bottom:14px"><div style="font-family:sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin-bottom:10px">C. Expenses (${dayE.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:sans-serif">
      <thead><tr style="background:#f5f0e6"><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Description</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Category</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">By</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:right">Amount</th></tr></thead>
      <tbody>`;
    dayE.forEach((e,idx)=>{pv+=`<tr style="background:${idx%2?'#fff':'#faf8f4'}"><td style="padding:6px 8px;border:1px solid #e8e0cc">${esc(e.description)}</td><td style="padding:6px 8px;border:1px solid #e8e0cc">${esc(e.category||'General')}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;color:#888;font-size:10px">${esc(e.by||'—')}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;color:#dc2626;font-weight:700">${f$(e.amount)}</td></tr>`;});
    pv+=`</tbody><tfoot><tr style="background:#fee2e2"><td colspan="3" style="padding:7px 8px;border:1px solid #e0d5c0;font-weight:700">TOTAL EXPENSES</td><td style="padding:7px 8px;border:1px solid #e0d5c0;text-align:right;font-weight:900;color:#dc2626">${f$(totalExp)}</td></tr></tfoot></table></div>`;}
  // PRODUCTS SOLD
  if(items.length){pv+=`<div style="margin-bottom:14px"><div style="font-family:sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin-bottom:10px">D. Products Sold Summary</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:sans-serif"><thead><tr style="background:#f5f0e6"><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Product</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:center">Qty Sold</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:right">Revenue</th></tr></thead><tbody>`;
    items.forEach(([name,d],idx)=>{pv+=`<tr style="background:${idx%2?'#fff':'#faf8f4'}"><td style="padding:6px 8px;border:1px solid #e8e0cc">${esc(name)}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:center">${d.qty}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;font-weight:700;color:#B8900A">${f$(d.total)}</td></tr>`;});
    pv+=`</tbody></table></div>`;}
  // CASH COUNT
  if(usd>0||lrd>0){pv+=`<div style="margin-bottom:14px"><div style="font-family:sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin-bottom:10px">E. Cash Count &amp; Reconciliation</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:sans-serif;margin-bottom:10px">
      <thead><tr style="background:#f5f0e6"><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Currency</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:left">Denominations</th><th style="padding:6px 8px;border:1px solid #e0d5c0;text-align:right">Amount</th></tr></thead>
      <tbody>
        <tr><td style="padding:6px 8px;border:1px solid #e8e0cc;font-weight:700">USD ($)</td><td style="padding:6px 8px;border:1px solid #e8e0cc;font-size:10px;color:#666">100×${el('usd-100')?.value||0}, 50×${el('usd-50')?.value||0}, 20×${el('usd-20')?.value||0}, 10×${el('usd-10')?.value||0}, 5×${el('usd-5')?.value||0}, 1×${el('usd-1')?.value||0}, coins ${f$(parseFloat(el('usd-coins')?.value)||0)}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;font-weight:700">${f$(usd)}</td></tr>
        <tr style="background:#faf8f4"><td style="padding:6px 8px;border:1px solid #e8e0cc;font-weight:700">LRD (L$)</td><td style="padding:6px 8px;border:1px solid #e8e0cc;font-size:10px;color:#666">1000×${el('lrd-1000')?.value||0}, 500×${el('lrd-500')?.value||0}, 100×${el('lrd-100')?.value||0}, 50×${el('lrd-50')?.value||0}, 20×${el('lrd-20')?.value||0}, 10×${el('lrd-10')?.value||0}, 5×${el('lrd-5')?.value||0}</td><td style="padding:6px 8px;border:1px solid #e8e0cc;text-align:right;font-weight:700">L$${fN(lrd)} ≈ ${f$(lrdUSD)}</td></tr>
        <tr style="background:#f5f0e6"><td colspan="2" style="padding:7px 8px;border:1px solid #e0d5c0;font-weight:700">Rate: 1 USD = ${rate} LRD &nbsp;|&nbsp; Grand Total Cash</td><td style="padding:7px 8px;border:1px solid #e0d5c0;text-align:right;font-weight:900;color:#B8900A;font-size:13px">${f$(grandCash)}</td></tr>
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:sans-serif">
      <tr><td style="padding:7px 10px;border:1px solid #e0d5c0">💰 Cash from Sales</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;font-weight:700;color:#16a34a">${f$(totalPaid)}</td></tr>
      <tr><td style="padding:7px 10px;border:1px solid #e0d5c0">💸 Less: Expenses Paid</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;font-weight:700;color:#dc2626">-${f$(totalExp)}</td></tr>
      <tr style="background:#fef9ee"><td style="padding:7px 10px;border:1px solid #e0d5c0;font-weight:800">🎯 Expected in Drawer</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;font-weight:800;color:#B8900A">${f$(netExpected)}</td></tr>
      <tr style="background:#f9f5ee"><td style="padding:7px 10px;border:1px solid #e0d5c0">📊 Actual Cash Counted</td><td style="padding:7px 10px;border:1px solid #e0d5c0;text-align:right;font-weight:700">${f$(grandCash)}</td></tr>
      <tr style="background:${Math.abs(diff)<0.01?'#dcfce7':diff>0?'#dcfce7':'#fee2e2'}"><td style="padding:9px 10px;border:2px solid ${Math.abs(diff)<0.01?'#16a34a':diff>0?'#16a34a':'#dc2626'};font-weight:900">${Math.abs(diff)<0.01?'✓ BALANCED':diff>0?'📈 SURPLUS':'⚠️ SHORTAGE'}</td><td style="padding:9px 10px;border:2px solid ${Math.abs(diff)<0.01?'#16a34a':diff>0?'#16a34a':'#dc2626'};text-align:right;font-weight:900;font-size:14px;color:${Math.abs(diff)<0.01?'#166534':diff>0?'#166534':'#991b1b'}">${diff>=0?'+':''}${f$(diff)}</td></tr>
    </table>
  </div>`;}
  // NOTES
  if(notes){pv+=`<div style="margin-bottom:14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;font-family:sans-serif;font-size:12px"><strong>Remarks:</strong> ${esc(notes)}</div>`;}
  // SIGNATURES
  pv+=`<div style="margin-top:20px;padding-top:16px;border-top:2px solid #D4A520">
    <div class="sig-grid">
      <div class="sig-box"><div class="sig-lbl">Prepared By</div><div style="height:36px;border-bottom:1.5px solid #999;margin:8px 0 4px"></div><div class="sig-name">${esc(prep)||'____________________'}</div></div>
      <div class="sig-box"><div class="sig-lbl">Approved By</div><div style="height:36px;border-bottom:1.5px solid #999;margin:8px 0 4px"></div><div class="sig-name">${esc(appr)||'____________________'}</div></div>
    </div>
    <div style="text-align:center;margin-top:12px;font-family:sans-serif;font-size:10px;color:#aaa">SmartStock Pro &bull; ${esc(b.name)} &bull; ${new Date().toLocaleString()}</div>
  </div></div>`;
  const prevEl=el('print-preview-body');if(prevEl)prevEl.innerHTML=pv;
}
function printReport(){
  // Build latest preview
  buildPrintPreview();

  var previewEl = document.getElementById('rpt-preview');
  if(!previewEl){ alert('No report to print. Tap Generate first.'); return; }

  var content = previewEl.innerHTML;
  if(!content || content.trim().length < 50){
    alert('No report content. Tap Generate first.'); return;
  }

  // Create a full-page print overlay that covers the app
  var overlay = document.createElement('div');
  overlay.id = 'print-overlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:#fff','overflow:auto',
    'font-family:Georgia,serif','color:#111',
    'padding:20px'
  ].join(';');
  overlay.innerHTML =
    '<div style="max-width:900px;margin:0 auto">' +
      '<div class="no-print" style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 0;margin-bottom:16px;display:flex;gap:10px;z-index:1">' +
        '<button onclick="window.print()" style="padding:10px 24px;background:linear-gradient(135deg,#D4A520,#A07810);color:#060810;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer">🖨 Print</button>' +
        '<button onclick="document.getElementById(\'print-overlay\').remove()" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">✕ Close</button>' +
      '</div>' +
      content +
    '</div>';

  document.body.appendChild(overlay);

  // Add print CSS to hide everything except the overlay
  var printStyle = document.createElement('style');
  printStyle.id = 'print-style-override';
  printStyle.textContent =
    '@media print{' +
      'body > *:not(#print-overlay){ display:none !important; }' +
      '#print-overlay .no-print{ display:none !important; }' +
      '#print-overlay{ position:static !important; overflow:visible !important; padding:0 !important; }' +
      '@page{ margin:10mm; size:A4; }' +
    '}';
  document.head.appendChild(printStyle);

  // Auto-print
  setTimeout(function(){
    window.print();
  }, 300);
}
function renderDailyReport(){
  var b=biz();if(!b)return;
  var dateEl=document.getElementById('report-date');
  var date=dateEl?dateEl.value:today();
  if(document.getElementById('report-date-sub'))
    document.getElementById('report-date-sub').textContent='Report for: '+date;

  var dayS=(b.sales||[]).filter(function(s){return s.date===date&&s.status!=='cancelled';});
  var dayE=(b.expenses||[]).filter(function(e){return e.date===date&&e.status!=='cancelled';});
  var grossSales=dayS.reduce(function(a,s){return a+sTotal(s);},0);
  var totalPaid =dayS.reduce(function(a,s){return a+(s.paid||0);},0);
  var totalOwed =dayS.reduce(function(a,s){return a+sDue(s);},0);
  var actualExp =dayE.reduce(function(a,e){return a+(e.amount||0);},0);
  // ── Include daily allocations (if enabled) ──
  var allocEnabled = (b.allocationsEnabled !== false);
  var allocExp = 0;
  var allocBreakdown = null;
  if (allocEnabled && typeof getDayAllocations === 'function') {
    allocBreakdown = getDayAllocations(date);
    allocExp = (allocBreakdown && allocBreakdown.total) || 0;
  }
  var totalExp  = actualExp + allocExp;
  var profit    = grossSales - totalExp;
  var margin    = grossSales>0?Math.round((profit/grossSales)*100):0;

  // Build products sold summary
  var prodMap={};
  dayS.forEach(function(s){
    (s.items||[]).forEach(function(i){
      if(!prodMap[i.name]) prodMap[i.name]={name:i.name,qty:0,revenue:0};
      prodMap[i.name].qty+=i.qty;
      prodMap[i.name].revenue+=i.qty*i.unitPrice;
    });
  });
  var prodSold=Object.values(prodMap).sort(function(a2,b2){return b2.revenue-a2.revenue;});

  var rb=document.getElementById('report-body');if(!rb)return;

  var salesRows='<tr><td colspan="5" style="padding:10px;text-align:center;color:#9ca3af;font-size:12px">No sales for this date.</td></tr>';
  if(dayS.length){
    salesRows=dayS.map(function(s){
      var st2=sSt(s);
      var stC=st2==='PAID'?'#16a34a':st2==='PARTIAL'?'#d97706':'#dc2626';
      return '<tr>'+
        '<td style="padding:7px 10px;font-family:monospace;font-size:11px;color:#111">'+esc(s.inv||'—')+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#111">'+esc(s.customer||'Walk-in')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#555">'+
          (s.items||[]).map(function(i){return esc(i.name)+' \u00d7'+i.qty;}).join(', ')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#111">'+f$(sTotal(s))+'</td>'+
        '<td style="padding:7px 10px;text-align:center">'+
          '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:'+stC+';color:#fff">'+st2+'</span>'+
        '</td>'+
      '</tr>';
    }).join('');
  }

  var expRows='<tr><td colspan="4" style="padding:10px;text-align:center;color:#9ca3af;font-size:12px">No expenses for this date.</td></tr>';
  if(dayE.length || (allocBreakdown && allocBreakdown.breakdown.length)){
    var rowsArr = [];
    dayE.forEach(function(e){
      rowsArr.push('<tr>'+
        '<td style="padding:7px 10px;font-size:12px;color:#111">'+esc(e.description)+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#555">'+esc(e.category||'General')+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#555">'+esc(e.by||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#dc2626">'+f$(e.amount)+'</td>'+
      '</tr>');
    });
    // Add allocation rows (yellow background to distinguish)
    if (allocBreakdown && allocBreakdown.breakdown && allocBreakdown.breakdown.length) {
      allocBreakdown.breakdown.forEach(function(a){
        var label = a.type === 'doc' ? '📋 ' + a.name : '👤 ' + a.name + ' (salary)';
        var cat = a.type === 'doc' ? 'Documentation' : 'Salary';
        rowsArr.push('<tr style="background:#fff8e1">'+
          '<td style="padding:7px 10px;font-size:12px;color:#111;font-style:italic">'+esc(label)+'</td>'+
          '<td style="padding:7px 10px;font-size:12px;color:#555">'+cat+' (allocated)</td>'+
          '<td style="padding:7px 10px;font-size:11px;color:#777">auto</td>'+
          '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#d97706">'+f$(a.amount)+'</td>'+
        '</tr>');
      });
    }
    expRows = rowsArr.join('');
  } else {
    expRows=dayE.map(function(e){
      return '<tr>'+
        '<td style="padding:7px 10px;font-size:12px;color:#111">'+esc(e.description)+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#555">'+esc(e.category||'General')+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#555">'+esc(e.by||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#dc2626">'+f$(e.amount)+'</td>'+
      '</tr>';
    }).join('');
  }

  var prodRows='';
  if(prodSold.length){
    prodRows=prodSold.map(function(p,idx){
      return '<tr>'+
        '<td style="padding:7px 10px;font-size:12px;color:#555;text-align:center">'+(idx+1)+'</td>'+
        '<td style="padding:7px 10px;font-size:12px;color:#111">'+esc(p.name)+'</td>'+
        '<td style="padding:7px 10px;text-align:center;font-weight:700;color:#111">'+p.qty+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#D4A520">'+f$(p.revenue)+'</td>'+
      '</tr>';
    }).join('');
  }

  // Build the full report HTML (same styles for screen AND print)
  var reportHtml=
    '<div id="printable-report" style="font-family:Georgia,serif;padding:20px;color:#111;max-width:900px;margin:0 auto">'+

      // Title bar
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #D4A520">'+
        '<div>'+
          '<div style="font-size:22px;font-weight:900;color:#111">Daily Business Report</div>'+
          '<div style="font-size:13px;color:#6b7280;margin-top:4px">'+esc(b.name)+' &bull; '+date+' &bull; Generated '+new Date().toLocaleTimeString()+'</div>'+
        '</div>'+
        (b.logoType==='image'&&b.logoData
          ? '<img src="'+b.logoData+'" style="height:50px;width:50px;object-fit:cover;border-radius:10px">'
          : '<div style="width:50px;height:50px;border-radius:10px;background:linear-gradient(135deg,#D4A520,#A07810);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff">'+mkInit(b.name)+'</div>')+
      '</div>'+

      // KPI cards (3 per row)
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">'+
        kpiBox('Gross Sales',    f$(grossSales), '#16a34a')+
        kpiBox('Total Expenses', f$(totalExp),   '#dc2626')+
        kpiBox('Net Profit',     (profit>=0?'+':'')+f$(profit), profit>=0?'#16a34a':'#dc2626')+
        kpiBox('Cash Collected', f$(totalPaid),  '#2563eb')+
        kpiBox('Credit Owed',    f$(totalOwed),  '#d97706')+
        kpiBox('Profit Margin',  margin+'%',     margin>=50?'#16a34a':margin>=25?'#d97706':'#dc2626')+
      '</div>'+

      // Profit summary bar
      '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">'+
        '<div>'+
          '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Net Profit = Gross Sales \u2212 Expenses</div>'+
          '<div style="font-size:13px;color:#555">'+f$(grossSales)+' \u2212 '+f$(totalExp)+' = <b style="color:'+(profit>=0?'#16a34a':'#dc2626')+'">'+f$(profit)+'</b></div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:28px;font-weight:900;color:'+(profit>=0?'#16a34a':'#dc2626')+'">'+(profit>=0?'+':'')+f$(profit)+'</div>'+
          '<div style="font-size:11px;color:#6b7280">'+margin+'% margin</div>'+
        '</div>'+
      '</div>'+

      // Sales table
      rptSection('Sales ('+dayS.length+' transactions)',
        '<table style="width:100%;border-collapse:collapse">'+
          '<thead><tr style="background:#f3f4f6">'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Invoice</th>'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Customer</th>'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Items</th>'+
            '<th style="padding:8px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Total</th>'+
            '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Status</th>'+
          '</tr></thead>'+
          '<tbody>'+salesRows+'</tbody>'+
          '<tfoot><tr style="background:#fef9ee;border-top:2px solid #D4A520">'+
            '<td colspan="3" style="padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280">TOTALS ('+dayS.length+' transactions)</td>'+
            '<td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:900;color:#D4A520">'+f$(grossSales)+'</td>'+
            '<td></td>'+
          '</tr></tfoot>'+
        '</table>')+

      // Expenses table
      rptSection('Expenses ('+dayE.length+')',
        '<table style="width:100%;border-collapse:collapse">'+
          '<thead><tr style="background:#f3f4f6">'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Description</th>'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Category</th>'+
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">By</th>'+
            '<th style="padding:8px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Amount</th>'+
          '</tr></thead>'+
          '<tbody>'+expRows+'</tbody>'+
          '<tfoot><tr style="background:#fff5f5;border-top:2px solid #dc2626">'+
            '<td colspan="3" style="padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280">TOTAL EXPENSES</td>'+
            '<td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:900;color:#dc2626">-'+f$(totalExp)+'</td>'+
          '</tr></tfoot>'+
        '</table>')+

      // Products sold
      (prodSold.length?
        rptSection('Products Sold',
          '<table style="width:100%;border-collapse:collapse">'+
            '<thead><tr style="background:#f3f4f6">'+
              '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">#</th>'+
              '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Product</th>'+
              '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Qty</th>'+
              '<th style="padding:8px 10px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb">Revenue</th>'+
            '</tr></thead>'+
            '<tbody>'+prodRows+'</tbody>'+
          '</table>'):'')+

      // Signature section
      '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;margin-top:16px">'+
          sigBox('Prepared by')+
          sigBox('Verified by')+
          sigBox('Approved by')+
        '</div>'+
      '</div>'+

    '</div>';

  rb.innerHTML = reportHtml;
  // Store for print
  window._lastReportHtml = reportHtml;
  window._lastReportDate = date;
  window._lastReportBiz  = b;
}

function kpiBox(label, value, color){
  return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;border-left:4px solid '+color+'">'+
    '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">'+label+'</div>'+
    '<div style="font-size:22px;font-weight:900;color:'+color+'">'+value+'</div>'+
  '</div>';
}

function rptSection(title, content){
  return '<div style="margin-bottom:20px">'+
    '<div style="font-size:14px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">'+title+'</div>'+
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">'+content+'</div>'+
  '</div>';
}

function sigBox(label){
  return '<div>'+
    '<div style="border-top:1.5px solid #d1d5db;margin-bottom:6px;margin-top:40px"></div>'+
    '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">'+label+'</div>'+
  '</div>';
}

function printDailyReport(){
  var html = window._lastReportHtml;
  if(!html){ renderDailyReport(); html=window._lastReportHtml; }
  if(!html) return;
  var win=window.open('','_blank','width=900,height=700,toolbar=no,menubar=no,scrollbars=yes');
  if(!win){ alert('Please allow popups to print'); return; }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Daily Report</title>'+
    '<style>'+
      'body{margin:0;padding:20px;background:#fff;font-family:Georgia,serif}'+
      '@media print{'+
        'body{padding:0}'+
        '@page{margin:12mm;size:A4}'+
        '.no-print{display:none}'+
      '}'+
      'table{border-collapse:collapse;width:100%}'+
      'tr:nth-child(even){background:#f9fafb}'+
    '</style>'+
    '</head><body>'+html+'</bo'+'dy></ht'+'ml>'
  );
  win.document.close();
  setTimeout(function(){ win.focus(); win.print(); }, 600);
}

function renderWeekChart(){
  const b=biz();if(!b)return;
  const days=[];
  for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);}
  var vals=days.map(function(d){return(b.sales||[]).filter(function(s){return s.date===d&&s.status!=='cancelled';}).reduce(function(a,s){return a+sTotal(s);},0);});
  var maxVal=Math.max.apply(null,vals.concat([1]));
  var todayStr=today();
  var weekTotal=vals.reduce(function(a,v){return a+v;},0);
  if(el('weekly-total'))el('weekly-total').textContent=f$(weekTotal);
  var wrap=el('week-chart');if(!wrap)return;
  var dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'];
  wrap.innerHTML=days.map(function(d,i){
    var pct=Math.max((vals[i]/maxVal)*100,3);
    var isNow=d===todayStr;
    var dn=dayNames[new Date(d+'T12:00:00').getDay()];
    var amtLabel=vals[i]>0?f$(vals[i]):'';
    return '<div class="week-bar-col">'+
      '<div class="week-bar-fill '+(isNow?'today':'past')+'" style="height:'+pct+'%" title="'+f$(vals[i])+'">'+
        (isNow&&vals[i]>0?'<div style="position:absolute;bottom:calc(100%+3px);left:50%;transform:translateX(-50%);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--g);white-space:nowrap">'+f$(vals[i])+'</div>':'')+'</div>'+
      '<div class="week-bar-lbl" style="color:'+(isNow?'var(--g)':'var(--t3)')+';font-weight:'+(isNow?'800':'500')+'">'+dn+'</div>'+
    '</div>';
  }).join('');
}

function renderCustomers(){
  const b=biz();
  if(!b){ var cw=el('custlist'); if(cw) cw.innerHTML='<div style="padding:30px;text-align:center;color:var(--t3)"><div style="font-size:32px;margin-bottom:10px">⏳</div><div style="font-weight:700">Loading...</div></div>'; return; }
  const q=(gv('custq')||'').toLowerCase();
  const sales=(b.sales||[]).filter(s=>s.status!=='cancelled');
  const spendMap={};
  sales.forEach(s=>{const k=(s.customer||'').toLowerCase();spendMap[k]=(spendMap[k]||0)+sTotal(s);});
  let custs=(b.customers||[]);
  if(q)custs=custs.filter(c=>c.name.toLowerCase().includes(q)||(c.phone||'').includes(q));
  const totalSpend=Object.values(spendMap).reduce((a,v)=>a+v,0);
  const sumEl=el('cust-summary');
  if(sumEl)sumEl.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'+
    '<div class="cust-stat"><div class="cust-stat-l">Total</div><div class="cust-stat-v c-g">'+((b.customers||[]).length)+'</div></div>'+
    '<div class="cust-stat"><div class="cust-stat-l">Revenue</div><div class="cust-stat-v c-ok">'+f$(totalSpend)+'</div></div>'+
    '<div class="cust-stat"><div class="cust-stat-l">Avg Spend</div><div class="cust-stat-v c-in">'+
    ((b.customers||[]).length>0?f$(totalSpend/(b.customers||[]).length):f$(0))+'</div></div></div>';
  const wrap=el('custlist');if(!wrap)return;
  if(!custs.length){
    wrap.innerHTML=q?
      emS('🔍','No Customers Found','Try a different search term.'):
      emS('👤','No Customers Yet','Build your customer database to track purchase history and lifetime value.','<button type="button" class="btn bg bsm" onclick="openAddCustomer()">+ Add Customer</button>');
    return;
  }
  wrap.innerHTML=custs.map(c=>{
    const spent=spendMap[(c.name||'').toLowerCase()]||0;
    const custSales=sales.filter(s=>s.customer.toLowerCase()===(c.name||'').toLowerCase());
    const outstanding=custSales.reduce((a,s)=>a+sDue(s),0);
    return '<div class="cust-card" onclick="openCustDetail('+c.id+')">'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">'+
      '<div class="cust-av">'+mkInit(c.name)+'</div>'+
      '<div style="flex:1;min-width:0">'+
      '<div style="font-size:14px;font-weight:700;color:var(--t1)">'+esc(c.name)+'</div>'+
      '<div style="font-size:11px;color:var(--t3);margin-top:2px">'+(c.phone?'📞 '+esc(c.phone):'')+(c.notes?' · '+esc(c.notes):'')+'</div></div>'+
      (outstanding>0?'<span class="bdg ber0">Owes '+f$(outstanding)+'</span>':'')+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
      '<div class="cust-stat"><div class="cust-stat-l">Spent</div><div class="cust-stat-v c-g">'+f$(spent)+'</div></div>'+
      '<div class="cust-stat"><div class="cust-stat-l">Orders</div><div class="cust-stat-v c-in">'+custSales.length+'</div></div>'+
      '<div class="cust-stat"><div class="cust-stat-l">Balance</div><div class="cust-stat-v" style="color:'+(outstanding>0?'var(--er)':'var(--ok)')+'">'+f$(outstanding)+'</div></div></div></div>';
  }).join('');
}
function openAddCustomer(){
  editingCustId = null;
  el('cust-dr-ttl').textContent = 'Add Customer';
  el('cust-dr-sub').textContent = 'Add to your customer database';
  el('cust-save-btn').textContent = '💾 Save Customer';
  ['cust-name','cust-phone','cust-email','cust-addr','cust-notes'].forEach(function(id){ sv(id,''); });
  var statsWrap = document.getElementById('cust-stats-wrap');
  if(statsWrap) statsWrap.style.display = 'none';
  var preview = document.getElementById('cust-preview');
  if(preview) preview.style.display = 'none';
  openD('d-customer');
  setTimeout(function(){ var n = el('cust-name'); if(n) n.focus(); }, 300);
}
function editCurrentCustomer(){if(viewingCustId)openEditCustomer(viewingCustId);}
function openEditCustomer(id){
  var b = biz(); if(!b) return;
  var c = (b.customers||[]).find(function(x){return x.id===id;});
  if(!c) return;
  editingCustId = id;
  el('cust-dr-ttl').textContent = 'Edit Customer';
  el('cust-dr-sub').textContent = 'Update customer details';
  el('cust-save-btn').textContent = '✔ Update Customer';
  sv('cust-name',  c.name || '');
  sv('cust-phone', c.phone || '');
  sv('cust-email', c.email || '');
  sv('cust-addr',  c.address || '');
  sv('cust-notes', c.notes || '');

  // Compute activity stats
  var custSales = (b.sales||[]).filter(function(s){
    return s.status !== 'cancelled' && (s.customer||'').toLowerCase() === (c.name||'').toLowerCase();
  });
  var totalRev  = custSales.reduce(function(a,s){return a + sTotal(s);}, 0);
  var totalOwed = custSales.reduce(function(a,s){return a + sDue(s);}, 0);

  var sEl = document.getElementById('cust-stat-sales');
  var rEl = document.getElementById('cust-stat-rev');
  var oEl = document.getElementById('cust-stat-owed');
  var wrap= document.getElementById('cust-stats-wrap');
  if(sEl) sEl.textContent = custSales.length;
  if(rEl) rEl.textContent = f$(totalRev);
  if(oEl) oEl.textContent = f$(totalOwed);
  if(wrap) wrap.style.display = '';

  openD('d-customer');
  updateCustPreview();
}
function saveCustomer(_saveMode){const b=biz();if(!b)return;const name=gv('cust-name');if(!name){toast('Name required','er');return;}if(!b.customers)b.customers=[];if(!b.nextCustId)b.nextCustId=1;const now=Date.now();if(editingCustId!==null){const i=b.customers.findIndex(x=>x.id===editingCustId);if(i>-1)b.customers[i]={...b.customers[i],name,phone:gv('cust-phone'),email:gv('cust-email'),address:gv('cust-addr'),notes:gv('cust-notes'),updatedAt:now};toast('Customer updated!');}else{b.customers.push({id:b.nextCustId++,name,phone:gv('cust-phone'),email:gv('cust-email'),address:gv('cust-addr'),notes:gv('cust-notes'),createdAt:now});addNotif('customer','👤 New customer: '+name);toast('Customer added!','gd');}dbSave();renderCustomers();
  if(_saveMode==='addnew'&&!editingCustId){ setTimeout(function(){openAddCustomer();},150); }
  else { closeD('d-customer'); }
}
function openCustDetail(id){
  const b=biz();const c=(b.customers||[]).find(x=>x.id===id);if(!c)return;viewingCustId=id;
  el('cdet-name').textContent=c.name;el('cdet-sub').textContent=(c.phone?'📞 '+c.phone:'')+(c.email?' · '+c.email:'');
  const sales=(b.sales||[]).filter(s=>s.customer.toLowerCase()===(c.name||'').toLowerCase()&&s.status!=='cancelled');
  const spent=sales.reduce((a,s)=>a+sTotal(s),0),outstanding=sales.reduce((a,s)=>a+sDue(s),0),avgOrder=sales.length>0?spent/sales.length:0;
  el('cdet-stats').innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
    '<div class="cust-stat"><div class="cust-stat-l">Lifetime Value</div><div class="cust-stat-v c-g">'+f$(spent)+'</div></div>'+
    '<div class="cust-stat"><div class="cust-stat-l">Total Orders</div><div class="cust-stat-v c-in">'+sales.length+'</div></div>'+
    '<div class="cust-stat"><div class="cust-stat-l">Avg Order</div><div class="cust-stat-v">'+f$(avgOrder)+'</div></div>'+
    '<div class="cust-stat"><div class="cust-stat-l">Outstanding</div><div class="cust-stat-v" style="color:'+(outstanding>0?'var(--er)':'var(--ok)')+'">'+f$(outstanding)+'</div></div></div>'+
    (c.address?'<div style="margin-top:8px;font-size:12px;color:var(--t2)">📍 '+esc(c.address)+'</div>':'')+
    (c.notes?'<div style="margin-top:4px"><span class="bdg bdf">'+esc(c.notes)+'</span></div>':'');
  const hist=el('cdet-history');
  if(hist)hist.innerHTML=sales.length?
    '<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;padding:9px 14px 5px;letter-spacing:.1em">Purchase History ('+sales.length+')</div>'+
    '<div class="card" style="border-radius:0;border:none">'+
    [...sales].sort((a,b)=>b.id-a.id).map(s=>
      '<div class="cr cl" onclick="viewReceipt('+s.id+')">'+
      '<div class="ci" style="background:var(--gd)">🧾</div>'+
      '<div class="cb"><div class="ct">'+esc(s.inv||'—')+'</div>'+
      '<div class="cs">'+s.date+' · '+s.items.map(i=>esc(i.name)+' ×'+i.qty).join(', ')+'</div></div>'+
      '<div style="text-align:right"><div class="cv c-g">'+f$(sTotal(s))+'</div>'+
      '<div class="cm">'+payBadge(sSt(s))+'</div></div></div>').join('')+'</div>':
    emS('🧾','No Purchases Yet','No sales recorded for this customer.');
  openD('d-cust-detail');
}
function newSaleForCustomer(){const b=biz();const c=(b.customers||[]).find(x=>x.id===viewingCustId);closeD('d-cust-detail');openNewSale();if(c)setTimeout(()=>{sv('scust',c.name);sv('scont',c.phone||'');},300);}
function custAutoComplete(){
  const b=biz();const q=(gv('scust')||'').toLowerCase();const listEl=el('cust-ac-list');if(!listEl)return;
  if(!q||q.length<1){listEl.style.display='none';return;}
  const matches=(b.customers||[]).filter(c=>c.name.toLowerCase().includes(q)).slice(0,5);
  if(!matches.length){listEl.style.display='none';return;}
  listEl.innerHTML='<div class="autocomplete-list">'+matches.map(c=>
    '<div class="autocomplete-item" onclick="selectCust('+c.id+')">'+
    '<div class="autocomplete-name">'+esc(c.name)+'</div>'+
    '<div class="autocomplete-sub">'+(c.phone?'📞 '+esc(c.phone):'No phone')+'</div></div>').join('')+'</div>';
  listEl.style.display='';
}
function selectCust(id){const b=biz();const c=(b.customers||[]).find(x=>x.id===id);if(!c)return;sv('scust',c.name);sv('scont',c.phone||'');const l=el('cust-ac-list');if(l)l.style.display='none';}
document.addEventListener('click',e=>{if(!e.target.closest('#scust')&&!e.target.closest('#cust-ac-list')){const l=el('cust-ac-list');if(l)l.style.display='none';}});

// ── QUICK PRODUCT GRID ──
function renderQuickProdGrid() {
  const b = biz(); if (!b) return;
  const grid = el('quick-prod-grid'); if (!grid) return;
  const prods = (b.products || []).slice(0, 24);
  if (!prods.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0;grid-column:1/-1;text-align:center">No products added yet — add products first</div>';
    return;
  }
  const cartIds = new Set(cartItems.map(c => c.prodId));
  grid.innerHTML = prods.map(function(p) {
    var oos    = p.qty <= 0;
    var inCart = cartIds.has(p.id);
    var cls    = 'qpi-v2' + (oos ? ' oos' : '') + (inCart ? ' in-cart' : '');
    var img    = p.imgData
      ? '<img src="' + p.imgData + '" alt="' + esc(p.name) + '" style="width:100%;height:100%;object-fit:cover">'
      : (CATI[p.category] || '📦');
    var stockTxt  = oos ? 'OUT' : p.qty + ' ' + p.unit;
    var stockCol  = oos ? 'var(--er)' : 'var(--t3)';
    var clickAttr = oos ? '' : ' onclick="addToCart(' + p.id + ')"';
    return '<div class="' + cls + '"' + clickAttr + ' title="' + esc(p.name) + '">' +
      '<div class="qpi-v2-img">' + img + '</div>' +
      '<div class="qpi-v2-name">' + esc(p.name) + '</div>' +
      '<div class="qpi-v2-price">' + f$(p.price) + '</div>' +
      '<div class="qpi-v2-stock" style="color:' + stockCol + '">' + stockTxt + '</div>' +
      '</div>';
  }).join('');
}

function toggleSaleMode() {
  saleMode = saleMode === 'quick' ? 'search' : 'quick';
  const qg  = el('quick-prod-grid');
  const sw  = el('sale-search-wrap');
  const btn = el('sale-mode-btn');
  if (qg)  qg.style.display = saleMode === 'quick' ? '' : 'none';
  if (sw)  sw.style.display = saleMode === 'search' ? '' : 'none';
  if (btn) btn.textContent  = saleMode === 'quick' ? '🔍 Search' : '⊞ Grid';
  if (saleMode === 'search') setTimeout(() => el('spsq')?.focus(), 150);
  else renderQuickProdGrid();
}

// ── FINANCIAL REPORTS ──
function fillFinMonths(){const sel=el('fin-month');if(!sel)return;sel.innerHTML=months().map(m=>'<option value="'+m+'">'+m+'</option>').join('');sel.value=thisMonth();}

// openNewSale: full logic in rebuilt function above
// completeSale: full logic (incl. auto-customer) in rebuilt function above
// ── PATCH: migrateDB - ensure customers array exists ──
const _baseMigrateDB=migrateDB;
// migrateDB: defined above


function reqDelProdById(id, name) {
  if(!isAdmin()){toast('Admin only','er');return;}
  var b=biz();if(!b)return;
  var p=(b.products||[]).find(function(x){return x.id===id;});
  if(!p)return;
  if(isProdLocked(p)){toast('Product is locked — cannot delete yet','er');return;}
  // Confirm then delete
  showConf(
    '🗑️',
    'Delete Product?',
    '"'+name+'" will be permanently deleted.',
    'Yes, Delete',
    function(){
      b.products=b.products.filter(function(x){return x.id!==id;});
      dbSave();
      renderProducts();
      toast('Product deleted','gd');
    },
    'danger'
  );
}

// renderProducts: unified below

// ── UPGRADED viewReceipt with business logo ──
function viewReceipt(saleId){
  var b=biz();
  var s=(b.sales||[]).find(function(x){return x.id===saleId;});
  if(!s)return;
  var paid=s.paid||0;
  var tot=s.total||sTotal(s);
  var due=Math.max(0,tot-paid);
  var st=sSt(s);
  var hasLogo=b.logoType==='image'&&b.logoData;

  // Build receipt HTML
  var items='';
  (s.items||[]).forEach(function(i){
    items+=
      '<tr>'+
        '<td style="padding:5px 0;font-size:13px;color:#222;vertical-align:top">'+esc(i.name)+'</td>'+
        '<td style="padding:5px 0;font-size:12px;color:#555;text-align:center;white-space:nowrap">'+i.qty+' &times; '+f$(i.unitPrice)+'</td>'+
        '<td style="padding:5px 0;font-size:13px;font-weight:700;color:#111;text-align:right;white-space:nowrap">'+f$(i.qty*i.unitPrice)+'</td>'+
      '</tr>';
  });

  var stColor = st==='PAID'?'#16a34a':st==='PARTIAL'?'#d97706':'#dc2626';
  var stLabel = st==='PAID'?'&#10003; PAID':st==='PARTIAL'?'&#9681; PARTIAL':'&#9675; CREDIT';

  var rcptHtml =
    '<div style="font-family:Georgia,serif;max-width:340px;margin:0 auto;padding:20px 24px;background:#fff;color:#111">'+

      // Header
      '<div style="text-align:center;margin-bottom:16px">'+
        (hasLogo
          ? '<div style="width:64px;height:64px;border-radius:12px;overflow:hidden;margin:0 auto 10px;border:1.5px solid #e5e7eb"><img src="'+b.logoData+'" style="width:100%;height:100%;object-fit:cover"></div>'
          : '<div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#D4A520,#A07810);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:24px;font-weight:900;color:#fff;font-family:Georgia,serif">'+mkInit(b.name)+'</div>')+
        '<div style="font-size:20px;font-weight:900;color:#111;letter-spacing:.02em">'+esc(b.name)+'</div>'+
        (b.address?'<div style="font-size:11px;color:#6b7280;margin-top:3px">'+esc(b.address)+'</div>':'')+
        (b.phone?'<div style="font-size:11px;color:#6b7280">'+esc(b.phone)+'</div>':'')+
      '</div>'+

      // Divider
      '<div style="border-top:2px dashed #d1d5db;margin:12px 0"></div>'+

      // Invoice meta
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px">'+
        '<tr><td style="color:#6b7280;padding:3px 0">Invoice</td><td style="text-align:right;font-weight:700;font-family:monospace;color:#111">'+esc(s.inv||'—')+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">Date</td><td style="text-align:right;color:#111">'+s.date+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">Customer</td><td style="text-align:right;font-weight:700;color:#111">'+esc(s.customer||'Walk-in')+'</td></tr>'+
        (s.contact?'<tr><td style="color:#6b7280;padding:3px 0">Phone</td><td style="text-align:right;color:#111">'+esc(s.contact)+'</td></tr>':'')+
        '<tr><td style="color:#6b7280;padding:3px 0">Payment</td><td style="text-align:right;color:#111">'+esc(s.paymode||'')+'</td></tr>'+
      '</table>'+

      // Divider
      '<div style="border-top:1px dashed #d1d5db;margin:12px 0"></div>'+

      // Items header
      '<table style="width:100%;border-collapse:collapse">'+
        '<thead>'+
          '<tr style="border-bottom:1px solid #e5e7eb">'+
            '<th style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;padding:4px 0;text-align:left">Item</th>'+
            '<th style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;padding:4px 0;text-align:center">Qty/Price</th>'+
            '<th style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;padding:4px 0;text-align:right">Total</th>'+
          '</tr>'+
        '</thead>'+
        '<tbody>'+items+'</tbody>'+
      '</table>'+

      // Divider
      '<div style="border-top:1px dashed #d1d5db;margin:10px 0"></div>'+

      // Totals
      '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
        '<tr><td style="padding:3px 0;color:#6b7280">Subtotal</td><td style="text-align:right">'+f$(s.subtotal||tot)+'</td></tr>'+
        ((s.discount||0)>0?'<tr><td style="padding:3px 0;color:#6b7280">Discount</td><td style="text-align:right;color:#dc2626">-'+f$(s.discount)+'</td></tr>':'')+
        '<tr style="border-top:2px solid #111"><td style="padding:6px 0;font-size:16px;font-weight:900">TOTAL</td><td style="text-align:right;font-size:16px;font-weight:900">'+f$(tot)+'</td></tr>'+
        '<tr><td style="padding:3px 0;color:#6b7280">Paid ('+esc(s.paymode||'')+')</td><td style="text-align:right;color:#16a34a;font-weight:700">'+f$(paid)+'</td></tr>'+
        (due>0?'<tr><td style="padding:3px 0;font-weight:700;color:#dc2626">Balance Due</td><td style="text-align:right;font-weight:900;color:#dc2626">'+f$(due)+'</td></tr>':'')+
      '</table>'+

      // Status badge
      '<div style="text-align:center;margin:14px 0">'+
        '<span style="display:inline-block;padding:5px 20px;border-radius:99px;font-size:13px;font-weight:800;background:'+stColor+';color:#fff;letter-spacing:.05em">'+stLabel+'</span>'+
      '</div>'+

      // Divider
      '<div style="border-top:2px dashed #d1d5db;margin:12px 0"></div>'+

      // Footer
      '<div style="text-align:center;font-size:11px;color:#9ca3af;line-height:1.8">'+
        '<div style="font-size:13px;font-weight:700;color:#D4A520;margin-bottom:4px">Thank you for your business!</div>'+
        esc(b.name)+' &bull; Powered by SmartStock Pro'+
        (b.address?'<br>'+esc(b.address):'')+
      '</div>'+

    '</div>';

  // Set drawer content
  if(el('rcptttl')) el('rcptttl').textContent='Receipt \u00b7 '+s.inv;
  // Append fulfillment status
  var fulAppend='';
  if((s.fulfillments||[]).length>0){
    var allOrd=(s.items||[]).reduce(function(a,i){return a+i.qty;},0);
    var allSup=(s.fulfillments||[]).reduce(function(acc,f){return acc+(f.items||[]).reduce(function(a2,i){return a2+i.qtySupplied;},0);},0);
    var fpct=allOrd>0?Math.round(allSup/allOrd*100):0;
    var fc2=s.fulStatus==='Completed'||s.fulStatus==='Fulfilled'?'#16a34a':s.fulStatus==='Partially Fulfilled'?'#d97706':'#6b7280';
    fulAppend='<div style="padding:10px 0;border-top:1px dashed #ddd;margin-top:10px;font-size:11px">'+
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong>Delivery Status</strong>'+
      '<span style="font-weight:700;color:'+fc2+'">'+(s.fulStatus||'Pending')+'</span></div>'+
      '<div style="height:5px;background:#eee;border-radius:3px;overflow:hidden;margin-bottom:4px">'+
      '<div style="height:100%;background:'+fc2+';width:'+fpct+'%;border-radius:3px"></div></div>'+
      (s.assignedStaff?'<div>Handled by: <strong>'+esc(s.assignedStaff)+'</strong></div>':'')+
    '</div>';
  }
  if(el('rcptbody')) el('rcptbody').innerHTML=rcptHtml+fulAppend;

  // Store receipt HTML for print/share
  window._lastReceiptHtml   = rcptHtml;
  window._lastReceiptInv    = s.inv;
  window._lastReceiptSale   = s;
  window._lastReceiptBiz    = b;

  openD('d-rcpt');
}

function printReceipt(){
  var html = window._lastReceiptHtml;
  if(!html) return;
  var win = window.open('','_blank','width=400,height=700,toolbar=no,menubar=no,scrollbars=yes');
  if(!win){ alert('Please allow popups to print receipts'); return; }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
    '<title>Receipt</title>'+
    '<style>'+
      'body{margin:0;padding:16px;background:#fff}'+
      '@media print{body{padding:0}@page{margin:8mm;size:80mm auto}}'+
    '</style>'+
    '</head><body>'+html+'</bo'+'dy></ht'+'ml>'
  );
  win.document.close();
  setTimeout(function(){ win.focus(); win.print(); }, 500);
}

function shareReceiptWhatsApp(directToCustomer) {
  var s = window._lastReceiptSale;
  var b = window._lastReceiptBiz;
  if (!s || !b) return;

  var tot   = s.total || sTotal(s);
  var paid  = s.paid  || 0;
  var due   = Math.max(0, tot - paid);
  var st    = sSt(s);
  var stEmoji = st === 'PAID' ? '✅' : st === 'PARTIAL' ? '🔶' : '🔴';
  var now   = new Date().toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'});

  // Format items list
  var items = (s.items || []).map(function(i) {
    return '  • ' + i.name + '\n' +
           '    ' + i.qty + ' × ' + f$(i.unitPrice) + ' = *' + f$(i.qty * i.unitPrice) + '*';
  }).join('\n');

  // Build professional WhatsApp message
  var msg =
    '🏪 *' + b.name.toUpperCase() + '*\n' +
    (b.address ? '📍 ' + b.address + '\n' : '') +
    (b.phone   ? '📞 ' + b.phone   + '\n' : '') +
    '━━━━━━━━━━━━━━━━\n' +
    '🧾 *INVOICE ' + s.inv + '*\n' +
    '📅 Date: ' + s.date + '\n' +
    '👤 Customer: *' + (s.customer || 'Walk-in') + '*\n' +
    (s.contact ? '📱 Phone: ' + s.contact + '\n' : '') +
    '💳 Payment: ' + (s.paymode || 'Cash') + '\n' +
    '━━━━━━━━━━━━━━━━\n' +
    '*ITEMS:*\n' + items + '\n' +
    '━━━━━━━━━━━━━━━━\n' +
    (s.discount > 0 ? '🏷 Discount:  -' + f$(s.discount) + '\n' : '') +
    '💰 *TOTAL:    ' + f$(tot) + '*\n' +
    '✅  Paid:     ' + f$(paid) + '\n' +
    (due > 0 ? '🔴 *Balance:  ' + f$(due) + '*\n' : '') +
    stEmoji + ' Status: *' + st + '*\n' +
    '━━━━━━━━━━━━━━━━\n' +
    '_Thank you for choosing ' + b.name + '!_\n' +
    '_Powered by SmartStock Pro_';

  // If customer has a phone number, send directly to them
  var customerPhone = '';
  if (directToCustomer && s.contact) {
    // Clean phone number — remove spaces, dashes, parentheses
    customerPhone = s.contact.replace(/[\s\-\(\)]/g, '');
    // Add country code if missing (default Liberia +231)
    if (customerPhone && !customerPhone.startsWith('+') && !customerPhone.startsWith('00')) {
      if (customerPhone.startsWith('0')) {
        customerPhone = '+231' + customerPhone.slice(1);
      } else {
        customerPhone = '+231' + customerPhone;
      }
    }
  }

  var waBase = customerPhone
    ? 'https://wa.me/' + customerPhone + '?text='
    : 'https://wa.me/?text=';

  window.open(waBase + encodeURIComponent(msg), '_blank');
}

function toggleTheme(){curTheme=curTheme==='dark'?'light':'dark';applyTheme(curTheme);toast(curTheme==='light'?'☀ Light mode':'🌙 Dark mode','gd');}

// ════ END v5 FEATURES ════

function buildSaleCard(s) {
  const tot = sTotal(s);
  const due = sDue(s);
  const st  = sSt(s);
  const locked = isRecordLocked(s);
  const hasPending = hasPendingCR('sale', s.id);
  const adminUser  = isAdmin();

  // Status badge
  const stBadge = st === 'PAID'
    ? '<span class="sb-paid">✓ PAID</span>'
    : st === 'PARTIAL'
    ? '<span class="sb-partial">◑ PARTIAL</span>'
    : '<span class="sb-credit">○ CREDIT</span>';

  // Lock indicator
  const lockInfo = locked && !adminUser
    ? '<span class="bdg bwa0" style="font-size:9px">⏳ >3h</span>'
    : '';

  // Action buttons
  let actions = '';
  if (adminUser) {
    actions = `
      <button type="button" class="act-btn" onclick="openEditSale(${s.id})" title="Edit">✏ Edit</button>
      <button type="button" class="act-btn danger" onclick="deleteSale(${s.id})" title="Delete">🗑 Del</button>`;
  } else if (locked) {
    if (hasPending) {
      actions = `<span class="act-btn pending" style="pointer-events:none">⏳ Pending</span>`;
    } else {
      actions = `
        <button type="button" class="act-btn pending" onclick="openRecordChangeRequest('sale',${s.id},'${esc(s.inv || 'Sale #' + s.id).replace(/'/g, '')}')">⏳ Request</button>`;
    }
  } else {
    actions = `
      <button type="button" class="act-btn" onclick="openEditSale(${s.id})" title="Edit">✏ Edit</button>
      <button type="button" class="act-btn danger" onclick="deleteSale(${s.id})" title="Delete">🗑 Del</button>`;
  }

  // Edit log badge
  const editBadge = (s.editLog || []).length
    ? `<span class="bdg bin0" style="font-size:9px">✏×${s.editLog.length}</span>`
    : '';

  // Line items
  const lines = (s.items || []).map(i =>
    `<div class="sale-line">
      <span class="sale-line-name">${esc(i.name)} <span style="color:var(--t3)">×${i.qty}</span></span>
      <span style="color:var(--t3);font-size:11px;margin-right:6px">${f$(i.unitPrice)} each</span>
      <span class="sale-line-price">${f$(i.qty * i.unitPrice)}</span>
    </div>`
  ).join('');

  return `
    <div class="sale-item">
      <div class="sale-item-head">
        <div class="sale-item-icon">🧾</div>
        <div class="sale-item-info">
          <div class="sale-item-cust">
            ${esc(s.customer || 'Walk-in')}
            ${stBadge} ${editBadge} ${lockInfo}
          </div>
          <div class="sale-item-meta">
            <span class="mono" style="font-size:10px;color:var(--g)">${esc(s.inv || '')}</span>
            <span>·</span>
            <span>${s.date}</span>
            ${s.contact ? `<span>· 📞 ${esc(s.contact)}</span>` : ''}
            ${s.paymode ? `<span>· ${esc(s.paymode)}</span>` : ''}
          </div>
        </div>
        <div class="sale-item-right">
          <div class="sale-item-total">${f$(tot)}</div>
          <div class="sale-item-actions">
            <button type="button" class="act-btn neutral" onclick="viewReceipt(${s.id})">🧾</button>
            <button type="button" class="act-btn" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid rgba(8,145,178,.3)" onclick="openFulfillment(${s.id})" title="Fulfill Order">📦</button>
            ${actions}
          </div>
        </div>
      </div>
      <div class="sale-lines">${lines}</div>
      <div class="sale-footer">
        <span style="color:var(--t2)">Paid: <strong style="color:var(--ok)">${f$(s.paid || 0)}</strong></span>
        ${(function(){ var fs2=s.fulStatus||'Pending'; var fc={'Pending':'var(--t3)','Assigned':'#3b82f6','In Progress':'var(--wa)','Partially Fulfilled':'var(--wa)','Fulfilled':'var(--ok)','Completed':'var(--ok)'}[fs2]||'var(--t3)'; return '<span style="color:var(--t2)">Delivery: <strong style="color:'+fc+'">'+fs2+'</strong></span>'; })()}
        ${(function(){ var p = calcProfitForSale(s); return p.profit !== 0 ? '<span style="color:var(--t2)">Profit: <strong style="color:' + (p.profit >= 0 ? 'var(--ok)' : 'var(--er)') + '">' + f$(p.profit) + ' (' + p.margin.toFixed(1) + '%)</strong></span>' : ''; })()}
        <span style="color:${due > 0 ? 'var(--er)' : 'var(--ok)'}">
          ${due > 0 ? 'Due: <strong>' + f$(due) + '</strong>' : '✓ Settled'}
        </span>
      </div>
    </div>`;
}

// ── DELETE SALE ──

function selectPayMode(btnEl) {
  currentPayMode = btnEl.dataset.pay;
  sv('spay', currentPayMode);
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('on'));
  btnEl.classList.add('on');

  // Hide paid amount field for full Credit
  const wrap = el('paid-amount-wrap');
  if (wrap) wrap.style.display = currentPayMode === 'Credit' ? 'none' : '';

  if (currentPayMode === 'Credit') sv('spaid', '0');
  updateCart();
}

// ── QUICK FULL PAY ──

function setFullPay() {
  const tot = cartItems.reduce((a, b) => a + b.qty * b.unitPrice, 0);
  const disc = parseFloat(el('sdisc')?.value) || 0;
  sv('spaid', Math.max(0, tot - disc).toFixed(2));
  updateCart();
}

// ══════════════════════════════════════════════════════════
//  PRODUCT GRID + SEARCH
// ══════════════════════════════════════════════════════════

// ── KEYBOARD + INIT ──
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.dov.on').forEach(d=>d.classList.remove('on'));closeModal();}});

// ════════════════════════════════════════════════════
//  PWA — INSTALL + SERVICE WORKER
// ════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── 1. Service Worker (skipped on file:// — works when hosted) ──
  // SW registration is only needed for Play Store / hosted PWA
  // The app works fully offline via localStorage without SW

  // ── 2. Capture install prompt ──
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
    console.log('[PWA] Install prompt captured');
  });

  window.addEventListener('appinstalled', function() {
    hideInstallBanner();
    deferredPrompt = null;
    console.log('[PWA] App installed!');
    if (typeof toast === 'function') toast('SmartStock Pro installed as app!', 'gd');
  });

  // ── 3. Install banner ──
  function showInstallBanner() {
    var banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'flex';
    var tbBtn = document.getElementById('pwa-topbar-btn');
    if (tbBtn) tbBtn.style.display = 'flex';
  }

  function hideInstallBanner() {
    var banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
  }

  // ── 4. Global install trigger (called by button) ──
  window.triggerPWAInstall = function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result) {
        if (result.outcome === 'accepted') {
          console.log('[PWA] User accepted install');
          hideInstallBanner();
        } else {
          console.log('[PWA] User dismissed install');
        }
        deferredPrompt = null;
      });
    } else {
      // Manual instructions for browsers that don't fire beforeinstallprompt
      showManualInstallGuide();
    }
  };

  // ── 5. Manual install guide (fallback) ──
  window.showManualInstallGuide = function() {
    var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    var msg = isIOS
      ? 'To install:\n1. Tap the Share button (box with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"'
      : 'To install:\n1. Tap the 3-dot menu (⋮) in Chrome\n2. Tap "Add to Home screen"\n3. Tap "Add"';
    if (typeof toast === 'function') {
      toast('Tap ⋮ menu → "Add to Home Screen"', 'gd');
    }
    alert(msg);
  };

  // ── 6. Check if already running as installed PWA ──
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) {
    console.log('[PWA] Running in standalone mode');
    // Hide install banner if already installed
    document.addEventListener('DOMContentLoaded', hideInstallBanner);
  }

})();




function updateCustPreview() {
  var name  = gv('cust-name');
  var phone = gv('cust-phone');
  var email = gv('cust-email');
  var addr  = gv('cust-addr');
  var notes = gv('cust-notes');

  var preview = document.getElementById('cust-preview');
  if(!preview) return;

  var hasContent = name || phone || email || addr || notes;
  preview.style.display = hasContent ? '' : 'none';
  if(!hasContent) return;

  // Avatar = first letter
  var av = document.getElementById('cust-prev-av');
  if(av) av.textContent = name ? name.charAt(0).toUpperCase() : '?';

  var nameEl = document.getElementById('cust-prev-name');
  if(nameEl) nameEl.textContent = name || 'New Customer';

  // Meta line: phone / email / notes
  var metaBits = [];
  if(phone) metaBits.push('📞 ' + phone);
  if(email) metaBits.push('✉ ' + email);
  if(notes) metaBits.push('🏷 ' + notes);
  var metaEl = document.getElementById('cust-prev-meta');
  if(metaEl) metaEl.textContent = metaBits.join(' · ');
}



// ── RESTORED HELPERS (saveProd, customer add, print) ──
function getProdImgData(){return(el('pimg-cam')?.dataset.img)||(el('pimg-gal')?.dataset.img)||'';}

function getProdCat(){
  const v=el('pcat')?.value;if(v==='__custom__')return(gv('pcat-custom')||'Other');
  return v||'Other';
}

function onPcatChange(){
  const v=el('pcat')?.value;const ci=el('pcat-custom');
  if(!ci)return;ci.style.display=v==='__custom__'?'':'none';if(v==='__custom__')ci.focus();
}

function emS(icon, title, sub, actionHtml){
  return '<div style="padding:40px 20px;text-align:center">'+
    '<div style="font-size:44px;margin-bottom:12px;opacity:.25">'+icon+'</div>'+
    '<div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--t3);margin-bottom:6px">'+title+'</div>'+
    '<div style="font-size:12px;color:var(--t4);margin-bottom:14px">'+sub+'</div>'+
    (actionHtml||'')+
  '</div>';
}

function setEC(cat){
  expCat = cat;
  renderExpenses();
}


function approveStaffSignup(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  if (u.status !== 'pending') { toast('User is already active', 'er'); return; }
  u.status      = 'active';
  u.approvedAt  = Date.now();
  u.approvedBy  = (typeof CU !== 'undefined' && CU) ? CU.name : 'Admin';
  // Remove the pending signup notification(s)
  DB.notifications = (DB.notifications || []).filter(function(n){
    return !(n.type === 'user_signup' && n.pendingUserId === userId);
  });
  // Add a business-level notification log entry
  if (typeof DB.nextNotifId !== 'number' || isNaN(DB.nextNotifId)) DB.nextNotifId = 1;
  DB.notifications.unshift({
    id:        DB.nextNotifId++,
    type:      'user',
    msg:       '✓ Approved staff signup: ' + u.name + ' (@' + u.username + ')',
    bizId:     u.businessIds && u.businessIds[0] ? u.businessIds[0] : (CBI || 1),
    read:      false,
    ts:        Date.now()
  });
  // Audit log
  if (typeof addAdminLog === 'function') {
    addAdminLog('approve_signup', 'Approved staff signup: ' + u.name + ' (' + u.username + ')', (typeof CU !== 'undefined' && CU ? CU.name : 'Admin'));
  }
  dbSave();
  // Try to create Firebase Auth account for approved staff (if not done at signup)
  // Note: we don't have the plain password here, so this is best-effort
  // The user will get Firebase Auth account on their next successful login
  if (typeof fbPushUsers === 'function') fbPushUsers();
  if (typeof renderTeam === 'function') renderTeam();
  if (typeof checkNotif === 'function') checkNotif();
  toast('Approved ' + u.name + '. They can now log in.', 'gd');
}

function rejectStaffSignup(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  if (u.status !== 'pending') { toast('User is already active', 'er'); return; }
  // Per your design: account stays pending so staff can try again
  // Just mark as rejected (they can re-sign-up to update)
  u.rejectedAt = Date.now();
  u.rejectedBy = (typeof CU !== 'undefined' && CU) ? CU.name : 'Admin';
  // Remove the pending signup notification
  DB.notifications = (DB.notifications || []).filter(function(n){
    return !(n.type === 'user_signup' && n.pendingUserId === userId);
  });
  if (typeof addAdminLog === 'function') {
    addAdminLog('reject_signup', 'Rejected staff signup: ' + u.name + ' (' + u.username + ')', (typeof CU !== 'undefined' && CU ? CU.name : 'Admin'));
  }
  dbSave();
  if (typeof renderTeam === 'function') renderTeam();
  if (typeof checkNotif === 'function') checkNotif();
  toast('Rejected ' + u.name + '. They can sign up again to retry.', 'gd');
}

function promoteToAdmin(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  if (u.role === 'primaryAdmin') { toast('User is already Primary Admin', 'er'); return; }
  if (u.role === 'admin') { toast('User is already Admin', 'er'); return; }
  u.role = 'admin';
  u.allowedModules = (typeof MODS !== 'undefined' ? MODS : ['products','sales','stock','expenses','customers','salary','reports']);
  if (typeof addAdminLog === 'function') {
    addAdminLog('promote_user', 'Promoted ' + u.name + ' to Admin', (typeof CU !== 'undefined' && CU ? CU.name : 'Admin'));
  }
  dbSave();
  if (typeof renderTeam === 'function') renderTeam();
  toast(u.name + ' is now an Admin', 'gd');
}

function demoteFromAdmin(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  if (u.role === 'primaryAdmin') { toast('Cannot demote Primary Admin', 'er'); return; }
  if (u.role !== 'admin') { toast('User is not an Admin', 'er'); return; }
  u.role = 'dataOperator';
  u.allowedModules = ['products','sales','stock','expenses','customers'];
  if (typeof addAdminLog === 'function') {
    addAdminLog('demote_user', 'Demoted ' + u.name + ' to Data Operator', (typeof CU !== 'undefined' && CU ? CU.name : 'Admin'));
  }
  dbSave();
  if (typeof renderTeam === 'function') renderTeam();
  toast(u.name + ' is now Data Operator', 'gd');
}

// Helper: get pending signups for current business (used by Team page)
function getPendingSignups() {
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return [];
  return (DB.users || []).filter(function(u){
    return u.status === 'pending'
      && u.businessIds
      && u.businessIds.indexOf(b.id) >= 0;
  });
}

// Helper: pending count for current admin (used by topbar badge)
function getPendingSignupCount() {
  if (typeof CU === 'undefined' || !CU) return 0;
  if (CU.role !== 'primaryAdmin' && CU.role !== 'admin') return 0;
  return getPendingSignups().length;
}



// ─────────────────────────────────────────────────────
// FORGOT PASSWORD / RECOVERY CODE FLOW
// ─────────────────────────────────────────────────────
function generateRecoveryCode() {
  // Format: SS-XXXX-YYYY (8 random alphanumeric)
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/I/1
  var part1 = '', part2 = '';
  for (var i = 0; i < 4; i++) part1 += chars.charAt(Math.floor(Math.random()*chars.length));
  for (var j = 0; j < 4; j++) part2 += chars.charAt(Math.floor(Math.random()*chars.length));
  return 'SS-' + part1 + '-' + part2;
}

function openForgotPw() {
  // Close login any error message
  var errEl = document.getElementById('login-err');
  if (errEl) errEl.style.display = 'none';
  openD('d-forgot-pw');
  switchFpTab('code');
}

function switchFpTab(tab) {
  var tabs = {
    code:  { btn: document.getElementById('fp-tab-code'),  panel: document.getElementById('fp-panel-code')  },
    admin: { btn: document.getElementById('fp-tab-admin'), panel: document.getElementById('fp-panel-admin') },
    email: { btn: document.getElementById('fp-tab-email'), panel: document.getElementById('fp-panel-email') }
  };
  var active = 'linear-gradient(135deg,#D4A520,#A07810)';
  Object.keys(tabs).forEach(function(key) {
    var t = tabs[key];
    if (!t) return;
    var isActive = (key === tab);
    if (t.btn) {
      t.btn.style.background = isActive ? active : 'transparent';
      t.btn.style.color      = isActive ? '#060810' : 'var(--t3)';
    }
    if (t.panel) t.panel.style.display = isActive ? '' : 'none';
  });

  // Pre-fill email field when switching to email tab
  if (tab === 'email') {
    var loginVal = el('lu') ? el('lu').value.trim() : '';
    var emailInput = el('forgot-email');
    if (emailInput && loginVal.includes('@') && !emailInput.value) {
      emailInput.value = loginVal;
    }
  }
}

async function resetPasswordWithCode() {
  var un  = gv('fp-username');
  var code= gv('fp-code').toUpperCase().trim();
  var npw = document.getElementById('fp-newpw') ? document.getElementById('fp-newpw').value : '';
  var errEl = document.getElementById('fp-err');

  function showErr(msg){ if(errEl){ errEl.textContent = msg; errEl.style.display=''; } }

  if (!un)  return showErr('Enter your username');
  if (!code) return showErr('Enter your recovery code');
  if (!npw || npw.length < 6) return showErr('New password must be at least 6 characters');

  var user = (DB.users || []).find(function(u){
    return (u.username || '').toLowerCase() === un.toLowerCase();
  });
  if (!user) return showErr('No account found with that username');
  if (user.role !== 'primaryAdmin') {
    return showErr('Recovery codes are only for business owners. Use "Ask Admin" tab instead.');
  }
  if (!user.recoveryCode) {
    return showErr('No recovery code set for this account. Contact support.');
  }
  if (user.recoveryCode !== code) {
    return showErr('Recovery code does not match. Check capitals and dashes (e.g. SS-A1B2-C3D4)');
  }

  // Reset password — hash it first, then save
  var hashedNewPw = npw;
  try { hashedNewPw = await hashPassword(npw); } catch(e) { hashedNewPw = npw; }
  user.password = hashedNewPw;
  user.recoveryCode = generateRecoveryCode();
  user.passwordResetAt = Date.now();
  dbSave();
  if (typeof fbPushUsers === 'function') try { fbPushUsers(); } catch(e){}
  if (typeof fbPush === 'function') setTimeout(function(){ try { fbPush(); } catch(e){} }, 500);

  // Clear login lockout so user can log in immediately
  try { localStorage.removeItem('ss_login_attempts'); } catch(e){}
  closeD('d-forgot-pw');
  toast('✅ Password reset! Your new recovery code is: ' + user.recoveryCode + '. WRITE IT DOWN.', 'gd');

  // Show new recovery code
  setTimeout(function(){
    var rc = document.getElementById('recovery-code-display');
    if (rc) rc.textContent = user.recoveryCode;
    openD('d-recovery-code');
  }, 200);

  // Pre-fill the login form
  var luEl = document.getElementById('lu');
  if (luEl) luEl.value = user.username;
}

function requestAdminReset() {
  var un  = gv('fp-staff-username');
  var biz = gv('fp-staff-biz');
  var errEl = document.getElementById('fp-staff-err');

  function showErr(msg){ if(errEl){ errEl.textContent = msg; errEl.style.display=''; } }

  if (!un)  return showErr('Enter your username');
  if (!biz) return showErr('Enter your business name');

  // Find matching business
  var bizNameLower = biz.toLowerCase().trim();
  var matchedBiz = (DB.businesses || []).find(function(b){
    return (b.name || '').toLowerCase().trim() === bizNameLower;
  });
  if (!matchedBiz) return showErr('Business "' + biz + '" not found. Ask your admin for the exact name.');

  // Find the user
  var user = (DB.users || []).find(function(u){
    return (u.username || '').toLowerCase() === un.toLowerCase()
      && u.businessIds && u.businessIds.indexOf(matchedBiz.id) >= 0;
  });
  if (!user) return showErr('No staff account found with that username in that business');

  // Create notification for admins
  if (typeof DB.nextNotifId !== 'number' || isNaN(DB.nextNotifId)) DB.nextNotifId = 1;
  DB.notifications = DB.notifications || [];
  DB.notifications.unshift({
    id:        DB.nextNotifId++,
    type:      'user',
    msg:       '🔑 ' + user.name + ' (@' + user.username + ') requested a password reset. Go to Team Management to reset it.',
    bizId:     matchedBiz.id,
    pendingResetUserId: user.id,
    read:      false,
    ts:        Date.now()
  });
  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

  closeD('d-forgot-pw');
  toast('Reset request sent! Wait for your admin to contact you with the new password.', 'gd');
}

function copyRecoveryCode() {
  var rc = document.getElementById('recovery-code-display');
  if (!rc) return;
  var code = rc.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function(){
      toast('Recovery code copied to clipboard', 'gd');
    }).catch(function(){
      toast('Tap and hold the code to copy it', 'er');
    });
  } else {
    toast('Code: ' + code + ' (tap and hold to copy)', 'gd');
  }
}

function confirmSavedCode() {
  closeD('d-recovery-code');
  // If there is a pending login from owner-signup, do it now
  if (window._pendingLoginUser) {
    var u = window._pendingLoginUser;
    var bn = window._pendingBizName || 'your business';
    window._pendingLoginUser = null;
    window._pendingBizName = null;
    if (typeof loginAs === 'function') loginAs(u);
    if (typeof toast === 'function') toast('Welcome ' + u.name + '! "' + bn + '" is ready.', 'gd');
  }
}

// Admin function: reset a staff member's password directly
function adminResetUserPassword(userId, newPwOverride) {
  // Legacy entrypoint — kept for backwards compatibility
  // New flow uses openAdminPwReset (drawer) which calls this with override
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  var newPw = newPwOverride;
  if (!newPw) {
    // Fall back to prompt only if not called from drawer
    newPw = prompt('Set new password for ' + u.name + ' (min 6 chars):');
  }
  if (!newPw) return;
  if (newPw.length < 6) { toast('New password must be at least 6 characters', 'er'); return; }
  // Hash the new password before storing
  hashPassword(newPw).then(function(hashed){
    u.password = hashed;
    u.passwordResetAt = Date.now();
    u.passwordResetBy = (typeof CU !== 'undefined' && CU) ? CU.name : 'Admin';
    dbSave();
    try{if(typeof fbPush==='function')fbPush();}catch(e){}
  }).catch(function(){
    u.password = newPw;
  });
  // (continuing synchronously — hashing happens in background)
  u.passwordResetAt = Date.now();
  u.passwordResetBy = (typeof CU !== 'undefined' && CU) ? CU.name : 'Admin';

  // Remove any pending reset notifications for this user
  DB.notifications = (DB.notifications || []).filter(function(n){
    return n.pendingResetUserId !== userId;
  });

  if (typeof addAdminLog === 'function') {
    addAdminLog('reset_password', 'Reset password for ' + u.name, (typeof CU !== 'undefined' && CU ? CU.name : 'Admin'));
  }
  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}
  if (typeof checkNotif === 'function') checkNotif();
  toast('Password reset for ' + u.name + '. New password: ' + newPw, 'gd');
}



// ─────────────────────────────────────────────────────
// SIDEBAR MENU FUNCTIONS
// ─────────────────────────────────────────────────────
function openSidebarMenu(){
  try {
    refreshSidebar();
    var ov = document.getElementById('sidebar-overlay');
    var sb = document.getElementById('sidebar-menu');
    var btn = document.querySelector('.tb-menu-btn');
    if(ov) ov.classList.add('on');
    if(sb) sb.classList.add('on');
    if(btn) btn.classList.add('open');
    // Prevent body scroll while sidebar is open
    document.body.style.overflow = 'hidden';
  } catch(e){
    console.error('[openSidebarMenu]', e);
  }
}

function closeSidebarMenu(){
  var ov = document.getElementById('sidebar-overlay');
  var sb = document.getElementById('sidebar-menu');
  var btn = document.querySelector('.tb-menu-btn');
  if(ov) ov.classList.remove('on');
  if(sb) sb.classList.remove('on');
  if(btn) btn.classList.remove('open');
  document.body.style.overflow = '';
}

function refreshSidebar(){
  try {
    // Update user info
    if(typeof CU !== 'undefined' && CU){
      var avEl = document.getElementById('sb-uav');
      var unEl = document.getElementById('sb-uname');
      var urEl = document.getElementById('sb-urole');
      if(avEl){
        if(CU.profilePhoto){
          avEl.style.backgroundImage = 'url("' + CU.profilePhoto + '")';
          avEl.style.backgroundSize = 'cover';
          avEl.style.backgroundPosition = 'center';
          avEl.textContent = '';
        } else {
          avEl.style.backgroundImage = '';
          avEl.textContent = mkInit(CU.name);
        }
      }
      if(unEl) unEl.textContent = CU.name || 'User';
      if(urEl) urEl.textContent = (typeof RLBL !== 'undefined' && RLBL[CU.role]) ? RLBL[CU.role] : 'User';
    }
    // Update business info
    var b = (typeof biz === 'function') ? biz() : null;
    if(b){
      var bnEl = document.getElementById('sb-bizname');
      var blEl = document.getElementById('sb-tbl');
      if(bnEl) bnEl.textContent = b.name || 'My Business';
      if(blEl){
        if(b.logoType === 'image' && b.logoData){
          blEl.innerHTML = '<img src="' + b.logoData + '" alt="">';
        } else {
          blEl.textContent = mkInit(b.name);
        }
      }
    }
    // Show/hide admin section
    var adminLbl  = document.getElementById('sb-admin-lbl');
    var adminTool = document.getElementById('sb-admin-tools');
    if(typeof isAdmin === 'function' && isAdmin()){
      if(adminLbl)  adminLbl.style.display = '';
      if(adminTool) adminTool.style.display = '';
    } else {
      if(adminLbl)  adminLbl.style.display = 'none';
      if(adminTool) adminTool.style.display = 'none';
    }
    // Sync dot mirror
    var sdMain = document.getElementById('sync-dot');
    var sdSb   = document.getElementById('sync-dot-sb');
    if(sdMain && sdSb) sdSb.style.background = sdMain.style.background || '#6B7280';

    // ── DATA BACKUP: only primary admin can see this menu item ──
    var backupItem = document.getElementById('sb-backup-item');
    if(backupItem){
      var canSeeBackup = (typeof isPrimary === 'function' && isPrimary());
      backupItem.style.display = canSeeBackup ? '' : 'none';
    }
    // ── SALARY MANAGEMENT: admins always see, others need see_salary_management permission ──
    var salaryItem = document.getElementById('sb-salary-item');
    if(salaryItem){
      var canSeeSalary;
      if (typeof isAdmin === 'function' && isAdmin()) {
        canSeeSalary = true;  // Admin & primary admin always see
      } else {
        canSeeSalary = (typeof hasPerm === 'function') ? hasPerm('see_salary_management') : false;
      }
      salaryItem.style.display = canSeeSalary ? '' : 'none';
    }
    // ── DOCUMENTATION EXPENSE: admins always see ──
    var docExpItem = document.getElementById('sb-docexp-item');
    if(docExpItem){
      var canSeeDoc = (typeof isAdmin === 'function' && isAdmin());
      docExpItem.style.display = canSeeDoc ? '' : 'none';
    }

    // Install button visibility
    var installItem = document.getElementById('sb-install-item');
    var installTopBtn = document.getElementById('pwa-topbar-btn');
    if(installItem){
      installItem.style.display = (installTopBtn && installTopBtn.style.display !== 'none') ? '' : 'none';
    }

    // Admin pending badge — show count of pending signups + change requests
    var menuDot = document.getElementById('menu-dot');
    var adminReqBadge = document.getElementById('sb-admin-req-badge');
    var teamBadge = document.getElementById('sb-team-badge');
    var pendingCount = 0;
    try {
      if(typeof isAdmin === 'function' && isAdmin()){
        if(typeof getPendingSignups === 'function'){
          pendingCount += getPendingSignups().length;
        }
        var crCount = (DB.changeRequests || []).filter(function(r){
          return r.bizId === CBI && r.status === 'pending';
        }).length;
        pendingCount += crCount;

        if(teamBadge){
          var sCount = (typeof getPendingSignups === 'function') ? getPendingSignups().length : 0;
          if(sCount > 0){
            teamBadge.innerHTML = '<span style="background:var(--er);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;font-family:var(--fm)">' + sCount + '</span>';
          } else {
            teamBadge.innerHTML = '&#8250;';
          }
        }
        if(adminReqBadge){
          if(crCount > 0){
            adminReqBadge.innerHTML = '<span style="background:var(--er);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;font-family:var(--fm)">' + crCount + '</span>';
          } else {
            adminReqBadge.innerHTML = '&#8250;';
          }
        }
      }
    } catch(e){}

    if(menuDot){
      menuDot.style.display = pendingCount > 0 ? '' : 'none';
    }
  } catch(e){
    console.error('[refreshSidebar]', e);
  }
}

// Close sidebar on escape key
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    var sb = document.getElementById('sidebar-menu');
    if(sb && sb.classList.contains('on')) closeSidebarMenu();
  }
});



// ═══════════════════════════════════════════════════════════
// SMART IMPORT SYSTEM
// Excel + CSV + PDF, with Claude AI or offline detection
// ═══════════════════════════════════════════════════════════

let impState = {
  type: 'products',       // 'products' or 'sales'
  mode: 'ai',             // 'ai' or 'offline'
  mergeMode: 'merge',     // 'merge' or 'append'
  rawRows: [],            // parsed rows from file
  previewRows: [],        // edited rows ready to import
  fileName: '',
  fileType: ''
};

function openSmartImport(type) {
  impState = {
    type: type,
    mode: getApiKey() ? 'ai' : 'offline',
    mergeMode: 'merge',
    rawRows: [],
    previewRows: [],
    fileName: '',
    fileType: ''
  };

  el('imp-title').textContent = type === 'products' ? '📥 Import Products' : '📥 Import Sales';
  el('imp-sub').textContent   = type === 'products'
    ? 'Excel, CSV, or PDF — AI detects columns automatically'
    : 'Bring in historical sales records';

  // Reset to upload step
  showImpStep('upload');
  updateApiStatus();
  setMergeMode('merge');

  // Clear file input
  var fi = el('imp-file');
  if (fi) fi.value = '';

  openD('d-import');
}

function showImpStep(step) {
  ['upload', 'process', 'preview', 'done'].forEach(function(s){
    var el2 = document.getElementById('imp-step-' + s);
    if (el2) el2.style.display = s === step ? '' : 'none';
  });
}

// ─── API KEY MANAGEMENT ───
function getApiKey() {
  try { return localStorage.getItem('ss_claude_api_key') || ''; } catch(e) { return ''; }
}
function saveApiKey() {
  var k = (el('imp-api-key').value || '').trim();
  if (!k) { toast('Enter a valid API key', 'er'); return; }
  if (!k.startsWith('sk-ant-')) {
    if (!confirm('This does not look like an Anthropic Claude key (should start with "sk-ant-"). Save anyway?')) return;
  }
  try { localStorage.setItem('ss_claude_api_key', k); } catch(e) {}
  impState.mode = 'ai';
  updateApiStatus();
  el('imp-api-input').style.display = 'none';
  toast('API key saved on this device', 'gd');
}
function clearApiKey() {
  try { localStorage.removeItem('ss_claude_api_key'); } catch(e) {}
  impState.mode = 'offline';
  updateApiStatus();
  toast('API key removed', 'gd');
}
function toggleApiInput() {
  var i = el('imp-api-input');
  i.style.display = i.style.display === 'none' ? '' : 'none';
}
function updateApiStatus() {
  var k = getApiKey();
  var s = el('imp-api-status');
  var clearBtn = el('imp-clear-api');
  if (k) {
    var masked = '••••••••' + k.slice(-4);
    s.innerHTML = '<span style="color:var(--ok)">✓ Claude AI ready</span> · <span style="font-family:var(--fm);color:var(--t3)">' + masked + '</span>';
    if (clearBtn) clearBtn.style.display = '';
    impState.mode = 'ai';
  } else {
    s.innerHTML = '<span style="color:var(--wa)">⚠ No API key</span> · <span style="color:var(--t3);font-size:11px">Offline smart-detect will be used</span>';
    if (clearBtn) clearBtn.style.display = 'none';
    impState.mode = 'offline';
  }
}
function setImportMode(m) {
  impState.mode = m;
  toast(m === 'offline' ? 'Will use offline smart-detect' : 'Will use Claude AI', 'gd');
}
function setMergeMode(m) {
  impState.mergeMode = m;
  var mEl = el('imp-mode-merge'), aEl = el('imp-mode-append');
  if (mEl) mEl.classList.toggle('on', m === 'merge');
  if (aEl) aEl.classList.toggle('on', m === 'append');
  var help = el('imp-mode-help');
  if (help) {
    help.innerHTML = m === 'merge'
      ? '<strong>Smart Merge:</strong> Updates existing items if SKU/name matches, adds new ones.'
      : '<strong>Add New Only:</strong> Skips items that already exist. No updates to existing.';
  }
}

// ─── FILE HANDLING ───
function handleImportDrop(ev) {
  if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
  processImportFile(ev.dataTransfer.files[0]);
}
function handleImportFile(ev) {
  if (!ev.target.files.length) return;
  processImportFile(ev.target.files[0]);
}

function processImportFile(file) {
  impState.fileName = file.name;
  var nameLower = file.name.toLowerCase();

  if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) {
    impState.fileType = 'excel';
    parseExcelFile(file);
  } else if (nameLower.endsWith('.csv')) {
    impState.fileType = 'csv';
    parseCsvFile(file);
  } else if (nameLower.endsWith('.pdf')) {
    impState.fileType = 'pdf';
    parsePdfFile(file);
  } else {
    toast('Unsupported file. Use .xlsx, .csv or .pdf', 'er');
  }
}

// ─── EXCEL PARSER ───
function parseExcelFile(file) {
  showImpStep('process');
  setProgress(10, 'Reading Excel file...');

  if (typeof XLSX === 'undefined') {
    toast('Excel library failed to load. Check your internet connection.', 'er');
    showImpStep('upload');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      setProgress(40, 'Parsing spreadsheet...');
      var wb = XLSX.read(e.target.result, { type: 'array' });
      var firstSheet = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
      if (!rows.length) {
        toast('No data found in spreadsheet', 'er');
        showImpStep('upload');
        return;
      }
      setProgress(60, 'Detecting columns...');
      mapRowsToFields(rows);
    } catch(err) {
      console.error('[parseExcel]', err);
      toast('Could not read Excel file: ' + err.message, 'er');
      showImpStep('upload');
    }
  };
  reader.onerror = function() {
    toast('Failed to read file', 'er');
    showImpStep('upload');
  };
  reader.readAsArrayBuffer(file);
}

// ─── CSV PARSER ───
function parseCsvFile(file) {
  showImpStep('process');
  setProgress(20, 'Reading CSV...');

  if (typeof XLSX === 'undefined') {
    toast('CSV library failed to load.', 'er');
    showImpStep('upload');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      setProgress(50, 'Parsing rows...');
      var wb = XLSX.read(e.target.result, { type: 'string' });
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      if (!rows.length) {
        toast('No data in CSV', 'er');
        showImpStep('upload');
        return;
      }
      mapRowsToFields(rows);
    } catch(err) {
      console.error('[parseCsv]', err);
      toast('Could not read CSV: ' + err.message, 'er');
      showImpStep('upload');
    }
  };
  reader.readAsText(file);
}

// ─── PDF PARSER ───
function parsePdfFile(file) {
  showImpStep('process');
  setProgress(15, 'Reading PDF...');

  if (typeof pdfjsLib === 'undefined') {
    toast('PDF library failed to load. Check your internet connection.', 'er');
    showImpStep('upload');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    pdfjsLib.getDocument({ data: e.target.result }).promise.then(function(pdf) {
      setProgress(35, 'Extracting ' + pdf.numPages + ' page(s)...');
      var pagePromises = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        pagePromises.push(pdf.getPage(i).then(function(page) {
          return page.getTextContent().then(function(content) {
            return content.items.map(function(it) { return it.str; }).join(' ');
          });
        }));
      }
      return Promise.all(pagePromises);
    }).then(function(pageTexts) {
      var fullText = pageTexts.join('\n\n');
      setProgress(55, 'Understanding content...');
      // PDFs almost always need AI to parse the text into rows
      if (impState.mode === 'ai' && getApiKey()) {
        callClaudeForPDF(fullText);
      } else {
        // Fallback: try to split lines into rows
        var lines = fullText.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>3;});
        var rows = lines.map(function(line){ return { raw: line }; });
        toast('PDF parsing without AI is limited. Add a Claude API key for better results.', 'er');
        mapRowsToFields(rows);
      }
    }).catch(function(err) {
      console.error('[parsePdf]', err);
      toast('Could not read PDF: ' + err.message, 'er');
      showImpStep('upload');
    });
  };
  reader.readAsArrayBuffer(file);
}

function setProgress(pct, msg) {
  var bar = el('imp-progress-bar');
  var title = el('imp-progress-title');
  if (bar) bar.style.width = pct + '%';
  if (title && msg) title.textContent = msg;
}

// ─── MAP ROWS TO FIELDS ───
// Smart column detection (offline mode)
function mapRowsToFields(rows) {
  if (impState.mode === 'ai' && getApiKey() && impState.fileType !== 'pdf') {
    setProgress(75, 'Using AI to understand data...');
    callClaudeForMapping(rows);
  } else if (impState.fileType !== 'pdf') {
    setProgress(80, 'Smart-detecting columns...');
    var mapped = offlineSmartMap(rows);
    finishMapping(mapped);
  } else {
    // PDF already handled above
    finishMapping(rows);
  }
}

// Offline smart column detection
function offlineSmartMap(rows) {
  if (!rows.length) return [];
  var firstKeys = Object.keys(rows[0]);

  // Build a column-name → field-name mapping
  var fieldMap = {};
  var fieldPatterns;

  if (impState.type === 'products') {
    fieldPatterns = {
      name:     /^(name|product|item|description|product\s*name|item\s*name|product_name)$/i,
      sku:      /^(sku|code|product\s*code|item\s*code|barcode|ref)$/i,
      category: /^(category|cat|type|group|class)$/i,
      cost:     /^(cost|buy(ing)?\s*price|wholesale|cost\s*price|purchase)$/i,
      price:    /^(price|sell(ing)?\s*price|retail|sale\s*price|unit\s*price|sell)$/i,
      qty:      /^(qty|quantity|stock|in\s*stock|on\s*hand|count|amount)$/i,
      unit:     /^(unit|uom|measure|per)$/i,
      desc:     /^(desc(ription)?|notes|details|info)$/i,
      size:     /^(size|dimension(s)?)$/i,
      lowLevel: /^(low|low.*level|reorder|min(imum)?)$/i
    };
  } else {
    fieldPatterns = {
      date:     /^(date|sale\s*date|invoice\s*date|day)$/i,
      customer: /^(customer|client|name|buyer|customer\s*name)$/i,
      contact:  /^(phone|contact|tel|mobile)$/i,
      inv:      /^(invoice|inv|inv\s*#|invoice\s*no)$/i,
      items:    /^(item(s)?|product(s)?|description)$/i,
      qty:      /^(qty|quantity|count)$/i,
      unitPrice:/^(unit\s*price|price|rate)$/i,
      total:    /^(total|amount|grand\s*total)$/i,
      paid:     /^(paid|payment|received)$/i,
      paymode:  /^(payment\s*mode|method|pay\s*method|paymode)$/i,
      status:   /^(status|state)$/i,
      discount: /^(discount|disc)$/i
    };
  }

  // Match each spreadsheet key to a field
  for (var fkey in fieldPatterns) {
    var pattern = fieldPatterns[fkey];
    for (var i = 0; i < firstKeys.length; i++) {
      if (pattern.test(firstKeys[i].trim())) {
        fieldMap[fkey] = firstKeys[i];
        break;
      }
    }
  }

  // Convert rows using the map
  return rows.map(function(row) {
    var mapped = { _raw: row };
    for (var fkey in fieldMap) {
      mapped[fkey] = row[fieldMap[fkey]];
    }
    return mapped;
  });
}

// ─── CLAUDE AI MAPPING ───
async function callClaudeForMapping(rows) {
  setProgress(80, 'AI reading your data...');
  var apiKey = getApiKey();
  if (!apiKey) {
    toast('No API key. Using offline detection.', 'er');
    finishMapping(offlineSmartMap(rows));
    return;
  }

  // Limit sent rows to keep tokens manageable
  var sample = rows.slice(0, 100);
  var fieldList = impState.type === 'products'
    ? 'name (required), sku, category, cost (number), price (number), qty (number), unit, desc, size, lowLevel (number)'
    : 'date (YYYY-MM-DD), customer, contact, inv, items (array of {name, qty, unitPrice}), discount (number), paid (number), paymode (Cash/Card/Mobile/Credit), status (active/cancelled)';

  var prompt = 'You are a data import assistant. The user uploaded a file with these rows:\n\n' +
    JSON.stringify(sample, null, 2) +
    '\n\nConvert each row into a clean JSON object with these fields: ' + fieldList +
    '\n\nRules:\n- Return ONLY a JSON array, no commentary\n- Skip header/empty rows\n- Convert prices/quantities to numbers (no $, commas, etc.)\n- If a field is missing, use empty string "" or 0 for numbers\n- Standardize categories to one of: Tiles, Cement, Tools, Paint, Plumbing, Electrical, Accessories, Other\n\nReturn the JSON array now:';

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) {
      var errBody = await response.text();
      throw new Error('API error ' + response.status + ': ' + errBody.slice(0, 200));
    }
    var data = await response.json();
    var text = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';
    // Extract JSON array from response
    var jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON. Falling back to offline mode.');
    }
    var parsed = JSON.parse(jsonMatch[0]);
    finishMapping(parsed);
  } catch(err) {
    console.error('[Claude]', err);
    toast('AI failed: ' + (err.message || 'unknown') + '. Using offline mode.', 'er');
    finishMapping(offlineSmartMap(rows));
  }
}

// Claude for PDF text — slightly different prompt
async function callClaudeForPDF(text) {
  var apiKey = getApiKey();
  if (!apiKey) {
    toast('PDFs need a Claude API key for reliable parsing', 'er');
    showImpStep('upload');
    return;
  }
  var fieldList = impState.type === 'products'
    ? 'name (required), sku, category, cost (number), price (number), qty (number), unit'
    : 'date (YYYY-MM-DD), customer, contact, inv, items (array), paid, paymode';

  var prompt = 'You are a data import assistant. The user uploaded a PDF with this text content:\n\n' +
    text.slice(0, 12000) +
    '\n\nExtract all ' + impState.type + ' rows you can find and return as a JSON array. Each row must have these fields where possible: ' + fieldList +
    '\n\nRules:\n- Return ONLY a JSON array, no commentary\n- Convert prices/quantities to numbers\n- If a field is missing, use "" or 0\n- For products, standardize category to: Tiles, Cement, Tools, Paint, Plumbing, Electrical, Accessories, Other\n\nReturn the JSON array now:';

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) {
      var errBody = await response.text();
      throw new Error('API ' + response.status + ': ' + errBody.slice(0, 200));
    }
    var data = await response.json();
    var txt = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';
    var jsonMatch = txt.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI did not return valid JSON');
    var parsed = JSON.parse(jsonMatch[0]);
    finishMapping(parsed);
  } catch(err) {
    console.error('[Claude PDF]', err);
    toast('PDF parsing failed: ' + (err.message || 'unknown'), 'er');
    showImpStep('upload');
  }
}

// ─── FINISH MAPPING — sanitize and show preview ───
function finishMapping(rows) {
  setProgress(95, 'Preparing preview...');

  // Sanitize and normalize
  var clean = rows.map(function(r) {
    if (impState.type === 'products') {
      return {
        name:     String(r.name || r.Name || '').trim(),
        sku:      String(r.sku || r.SKU || '').trim(),
        category: String(r.category || r.Category || 'Other').trim(),
        cost:     parseFloat(r.cost || r.Cost || 0) || 0,
        price:    parseFloat(r.price || r.Price || 0) || 0,
        qty:      parseFloat(r.qty || r.Qty || r.quantity || r.Quantity || 0) || 0,
        unit:     String(r.unit || r.Unit || 'Piece').trim(),
        desc:     String(r.desc || r.description || r.Description || '').trim(),
        size:     String(r.size || r.Size || '').trim(),
        lowLevel: parseFloat(r.lowLevel || r.low || 5) || 5
      };
    } else {
      // Sales
      var items = Array.isArray(r.items) ? r.items : [];
      return {
        date:      String(r.date || today()).trim(),
        customer:  String(r.customer || r.Customer || 'Walk-in').trim(),
        contact:   String(r.contact || r.phone || '').trim(),
        inv:       String(r.inv || r.invoice || '').trim(),
        items:     items,
        discount:  parseFloat(r.discount || 0) || 0,
        paid:      parseFloat(r.paid || r.Paid || 0) || 0,
        total:     parseFloat(r.total || r.Total || 0) || 0,
        paymode:   String(r.paymode || r.paymentMode || 'Cash').trim(),
        status:    String(r.status || 'active').trim()
      };
    }
  });

  // Remove empty rows
  clean = clean.filter(function(r) {
    if (impState.type === 'products') return r.name && r.name.length > 0;
    return r.customer || r.inv || (r.items && r.items.length);
  });

  impState.previewRows = clean;
  setProgress(100, 'Done!');
  setTimeout(function(){ showPreview(); }, 200);
}

// ─── SHOW PREVIEW ───
function showPreview() {
  showImpStep('preview');
  renderPreview();
}

function renderPreview() {
  var rows = impState.previewRows;
  var b = biz();
  var existing = impState.type === 'products' ? (b.products || []) : [];

  // Categorize: new vs updates
  var newCount = 0, updateCount = 0;
  rows.forEach(function(r){
    if (impState.type === 'products') {
      var match = existing.find(function(p){
        return (r.sku && p.sku && p.sku.toLowerCase() === r.sku.toLowerCase()) ||
               (r.name && p.name.toLowerCase() === r.name.toLowerCase());
      });
      r._isUpdate = !!match;
      r._existingId = match ? match.id : null;
      if (match) updateCount++;
      else newCount++;
    } else {
      r._isUpdate = false;
      newCount++;
    }
  });

  el('imp-preview-title').textContent = '📋 Review ' + rows.length + ' ' + impState.type;
  el('imp-preview-meta').textContent = rows.length + ' rows · ' + newCount + ' new · ' + updateCount + ' updates';
  el('imp-confirm-count').textContent = '(' + rows.length + ')';

  var html;
  if (impState.type === 'products') {
    html = '<div class="imp-row-header">' +
      '<div>Name</div><div>SKU / Category</div><div>Price</div><div>Qty</div><div></div>' +
    '</div>';
    rows.forEach(function(r, idx) {
      var cls = r._isUpdate ? 'imp-updates' : 'imp-new';
      var badge = r._isUpdate
        ? '<span class="imp-badge" style="background:var(--wab);color:var(--wa)">UPDATE</span>'
        : '<span class="imp-badge" style="background:var(--okb);color:var(--ok)">NEW</span>';
      html += '<div class="imp-row ' + cls + '">' +
        '<div>' +
          '<input type="text" value="' + esc(r.name) + '" oninput="updatePreview(' + idx + ',\'name\',this.value)">' +
          '<div style="margin-top:3px">' + badge + '</div>' +
        '</div>' +
        '<div>' +
          '<input type="text" value="' + esc(r.sku) + '" placeholder="SKU" oninput="updatePreview(' + idx + ',\'sku\',this.value)">' +
          '<input type="text" value="' + esc(r.category) + '" placeholder="Category" oninput="updatePreview(' + idx + ',\'category\',this.value)" style="margin-top:3px">' +
        '</div>' +
        '<div><input type="number" value="' + r.price + '" step="0.01" oninput="updatePreview(' + idx + ',\'price\',this.value)"></div>' +
        '<div><input type="number" value="' + r.qty + '" oninput="updatePreview(' + idx + ',\'qty\',this.value)"></div>' +
        '<div><button type="button" class="imp-rm" onclick="removePreviewRow(' + idx + ')" title="Remove">×</button></div>' +
      '</div>';
    });
  } else {
    // Sales preview
    html = '<div class="imp-row-header">' +
      '<div>Date / Customer</div><div>Invoice / Items</div><div>Total</div><div>Paid</div><div></div>' +
    '</div>';
    rows.forEach(function(r, idx) {
      var status = (r.paid >= r.total - 0.01) ? 'PAID' : (r.paid > 0 ? 'PARTIAL' : 'CREDIT');
      var statusColor = status === 'PAID' ? 'var(--ok)' : status === 'PARTIAL' ? 'var(--wa)' : 'var(--er)';
      html += '<div class="imp-row imp-new">' +
        '<div>' +
          '<input type="date" value="' + esc(r.date) + '" oninput="updatePreview(' + idx + ',\'date\',this.value)">' +
          '<input type="text" value="' + esc(r.customer) + '" placeholder="Customer" oninput="updatePreview(' + idx + ',\'customer\',this.value)" style="margin-top:3px">' +
        '</div>' +
        '<div>' +
          '<input type="text" value="' + esc(r.inv) + '" placeholder="Invoice" oninput="updatePreview(' + idx + ',\'inv\',this.value)">' +
          '<div style="font-size:10px;color:var(--t3);margin-top:3px">' + (r.items.length || 0) + ' item(s) · ' + esc(r.paymode) + '</div>' +
        '</div>' +
        '<div><input type="number" value="' + r.total + '" step="0.01" oninput="updatePreview(' + idx + ',\'total\',this.value)"></div>' +
        '<div>' +
          '<input type="number" value="' + r.paid + '" step="0.01" oninput="updatePreview(' + idx + ',\'paid\',this.value)">' +
          '<div style="font-size:9px;font-weight:800;color:' + statusColor + ';margin-top:3px;text-align:center">' + status + '</div>' +
        '</div>' +
        '<div><button type="button" class="imp-rm" onclick="removePreviewRow(' + idx + ')">×</button></div>' +
      '</div>';
    });
  }

  el('imp-preview-rows').innerHTML = html;
}

function updatePreview(idx, field, value) {
  if (!impState.previewRows[idx]) return;
  var row = impState.previewRows[idx];
  if (['price','qty','total','paid','cost','discount'].indexOf(field) >= 0) {
    row[field] = parseFloat(value) || 0;
  } else {
    row[field] = value;
  }
}

function removePreviewRow(idx) {
  impState.previewRows.splice(idx, 1);
  renderPreview();
}

function cancelImport() {
  if (confirm('Cancel import? No data will be saved.')) {
    closeD('d-import');
  }
}

// ─── CONFIRM IMPORT — SMART MERGE ───
function confirmImport() {
  var rows = impState.previewRows;
  if (!rows.length) { toast('Nothing to import', 'er'); return; }

  var b = biz();
  if (!b) { toast('No business selected', 'er'); return; }

  var added = 0, updated = 0, skipped = 0;

  if (impState.type === 'products') {
    b.products = b.products || [];
    rows.forEach(function(r) {
      if (!r.name) { skipped++; return; }
      var existing = null;
      if (r._existingId) {
        existing = b.products.find(function(p){ return p.id === r._existingId; });
      } else if (r.sku) {
        existing = b.products.find(function(p){ return p.sku && p.sku.toLowerCase() === r.sku.toLowerCase(); });
      }
      if (existing && impState.mergeMode === 'merge') {
        // Update existing
        existing.name     = r.name;
        existing.sku      = r.sku || existing.sku;
        existing.category = r.category || existing.category;
        existing.cost     = r.cost > 0 ? r.cost : existing.cost;
        existing.price    = r.price > 0 ? r.price : existing.price;
        existing.qty      = parseFloat(r.qty) || 0;
        existing.unit     = r.unit || existing.unit;
        existing.desc     = r.desc || existing.desc;
        existing.size     = r.size || existing.size;
        existing.lowLevel = r.lowLevel || existing.lowLevel;
        existing.updatedAt= Date.now();
        existing.adminUnlocked = true;
        updated++;
      } else if (!existing || impState.mergeMode === 'append-all') {
        // Add new
        b.products.push({
          id:         b.nextProdId++,
          name:       r.name,
          sku:        r.sku || '',
          category:   r.category || 'Other',
          cost:       r.cost || 0,
          price:      r.price || 0,
          qty:        parseFloat(r.qty) || 0,
          unit:       r.unit || 'Piece',
          desc:       r.desc || '',
          size:       r.size || '',
          lowLevel:   r.lowLevel || 5,
          imgData:    '',
          createdAt:  Date.now() - 9 * 3600000,  // unlocked
          updatedAt:  Date.now(),
          status:     'active'
        });
        added++;
      } else {
        skipped++;
      }
    });
  } else {
    // Sales import
    b.sales = b.sales || [];
    rows.forEach(function(r) {
      if (!r.customer && !r.inv) { skipped++; return; }
      var items = Array.isArray(r.items) && r.items.length
        ? r.items.map(function(i){
            return {
              prodId:    0,
              name:      String(i.name || 'Item'),
              qty:       parseFloat(i.qty) || 1,
              unitPrice: parseFloat(i.unitPrice || i.price || 0) || 0,
              cost:      parseFloat(i.cost) || 0
            };
          })
        : [{
            prodId: 0,
            name: 'Imported item',
            qty: 1,
            unitPrice: r.total || 0,
            cost: 0
          }];
      var invNum = r.inv || ('INV-' + String(b.nextSaleId || 1).padStart(4, '0'));
      b.sales.unshift({
        id:         b.nextSaleId++,
        inv:        invNum,
        date:       r.date || today(),
        customer:   r.customer || 'Walk-in',
        contact:    r.contact || '',
        items:      items,
        discount:   r.discount || 0,
        paid:       r.paid || 0,
        total:      r.total || items.reduce(function(a,i){return a + i.qty * i.unitPrice;}, 0),
        paymode:    r.paymode || 'Cash',
        status:     r.status || 'active',
        createdAt:  Date.now() - 9 * 3600000,
        updatedAt:  Date.now(),
        editLog:    []
      });
      added++;
    });
  }

  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

  // Show done screen
  var msg = '';
  if (impState.type === 'products') {
    msg = added + ' new product' + (added !== 1 ? 's' : '') +
          (updated > 0 ? ', ' + updated + ' updated' : '') +
          (skipped > 0 ? ', ' + skipped + ' skipped' : '');
  } else {
    msg = added + ' sale' + (added !== 1 ? 's' : '') + ' imported' +
          (skipped > 0 ? ', ' + skipped + ' skipped' : '');
  }
  el('imp-done-msg').textContent = msg;
  showImpStep('done');

  // Re-render views
  if (impState.type === 'products') {
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderGallery === 'function') renderGallery();
  } else {
    if (typeof renderSales === 'function') renderSales();
    if (typeof fillSalesSummary === 'function') fillSalesSummary();
  }
  if (typeof renderDash === 'function') renderDash();

  if (typeof addAdminLog === 'function') {
    addAdminLog('import_' + impState.type, msg, CU ? CU.name : 'User');
  }
}

// ─── EXPORT ───
function exportProductsToExcel_protected(){ protectedExport(function(){ exportProductsToExcel_raw(); }, "exportProductsToExcel Export"); }
function exportProductsToExcel_raw() {
  if (typeof XLSX === 'undefined') { toast('Excel library not loaded', 'er'); return; }
  var b = biz();
  if (!b || !(b.products || []).length) { toast('No products to export', 'er'); return; }
  var data = b.products.map(function(p){
    return {
      Name:     p.name,
      SKU:      p.sku || '',
      Category: p.category || '',
      Cost:     p.cost || 0,
      Price:    p.price || 0,
      Qty:      p.qty || 0,
      Unit:     p.unit || '',
      Size:     p.size || '',
      Description: p.desc || '',
      LowLevel: p.lowLevel || 0
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, 'products_' + today() + '.xlsx');
  toast('Exported ' + data.length + ' products', 'gd');
}

function exportSalesToExcel_protected(){ protectedExport(function(){ exportSalesToExcel_raw(); }, "exportSalesToExcel Export"); }
function exportSalesToExcel_raw() {
  if (typeof XLSX === 'undefined') { toast('Excel library not loaded', 'er'); return; }
  var b = biz();
  if (!b || !(b.sales || []).length) { toast('No sales to export', 'er'); return; }
  var data = b.sales.filter(function(s){return s.status !== 'cancelled';}).map(function(s){
    return {
      Invoice:  s.inv,
      Date:     s.date,
      Customer: s.customer,
      Contact:  s.contact || '',
      Items:    (s.items || []).map(function(i){ return i.name + ' x' + i.qty + ' @' + i.unitPrice;}).join(' | '),
      Discount: s.discount || 0,
      Total:    sTotal(s),
      Paid:     s.paid || 0,
      Due:      sDue(s),
      PayMode:  s.paymode,
      Status:   sSt(s)
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  XLSX.writeFile(wb, 'sales_' + today() + '.xlsx');
  toast('Exported ' + data.length + ' sales', 'gd');
}



// ═══════════════════════════════════════════════════════════
// PROFILE / USERNAME / VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════

function isValidEmail(em) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(em || '').trim());
}

function isValidUsername(un) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(String(un || '').trim());
}

function isAdult(dob) {
  if (!dob) return false;
  var d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  var age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600000);
  return age >= 13 && age <= 120;
}

function daysSinceUsernameChange(user) {
  if (!user || !user.usernameChangedAt) return Infinity;
  return (Date.now() - user.usernameChangedAt) / (24 * 3600000);
}

function isProfileComplete(user) {
  if (!user) return false;
  return !!(user.email && user.dob && user.location && user.profileComplete);
}

// ═══════════════════════════════════════════════════════════
// FORCE PROFILE COMPLETION FOR EXISTING USERS
// Called from loginAs(). If user is missing email/dob/location,
// open the Complete Profile drawer and block app access.
// ═══════════════════════════════════════════════════════════
function checkProfileComplete() {
  try {
    if (!CU) return true;
    if (isProfileComplete(CU)) return true;

    // Open mandatory profile completion
    setTimeout(function(){
      openCompleteProfileDrawer();
    }, 600);
    return false;
  } catch(e) {
    console.error('[checkProfileComplete]', e);
    return true;
  }
}

function openCompleteProfileDrawer() {
  if (!CU) return;
  // Pre-fill anything we have
  var em = el('cp-email');     if (em) em.value = CU.email || '';
  var db = el('cp-dob');       if (db) db.value = CU.dob || '';
  var lc = el('cp-location');  if (lc) lc.value = CU.location || '';
  openD('d-complete-profile');
}

function saveCompleteProfile() {
  if (!CU) { toast('Not logged in', 'er'); return; }
  var em = gv('cp-email');
  var db = gv('cp-dob');
  var lc = gv('cp-location');
  var errEl = el('cp-err');
  function showErr(msg){ if(errEl){errEl.textContent=msg;errEl.style.display='';} }
  if (!em) return showErr('Email is required');
  if (!isValidEmail(em)) return showErr('Please enter a valid email address');
  if (!db) return showErr('Date of birth is required');
  if (!isAdult(db)) return showErr('You must be at least 13 years old');
  if (!lc) return showErr('Location is required');

  // Check email isn't used by another user
  var emLower = em.toLowerCase().trim();
  for (var i = 0; i < DB.users.length; i++) {
    var u = DB.users[i];
    if (u.id !== CU.id && (u.email || '').toLowerCase() === emLower) {
      return showErr('That email is already used by another user');
    }
  }

  // Save
  CU.email           = emLower;
  CU.dob             = db;
  CU.location        = lc.trim();
  CU.profileComplete = true;
  CU.updatedAt       = Date.now();

  // Persist in DB.users too
  var idx = DB.users.findIndex(function(x){ return x.id === CU.id; });
  if (idx >= 0) DB.users[idx] = CU;

  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

  closeD('d-complete-profile');
  toast('Profile saved. Welcome!', 'gd');
}

// ═══════════════════════════════════════════════════════════
// PROFILE EDIT DRAWER (for changing username, etc)
// ═══════════════════════════════════════════════════════════
function openProfileEdit() {
  if (!CU) return;
  var u = el('pe-username');   if (u) u.value = CU.username || '';
  var n = el('pe-name');       if (n) n.value = CU.name || '';
  var e = el('pe-email');      if (e) e.value = CU.email || '';
  var d = el('pe-dob');        if (d) d.value = CU.dob || '';
  var l = el('pe-location');   if (l) l.value = CU.location || '';
  var p = el('pe-phone');      if (p) p.value = CU.phone || '';

  // Show username change cooldown info
  var daysLeft = 30 - daysSinceUsernameChange(CU);
  var unInfo = el('pe-un-info');
  var unInput = el('pe-username');
  if (unInfo) {
    if (CU.usernameChangedAt && daysLeft > 0) {
      unInfo.innerHTML = '🔒 Locked — you can change again in <strong>' + Math.ceil(daysLeft) + ' day' + (Math.ceil(daysLeft) !== 1 ? 's' : '') + '</strong>';
      unInfo.style.color = 'var(--wa)';
      if (unInput) { unInput.disabled = true; unInput.style.opacity = '.5'; }
    } else {
      unInfo.innerHTML = 'You can change your username (once every 30 days)';
      unInfo.style.color = 'var(--t3)';
      if (unInput) { unInput.disabled = false; unInput.style.opacity = '1'; }
    }
  }

  closeSidebarMenu();
  openD('d-profile-edit');
}

function saveProfileEdit() {
  if (!CU) return;
  var oldUn = CU.username;
  var newUn = gv('pe-username');
  var name  = gv('pe-name');
  var email = gv('pe-email');
  var dob   = gv('pe-dob');
  var loc   = gv('pe-location');
  var phone = gv('pe-phone');
  var errEl = el('pe-err');
  function showErr(msg){ if(errEl){errEl.textContent=msg;errEl.style.display='';} }

  if (!name)  return showErr('Name is required');
  if (!email) return showErr('Email is required');
  if (!isValidEmail(email)) return showErr('Please enter a valid email');
  if (!dob)   return showErr('Date of birth is required');
  if (!isAdult(dob)) return showErr('You must be at least 13 years old');
  if (!loc)   return showErr('Location is required');

  // Username change rules
  if (newUn !== oldUn) {
    if (!isValidUsername(newUn)) return showErr('Username: 3-20 letters, numbers or underscores');
    var daysLeft = 30 - daysSinceUsernameChange(CU);
    if (CU.usernameChangedAt && daysLeft > 0) {
      return showErr('Username locked for ' + Math.ceil(daysLeft) + ' more day(s)');
    }
    // Check uniqueness
    var unLower = newUn.toLowerCase();
    for (var i = 0; i < DB.users.length; i++) {
      if (DB.users[i].id !== CU.id && (DB.users[i].username || '').toLowerCase() === unLower) {
        return showErr('Username already taken');
      }
    }
    CU.username = newUn;
    CU.usernameChangedAt = Date.now();
  }

  // Email uniqueness check
  var emLower = email.toLowerCase().trim();
  for (var j = 0; j < DB.users.length; j++) {
    if (DB.users[j].id !== CU.id && (DB.users[j].email || '').toLowerCase() === emLower) {
      return showErr('That email is already used by another user');
    }
  }

  CU.name           = name;
  CU.email          = emLower;
  CU.dob            = dob;
  CU.location       = loc.trim();
  CU.phone          = phone;
  CU.profileComplete= true;
  CU.updatedAt      = Date.now();

  // Update in DB.users
  var idx = DB.users.findIndex(function(x){ return x.id === CU.id; });
  if (idx >= 0) DB.users[idx] = CU;

  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

  closeD('d-profile-edit');
  toast('Profile updated', 'gd');

  // Refresh sidebar avatar/name
  if (typeof refreshSidebar === 'function') refreshSidebar();
}



// ═══════════════════════════════════════════════════════════
// SUPPORT / ABOUT / TERMS PAGES
// ═══════════════════════════════════════════════════════════
function openSupportPage() { openD('d-support'); }
function openAboutPage()   { openD('d-about'); }
function openTermsPage()   { openD('d-terms'); }



// ═══════════════════════════════════════════════════════════
// STAFF CHAT SYSTEM (Group + DM + Photos)
// ═══════════════════════════════════════════════════════════
let chatState = {
  tab:         'group',    // 'group' | 'dm-list' | 'dm-conv'
  activePeer:  null,       // user object when in dm-conv
  unsubGroup:  null,       // Firebase listener
  unsubDm:     null
};

function ensureChatStorage() {
  if (!DB) return;
  DB.chatMessages = DB.chatMessages || [];
  DB.nextChatId   = typeof DB.nextChatId === 'number' ? DB.nextChatId : 1;
}

function chatConvId(userId1, userId2) {
  var a = Math.min(userId1, userId2);
  var b = Math.max(userId1, userId2);
  return 'dm-' + a + '-' + b;
}

function renderChat() {
  ensureChatStorage();
  if (chatState.tab === 'group') {
    switchChatTab('group');
  } else if (chatState.tab === 'dm-conv' && chatState.activePeer) {
    renderDmConversation();
  } else {
    switchChatTab('dm');
  }
  markChatMessagesRead();
}

function switchChatTab(tab) {
  chatState.tab = tab === 'dm' ? 'dm-list' : tab;

  // Tab pills — highlight active tab
  ['group','dm','ai'].forEach(function(t) {
    var btn = el('chat-tab-' + t);
    if (btn) btn.classList.toggle('on', t === tab);
  });

  // Views — show active, hide others
  var vg  = el('chat-view-group');
  var vdl = el('chat-view-dm-list');
  var vdc = el('chat-view-dm-conv');
  var vai = el('chat-view-ai');

  // Use hidden class so CSS flex is not overridden
  if (vg)  vg.classList.toggle('hidden',  tab !== 'group');
  if (vdl) vdl.classList.toggle('hidden', tab !== 'dm');
  if (vdc) vdc.classList.add('hidden');
  if (vai) vai.classList.toggle('hidden', tab !== 'ai');

  // Render appropriate content
  if (tab === 'group') {
    renderGroupChat();
  } else if (tab === 'dm') {
    renderDmList();
  } else if (tab === 'ai') {
    setTimeout(scrollAIToBottom, 100);
  }
}

function backToDmList() {
  chatState.tab = 'dm-list';
  chatState.activePeer = null;
  var vdl= el('chat-view-dm-list');
  var vdc= el('chat-view-dm-conv');
  if (vdl) vdl.style.display = '';
  if (vdc) vdc.style.display = 'none';
  renderDmList();
}

// ─── GROUP CHAT ───
function renderGroupChat() {
  ensureChatStorage();
  if (!CU || !CBI) return;
  var msgs = (DB.chatMessages || []).filter(function(m){
    return m.bizId === CBI && m.conv === 'group';
  }).sort(function(a,b){ return a.ts - b.ts; });

  var container = el('chat-group-msgs');
  if (!container) return;

  if (!msgs.length) {
    container.innerHTML =
      '<div class="chat-empty">' +
        '<div class="chat-empty-icon">👋</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--t2);margin-bottom:5px">No messages yet</div>' +
        '<div style="font-size:12px">Be the first to say hello to your team!</div>' +
      '</div>';
    return;
  }

  var html = '';
  var lastDay = '';
  msgs.forEach(function(m){
    var dayLabel = formatChatDay(m.ts);
    if (dayLabel !== lastDay) {
      html += '<div class="chat-day-divider">' + dayLabel + '</div>';
      lastDay = dayLabel;
    }
    html += buildChatBubble(m);
  });
  container.innerHTML = html;
  // Scroll to bottom
  setTimeout(function(){ container.scrollTop = container.scrollHeight; }, 50);
}

// ─── DM LIST ───
function renderDmList() {
  ensureChatStorage();
  if (!CU || !CBI) return;
  // List all other users in this business
  var teammates = (DB.users || []).filter(function(u){
    return u.id !== CU.id
      && u.businessIds && u.businessIds.indexOf(CBI) >= 0
      && u.status !== 'pending';
  });

  var listEl = el('chat-dm-list');
  if (!listEl) return;

  if (!teammates.length) {
    listEl.innerHTML =
      '<div class="chat-empty">' +
        '<div class="chat-empty-icon">👥</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--t2);margin-bottom:5px">No teammates yet</div>' +
        '<div style="font-size:12px">Invite staff from More → Team Management</div>' +
      '</div>';
    return;
  }

  var html = teammates.map(function(u){
    var convId = chatConvId(CU.id, u.id);
    var msgs = (DB.chatMessages || []).filter(function(m){
      return m.bizId === CBI && m.conv === convId;
    });
    var lastMsg = msgs.length ? msgs[msgs.length-1] : null;
    var unread = msgs.filter(function(m){
      return m.from !== CU.id && (!m.readBy || m.readBy.indexOf(CU.id) < 0);
    }).length;
    var lastTxt = lastMsg
      ? (lastMsg.photo ? '📷 Photo' : (lastMsg.text || ''))
      : 'No messages yet';
    var lastTime = lastMsg ? formatChatTime(lastMsg.ts) : '';

    return '<div class="chat-dm-item" onclick="openDmConversation(' + u.id + ')">' +
      '<div class="av" style="width:42px;height:42px;font-size:14px;flex-shrink:0">' + esc(mkInit(u.name)) + '</div>' +
      '<div class="chat-dm-info">' +
        '<div class="chat-dm-info-name">' + esc(u.name || u.username) + '</div>' +
        '<div class="chat-dm-info-last">' + esc(lastTxt.slice(0, 50)) + (lastTxt.length > 50 ? '…' : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        (lastTime ? '<div style="font-size:10px;color:var(--t3);font-family:var(--fm);margin-bottom:3px">' + lastTime + '</div>' : '') +
        (unread > 0 ? '<div class="chat-dm-badge">' + unread + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  listEl.innerHTML = html;
}

function openDmConversation(peerUserId) {
  var peer = (DB.users || []).find(function(u){ return u.id === peerUserId; });
  if (!peer) { toast('User not found', 'er'); return; }
  chatState.activePeer = peer;
  chatState.tab = 'dm-conv';

  var vdl= el('chat-view-dm-list');
  var vdc= el('chat-view-dm-conv');
  if (vdl) vdl.style.display = 'none';
  if (vdc) vdc.style.display = '';

  // Update header
  var av  = el('chat-dm-av');
  var nm  = el('chat-dm-name');
  if (av) av.textContent = mkInit(peer.name);
  if (nm) nm.textContent = peer.name || peer.username;

  renderDmConversation();
}

function renderDmConversation() {
  ensureChatStorage();
  if (!CU || !chatState.activePeer) return;
  var convId = chatConvId(CU.id, chatState.activePeer.id);
  var msgs = (DB.chatMessages || []).filter(function(m){
    return m.bizId === CBI && m.conv === convId;
  }).sort(function(a,b){ return a.ts - b.ts; });

  var container = el('chat-dm-msgs');
  if (!container) return;

  if (!msgs.length) {
    container.innerHTML =
      '<div class="chat-empty">' +
        '<div class="chat-empty-icon">💬</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--t2);margin-bottom:5px">Start the conversation</div>' +
        '<div style="font-size:12px">Send a message to ' + esc(chatState.activePeer.name) + '</div>' +
      '</div>';
  } else {
    var html = '';
    var lastDay = '';
    msgs.forEach(function(m){
      var dayLabel = formatChatDay(m.ts);
      if (dayLabel !== lastDay) {
        html += '<div class="chat-day-divider">' + dayLabel + '</div>';
        lastDay = dayLabel;
      }
      html += buildChatBubble(m, true);
    });
    container.innerHTML = html;
    setTimeout(function(){ container.scrollTop = container.scrollHeight; }, 50);
  }
  // Mark messages from peer as read
  markChatMessagesRead();
}

function buildChatBubble(m, hideAuthor) {
  var isMe = m.from === CU.id;
  var fromUser = (DB.users || []).find(function(u){ return u.id === m.from; });
  var fromName = fromUser ? (fromUser.name || fromUser.username) : 'Unknown';

  var photoHtml = m.photo ? '<img src="' + m.photo + '" alt="photo">' : '';
  var textHtml  = m.text  ? esc(m.text) : '';

  return '<div class="chat-msg ' + (isMe ? 'chat-msg-me' : 'chat-msg-them') + '">' +
    (isMe || hideAuthor ? '' : '<div class="chat-msg-author">' + esc(fromName) + '</div>') +
    textHtml +
    photoHtml +
    '<div class="chat-msg-meta">' + formatChatTime(m.ts) + '</div>' +
  '</div>';
}

// ─── SENDING ───
function sendChatMessage(mode) {
  ensureChatStorage();
  if (!CU || !CBI) { toast('Not signed in', 'er'); return; }

  var inputId, convId;
  if (mode === 'group') {
    inputId = 'chat-group-input';
    convId  = 'group';
  } else {
    inputId = 'chat-dm-input';
    if (!chatState.activePeer) return;
    convId  = chatConvId(CU.id, chatState.activePeer.id);
  }

  var inputEl = el(inputId);
  if (!inputEl) return;
  var text = (inputEl.value || '').trim();
  if (!text) return;

  DB.chatMessages.push({
    id:     DB.nextChatId++,
    bizId:  CBI,
    conv:   convId,
    from:   CU.id,
    fromName: CU.name,
    text:   text,
    photo:  null,
    ts:     Date.now(),
    readBy: [CU.id]
  });

  inputEl.value = '';
  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

  // Re-render
  if (mode === 'group') renderGroupChat();
  else renderDmConversation();
}

// ─── PHOTO ATTACH ───
let chatPhotoTarget = 'group';
function attachChatPhoto(mode) {
  chatPhotoTarget = mode;
  var inp = el('chat-photo-input');
  if (inp) { inp.value = ''; inp.click(); }
}

function handleChatPhoto(ev) {
  var file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Photo too large (max 5MB)', 'er');
    return;
  }
  // Resize/compress before sending
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      // Compress to max 800px wide, JPEG quality 0.7
      var maxW = 800;
      var w = img.width, hgt = img.height;
      if (w > maxW) { hgt = hgt * (maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = hgt;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, hgt);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      ensureChatStorage();
      var convId = chatPhotoTarget === 'group' ? 'group'
        : chatConvId(CU.id, chatState.activePeer.id);

      DB.chatMessages.push({
        id:     DB.nextChatId++,
        bizId:  CBI,
        conv:   convId,
        from:   CU.id,
        fromName: CU.name,
        text:   '',
        photo:  dataUrl,
        ts:     Date.now(),
        readBy: [CU.id]
      });

      dbSave();
      if (typeof fbPush === 'function') try { fbPush(); } catch(e){}

      if (chatPhotoTarget === 'group') renderGroupChat();
      else renderDmConversation();

      toast('Photo sent', 'gd');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── MARK AS READ ───
function markChatMessagesRead() {
  if (!CU || !CBI) return;
  ensureChatStorage();
  var changed = false;
  DB.chatMessages.forEach(function(m){
    if (m.bizId !== CBI) return;
    // Decide if this message is in the current view
    var isVisible = false;
    if (chatState.tab === 'group' && m.conv === 'group') isVisible = true;
    if (chatState.tab === 'dm-conv' && chatState.activePeer
        && m.conv === chatConvId(CU.id, chatState.activePeer.id)) isVisible = true;
    if (!isVisible) return;

    m.readBy = m.readBy || [];
    if (m.readBy.indexOf(CU.id) < 0) {
      m.readBy.push(CU.id);
      changed = true;
    }
  });
  if (changed) { dbSave(); checkChatUnread(); }
}

// ─── UNREAD BADGE ───
function checkChatUnread() {
  if (!CU || !CBI) return;
  ensureChatStorage();
  var unread = (DB.chatMessages || []).filter(function(m){
    if (m.bizId !== CBI) return false;
    if (m.from === CU.id) return false;
    return !m.readBy || m.readBy.indexOf(CU.id) < 0;
  }).length;
  var dot = el('chat-dot');
  if (dot) dot.style.display = unread > 0 ? '' : 'none';
}

// ─── FORMATTING HELPERS ───
function formatChatTime(ts) {
  var d = new Date(ts);
  var hh = d.getHours(), mm = String(d.getMinutes()).padStart(2,'0');
  var ap = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12; if (hh === 0) hh = 12;
  return hh + ':' + mm + ' ' + ap;
}

function formatChatDay(ts) {
  var d = new Date(ts);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dayDiff = Math.floor((today - msgDate) / (24 * 3600 * 1000));
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Check unread on app start + every 10s
setInterval(function(){
  try { checkChatUnread(); } catch(e){}
}, 10000);



// ═══════════════════════════════════════════════════════════
// FINANCIAL REPORT FILTERS (one at a time, not combined)
// ═══════════════════════════════════════════════════════════
let finActiveFilter = { type: 'date', value: 'all' };  // The ONE active filter
let finFilterDraft  = null;                            // Working filter inside drawer
let finTab          = 'pl';                            // Active tab

const FIN_FILTER_TYPES = {
  date:     { label: 'Date', icon: '📅', emptyLbl: 'All Time' },
  category: { label: 'Category', icon: '🏷', emptyLbl: 'All Categories' },
  payment:  { label: 'Payment Mode', icon: '💳', emptyLbl: 'All Payments' },
  invoice:  { label: 'Invoice / Customer', icon: '📄', emptyLbl: 'Invoice/Customer' },
  staff:    { label: 'Staff Entry', icon: '👤', emptyLbl: 'All Staff' }
};

function openFinFilter(type) {
  finFilterDraft = JSON.parse(JSON.stringify(finActiveFilter));
  if (finFilterDraft.type !== type) {
    finFilterDraft = getDefaultFilterFor(type);
  }
  el('finf-title').textContent = '🔍 ' + FIN_FILTER_TYPES[type].label + ' Filter';
  el('finf-sub').textContent   = 'Pick one option (replaces any current filter)';
  renderFilterBody(type);
  openD('d-fin-filter');
}

function getDefaultFilterFor(type) {
  if (type === 'date')     return { type: 'date',     value: 'all', start: '', end: '', single: '' };
  if (type === 'category') return { type: 'category', value: [] };
  if (type === 'payment')  return { type: 'payment',  value: 'all' };
  if (type === 'invoice')  return { type: 'invoice',  value: '' };
  if (type === 'staff')    return { type: 'staff',    value: 'all' };
  return { type: 'date', value: 'all' };
}

function renderFilterBody(type) {
  var body = el('finf-body');
  if (!body) return;
  var html = '';

  if (type === 'date') {
    var v = finFilterDraft.value || 'all';
    var opts = [
      ['all',       'All Time',     '📊 Show every record'],
      ['today',     'Today',        '☀️ Records from today'],
      ['yesterday', 'Yesterday',    '🌙 Records from yesterday'],
      ['this-mo',   'This Month',   '📅 Current calendar month'],
      ['last-mo',   'Last Month',   '📆 Previous calendar month'],
      ['single',    'Single Day',   '📅 Pick a specific date'],
      ['range',     'Date Range',   '📅 Custom start & end dates']
    ];
    html = opts.map(function(o){
      var act = v === o[0];
      return '<div class="finf-opt' + (act ? ' on' : '') + '" onclick="setDateOpt(\'' + o[0] + '\')">' +
        '<div class="finf-opt-radio">' + (act ? '●' : '○') + '</div>' +
        '<div style="flex:1">' +
          '<div class="finf-opt-name">' + o[1] + '</div>' +
          '<div class="finf-opt-sub">' + o[2] + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // If single or range chosen, show date inputs
    if (v === 'single') {
      html += '<div style="padding:14px;background:var(--s2);border-radius:var(--r10);margin-top:10px">' +
        '<div class="fl">Pick Date</div>' +
        '<input class="fi" type="date" id="finf-single" value="' + (finFilterDraft.single || today()) + '" onchange="finFilterDraft.single=this.value">' +
      '</div>';
    } else if (v === 'range') {
      html += '<div style="padding:14px;background:var(--s2);border-radius:var(--r10);margin-top:10px">' +
        '<div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div><div class="fl">From</div><input class="fi" type="date" id="finf-rstart" value="' + (finFilterDraft.start || '') + '" onchange="finFilterDraft.start=this.value"></div>' +
          '<div><div class="fl">To</div><input class="fi" type="date" id="finf-rend" value="' + (finFilterDraft.end || '') + '" onchange="finFilterDraft.end=this.value"></div>' +
        '</div>' +
      '</div>';
    }

  } else if (type === 'category') {
    // Multi-select with checkboxes
    var b = biz();
    var cats = [];
    if (b && b.products) {
      var seen = {};
      b.products.forEach(function(p){
        var c = (p.category || 'Other').trim();
        if (c && !seen[c]) { seen[c] = 1; cats.push(c); }
      });
      cats.sort();
    }
    var selected = Array.isArray(finFilterDraft.value) ? finFilterDraft.value : [];
    html = '<div style="font-size:11px;color:var(--t3);margin-bottom:10px;text-align:center">Tap categories to include them. Empty = all categories.</div>';
    if (!cats.length) {
      html += '<div style="text-align:center;padding:30px;color:var(--t3)">No categories yet. Add products first.</div>';
    } else {
      html += cats.map(function(c){
        var ck = selected.indexOf(c) >= 0;
        return '<div class="finf-opt' + (ck ? ' on' : '') + '" onclick="toggleCatFilter(\'' + esc(c).replace(/\x27/g, "\\'") + '\')">' +
          '<div class="finf-opt-radio" style="font-size:14px">' + (ck ? '☑' : '☐') + '</div>' +
          '<div style="flex:1">' +
            '<div class="finf-opt-name">' + esc(c) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

  } else if (type === 'payment') {
    var v = finFilterDraft.value || 'all';
    var modes = ['all', 'Cash', 'Card', 'Mobile', 'Bank', 'Credit'];
    var icons = { all:'📊', Cash:'💵', Card:'💳', Mobile:'📱', Bank:'🏦', Credit:'📝' };
    html = modes.map(function(m){
      var act = v === m;
      return '<div class="finf-opt' + (act ? ' on' : '') + '" onclick="finFilterDraft.value=\'' + m + '\';renderFilterBody(\'payment\')">' +
        '<div class="finf-opt-radio">' + (act ? '●' : '○') + '</div>' +
        '<div style="flex:1">' +
          '<div class="finf-opt-name">' + icons[m] + ' ' + (m === 'all' ? 'All Payment Modes' : m) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

  } else if (type === 'invoice') {
    html = '<div style="padding:14px">' +
      '<div class="fl">Search by Invoice # or Customer Name / Contact</div>' +
      '<input class="fi" type="text" id="finf-inv-input" value="' + esc(finFilterDraft.value || '') + '" placeholder="e.g. INV-0023 or John or 0770..." oninput="finFilterDraft.value=this.value" autofocus>' +
      '<div style="font-size:11px;color:var(--t3);margin-top:8px;line-height:1.6">Matches invoice number, customer name, OR contact/phone number (case-insensitive).</div>' +
    '</div>';

  } else if (type === 'staff') {
    var v = finFilterDraft.value || 'all';
    var staffUsers = (DB.users || []).filter(function(u){
      return u.businessIds && u.businessIds.indexOf(CBI) >= 0 && u.status !== 'pending';
    });
    html = '<div class="finf-opt' + (v === 'all' ? ' on' : '') + '" onclick="finFilterDraft.value=\'all\';renderFilterBody(\'staff\')">' +
      '<div class="finf-opt-radio">' + (v === 'all' ? '●' : '○') + '</div>' +
      '<div style="flex:1"><div class="finf-opt-name">👥 All Staff Entries</div></div>' +
    '</div>';
    html += staffUsers.map(function(u){
      var act = String(v) === String(u.id);
      return '<div class="finf-opt' + (act ? ' on' : '') + '" onclick="finFilterDraft.value=' + u.id + ';renderFilterBody(\'staff\')">' +
        '<div class="finf-opt-radio">' + (act ? '●' : '○') + '</div>' +
        '<div style="flex:1">' +
          '<div class="finf-opt-name">' + esc(u.name || u.username) + '</div>' +
          '<div class="finf-opt-sub">' + (RLBL[u.role] || u.role) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  body.innerHTML = html;
}

function setDateOpt(val) {
  finFilterDraft.value = val;
  if (val === 'single' && !finFilterDraft.single) finFilterDraft.single = today();
  if (val === 'range') {
    if (!finFilterDraft.start) {
      var d = new Date();
      finFilterDraft.start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);
    }
    if (!finFilterDraft.end) finFilterDraft.end = today();
  }
  renderFilterBody('date');
}

function toggleCatFilter(cat) {
  var arr = Array.isArray(finFilterDraft.value) ? finFilterDraft.value : [];
  var idx = arr.indexOf(cat);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(cat);
  finFilterDraft.value = arr;
  renderFilterBody('category');
}

function applyFilter() {
  finActiveFilter = JSON.parse(JSON.stringify(finFilterDraft));
  closeD('d-fin-filter');
  refreshFilterChips();
  renderFinReports();
}

function clearOneFilter() {
  finActiveFilter = { type: 'date', value: 'all' };
  closeD('d-fin-filter');
  refreshFilterChips();
  renderFinReports();
}

function refreshFilterChips() {
  var f = finActiveFilter;
  var dateLbl = el('finf-date-lbl');
  var catLbl  = el('finf-cat-lbl');
  var payLbl  = el('finf-pay-lbl');
  var invLbl  = el('finf-inv-lbl');
  var staffLbl= el('finf-staff-lbl');

  // Reset all
  if (dateLbl)  dateLbl.textContent  = 'All Time';
  if (catLbl)   catLbl.textContent   = 'All Categories';
  if (payLbl)   payLbl.textContent   = 'All Payments';
  if (invLbl)   invLbl.textContent   = 'Invoice/Customer';
  if (staffLbl) staffLbl.textContent = 'All Staff';

  // Set the active one
  if (f.type === 'date') {
    if (dateLbl) dateLbl.textContent = describeDateFilter(f);
  } else if (f.type === 'category' && f.value && f.value.length) {
    if (catLbl) catLbl.textContent = f.value.length === 1 ? f.value[0] : (f.value.length + ' categories');
  } else if (f.type === 'payment' && f.value && f.value !== 'all') {
    if (payLbl) payLbl.textContent = f.value;
  } else if (f.type === 'invoice' && f.value) {
    if (invLbl) invLbl.textContent = '"' + f.value.slice(0, 12) + (f.value.length > 12 ? '…' : '') + '"';
  } else if (f.type === 'staff' && f.value !== 'all') {
    var u = (DB.users || []).find(function(x){ return x.id === f.value; });
    if (staffLbl && u) staffLbl.textContent = u.name || u.username;
  }

  // Active filter chip with X to clear
  var row = el('finf-active-row');
  if (row) {
    if (f.type !== 'date' || f.value !== 'all') {
      var lbl = (FIN_FILTER_TYPES[f.type].icon || '') + ' ' + describeActiveFilter(f);
      row.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 11px;background:rgba(212,165,32,.12);border:1px solid rgba(212,165,32,.3);border-radius:99px;font-size:12px;color:var(--g);font-weight:700;width:fit-content">' +
          '<span>Active: ' + esc(lbl) + '</span>' +
          '<span onclick="clearOneFilter()" style="cursor:pointer;font-size:14px;line-height:1">&#10005;</span>' +
        '</div>';
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  }
}

function describeDateFilter(f) {
  if (f.value === 'all')       return 'All Time';
  if (f.value === 'today')     return 'Today';
  if (f.value === 'yesterday') return 'Yesterday';
  if (f.value === 'this-mo')   return 'This Month';
  if (f.value === 'last-mo')   return 'Last Month';
  if (f.value === 'single')    return f.single || 'Single Day';
  if (f.value === 'range')     return (f.start || '?') + ' → ' + (f.end || '?');
  return 'Custom';
}

function describeActiveFilter(f) {
  if (f.type === 'date')     return describeDateFilter(f);
  if (f.type === 'category') return (f.value || []).join(', ');
  if (f.type === 'payment')  return f.value;
  if (f.type === 'invoice')  return 'Search: "' + f.value + '"';
  if (f.type === 'staff') {
    var u = (DB.users || []).find(function(x){ return x.id === f.value; });
    return u ? (u.name || u.username) : 'Unknown';
  }
  return '';
}

// ─── Apply the filter to sales/expenses ───
function applyFinFilterToSales(sales) {
  var f = finActiveFilter;
  var b = biz();
  return sales.filter(function(s) {
    if (s.status === 'cancelled') return false;

    if (f.type === 'date') {
      if (!dateMatchesFilter(s.date, f)) return false;
    } else if (f.type === 'category') {
      if (f.value && f.value.length) {
        // Sale matches if ANY of its items belong to one of selected categories
        var prods = b ? (b.products || []) : [];
        var saleCats = (s.items || []).map(function(it){
          var prod = prods.find(function(p){ return p.id === it.prodId; });
          return prod ? (prod.category || 'Other') : null;
        }).filter(Boolean);
        var any = saleCats.some(function(c){ return f.value.indexOf(c) >= 0; });
        if (!any) return false;
      }
    } else if (f.type === 'payment') {
      if (f.value !== 'all') {
        if ((s.paymode || '').toLowerCase() !== f.value.toLowerCase()) return false;
      }
    } else if (f.type === 'invoice') {
      if (f.value) {
        var q = f.value.toLowerCase();
        var match =
          (s.inv || '').toLowerCase().indexOf(q) >= 0 ||
          (s.customer || '').toLowerCase().indexOf(q) >= 0 ||
          (s.contact || '').toLowerCase().indexOf(q) >= 0;
        if (!match) return false;
      }
    } else if (f.type === 'staff') {
      if (f.value !== 'all') {
        var creator = s.createdBy || s.staffId || null;
        if (String(creator) !== String(f.value)) return false;
      }
    }
    return true;
  });
}

function applyFinFilterToExpenses(exps) {
  var f = finActiveFilter;
  return exps.filter(function(e) {
    if (e.status === 'cancelled') return false;
    if (f.type === 'date') {
      if (!dateMatchesFilter(e.date, f)) return false;
    } else if (f.type === 'category') {
      // Expenses can have a category field too
      if (f.value && f.value.length) {
        var ec = (e.category || '').trim();
        if (!ec || f.value.indexOf(ec) < 0) return false;
      }
    } else if (f.type === 'staff') {
      if (f.value !== 'all') {
        var creator = e.createdBy || e.staffId || null;
        if (String(creator) !== String(f.value)) return false;
      }
    }
    return true;
  });
}

function dateMatchesFilter(dateStr, f) {
  if (!dateStr) return false;
  if (f.value === 'all') return true;
  var todayStr = today();
  if (f.value === 'today') return dateStr === todayStr;
  if (f.value === 'yesterday') {
    var d = new Date(); d.setDate(d.getDate()-1);
    return dateStr === d.toISOString().slice(0,10);
  }
  if (f.value === 'this-mo') return dateStr.startsWith(thisMonth());
  if (f.value === 'last-mo') {
    var d = new Date(); d.setMonth(d.getMonth()-1);
    var lm = d.toISOString().slice(0,7);
    return dateStr.startsWith(lm);
  }
  if (f.value === 'single') return dateStr === f.single;
  if (f.value === 'range')  return (!f.start || dateStr >= f.start) && (!f.end || dateStr <= f.end);
  return true;
}

// ═══════════════════════════════════════════════════════════
// PROFIT CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════
function calcProfitForItem(item) {
  var qty   = parseFloat(item.qty) || 0;
  var price = parseFloat(item.unitPrice) || 0;
  var cost  = parseFloat(item.cost) || 0;
  var perUnit = price - cost;
  var total   = perUnit * qty;
  var margin  = price > 0 ? (perUnit / price * 100) : 0;
  return { qty: qty, price: price, cost: cost, perUnit: perUnit, total: total, margin: margin };
}

function calcProfitForSale(sale) {
  var items = sale.items || [];
  var totalProfit = 0;
  var totalCost   = 0;
  var totalRev    = 0;
  items.forEach(function(it){
    var p = calcProfitForItem(it);
    totalProfit += p.total;
    totalCost   += p.cost * p.qty;
    totalRev    += p.price * p.qty;
  });
  // Subtract discount from profit
  var discount = parseFloat(sale.discount) || 0;
  totalProfit -= discount;
  var margin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
  return { profit: totalProfit, cost: totalCost, revenue: totalRev, margin: margin };
}

function buildProfitBreakdown(sales) {
  // Aggregate by product
  var byProduct = {};
  sales.forEach(function(s){
    (s.items || []).forEach(function(it){
      var key = it.name || ('Product #' + it.prodId);
      if (!byProduct[key]) {
        byProduct[key] = {
          name: key,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          unitCost: parseFloat(it.cost) || 0,
          unitPrice: parseFloat(it.unitPrice) || 0
        };
      }
      var p = calcProfitForItem(it);
      byProduct[key].qty     += p.qty;
      byProduct[key].revenue += p.price * p.qty;
      byProduct[key].cost    += p.cost * p.qty;
      byProduct[key].profit  += p.total;
      // Keep latest price/cost
      byProduct[key].unitCost  = p.cost;
      byProduct[key].unitPrice = p.price;
    });
  });
  // Convert to array, sort by total profit desc
  return Object.keys(byProduct)
    .map(function(k){ return byProduct[k]; })
    .sort(function(a,b){ return b.profit - a.profit; });
}

function renderProfitBreakdownSection(sales) {
  var breakdown = buildProfitBreakdown(sales);
  if (!breakdown.length) return '';

  var totalProfit = breakdown.reduce(function(a,b){ return a + b.profit; }, 0);
  var totalRev    = breakdown.reduce(function(a,b){ return a + b.revenue; }, 0);
  var avgMargin   = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;

  var html =
    '<div class="card" style="margin-bottom:12px;padding:0;overflow:hidden">' +
      '<div style="padding:13px 15px;background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(34,197,94,.02));border-bottom:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:space-between">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--ok);letter-spacing:.02em">💰 Profit Breakdown by Product</div>' +
          '<div style="font-size:10px;color:var(--t3);margin-top:2px;font-family:var(--fm)">' + breakdown.length + ' products · ' + avgMargin.toFixed(1) + '% avg margin</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-family:var(--fd);font-size:18px;font-weight:900;color:var(--ok);line-height:1">' + f$(totalProfit) + '</div>' +
          '<div style="font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;font-family:var(--fm)">Total Profit</div>' +
        '</div>' +
      '</div>';

  // Header row
  html += '<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:6px;padding:8px 13px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:9px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;font-family:var(--fm)">' +
    '<div>Product</div>' +
    '<div style="text-align:right">Per Unit</div>' +
    '<div style="text-align:right">Qty Sold</div>' +
    '<div style="text-align:right">Total Profit</div>' +
  '</div>';

  // Rows
  html += breakdown.map(function(p){
    var marginPct = p.revenue > 0 ? (p.profit / p.revenue * 100) : 0;
    var marginColor = marginPct >= 20 ? 'var(--ok)' : marginPct >= 10 ? 'var(--wa)' : 'var(--er)';
    return '<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:6px;padding:11px 13px;border-bottom:1px solid var(--bd);align-items:center">' +
      '<div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name) + '</div>' +
        '<div style="font-size:10px;color:var(--t3);margin-top:2px">Cost ' + f$(p.unitCost) + ' → Price ' + f$(p.unitPrice) + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:12px;font-weight:800;color:var(--ok);font-family:var(--fm)">' + f$(p.unitPrice - p.unitCost) + '</div>' +
        '<div style="font-size:10px;font-weight:700;color:' + marginColor + ';font-family:var(--fm)">' + marginPct.toFixed(1) + '%</div>' +
      '</div>' +
      '<div style="text-align:right;font-size:13px;font-weight:700;color:var(--t1);font-family:var(--fm)">' + p.qty + '</div>' +
      '<div style="text-align:right;font-size:13px;font-weight:800;color:var(--g);font-family:var(--fm)">' + f$(p.profit) + '</div>' +
    '</div>';
  }).join('');

  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
// REWIRED renderFinReports() — uses the new filter
// ═══════════════════════════════════════════════════════════
function renderFinReports() {
  var b = biz();
  if (!b) return;
  var wrap = el('fin-body');
  if (!wrap) return;

  // Apply active filter
  var allSales = applyFinFilterToSales(b.sales || []);
  var allExps  = applyFinFilterToExpenses(b.expenses || []);

  var grossRev   = allSales.reduce(function(a,s){ return a + sTotal(s); }, 0);
  var actualExp  = allExps.reduce(function(a,e){ return a + (parseFloat(e.amount) || 0); }, 0);
  var totalProfit= allSales.reduce(function(a,s){ return a + calcProfitForSale(s).profit; }, 0);

  // ── Add doc + salary allocations across filter period (if enabled) ──
  var allocEnabled = (b.allocationsEnabled !== false);
  var allocExp = 0;
  if (allocEnabled && typeof getFinFilterDateRange === 'function') {
    var range = getFinFilterDateRange();
    if (range && range.start && range.end) {
      var cur = new Date(range.start + 'T00:00:00');
      var endD = new Date(range.end + 'T00:00:00');
      while (cur <= endD) {
        var iso = cur.toISOString().split('T')[0];
        if (typeof getDayAllocations === 'function') {
          var a = getDayAllocations(iso);
          allocExp += (a && a.total) || 0;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  var totalExp   = actualExp + allocExp;
  var netProfit  = totalProfit - totalExp;
  var totalMargin= grossRev > 0 ? (totalProfit / grossRev * 100) : 0;

  // Build the page based on tab
  var html = '';

  if (finTab === 'profit') {
    // Dedicated profit analysis tab
    html += renderProfitBreakdownSection(allSales) ||
      '<div class="card" style="padding:30px;text-align:center;color:var(--t3)">No sales in this period. Add cost prices to products to track profit.</div>';
  }
  else if (finTab === 'pl') {
    // P&L tab — show profit breakdown at top, then traditional P&L
    var profitSection = renderProfitBreakdownSection(allSales);
    if (profitSection) html += profitSection;

    html += '<div class="card">' +
      '<div class="pl-row"><span>Gross Revenue</span><span class="c-ok fw7">' + f$(grossRev) + '</span></div>' +
      '<div class="pl-row"><span>Product Cost</span><span class="c-er fw7">' + f$(grossRev - totalProfit) + '</span></div>' +
      '<div class="pl-row"><span>Gross Profit</span><span class="c-ok fw7">' + f$(totalProfit) + ' (' + totalMargin.toFixed(1) + '%)</span></div>' +
      (allocExp > 0.01
        ? ('<div class="pl-row" style="font-size:12px;color:var(--t3)"><span style="padding-left:10px">↳ Cash Expenses</span><span>' + f$(actualExp) + '</span></div>' +
           '<div class="pl-row" style="font-size:12px;color:var(--wa)"><span style="padding-left:10px">↳ 📋 Allocated (docs + salaries)</span><span>' + f$(allocExp) + '</span></div>')
        : '') +
      '<div class="pl-row"><span>Operating Expenses</span><span class="c-er fw7">' + f$(totalExp) + '</span></div>' +
      '<div class="pl-row total"><span>NET PROFIT</span><span style="color:' + (netProfit >= 0 ? 'var(--ok)' : 'var(--er)') + '">' + (netProfit >= 0 ? '+' : '') + f$(netProfit) + '</span></div>' +
    '</div>';

    html += '<div class="card" style="margin-top:10px;padding:14px">' +
      '<div class="sh" style="margin-bottom:8px">Transactions (' + allSales.length + ')</div>' +
      (allSales.length
        ? allSales.slice(0, 8).map(function(s){
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bd);font-size:12px;color:var(--t2)">' +
              '<span>' + esc(s.customer || 'Walk-in') + ' · ' + esc(s.inv || '') + '</span>' +
              '<span class="fw7 c-g">' + f$(sTotal(s)) + '</span>' +
            '</div>';
          }).join('') + (allSales.length > 8 ? '<div style="text-align:center;padding:8px 0;font-size:11px;color:var(--t3)">+' + (allSales.length - 8) + ' more</div>' : '')
        : '<div style="text-align:center;padding:20px;color:var(--t3);font-size:12px">No transactions in this period</div>') +
    '</div>';
  }
  else if (finTab === 'cat') {
    // Sales by category
    var byCat = {};
    allSales.forEach(function(s){
      (s.items || []).forEach(function(it){
        var prod = (b.products || []).find(function(p){ return p.id === it.prodId; });
        var c = prod ? (prod.category || 'Other') : 'Unknown';
        if (!byCat[c]) byCat[c] = { rev: 0, profit: 0, qty: 0 };
        var p = calcProfitForItem(it);
        byCat[c].rev    += p.price * p.qty;
        byCat[c].profit += p.total;
        byCat[c].qty    += p.qty;
      });
    });
    var cats = Object.keys(byCat).sort(function(a,b){ return byCat[b].rev - byCat[a].rev; });
    if (!cats.length) {
      html += '<div class="card" style="padding:30px;text-align:center;color:var(--t3)">No sales by category yet</div>';
    } else {
      html += '<div class="card" style="padding:0;overflow:hidden">' +
        '<div style="padding:11px 14px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:11px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;font-family:var(--fm)">Sales by Category</div>';
      html += cats.map(function(c){
        var pct = grossRev > 0 ? (byCat[c].rev / grossRev * 100) : 0;
        return '<div style="padding:12px 14px;border-bottom:1px solid var(--bd)">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:13px;font-weight:700;color:var(--t1)">' + esc(c) + '</span>' +
            '<span style="font-size:13px;font-weight:800;color:var(--g);font-family:var(--fm)">' + f$(byCat[c].rev) + '</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:5px">' +
            '<span>' + byCat[c].qty + ' sold · ' + pct.toFixed(1) + '%</span>' +
            '<span class="c-ok">Profit: ' + f$(byCat[c].profit) + '</span>' +
          '</div>' +
          '<div style="height:5px;background:var(--s2);border-radius:99px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--g),var(--g3))"></div>' +
          '</div>' +
        '</div>';
      }).join('');
      html += '</div>';
    }
  }
  else if (finTab === 'cust') {
    // Top customers
    var byCust = {};
    allSales.forEach(function(s){
      var name = s.customer || 'Walk-in';
      if (!byCust[name]) byCust[name] = { rev: 0, count: 0, profit: 0 };
      byCust[name].rev    += sTotal(s);
      byCust[name].count++;
      byCust[name].profit += calcProfitForSale(s).profit;
    });
    var customers = Object.keys(byCust).sort(function(a,b){ return byCust[b].rev - byCust[a].rev; });
    if (!customers.length) {
      html += '<div class="card" style="padding:30px;text-align:center;color:var(--t3)">No customer sales yet</div>';
    } else {
      html += '<div class="card" style="padding:0;overflow:hidden">' +
        '<div style="padding:11px 14px;background:var(--s2);border-bottom:1px solid var(--bd);font-size:11px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;font-family:var(--fm)">Top Customers</div>';
      html += customers.slice(0, 20).map(function(name, i){
        return '<div style="padding:11px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:11px">' +
          '<div class="av" style="width:34px;height:34px;font-size:12px;flex-shrink:0">' + esc(mkInit(name)) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</div>' +
            '<div style="font-size:11px;color:var(--t3)">' + byCust[name].count + ' orders · profit ' + f$(byCust[name].profit) + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:13px;font-weight:800;color:var(--g);font-family:var(--fm)">' + f$(byCust[name].rev) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      html += '</div>';
    }
  }

  wrap.innerHTML = html;
}

// Switch between tabs
function switchFinTab(tab) {
  finTab = tab;
  ['pl','cat','cust','profit'].forEach(function(t){
    var c = el('rpt-tab-' + t);
    if (c) c.classList.toggle('on', t === tab);
  });
  renderFinReports();
}

// ═══════════════════════════════════════════════════════════
// EXPORT FILTERED RESULTS TO EXCEL
// ═══════════════════════════════════════════════════════════
function exportFilteredReport_protected() {
  protectedExport(function(){ exportFilteredReport_raw(); }, 'Financial Report Export');
}
function exportFilteredReport_raw() {
  if (typeof XLSX === 'undefined') { toast('Excel library not loaded', 'er'); return; }
  var b = biz();
  if (!b) return;
  var sales = applyFinFilterToSales(b.sales || []);
  if (!sales.length) { toast('No data to export with current filter', 'er'); return; }

  // Sheet 1: Sales
  var salesData = sales.map(function(s){
    var p = calcProfitForSale(s);
    return {
      Invoice: s.inv || '',
      Date: s.date || '',
      Customer: s.customer || 'Walk-in',
      Contact: s.contact || '',
      Items: (s.items || []).map(function(i){ return i.name + ' x' + i.qty; }).join(' | '),
      Discount: s.discount || 0,
      Total: sTotal(s),
      Paid: s.paid || 0,
      Due: sDue(s),
      PayMode: s.paymode || '',
      Status: sSt(s),
      Profit: p.profit.toFixed(2),
      Margin_Pct: p.margin.toFixed(1)
    };
  });

  // Sheet 2: Profit Breakdown by Product
  var breakdown = buildProfitBreakdown(sales);
  var breakdownData = breakdown.map(function(p){
    return {
      Product: p.name,
      Unit_Cost: p.unitCost.toFixed(2),
      Unit_Price: p.unitPrice.toFixed(2),
      Profit_Per_Unit: (p.unitPrice - p.unitCost).toFixed(2),
      Qty_Sold: p.qty,
      Revenue: p.revenue.toFixed(2),
      Total_Cost: p.cost.toFixed(2),
      Total_Profit: p.profit.toFixed(2),
      Margin_Pct: (p.revenue > 0 ? (p.profit/p.revenue*100) : 0).toFixed(1)
    };
  });

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Sales');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(breakdownData), 'Profit Breakdown');

  var filterDesc = describeActiveFilter(finActiveFilter).replace(/[^a-z0-9]/gi, '_').slice(0, 30);
  XLSX.writeFile(wb, 'report_' + filterDesc + '_' + today() + '.xlsx');
  toast('Report exported (' + salesData.length + ' sales)', 'gd');
}

// ═══════════════════════════════════════════════════════════
// PRINT FILTERED RESULTS
// ═══════════════════════════════════════════════════════════
function printFilteredReport() {
  var b = biz();
  if (!b) return;
  var sales = applyFinFilterToSales(b.sales || []);
  var exps  = applyFinFilterToExpenses(b.expenses || []);
  if (!sales.length && !exps.length) { toast('No data to print', 'er'); return; }

  var grossRev    = sales.reduce(function(a,s){ return a + sTotal(s); }, 0);
  var totalExp    = exps.reduce(function(a,e){ return a + (parseFloat(e.amount) || 0); }, 0);
  var totalProfit = sales.reduce(function(a,s){ return a + calcProfitForSale(s).profit; }, 0);
  var netProfit   = totalProfit - totalExp;
  var breakdown   = buildProfitBreakdown(sales);

  var filterLbl = describeActiveFilter(finActiveFilter) || 'All Records';

  var overlay = document.getElementById('print-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'print-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML =
    '<style>' +
      '@media print { body > *:not(#print-overlay) { display:none !important; } #print-overlay { display:block !important; position:static !important; } @page { margin: 14mm; size: A4; } }' +
      '#print-overlay { position:fixed;inset:0;z-index:9999;background:#fff;color:#000;overflow:auto;font-family:Arial,sans-serif;padding:18px }' +
      '.rp-hdr { text-align:center;border-bottom:3px double #000;padding-bottom:10px;margin-bottom:14px }' +
      '.rp-hdr h1 { margin:0;font-size:20px;letter-spacing:.05em }' +
      '.rp-meta { font-size:11px;color:#444;margin-top:4px }' +
      '.rp-section { margin-bottom:16px }' +
      '.rp-section h2 { font-size:13px;margin:0 0 6px;background:#000;color:#fff;padding:4px 8px;letter-spacing:.05em }' +
      '.rp-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px }' +
      '.rp-kpi { border:1px solid #000;padding:7px 10px }' +
      '.rp-kpi-lbl { font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#555 }' +
      '.rp-kpi-val { font-size:15px;font-weight:bold;margin-top:2px }' +
      '.rp-tbl { width:100%;border-collapse:collapse;font-size:11px;margin-top:5px }' +
      '.rp-tbl th, .rp-tbl td { border:1px solid #999;padding:5px 7px;text-align:left }' +
      '.rp-tbl th { background:#eee;font-weight:bold;text-transform:uppercase;font-size:9px;letter-spacing:.05em }' +
      '.rp-tbl tfoot td { font-weight:bold;background:#f3f3f3 }' +
      '.rp-tbl .num { text-align:right;font-family:Courier,monospace }' +
      '.print-close { position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;padding:8px 14px;cursor:pointer;font-size:12px;border-radius:5px;z-index:10000 }' +
      '@media print { .print-close, .print-action { display:none !important; } }' +
    '</style>' +
    '<button type="button" class="print-close" onclick="closePrintOverlay()">✕ Close</button>' +
    '<button type="button" class="print-action" onclick="window.print()" style="position:fixed;top:14px;right:90px;background:#1a73e8;color:#fff;border:none;padding:8px 14px;cursor:pointer;font-size:12px;border-radius:5px;z-index:10000">🖨 Print</button>' +
    '<div class="rp-hdr">' +
      '<h1>' + esc(b.name || 'Business') + '</h1>' +
      '<div class="rp-meta">Financial Report &middot; Filter: ' + esc(filterLbl) + '</div>' +
      '<div class="rp-meta">Generated: ' + new Date().toLocaleString() + '</div>' +
    '</div>' +

    '<div class="rp-section">' +
      '<h2>SUMMARY</h2>' +
      '<div class="rp-grid">' +
        '<div class="rp-kpi"><div class="rp-kpi-lbl">Revenue</div><div class="rp-kpi-val">' + f$(grossRev) + '</div></div>' +
        '<div class="rp-kpi"><div class="rp-kpi-lbl">Gross Profit</div><div class="rp-kpi-val">' + f$(totalProfit) + '</div></div>' +
        '<div class="rp-kpi"><div class="rp-kpi-lbl">Expenses</div><div class="rp-kpi-val">' + f$(totalExp) + '</div></div>' +
        '<div class="rp-kpi"><div class="rp-kpi-lbl">Net Profit</div><div class="rp-kpi-val">' + f$(netProfit) + '</div></div>' +
      '</div>' +
    '</div>' +

    (breakdown.length
      ? '<div class="rp-section">' +
          '<h2>PROFIT BREAKDOWN BY PRODUCT</h2>' +
          '<table class="rp-tbl">' +
            '<thead><tr><th>Product</th><th class="num">Cost</th><th class="num">Price</th><th class="num">Per Unit</th><th class="num">Qty</th><th class="num">Total Profit</th><th class="num">Margin %</th></tr></thead>' +
            '<tbody>' +
              breakdown.map(function(p){
                var marg = p.revenue > 0 ? (p.profit / p.revenue * 100) : 0;
                return '<tr>' +
                  '<td>' + esc(p.name) + '</td>' +
                  '<td class="num">' + f$(p.unitCost) + '</td>' +
                  '<td class="num">' + f$(p.unitPrice) + '</td>' +
                  '<td class="num">' + f$(p.unitPrice - p.unitCost) + '</td>' +
                  '<td class="num">' + p.qty + '</td>' +
                  '<td class="num">' + f$(p.profit) + '</td>' +
                  '<td class="num">' + marg.toFixed(1) + '%</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
            '<tfoot><tr><td colspan="5">TOTAL</td><td class="num">' + f$(totalProfit) + '</td><td class="num">' + (grossRev > 0 ? (totalProfit/grossRev*100).toFixed(1) : 0) + '%</td></tr></tfoot>' +
          '</table>' +
        '</div>'
      : '') +

    (sales.length
      ? '<div class="rp-section">' +
          '<h2>SALES (' + sales.length + ')</h2>' +
          '<table class="rp-tbl">' +
            '<thead><tr><th>#</th><th>Date</th><th>Invoice</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Profit</th><th>Mode</th></tr></thead>' +
            '<tbody>' +
              sales.map(function(s,i){
                var p = calcProfitForSale(s);
                return '<tr>' +
                  '<td>' + (i+1) + '</td>' +
                  '<td>' + esc(s.date || '') + '</td>' +
                  '<td>' + esc(s.inv || '') + '</td>' +
                  '<td>' + esc(s.customer || 'Walk-in') + '</td>' +
                  '<td class="num">' + f$(sTotal(s)) + '</td>' +
                  '<td class="num">' + f$(s.paid || 0) + '</td>' +
                  '<td class="num">' + f$(p.profit) + '</td>' +
                  '<td>' + esc(s.paymode || '') + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>'
      : '') +

    (exps.length
      ? '<div class="rp-section">' +
          '<h2>EXPENSES (' + exps.length + ')</h2>' +
          '<table class="rp-tbl">' +
            '<thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead>' +
            '<tbody>' +
              exps.map(function(e){
                return '<tr>' +
                  '<td>' + esc(e.date || '') + '</td>' +
                  '<td>' + esc(e.category || '') + '</td>' +
                  '<td>' + esc(e.desc || e.description || '') + '</td>' +
                  '<td class="num">' + f$(parseFloat(e.amount) || 0) + '</td>' +
                '</tr>';
              }).join('') +
              '<tr><td colspan="3" style="text-align:right;font-weight:bold">TOTAL EXPENSES</td><td class="num" style="font-weight:bold">' + f$(totalExp) + '</td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>'
      : '');

  overlay.style.display = 'block';
  setTimeout(function(){ window.print(); }, 400);
}

function closePrintOverlay() {
  var o = document.getElementById('print-overlay');
  if (o) o.style.display = 'none';
}



// ═══════════════════════════════════════════════════════════
// STAGE 2: PERMISSION GATES
// Apply visual locks (greyed-out + 🔒) when user lacks permission
// ═══════════════════════════════════════════════════════════

function enforceDashboardPerms() {
  if (!CU) return;

  // ── ADMIN SHORT-CIRCUIT ──
  // Primary admin and admin role ALWAYS see EVERYTHING. No gating, ever.
  // We aggressively restore display on every dashboard element that might
  // have had display:none applied by a previous non-admin login.
  if (CU.role === 'primaryAdmin' || CU.role === 'admin') {
    var pg = document.getElementById('pg-dash');
    if (pg) {
      // Restore the kcard-v2 cards explicitly
      ['ks','ke','kiv','kl'].forEach(function(id){
        var elx = document.getElementById(id);
        if (elx) {
          var card = elx.closest('.kcard-v2');
          if (card) card.style.display = '';
        }
      });
      // Strip display:none from EVERY element inside the dashboard page.
      // This guarantees nothing stays hidden from previous gating.
      pg.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(function(el){
        // Don't unhide elements that should be hidden for OTHER reasons (modals, etc.)
        // Only restore elements that are part of the dashboard layout, not popups.
        var keepHidden =
          el.classList.contains('dov')      ||  // drawer overlay
          el.classList.contains('modal')    ||  // modal
          el.id === 'print-overlay'         ||
          el.id === 'sidebar-overlay'       ||
          el.id === 'sidebar-menu'          ||
          el.classList.contains('ndot');         // notification dots
        if (!keepHidden) {
          el.style.display = '';
        }
      });
    }
    // Remove any restrictive body classes
    document.body.classList.remove('no-net-profit', 'no-expenses-card',
      'no-inventory-value', 'no-weekly-revenue', 'no-product-price', 'no-all-sales');
    return;
  }

  // ── BELOW: only runs for non-admin roles (staff, sell agents, viewers) ──

  // ── 1. HERO NET PROFIT STRIP ──
  var hero = document.querySelector('.hero-net');
  if (hero) {
    hero.style.display = hasPerm('see_net_profit') ? '' : 'none';
  }

  // ── 2. DASHBOARD CARDS GRID ──
  // Inventory Value card — hide if user lacks see_inventory_value
  try {
    var kivEl = document.getElementById('kiv');
    if (kivEl) {
      var ivCard = kivEl.closest('.kcard-v2');
      if (ivCard) ivCard.style.display = hasPerm('see_inventory_value') ? '' : 'none';
    }
  } catch(e){}
  // Expenses card — hide if user lacks see_expenses_card
  try {
    var keEl = document.getElementById('ke');
    if (keEl) {
      var expCard = keEl.closest('.kcard-v2');
      if (expCard) expCard.style.display = hasPerm('see_expenses_card') ? '' : 'none';
    }
  } catch(e){}
  // Legacy .stat-card fallback for any older markup
  document.querySelectorAll('.stat-card').forEach(function(card){
    var lbl = card.querySelector('.stat-card-label, .sc-lbl, .stat-label, .sc-l');
    var lblText = lbl ? (lbl.textContent || '').toUpperCase() : (card.textContent || '').toUpperCase();
    if (lblText.indexOf('EXPENSE') >= 0) {
      card.style.display = hasPerm('see_expenses_card') ? '' : 'none';
    } else if (lblText.indexOf('INVENTORY VALUE') >= 0) {
      card.style.display = hasPerm('see_inventory_value') ? '' : 'none';
    }
  });

  // ── 3. WEEKLY REVENUE CHART ──
  var weekly = document.getElementById('week-chart');
  // Hide the parent .sec block, not just the bars
  if (weekly) {
    var section = weekly.closest('.sec') || weekly.parentElement;
    if (section) {
      section.style.display = hasPerm('see_weekly_revenue') ? '' : 'none';
    }
  }

  // ── 4. DAILY REPORT QUICK ACTION ──
  document.querySelectorAll('[onclick*="openDailyReport"]').forEach(function(b){
    // The qa buttons are .qa-btn — hide just the button itself, not its container
    var qaBtn = b.classList && b.classList.contains('qa-btn') ? b : b.closest('.qa-btn');
    var target = qaBtn || b;
    target.style.display = hasPerm('print_daily_report') ? '' : 'none';
  });

  // ── 5. ADD EXPENSE QUICK ACTION ──
  document.querySelectorAll('[onclick*="openExp"], [onclick*="goTo(\'expenses\')"]').forEach(function(b){
    var qaBtn = b.classList && b.classList.contains('qa-btn') ? b : b.closest('.qa-btn');
    var target = qaBtn || b;
    target.style.display = hasPerm('see_expenses') ? '' : 'none';
  });

  // ── 6. CSS body classes for sweeping styles ──
  document.body.classList.toggle('no-net-profit',     !hasPerm('see_net_profit'));
  document.body.classList.toggle('no-expenses-card',  !hasPerm('see_expenses_card'));
  document.body.classList.toggle('no-inventory-value',!hasPerm('see_inventory_value'));
  document.body.classList.toggle('no-weekly-revenue', !hasPerm('see_weekly_revenue'));
  document.body.classList.toggle('no-product-price',  !hasPerm('see_product_price'));
  document.body.classList.toggle('no-all-sales',      !hasPerm('see_all_sales'));
}

// ─── Helper: mask a number element when locked ───
function maskIfNoPerm(elementId, permKey) {
  var elx = document.getElementById(elementId);
  if (!elx) return;
  if (!hasPerm(permKey)) {
    elx.textContent = '🔒 Locked';
    elx.style.color = 'var(--t3)';
    elx.style.fontSize = '12px';
  }
}

// ─── Hide entire page/section by permission ───
function gatePageByPerm(pageId, permKey) {
  if (hasPerm(permKey)) return true;  // Allowed
  var pg = document.getElementById(pageId);
  if (pg) {
    pg.innerHTML = '<div class="sec">' +
      '<div class="perm-lock-card" style="padding:40px 20px;text-align:center">' +
        '<div class="perm-lock-icon">🔒</div>' +
        '<div class="perm-lock-title">Access restricted</div>' +
        '<div class="perm-lock-sub">' + (PERM_LABELS[permKey] || permKey) + ' — ask admin to enable</div>' +
      '</div>' +
    '</div>';
  }
  return false;
}

// ─── Add a lock badge to a button (visually only — click still fires) ───
function addLockToButton(button, permKey) {
  if (!button) return;
  if (hasPerm(permKey)) {
    // Restore button if it was locked
    button.classList.remove('perm-locked');
    button.style.opacity = '';
    return;
  }
  if (button.classList.contains('perm-locked')) return;
  button.classList.add('perm-locked');
  button.style.opacity = '.55';
  // Add lock icon if not present
  if (button.textContent.indexOf('🔒') < 0) {
    var orig = button.textContent;
    button.dataset.origText = orig;
    button.innerHTML = '🔒 ' + orig;
  }
}

// ─── Override key functions to check permissions ───
// Wrap exportFilteredReport
(function(){
  if (typeof window.exportFilteredReport === 'function') {
    var orig = window.exportFilteredReport;
    window.exportFilteredReport = function() {
      if (!hasPerm('export_reports')) {
        permDenied('export_reports');
        return;
      }
      // Require password for sensitive action
      requirePassword('Export Reports', function(){
        orig.apply(this, arguments);
      });
    };
  }
  if (typeof window.printFilteredReport === 'function') {
    var origP = window.printFilteredReport;
    window.printFilteredReport = function() {
      if (!hasPerm('print_daily_report')) {
        permDenied('print_daily_report');
        return;
      }
      origP.apply(this, arguments);
    };
  }
  if (typeof window.exportProductsToExcel === 'function') {
    var origE = window.exportProductsToExcel;
    window.exportProductsToExcel = function() {
      if (!hasPerm('export_reports')) {
        permDenied('export_reports');
        return;
      }
      requirePassword('Export Products', function(){
        origE.apply(this, arguments);
      });
    };
  }
  if (typeof window.exportSalesToExcel === 'function') {
    var origS = window.exportSalesToExcel;
    window.exportSalesToExcel = function() {
      if (!hasPerm('export_reports')) {
        permDenied('export_reports');
        return;
      }
      requirePassword('Export Sales', function(){
        origS.apply(this, arguments);
      });
    };
  }
  if (typeof window.openDailyReport === 'function') {
    var origD = window.openDailyReport;
    window.openDailyReport = function() {
      if (!hasPerm('print_daily_report')) {
        permDenied('print_daily_report');
        return;
      }
      origD.apply(this, arguments);
    };
  }
})();

// Gate Reports page when user navigates to it
(function(){
  var origGoTo = window.goTo;
  if (typeof origGoTo !== 'function') return;
  window.goTo = function(p) {
    // Check page-level permissions BEFORE navigating
    if (p === 'reports' && !hasPerm('see_financial_reports')) {
      permDenied('see_financial_reports');
      return;
    }
    if (p === 'expenses' && !hasPerm('see_expenses')) {
      permDenied('see_expenses');
      return;
    }
    if (p === 'salary' && !isAdmin() && !hasPerm('see_salary_management')) {
      permDenied('see_salary_management');
      return;
    }
    if (p === 'docexp' && !isAdmin()) {
      permDenied('Documentation Expense (admins only)');
      return;
    }
    return origGoTo.apply(this, arguments);
  };
})();

// Gate "Manage Team" + "Business Settings" via their open functions
(function(){
  if (typeof window.openTeam === 'function') {
    var origT = window.openTeam;
    window.openTeam = function() {
      if (!isAdmin()) { toast('Admins only', 'er'); return; }
      // Non-primary admin needs manage_team permission
      if (!isPrimary() && !hasPerm('manage_team')) {
        permDenied('manage_team');
        return;
      }
      return origT.apply(this, arguments);
    };
  }
  if (typeof window.openBizSettings === 'function') {
    var origB = window.openBizSettings;
    window.openBizSettings = function() {
      if (!isAdmin()) { toast('Admins only', 'er'); return; }
      if (!isPrimary() && !hasPerm('manage_settings')) {
        permDenied('manage_settings');
        return;
      }
      return origB.apply(this, arguments);
    };
  }
})();

// Sales totals: gate "see_sales_totals" by hiding due column / total amounts when staff
// We'll re-style this in renderSales render but simpler approach: add CSS class
function applySalesPermStyles() {
  if (hasPerm('see_sales_totals')) {
    document.body.classList.remove('no-sales-totals');
  } else {
    document.body.classList.add('no-sales-totals');
  }
  if (hasPerm('see_product_cost')) {
    document.body.classList.remove('no-product-cost');
  } else {
    document.body.classList.add('no-product-cost');
  }
}

// Call this on every login + after each render



// ═══════════════════════════════════════════════════════════
// STAGE 3: USER PERMISSIONS UI
// ═══════════════════════════════════════════════════════════
let _editingPermsUserId = null;

function openUserPerms(userId) {
  if (!isPrimary()) {
    toast('Only primary admin can change permissions', 'er');
    return;
  }
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) { toast('User not found', 'er'); return; }
  if (u.role === 'primaryAdmin') {
    toast('Primary admin has all permissions', 'gd');
    return;
  }
  _editingPermsUserId = userId;
  // Make sure user has perms
  if (!u.perms) u.perms = defaultPermsFor(u.role);

  // Fill drawer header
  var avEl = document.getElementById('up-avatar');
  var nmEl = document.getElementById('up-name');
  var rlEl = document.getElementById('up-role');
  if (avEl) avEl.textContent = mkInit(u.name);
  if (nmEl) nmEl.textContent = u.name + ' (@' + u.username + ')';
  if (rlEl) rlEl.textContent = (RLBL[u.role] || u.role) + ' • ' + (u.email || 'no email');

  renderUserPerms();
  openD('d-user-perms');
}

function renderUserPerms() {
  if (!_editingPermsUserId) return;
  var u = (DB.users || []).find(function(x){ return x.id === _editingPermsUserId; });
  if (!u) return;
  u.perms = u.perms || defaultPermsFor(u.role);
  var html = '';
  PERM_KEYS.forEach(function(key){
    var on = !!u.perms[key];
    html += '<div class="up-toggle-row' + (on ? ' on' : '') + '" onclick="togglePerm(\'' + key + '\')">' +
      '<div class="up-toggle-icon">' + (PERM_ICONS[key] || '🔒') + '</div>' +
      '<div class="up-toggle-info">' +
        '<div class="up-toggle-name">' + esc(PERM_LABELS[key]) + '</div>' +
        '<div class="up-toggle-key">' + (on ? '✓ Granted' : '✗ Locked') + '</div>' +
      '</div>' +
      '<div class="up-toggle-switch"></div>' +
    '</div>';
  });
  var listEl = document.getElementById('up-perms-list');
  if (listEl) listEl.innerHTML = html;
}

function togglePerm(permKey) {
  if (!_editingPermsUserId) return;
  var u = (DB.users || []).find(function(x){ return x.id === _editingPermsUserId; });
  if (!u) return;
  u.perms = u.perms || defaultPermsFor(u.role);
  var newVal = !u.perms[permKey];
  setUserPerm(_editingPermsUserId, permKey, newVal);
  renderUserPerms();
  toast((newVal ? '✓ Granted: ' : '🚫 Revoked: ') + PERM_LABELS[permKey], newVal ? 'gd' : 'er');
}

function applyPermPreset(preset) {
  if (!_editingPermsUserId) return;
  var u = (DB.users || []).find(function(x){ return x.id === _editingPermsUserId; });
  if (!u) return;
  var newPerms = {};
  if (preset === 'none') {
    PERM_KEYS.forEach(function(k){ newPerms[k] = false; });
  } else if (preset === 'cashier') {
    PERM_KEYS.forEach(function(k){ newPerms[k] = false; });
    newPerms.see_product_price = true;  // need price to ring up sales
    newPerms.see_all_sales = true;      // cashier reconciles end-of-day, sees business total
  } else if (preset === 'sell_agent') {
    // Sell Agent: their own sales only, product names + qty (no prices/costs),
    // shortage alerts allowed. NO net profit, NO expenses, NO weekly revenue.
    PERM_KEYS.forEach(function(k){ newPerms[k] = false; });
    newPerms.see_dashboard_cards    = true;  // general dashboard (own sales card, low stock card)
    newPerms.see_product_price      = true;  // need to sell items
    // Everything else stays off (net profit, expenses card, inventory value, weekly revenue,
    // all sales, financial reports, exports, daily report, etc.)
  } else if (preset === 'manager') {
    newPerms = {
      see_dashboard_cards: true,
      see_net_profit: true,
      see_expenses_card: true,
      see_inventory_value: true,
      see_weekly_revenue: true,
      see_all_sales: true,
      see_product_price: true,
      see_financial_reports: true,
      see_sales_totals: true,
      see_product_cost: true,
      see_expenses: true,
      see_salary_management: true,
      export_reports: false,
      print_daily_report: true,
      manage_team: false,
      manage_settings: false
    };
  } else if (preset === 'all') {
    PERM_KEYS.forEach(function(k){ newPerms[k] = true; });
  }
  u.perms = newPerms;
  if (typeof addAdminLog === 'function') {
    addAdminLog('perm_preset', 'Applied "' + preset + '" preset to ' + u.name, CU.name);
  }
  dbSave();
  if (typeof fbPush === 'function') try { fbPush(); } catch(e){}
  renderUserPerms();
  toast('Applied "' + preset + '" preset', 'gd');
}



// ═══════════════════════════════════════════════════════════
// STAGE 4+5: FIREBASE CONFIG SECURITY
// ═══════════════════════════════════════════════════════════

// Helper: mask Firebase config so admins (non-primary) see ***
function getMaskedFBConfig() {
  try {
    var raw = localStorage.getItem('ss_fb_config');
    if (!raw) return '';
    var cfg = JSON.parse(raw);
    var masked = {};
    Object.keys(cfg).forEach(function(k){
      var v = cfg[k] || '';
      // Keep domain visible, mask keys/IDs
      if (k === 'apiKey' || k === 'appId' || k === 'messagingSenderId') {
        masked[k] = (v.length > 6) ? '••••••••••••' + v.slice(-4) : '••••••••';
      } else if (k === 'projectId' || k === 'authDomain' || k === 'storageBucket' || k === 'databaseURL') {
        // Show partial - just the project name
        var match = v.match(/([a-z0-9-]+)/i);
        masked[k] = match ? '••••' + match[1].slice(-4) + '••••' : '••••••';
      } else {
        masked[k] = '••••••••';
      }
    });
    return JSON.stringify(masked, null, 2);
  } catch(e) { return ''; }
}

// Override openFBSetup to mask config from non-primary admins
(function(){
  var origOpen = window.openFBSetup;
  if (typeof origOpen !== 'function') return;
  window.openFBSetup = function() {
    // Let the original function open and render normally
    origOpen.apply(this, arguments);
    // Then apply masking after a short delay (so DOM is ready)
    setTimeout(applyFBConfigMask, 100);
  };
})();

function applyFBConfigMask() {
  var textarea = document.getElementById('fb-config-input');
  if (!textarea) return;

  if (isPrimary()) {
    // Primary admin sees real config
    return;
  }

  // Non-primary admin: show masked version, disable edits
  var masked = getMaskedFBConfig();
  if (masked) {
    textarea.value = masked;
    textarea.readOnly = true;
    textarea.style.opacity = '.6';
    textarea.style.cursor = 'not-allowed';
    // Add lock indicator at top
    if (!document.getElementById('fb-mask-notice')) {
      var notice = document.createElement('div');
      notice.id = 'fb-mask-notice';
      notice.style.cssText = 'background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:var(--r10);padding:11px 13px;margin-bottom:10px;font-size:11px;color:var(--wa);line-height:1.6';
      notice.innerHTML = '🔒 <strong>Firebase keys are hidden</strong> — only the primary admin can view or change the database configuration.';
      textarea.parentNode.insertBefore(notice, textarea);
    }
  }

  // Hide / disable the Connect button for non-primary
  var connectBtns = document.querySelectorAll('#d-fbsetup button');
  connectBtns.forEach(function(btn){
    var txt = (btn.textContent || '').trim();
    if (txt.indexOf('Connect') >= 0 || txt.indexOf('Disconnect') >= 0) {
      if (!isPrimary()) {
        btn.disabled = true;
        btn.style.opacity = '.4';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Only primary admin can change Firebase config';
        // Replace handler to show toast
        btn.onclick = function(ev){
          ev.preventDefault();
          ev.stopPropagation();
          toast('🔒 Only primary admin can change Firebase config', 'er');
        };
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// PASSWORD GATES FOR SENSITIVE ACTIONS (every time)
// ═══════════════════════════════════════════════════════════

// Wrap disconnect Firebase
(function(){
  var orig = window.disconnectFirebase;
  if (typeof orig !== 'function') return;
  window.disconnectFirebase = function() {
    if (!isPrimary()) {
      toast('🔒 Only primary admin can disconnect Firebase', 'er');
      return;
    }
    requirePassword('Disconnect Firebase Database', function(){
      orig.apply(this, arguments);
    });
  };
})();

// Wrap saveFBConfig
(function(){
  var orig = window.saveFBConfig;
  if (typeof orig !== 'function') return;
  window.saveFBConfig = function() {
    if (!isPrimary()) {
      toast('🔒 Only primary admin can change Firebase config', 'er');
      return;
    }
    requirePassword('Save Firebase Configuration', function(){
      orig.apply(this, arguments);
    });
  };
})();

// Wrap exportBackup
(function(){
  var orig = window.exportBackup;
  if (typeof orig !== 'function') return;
  window.exportBackup = function() {
    if (!isAdmin()) {
      toast('🔒 Admins only', 'er');
      return;
    }
    requirePassword('Download Full Database Backup', function(){
      orig.apply(this, arguments);
    });
  };
})();

// Wrap deleteSale, deleteProduct, deleteExpense  
['deleteSale', 'deleteProduct', 'deleteExpense', 'removeUser'].forEach(function(fnName){
  if (typeof window[fnName] === 'function') {
    var orig = window[fnName];
    window[fnName] = function() {
      var args = arguments;
      if (!isAdmin()) {
        // Non-admin: create a delete request through change request system
        if (typeof openRecordChangeRequest === 'function' && fnName !== 'removeUser') {
          var type = fnName.replace('delete', '').toLowerCase();
          toast('🔒 Sending delete request to admin', 'gd');
          openRecordChangeRequest(type, args[0], type + ' #' + args[0]);
          return;
        }
        toast('🔒 Admins only', 'er');
        return;
      }
      requirePassword('Delete ' + fnName.replace('delete','').replace('removeUser','User'), function(){
        orig.apply(this, args);
      });
    };
  }
});

// Notify primary admin when staff sends a delete request (already exists in CR system,
// but we ensure a notification fires too)
(function(){
  var orig = window.openRecordChangeRequest;
  if (typeof orig !== 'function') return;
  window.openRecordChangeRequest = function() {
    orig.apply(this, arguments);
    // After 800ms, push a notification too so admin gets both
    setTimeout(function(){
      if (typeof addNotif === 'function' && CU && !isAdmin()) {
        try {
          addNotif('change_request', '🔔 ' + (CU.name || 'Staff') + ' requested a record change/delete — review in Admin Panel');
        } catch(e){}
      }
    }, 800);
  };
})();



// ═══════════════════════════════════════════════════════════
// APP LOADING SCREEN HIDE
// Hide the loader once the app has finished initializing
// Minimum show time: 800ms (so it doesn't flash)
// Maximum wait: 4 seconds (in case something hangs)
// ═══════════════════════════════════════════════════════════
(function(){
  // ── INSTANT RESTORE: if user has a session, remove loader immediately ──
  if (window._instantRestore) {
    var loader = document.getElementById('ss-loader');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    return;
  }

  // First-time visitor / signed-out — show normal loader briefly
  var loaderStart = Date.now();
  var MIN_SHOW = 600;   // Reduced from 3s — only show briefly on first visit
  var MAX_WAIT = 4000;  // Safety net

  function hideLoader() {
    var elapsed = Date.now() - loaderStart;
    var wait = Math.max(0, MIN_SHOW - elapsed);
    setTimeout(function(){
      var loader = document.getElementById('ss-loader');
      if (!loader) return;
      loader.classList.add('fade-out');
      setTimeout(function(){
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 550);
    }, wait);
  }

  function tryHide() {
    if (document.readyState === 'complete') {
      hideLoader();
    } else {
      window.addEventListener('load', hideLoader, { once: true });
    }
  }

  setTimeout(function(){
    var loader = document.getElementById('ss-loader');
    if (loader && !loader.classList.contains('fade-out')) {
      hideLoader();
    }
  }, MAX_WAIT);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHide, { once: true });
  } else {
    tryHide();
  }
})();



// ═══════════════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// Enables "Install App" prompt + offline support
// Requires HTTPS (Netlify provides this automatically)
// ═══════════════════════════════════════════════════════════
(function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Not supported by this browser');
    return;
  }
  // Only register over HTTPS (or localhost for dev)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    console.log('[SW] Skipped — requires HTTPS (you are on ' + location.protocol + ')');
    return;
  }
  // Register after page load to avoid blocking initial render
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function(reg) {
        console.log('[SW] Registered:', reg.scope);
        // Watch for updates
        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                console.log('[SW] New version available — refresh to update');
                if (typeof toast === 'function') {
                  toast('🔄 New version ready — refresh to apply', 'gd');
                }
              }
            });
          }
        });
      })
      .catch(function(err) {
        console.log('[SW] Registration failed:', err.message);
      });
  });
})();

// ─── PWA Install Prompt (Add to Home Screen) ───
var deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  // Prevent the default mini-info bar
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log('[PWA] Install prompt ready');
  // Optional: show a toast to remind user they can install
  setTimeout(function() {
    if (typeof toast === 'function' && deferredInstallPrompt) {
      toast('📱 Install SmartStock for offline use — tap menu ⋮ → Install', 'gd');
    }
  }, 5000);
});

window.addEventListener('appinstalled', function() {
  console.log('[PWA] App installed');
  deferredInstallPrompt = null;
  if (typeof toast === 'function') {
    toast('✓ SmartStock Pro installed!', 'gd');
  }
});

// Optional helper: trigger install from a button somewhere
function triggerPWAInstall() {
  if (!deferredInstallPrompt) {
    if (typeof toast === 'function') {
      toast('Tap Chrome menu ⋮ → "Install app" instead', 'er');
    }
    return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(function(result) {
    console.log('[PWA] Install choice:', result.outcome);
    deferredInstallPrompt = null;
  });
}



// ═══════════════════════════════════════════════════════════
// CONNECTED STATUS (for non-primary admins)
// Shows a simple confirmation that Firebase is connected,
// without exposing any config or controls
// ═══════════════════════════════════════════════════════════
function showConnectedStatus() {
  // Check if connected
  var hasConfig = false;
  try {
    var raw = localStorage.getItem('ss_fb_config');
    hasConfig = !!raw;
  } catch(e){}

  // Build a simple status drawer if not already in DOM
  var d = document.getElementById('d-fb-status');
  if (!d) {
    d = document.createElement('div');
    d.id = 'd-fb-status';
    d.className = 'dov';
    d.innerHTML =
      '<div class="dbox" style="max-width:420px"><div class="dh2"></div>' +
        '<div class="dhead">' +
          '<div>' +
            '<div class="dtitle">🔗 Database Sync</div>' +
            '<div class="dsub">Auto-managed</div>' +
          '</div>' +
          '<button type="button" class="dclose" onclick="closeD(\'d-fb-status\')">&#10005;</button>' +
        '</div>' +
        '<div class="dbnp"><div class="dbody">' +
          '<div style="background:rgba(34,197,94,.08);border:1.5px solid rgba(34,197,94,.3);border-radius:var(--r12);padding:24px 18px;text-align:center;margin-bottom:14px">' +
            '<div style="font-size:42px;margin-bottom:10px">✅</div>' +
            '<div style="font-size:16px;font-weight:800;color:var(--ok);margin-bottom:6px">Connected</div>' +
            '<div style="font-size:12px;color:var(--t2);line-height:1.6">Your business data syncs automatically across all devices. No setup needed.</div>' +
          '</div>' +
          '<div style="background:rgba(79,195,247,.06);border:1px solid rgba(79,195,247,.18);border-radius:var(--r10);padding:13px 14px">' +
            '<div style="font-size:11px;color:var(--in);font-weight:700;margin-bottom:6px;letter-spacing:.03em">ℹ How it works</div>' +
            '<div style="font-size:11px;color:var(--t2);line-height:1.7">' +
              '• Changes appear on every staff phone within 1 second<br>' +
              '• Works offline — syncs back when internet returns<br>' +
              '• Only your primary admin can change sync settings' +
            '</div>' +
          '</div>' +
        '</div></div>' +
      '</div>';
    document.body.appendChild(d);
  }
  if (typeof openD === 'function') openD('d-fb-status');
}




// ═══════════════════════════════════════════════════════════════════
//  DOCUMENTATION EXPENSE — UI logic
// ═══════════════════════════════════════════════════════════════════

let editDocId = null;
let docFileData = null;
let docFileType = null;

function openDocExpAdd(){
  editDocId = null;
  docFileData = null;
  docFileType = null;
  el('docexp-dtitle').textContent = '📋 Add Document';
  sv('doc-name','');
  sv('doc-cost','');
  sv('doc-start', today());
  sv('doc-expiry','');
  sv('doc-notes','');
  if(el('doc-type')) el('doc-type').value = 'License';
  if(el('doc-preview')) el('doc-preview').style.display = 'none';
  if(el('doc-file-preview')) {
    el('doc-file-preview').style.display = 'none';
    el('doc-file-preview').innerHTML = '';
  }
  if(el('doc-file-btn')) el('doc-file-btn').innerHTML = '📎 Choose Photo or PDF';
  openD('d-docexp');
}

function openDocExpEdit(id){
  var b = biz(); if(!b) return;
  var doc = (b.docExpenses || []).find(function(d){return d.id === id;});
  if(!doc) return;
  editDocId = id;
  docFileData = doc.fileData || null;
  docFileType = doc.fileType || null;
  el('docexp-dtitle').textContent = '📋 Edit Document';
  sv('doc-name', doc.name || '');
  sv('doc-cost', doc.cost || '');
  sv('doc-start', doc.startDate || '');
  sv('doc-expiry', doc.expiryDate || '');
  sv('doc-notes', doc.notes || '');
  if(el('doc-type')) el('doc-type').value = doc.type || 'License';
  updateDocPreview();
  showDocFilePreview();
  openD('d-docexp');
}

function onDocFile(event){
  var file = event.target.files[0];
  if(!file) return;
  // Limit size: 5MB
  if(file.size > 5*1024*1024){
    toast('File too large (max 5MB)','er');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e){
    docFileData = e.target.result;
    docFileType = file.type;
    showDocFilePreview();
  };
  reader.readAsDataURL(file);
}

function showDocFilePreview(){
  var box = el('doc-file-preview');
  if(!box) return;
  if(!docFileData){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  if(docFileType && docFileType.indexOf('image') === 0){
    box.innerHTML = '<img src="' + docFileData + '" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--bd)">' +
                    '<button type="button" class="btn btn-gh btn-block" style="margin-top:6px;font-size:11px" onclick="clearDocFile()">✕ Remove</button>';
  } else {
    box.innerHTML = '<div style="padding:14px;background:rgba(79,195,247,.08);border:1px solid rgba(79,195,247,.25);border-radius:8px;text-align:center"><div style="font-size:24px">📄</div><div style="font-size:11px;color:var(--t2);margin-top:4px">PDF Attached</div></div>' +
                    '<button type="button" class="btn btn-gh btn-block" style="margin-top:6px;font-size:11px" onclick="clearDocFile()">✕ Remove</button>';
  }
  if(el('doc-file-btn')) el('doc-file-btn').innerHTML = '🔄 Replace File';
}

function clearDocFile(){
  docFileData = null;
  docFileType = null;
  if(el('doc-file')) el('doc-file').value = '';
  showDocFilePreview();
  if(el('doc-file-btn')) el('doc-file-btn').innerHTML = '📎 Choose Photo or PDF';
}

function updateDocPreview(){
  var cost = parseFloat(gv('doc-cost'));
  var start = gv('doc-start');
  var expiry = gv('doc-expiry');
  if(!cost || !start || !expiry){
    if(el('doc-preview')) el('doc-preview').style.display = 'none';
    return;
  }
  var wd = countWorkingDays(start, expiry);
  if(wd <= 0){
    if(el('doc-preview')) el('doc-preview').style.display = 'none';
    return;
  }
  var daily = cost / wd;
  // Calculate duration in months
  var dur = daysBetween(start, expiry);
  var durText;
  if(dur >= 365) {
    durText = Math.round(dur/365 * 10)/10 + ' yr';
  } else if(dur >= 30) {
    durText = Math.round(dur/30) + ' mo';
  } else {
    durText = dur + ' days';
  }
  if(el('doc-preview')) el('doc-preview').style.display = '';
  if(el('doc-wd')) el('doc-wd').textContent = wd;
  if(el('doc-dd')) el('doc-dd').textContent = f$(daily);
  if(el('doc-dur')) el('doc-dur').textContent = durText;
  if(el('doc-formula')) el('doc-formula').innerHTML = f$(cost) + ' &divide; ' + wd + ' working days = <strong style="color:var(--ok)">' + f$(daily) + '/day</strong>';
}

function saveDocExp(){
  var b = biz(); if(!b){toast('No business','er');return;}
  var name = gv('doc-name').trim();
  var cost = parseFloat(gv('doc-cost'));
  var start = gv('doc-start');
  var expiry = gv('doc-expiry');
  var type = el('doc-type') ? el('doc-type').value : 'License';
  var notes = gv('doc-notes').trim();
  if(!name){toast('Name required','er');return;}
  if(!cost || cost <= 0){toast('Cost required','er');return;}
  if(!start){toast('Start date required','er');return;}
  if(!expiry){toast('Expiry date required','er');return;}
  if(start >= expiry){toast('Expiry must be after start','er');return;}
  if(!b.docExpenses) b.docExpenses = [];
  if(!b.nextDocId) b.nextDocId = 1;
  if(editDocId !== null){
    var i = b.docExpenses.findIndex(function(d){return d.id === editDocId;});
    if(i > -1){
      b.docExpenses[i] = {
        ...b.docExpenses[i],
        name: name, type: type, cost: cost,
        startDate: start, expiryDate: expiry,
        notes: notes,
        fileData: docFileData, fileType: docFileType,
        updatedAt: Date.now()
      };
      toast('Document updated','gd');
    }
  } else {
    b.docExpenses.push({
      id: b.nextDocId++,
      name: name, type: type, cost: cost,
      startDate: start, expiryDate: expiry,
      notes: notes,
      fileData: docFileData, fileType: docFileType,
      status: 'active',
      createdAt: Date.now(), updatedAt: Date.now(),
      createdBy: CU ? CU.id : null
    });
    toast('Document added','gd');
  }
  dbSave();
  try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
  closeD('d-docexp');
  renderDocExp();
  try { renderDash(); } catch(e){}
}

function delDocExp(id){
  var b = biz(); if(!b) return;
  var doc = (b.docExpenses || []).find(function(d){return d.id === id;});
  if (!doc) return;
  // Beautiful confirmation drawer (not browser confirm)
  if (typeof confirmDelete === 'function') {
    confirmDelete({
      title: 'Delete Document?',
      message: '<strong>' + esc(doc.name) + '</strong><br><br>This document and its daily allocation will be removed permanently. Any cost already accrued stays on your books.',
      onYes: function(){
        b.docExpenses = b.docExpenses.filter(function(d){return d.id !== id;});
        dbSave();
        try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
        toast('Document deleted','gd');
        renderDocExp();
        try { renderDash(); } catch(e){}
      }
    });
  } else {
    // Fallback if helper not available
    if(!confirm('Delete this document? This will stop daily allocation.')) return;
    b.docExpenses = b.docExpenses.filter(function(d){return d.id !== id;});
    dbSave();
    try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
    toast('Document deleted','gd');
    renderDocExp();
    try { renderDash(); } catch(e){}
  }
}

function viewDocFile(id){
  var b = biz(); if(!b) return;
  var doc = (b.docExpenses || []).find(function(d){return d.id === id;});
  if(!doc || !doc.fileData){toast('No file attached','er');return;}
  // Open in new tab/window
  var w = window.open('','_blank');
  if(!w){toast('Popup blocked - allow popups','er');return;}
  if(doc.fileType && doc.fileType.indexOf('image') === 0){
    w.document.write('<html><head><title>'+esc(doc.name)+'</title></head><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+doc.fileData+'" style="max-width:100%;max-height:100vh"></body></html>');
  } else {
    w.document.write('<iframe src="'+doc.fileData+'" style="width:100vw;height:100vh;border:0"></iframe>');
  }
}

function renderDocExp(){
  var b = biz(); if(!b){
    if(el('docexp-list')) el('docexp-list').innerHTML = em('No business loaded');
    return;
  }
  var docs = (b.docExpenses || []).slice().sort(function(a,b){
    return (a.expiryDate || '').localeCompare(b.expiryDate || '');
  });
  // Summary
  if(el('docexp-count')) el('docexp-count').textContent = docs.length;
  // Show today's allocation directly
  var todayAlloc = getDayAllocations(today());
  var docExpTodayEl = el('docexp-today');
  if(docExpTodayEl) docExpTodayEl.textContent = f$(todayAlloc.docs);
  // Expiring within 30 days
  var soonExp = 0;
  var now = today();
  docs.forEach(function(d){
    if(!d.expiryDate) return;
    var daysLeft = daysBetween(now, d.expiryDate);
    if(daysLeft >= 0 && daysLeft <= 30) soonExp++;
  });
  if(el('docexp-warn')) el('docexp-warn').textContent = soonExp;
  // List
  var list = el('docexp-list'); if(!list) return;
  if(!docs.length){
    list.innerHTML = em('No documents tracked yet. Tap + Add Document to begin.');
    return;
  }
  list.innerHTML = docs.map(function(d){
    var daily = getDocDailyAmount(d);
    var accrued = getDocAccruedAmount(d, today());
    var wd = countWorkingDays(d.startDate, d.expiryDate);
    var daysLeft = daysBetween(today(), d.expiryDate);
    var expired = daysLeft < 0;
    var soon = !expired && daysLeft <= 30;
    var statusBadge = expired ?
      '<span class="bdg ber0" style="background:rgba(239,68,68,.15);color:var(--er)">EXPIRED ' + Math.abs(daysLeft) + 'd ago</span>' :
      soon ?
      '<span class="bdg" style="background:rgba(245,158,11,.15);color:var(--wa)">⚠ Expires in ' + daysLeft + 'd</span>' :
      '<span class="bdg" style="background:rgba(34,197,94,.12);color:var(--ok)">Active · ' + daysLeft + 'd left</span>';
    var typeBadge = '<span class="bdg" style="background:var(--s3);color:var(--t2);font-size:9px">' + esc(d.type || 'License') + '</span>';
    var fileBtn = d.fileData ?
      '<button class="btn btn-gh btn-xs" onclick="viewDocFile(' + d.id + ')" style="font-size:10px">📎 View</button>' : '';
    return '<div class="ecard" style="margin-bottom:10px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:var(--t1);margin-bottom:3px">' + esc(d.name) + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">' + typeBadge + statusBadge + '</div>' +
          '<div style="font-size:10px;color:var(--t3);font-family:var(--fm)">' + esc(d.startDate) + ' → ' + esc(d.expiryDate) + '</div>' +
          (d.notes ? '<div style="font-size:11px;color:var(--t3);margin-top:4px">' + esc(d.notes) + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-family:var(--fd);font-size:18px;font-weight:800;color:var(--g)">' + f$(d.cost) + '</div>' +
          '<div style="font-size:10px;color:var(--t3);margin-top:2px">total</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:10px;background:rgba(232,160,32,.06);border:1px solid rgba(232,160,32,.2);border-radius:8px;margin-bottom:10px">' +
        '<div><div style="font-size:9px;color:var(--t3);font-family:var(--fm);letter-spacing:.05em">WORKING DAYS</div><div style="font-weight:700;color:var(--t1);font-size:13px">' + wd + '</div></div>' +
        '<div><div style="font-size:9px;color:var(--t3);font-family:var(--fm);letter-spacing:.05em">DAILY</div><div style="font-weight:700;color:var(--g);font-size:13px">' + f$(daily) + '</div></div>' +
        '<div><div style="font-size:9px;color:var(--t3);font-family:var(--fm);letter-spacing:.05em">ACCRUED</div><div style="font-weight:700;color:var(--er);font-size:13px">' + f$(accrued) + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;padding-top:10px;border-top:1px solid var(--bd);margin-top:6px">' +
        fileBtn +
        '<button type="button" class="btn bgh bsm" onclick="openDocExpEdit(' + d.id + ')" style="flex:1;font-size:11px;font-weight:700">✎ Edit</button>' +
        '<button type="button" class="btn ber bsm" onclick="delDocExp(' + d.id + ')" style="font-size:11px;font-weight:700;min-width:40px" title="Delete">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function daysBetween(d1, d2){
  // d2 - d1 in days. Negative if d2 is before d1.
  if(!d1 || !d2) return 0;
  var t1 = new Date(d1 + 'T00:00:00').getTime();
  var t2 = new Date(d2 + 'T00:00:00').getTime();
  return Math.floor((t2 - t1) / (1000*60*60*24));
}

// ─── Document expiration warnings (called on login/dashboard render) ───
function checkDocExpirations(){
  var b = biz(); if(!b) return;
  var docs = (b.docExpenses || []);
  var now = today();
  var warnings = [];
  docs.forEach(function(d){
    if(!d.expiryDate) return;
    var daysLeft = daysBetween(now, d.expiryDate);
    if(daysLeft === 30 || daysLeft === 14 || daysLeft === 7 || daysLeft === 1){
      warnings.push({doc:d, daysLeft:daysLeft});
    }
  });
  // Only show once per day
  var lastKey = 'docexp_warn_' + now;
  var alreadyShown = false;
  try { alreadyShown = !!localStorage.getItem(lastKey); } catch(e){}
  if(!alreadyShown && warnings.length){
    setTimeout(function(){
      warnings.forEach(function(w, i){
        setTimeout(function(){
          toast('⚠ "' + w.doc.name + '" expires in ' + w.daysLeft + ' day' + (w.daysLeft!==1?'s':''), 'wa');
        }, i * 1500);
      });
      try { localStorage.setItem(lastKey, '1'); } catch(e){}
    }, 1500);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SALARY ALLOCATION (per-employee toggle in d-emp drawer)
// ═══════════════════════════════════════════════════════════════════

function toggleSalaryAlloc(){
  var t = el('emp-alloc-toggle');
  var fields = el('emp-alloc-fields');
  if(!t || !fields) return;
  fields.style.display = t.checked ? '' : 'none';
  if(t.checked) updateSalaryAllocPreview();
}

function updateSalaryAllocPreview(){
  // Auto-calculate from monthly salary × months in period
  var monthlySalary = parseFloat(gv('esal')) || 0;
  var s = gv('emp-alloc-start');
  var e = gv('emp-alloc-end');
  var box = el('emp-alloc-preview');

  // Show date error if end <= start
  if (s && e && e <= s) {
    if(box) {
      box.style.display = '';
      box.style.background = 'rgba(239,68,68,.08)';
      box.style.borderColor = 'rgba(239,68,68,.3)';
      var prevText = el('emp-alloc-prev-text');
      if(prevText) prevText.innerHTML = '<span style="color:var(--er);font-weight:700">⚠ End date must be after start date</span>';
      if(el('emp-alloc-wd')) el('emp-alloc-wd').textContent = '—';
      if(el('emp-alloc-dd')) el('emp-alloc-dd').textContent = '—';
      if(el('emp-alloc-tt')) el('emp-alloc-tt').textContent = '—';
    }
    return;
  }

  if(!monthlySalary || !s || !e){
    if(box) box.style.display = 'none';
    return;
  }
  // Reset colors
  if(box) { box.style.background = ''; box.style.borderColor = ''; }
  var wd = countWorkingDays(s, e);
  if(wd <= 0){
    if(box) box.style.display = 'none';
    return;
  }
  // Compute calendar months between dates (more accurate than days/30)
  var sD = new Date(s + 'T00:00:00');
  var eD = new Date(e + 'T00:00:00');
  var months = (eD.getFullYear() - sD.getFullYear()) * 12 + (eD.getMonth() - sD.getMonth());
  // Add partial month: count remaining days as fraction of month
  var lastMonthStart = new Date(eD.getFullYear(), eD.getMonth(), 1);
  var daysIntoLastMonth = Math.floor((eD - lastMonthStart) / (1000*60*60*24)) + 1;
  var daysInLastMonth = new Date(eD.getFullYear(), eD.getMonth()+1, 0).getDate();
  months += daysIntoLastMonth / daysInLastMonth;
  // Subtract the partial start month
  var firstMonthDay = sD.getDate();
  var daysInFirstMonth = new Date(sD.getFullYear(), sD.getMonth()+1, 0).getDate();
  months -= (firstMonthDay - 1) / daysInFirstMonth;
  // Round to 2 decimal places for clean display
  months = Math.round(months * 100) / 100;
  if (months < 0.01) months = 0.01;
  var totalCost = monthlySalary * months;
  var daily = totalCost / wd;
  if(box){
    box.style.display = '';
    if(el('emp-alloc-wd')) el('emp-alloc-wd').textContent = wd;
    if(el('emp-alloc-dd')) el('emp-alloc-dd').textContent = f$(daily);
    if(el('emp-alloc-tt')) el('emp-alloc-tt').textContent = f$(totalCost);
    var monthsLbl = months < 1.05 ? months.toFixed(2) + ' months' : Math.round(months*10)/10 + ' months';
    if(el('emp-alloc-prev-text')) el('emp-alloc-prev-text').innerHTML =
      f$(monthlySalary) + '/mo &times; ' + monthsLbl + ' = <strong style="color:var(--in)">' + f$(totalCost) + '</strong> &divide; ' + wd + ' days';
  }
}

// ─── Hook into existing openEmp to populate the new fields ───
// (We don't replace openEmp — we just monkeypatch saveEmployee for the new data,
// and reset the toggle when drawer opens)

(function(){
  // Patch openEmp / openEmployeeDrawer if exists, to fill new fields
  var origOpenEmp = typeof openEmp === 'function' ? openEmp : null;
  if(origOpenEmp){
    window.openEmp = function(){
      try { origOpenEmp.apply(this, arguments); } catch(e){}
      // Reset alloc fields
      setTimeout(function(){
        if(el('emp-alloc-toggle')) el('emp-alloc-toggle').checked = false;
        if(el('emp-alloc-fields')) el('emp-alloc-fields').style.display = 'none';
        if(el('emp-alloc-preview')) el('emp-alloc-preview').style.display = 'none';
        sv('emp-alloc-start','');
        sv('emp-alloc-end','');
        // If editing, populate from emp record
        if(typeof editEmpId !== 'undefined' && editEmpId !== null){
          var b = biz();
          if(b){
            var emp = (b.employees || []).find(function(x){return x.id === editEmpId;});
            if(emp && (emp.allocStart || emp.allocEnd)){
              if(el('emp-alloc-toggle')) el('emp-alloc-toggle').checked = true;
              if(el('emp-alloc-fields')) el('emp-alloc-fields').style.display = '';
              sv('emp-alloc-start', emp.allocStart || '');
              sv('emp-alloc-end', emp.allocEnd || '');
              updateSalaryAllocPreview();
            }
          }
        }
      }, 50);
    };
  }

  // Wrap saveEmployee to also save allocation fields
  var origSaveEmployee = typeof saveEmployee === 'function' ? saveEmployee : null;
  if(origSaveEmployee){
    window.saveEmployee = function(){
      // Get allocation fields BEFORE original save
      var allocToggle = el('emp-alloc-toggle');
      var allocOn = allocToggle && allocToggle.checked;
      var allocStart = allocOn ? gv('emp-alloc-start') : '';
      var allocEnd = allocOn ? gv('emp-alloc-end') : '';
      // Auto-calculate total cost from monthly salary × months
      var allocCost = 0;
      if (allocOn && allocStart && allocEnd) {
        // Validate dates — end must be after start
        if (allocEnd <= allocStart) {
          toast('⚠ End date must be after start date for allocation', 'er');
          return;  // Stop save and prompt user to fix dates
        }
        var monthlySal = parseFloat(gv('esal')) || 0;
        var sD = new Date(allocStart + 'T00:00:00');
        var eD = new Date(allocEnd + 'T00:00:00');
        var months = (eD.getFullYear() - sD.getFullYear()) * 12 + (eD.getMonth() - sD.getMonth());
        var lastMonthStart = new Date(eD.getFullYear(), eD.getMonth(), 1);
        var daysIntoLast = Math.floor((eD - lastMonthStart) / (1000*60*60*24)) + 1;
        var daysInLast = new Date(eD.getFullYear(), eD.getMonth()+1, 0).getDate();
        months += daysIntoLast / daysInLast;
        var firstMonthDay = sD.getDate();
        var daysInFirst = new Date(sD.getFullYear(), sD.getMonth()+1, 0).getDate();
        months -= (firstMonthDay - 1) / daysInFirst;
        if (months < 0.01) months = 0.01;
        allocCost = monthlySal * months;
      }
      // Track which emp ID will be edited or new
      var editingId = (typeof editEmpId !== 'undefined') ? editEmpId : null;
      // Call original
      try { origSaveEmployee.apply(this, arguments); } catch(e){ console.warn(e); }
      // After save, attach alloc fields to the just-saved employee
      var b = biz();
      if(!b || !b.employees) return;
      if(editingId !== null){
        var emp = b.employees.find(function(x){return x.id === editingId;});
        if(emp){
          emp.allocCost = allocOn ? allocCost : 0;
          emp.allocStart = allocStart;
          emp.allocEnd = allocEnd;
          dbSave();
          try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
        }
      } else {
        // For new emp, attach to the most recently added
        var last = b.employees[b.employees.length-1];
        if(last){
          last.allocCost = allocOn ? allocCost : 0;
          last.allocStart = allocStart;
          last.allocEnd = allocEnd;
          dbSave();
          try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
        }
      }
      // Force re-render everywhere
      try { renderDash(); } catch(e){}
      try { if(typeof renderProfitCard==='function') renderProfitCard(); } catch(e){}
      try { if(typeof renderCoverage==='function') renderCoverage(); } catch(e){}
      try { if(typeof updateAllocToggleUI==='function') updateAllocToggleUI(); } catch(e){}
      // Show success confirmation
      if(allocOn && allocCost > 0){
        var wd = countWorkingDays(allocStart, allocEnd);
        var daily = wd > 0 ? (allocCost/wd) : 0;
        toast('✅ Allocation active: ' + f$(daily) + '/day will appear in Expenses', 'gd');
      }
    };
  }
})();




// ─── handleProdImg (legacy product image handler) ───
// Generic file-to-base64 handler for product image upload
function handleProdImg(inputEl){
  // Reads the uploaded image, compresses it, stores it on both #pimg-cam and #pimg-gal
  // dataset.img (so getProdImgData() can find it), and shows the preview.
  try {
    if(!inputEl || !inputEl.files || !inputEl.files[0]) return;
    var file = inputEl.files[0];
    if(file.size > 10*1024*1024){
      if(typeof toast === 'function') toast('Image too large (max 10MB)','er');
      inputEl.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e){
      // Compress the image via canvas (max 1000px on long side, JPEG 80%)
      var img = new Image();
      img.onload = function(){
        try {
          var MAX = 1000;
          var w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
            else        { w = Math.round(w * MAX / h); h = MAX; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          // Store on BOTH cam + gal inputs (getProdImgData reads either)
          ['pimg-cam','pimg-gal'].forEach(function(id){
            var t = document.getElementById(id);
            if (t) t.dataset.img = dataUrl;
          });
          // Update preview thumb
          var thumb = document.getElementById('pimgthumb');
          var wrap = document.getElementById('pimg-prev-wrap');
          var uploadArea = document.getElementById('pimg-upload-area');
          if (thumb) thumb.src = dataUrl;
          if (wrap) wrap.style.display = '';
          if (uploadArea) uploadArea.style.display = 'none';
          if(typeof toast === 'function') toast('Image attached','gd');
        } catch(err){
          console.warn('handleProdImg compress error:', err);
          if(typeof toast === 'function') toast('Could not process image','er');
        }
      };
      img.onerror = function(){
        if(typeof toast === 'function') toast('Invalid image file','er');
      };
      img.src = e.target.result;
    };
    reader.onerror = function(){
      if(typeof toast === 'function') toast('Could not read file','er');
    };
    reader.readAsDataURL(file);
  } catch(err){
    console.warn('handleProdImg error:', err);
  }
}

// ─── Also ensure openProdEdit loads image into preview ───
(function(){
  // Hook into the function that opens the product drawer
  // We can\'t edit openProdEdit (not found by name), but we CAN watch for prod-d open
  // and populate the image from editProdId if it exists.
  // Instead: provide a helper that other code can call
  window.restoreProdImg = function(imgData){
    if (!imgData) return;
    ['pimg-cam','pimg-gal'].forEach(function(id){
      var t = document.getElementById(id);
      if (t) t.dataset.img = imgData;
    });
    var thumb = document.getElementById('pimgthumb');
    var wrap = document.getElementById('pimg-prev-wrap');
    var uploadArea = document.getElementById('pimg-upload-area');
    if (thumb) thumb.src = imgData;
    if (wrap) wrap.style.display = '';
    if (uploadArea) uploadArea.style.display = 'none';
  };
})();



// ═══════════════════════════════════════════════════════════════════
//  COVERAGE STATUS — sales vs expenses (including allocations)
// ═══════════════════════════════════════════════════════════════════

let covTab = 'day';  // 'day' | 'week' | 'month'

function switchCovTab(tab){
  covTab = tab;
  // Update tab buttons
  ['day','week','month'].forEach(function(t){
    var btn = document.getElementById('cov-tab-' + t);
    if(!btn) return;
    if(t === tab){
      btn.classList.add('on');
      btn.style.background = 'var(--g)';
      btn.style.color = '#000';
      btn.style.fontWeight = '700';
    } else {
      btn.classList.remove('on');
      btn.style.background = 'var(--s2)';
      btn.style.color = 'var(--t2)';
      btn.style.fontWeight = '600';
    }
  });
  renderCoverage();
}

function getCoverageData(period){
  // Returns {sales, actualExp, allocExp, totalExp, surplus, periodLabel}
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return null;

  var now = today();
  var startDateStr, endDateStr, label;

  if (period === 'day') {
    startDateStr = endDateStr = now;
    label = 'Today';
  } else if (period === 'week') {
    // Last 7 days including today
    var d = new Date(now + 'T00:00:00');
    var weekAgo = new Date(d);
    weekAgo.setDate(d.getDate() - 6);
    startDateStr = weekAgo.toISOString().split('T')[0];
    endDateStr = now;
    label = 'Last 7 Days';
  } else {
    // Current month (1st to today)
    var d2 = new Date(now + 'T00:00:00');
    var first = new Date(d2.getFullYear(), d2.getMonth(), 1);
    startDateStr = first.toISOString().split('T')[0];
    endDateStr = now;
    label = d2.toLocaleString('default',{month:'long'}) + ' ' + d2.getFullYear();
  }

  // Aggregate sales
  var sales = 0;
  (b.sales || []).forEach(function(s){
    if (!s || s.status === 'cancelled') return;
    if (s.date >= startDateStr && s.date <= endDateStr) {
      sales += (typeof sTotal === 'function') ? sTotal(s) : 0;
    }
  });

  // Aggregate actual expenses (cash)
  var actualExp = 0;
  (b.expenses || []).forEach(function(e){
    if (!e || e.status === 'cancelled') return;
    if (e.date >= startDateStr && e.date <= endDateStr) {
      actualExp += (e.amount || 0);
    }
  });

  // Aggregate allocations across the period — only if toggle ON
  var allocExp = 0;
  var allocEnabled2 = (b.allocationsEnabled !== false);
  if (allocEnabled2 && typeof getDayAllocations === 'function') {
    var cursor = new Date(startDateStr + 'T00:00:00');
    var endD = new Date(endDateStr + 'T00:00:00');
    while (cursor <= endD) {
      var iso = cursor.toISOString().split('T')[0];
      var a = getDayAllocations(iso);
      allocExp += (a && a.total) || 0;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  var totalExp = actualExp + allocExp;
  var surplus = sales - totalExp;

  return {
    sales: sales,
    actualExp: actualExp,
    allocExp: allocExp,
    totalExp: totalExp,
    surplus: surplus,
    periodLabel: label,
    startDate: startDateStr,
    endDate: endDateStr
  };
}

function renderCoverage(){
  var data = getCoverageData(covTab);
  if (!data) return;

  // Subtitle
  var subEl = document.getElementById('cov-sub');
  if (subEl) {
    var isWD = (typeof isWorkingDay === 'function') ? isWorkingDay(today()) : true;
    var sfx = (covTab === 'day' && !isWD) ? ' · rest day · no allocation' : ' · sales vs total expenses';
    subEl.textContent = data.periodLabel + sfx;
  }

  // Sales + expenses
  if (typeof f$ !== 'function') return;
  var fmt = f$;
  var sEl = document.getElementById('cov-sales');
  if (sEl) sEl.textContent = fmt(data.sales);
  var eEl = document.getElementById('cov-exp');
  if (eEl) eEl.textContent = fmt(data.totalExp);

  // Breakdown chip — respect allocation toggle
  var bdEl = document.getElementById('cov-breakdown');
  var b2 = (typeof biz === 'function') ? biz() : null;
  var allocOn2 = b2 && (b2.allocationsEnabled !== false);
  if (bdEl) {
    if (allocOn2 && data.allocExp > 0.01) {
      bdEl.style.display = '';
      bdEl.innerHTML = '💵 ' + fmt(data.actualExp) + ' actual + 📋 ' + fmt(data.allocExp) + ' allocated';
    } else {
      bdEl.style.display = 'none';
    }
  }

  // Result + badge + color
  var badgeEl = document.getElementById('cov-badge');
  var lblEl = document.getElementById('cov-result-lbl');
  var resEl = document.getElementById('cov-result');
  var msgEl = document.getElementById('cov-msg');

  var isCovered = data.surplus >= 0;
  var amt = Math.abs(data.surplus);

  if (isCovered) {
    if (badgeEl) {
      badgeEl.textContent = data.surplus > 0.01 ? 'COVERED ✓' : 'BREAK EVEN';
      badgeEl.style.background = 'var(--okb)';
      badgeEl.style.color = 'var(--ok)';
    }
    if (lblEl) {
      lblEl.textContent = 'SURPLUS';
      lblEl.style.color = 'var(--ok)';
    }
    if (resEl) {
      resEl.textContent = '+' + fmt(amt);
      resEl.style.color = 'var(--ok)';
    }
    if (msgEl) {
      if (data.surplus > 0.01) {
        msgEl.textContent = 'Sales covered all expenses';
        msgEl.style.color = 'var(--ok)';
      } else {
        msgEl.textContent = 'Sales matched expenses exactly';
        msgEl.style.color = 'var(--t2)';
      }
    }
  } else {
    if (badgeEl) {
      badgeEl.textContent = 'DEFICIT';
      badgeEl.style.background = 'rgba(239,68,68,.15)';
      badgeEl.style.color = 'var(--er)';
    }
    if (lblEl) {
      lblEl.textContent = 'DEFICIT';
      lblEl.style.color = 'var(--er)';
    }
    if (resEl) {
      resEl.textContent = '-' + fmt(amt);
      resEl.style.color = 'var(--er)';
    }
    if (msgEl) {
      msgEl.textContent = 'Short by ' + fmt(amt);
      msgEl.style.color = 'var(--er)';
    }
  }

  // Hide entire card if user lacks permission to see net profit
  // (because that means they shouldn't see business-wide financial data)
  try {
    var cardEl = document.getElementById('cov-card');
    if (cardEl) {
      var canSee = (typeof isAdmin === 'function' && isAdmin()) ||
                   (typeof hasPerm === 'function' && hasPerm('see_net_profit'));
      cardEl.style.display = canSee ? '' : 'none';
    }
  } catch(e){}
}

// Hook renderCoverage into renderDash
(function(){
  if (typeof renderDash === 'function') {
    var origRD = renderDash;
    window.renderDash = function(){
      try { origRD.apply(this, arguments); } catch(e) { console.warn(e); }
      try { renderCoverage(); } catch(e) { console.warn('renderCoverage:', e); }
    };
  }
})();




// ═══════════════════════════════════════════════════════════════════
//  PASSWORD RESET DRAWER (replaces ugly browser prompt)
// ═══════════════════════════════════════════════════════════════════

let _pwResetUserId = null;

function openAdminPwReset(userId){
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if(!u){ toast('User not found','er'); return; }
  _pwResetUserId = userId;
  // Populate user card
  if(el('pwreset-name')) el('pwreset-name').textContent = u.name || '--';
  if(el('pwreset-username')) el('pwreset-username').textContent = '@' + (u.username || u.name || '');
  if(el('pwreset-av')) el('pwreset-av').textContent = (typeof mkInit === 'function') ? mkInit(u.name) : (u.name||'?').slice(0,2).toUpperCase();
  if(el('pwreset-sub')) el('pwreset-sub').textContent = 'Set a new password for ' + u.name;
  // Reset fields
  if(el('pwreset-input')) el('pwreset-input').value = '';
  if(el('pwreset-input')) el('pwreset-input').type = 'password';
  if(el('pwreset-toggle')) el('pwreset-toggle').textContent = '👁';
  if(el('pwreset-strength')) el('pwreset-strength').style.display = 'none';
  openD('d-pwreset');
  setTimeout(function(){
    var inp = el('pwreset-input');
    if(inp) inp.focus();
  }, 220);
}

function togglePwResetVisibility(){
  var inp = el('pwreset-input');
  var btn = el('pwreset-toggle');
  if(!inp || !btn) return;
  if(inp.type === 'password'){
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

function checkPwStrength(){
  var inp = el('pwreset-input');
  if(!inp) return;
  var pw = inp.value || '';
  var box = el('pwreset-strength');
  if(!pw) {
    if(box) box.style.display = 'none';
    return;
  }
  if(box) box.style.display = '';
  // Score: 0-4 (length, mixed case, digit, special)
  var score = 0;
  if(pw.length >= 4) score++;
  if(pw.length >= 8) score++;
  if(/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if(/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  var colors = ['var(--er)','var(--wa)','var(--in)','var(--ok)'];
  var labels = ['Weak','Fair','Good','Strong'];
  for(var i=1; i<=4; i++){
    var seg = el('pwstr-' + i);
    if(seg) seg.style.background = (i <= score) ? colors[Math.min(score-1, 3)] : 'var(--s3)';
  }
  var lbl = el('pwstr-label');
  if(lbl){
    if(score === 0) { lbl.textContent = '--'; lbl.style.color = 'var(--t3)'; }
    else {
      lbl.textContent = labels[score-1] + ' password';
      lbl.style.color = colors[Math.min(score-1, 3)];
    }
  }
}

function generatePwReset(){
  // Generate a memorable strong password: AdjNounDigits (e.g., BlueOcean42)
  var adjectives = ['Quick','Bright','Bold','Calm','Strong','Smart','Swift','Lucky','Cool','Sharp'];
  var nouns = ['Tiger','Falcon','Mango','River','Mountain','Ocean','Forest','Eagle','Star','Lion'];
  var adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  var noun = nouns[Math.floor(Math.random() * nouns.length)];
  var num = Math.floor(10 + Math.random() * 90);
  var generated = adj + noun + num;
  var inp = el('pwreset-input');
  if(inp){
    inp.value = generated;
    inp.type = 'text';
    var btn = el('pwreset-toggle');
    if(btn) btn.textContent = '🙈';
    checkPwStrength();
    toast('Generated: ' + generated, 'gd');
  }
}

function confirmPwReset(){
  var pw = gv('pwreset-input');
  if(!pw || pw.length < 4){ toast('Password must be at least 4 characters','er'); return; }
  if(!_pwResetUserId){ toast('No user selected','er'); return; }
  var btn = el('pwreset-confirm-btn');
  if(btn) btn.disabled = true;
  try {
    adminResetUserPassword(_pwResetUserId, pw);
    closeD('d-pwreset');
    _pwResetUserId = null;
  } catch(e){
    console.warn('PW reset error:', e);
    toast('Reset failed','er');
  }
  if(btn) btn.disabled = false;
}

// ─── Track last login for inline stats ───
(function(){
  var origLoginAs = typeof loginAs === 'function' ? loginAs : null;
  if(origLoginAs){
    window.loginAs = function(user){
      try {
        if(user && DB.users){
          var u = DB.users.find(function(x){ return x.id === user.id; });
          if(u){
            u.lastLoginAt = Date.now();
          }
        }
      } catch(e){}
      return origLoginAs.apply(this, arguments);
    };
  }
})();



// ═══════════════════════════════════════════════════════════════════
//  ALLOCATION TOGGLE (dashboard Expense card + Business Settings)
// ═══════════════════════════════════════════════════════════════════

function toggleAllocations(){
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) { toast('No business','er'); return; }
  if (typeof isAdmin === 'function' && !isAdmin()) {
    toast('Admin only','er');
    return;
  }
  b.allocationsEnabled = (b.allocationsEnabled === false);  // flip
  dbSave();
  try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
  updateAllocToggleUI();
  // Re-render dashboard so Expense card updates
  try { renderDash(); } catch(e){}
  try { renderCoverage(); } catch(e){}
  toast(b.allocationsEnabled ? '⚖️ Allocations ON' : '⚖️ Allocations OFF', 'gd');
}

function updateAllocToggleUI(){
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return;
  var enabled = (b.allocationsEnabled !== false);
  var sw = document.getElementById('alloc-toggle-switch');
  var knob = document.getElementById('alloc-toggle-knob');
  var lbl = document.getElementById('alloc-toggle-lbl');
  if (sw) sw.style.background = enabled ? 'var(--ok)' : 'var(--t4)';
  if (knob) knob.style.left = enabled ? '13px' : '1px';
  if (lbl) {
    lbl.style.color = enabled ? 'var(--ok)' : 'var(--t3)';
    lbl.textContent = enabled ? 'ALLOC' : 'OFF';
  }
  // Hide toggle for non-admins (they shouldn't touch it)
  var wrap = document.getElementById('alloc-toggle-wrap');
  if (wrap) {
    var canToggle = (typeof isAdmin === 'function' && isAdmin());
    wrap.style.display = canToggle ? '' : 'none';
  }
}

// Hook into renderDash to keep toggle UI in sync
(function(){
  if (typeof renderDash === 'function') {
    var prev = renderDash;
    window.renderDash = function(){
      try { prev.apply(this, arguments); } catch(e){}
      try { updateAllocToggleUI(); } catch(e){}
    };
  }
})();




// ═══════════════════════════════════════════════════════════════════
//  PROFILE PHOTOS — upload, store on user, display everywhere
// ═══════════════════════════════════════════════════════════════════

function handleProfilePhoto(inputEl){
  if(!inputEl || !inputEl.files || !inputEl.files[0]) return;
  var file = inputEl.files[0];
  if(file.size > 10*1024*1024){ toast('Photo too large (max 10MB)','er'); inputEl.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function(){
      try {
        var MAX = 400;  // Profile photos compressed to 400px
        var w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h*MAX/w); w = MAX; }
          else        { w = Math.round(w*MAX/h); h = MAX; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        // Show in drawer preview
        var disp = document.getElementById('pe-photo-display');
        if (disp) {
          disp.style.backgroundImage = 'url("' + dataUrl + '")';
          var ini = document.getElementById('pe-photo-initials');
          if (ini) ini.style.display = 'none';
        }
        var removeBtn = document.getElementById('pe-photo-remove-btn');
        if (removeBtn) removeBtn.style.display = '';
        // Stash on a global so saveProfileEdit picks it up
        window._pendingProfilePhoto = dataUrl;
        toast('Photo ready — tap Save to apply','gd');
      } catch(err){
        console.warn('Profile photo error:', err);
        toast('Could not process photo','er');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto(){
  window._pendingProfilePhoto = '_REMOVE_';
  var disp = document.getElementById('pe-photo-display');
  if (disp) {
    disp.style.backgroundImage = '';
    var ini = document.getElementById('pe-photo-initials');
    if (ini) ini.style.display = '';
  }
  var removeBtn = document.getElementById('pe-photo-remove-btn');
  if (removeBtn) removeBtn.style.display = 'none';
  toast('Photo will be removed on save','gd');
}

// Hook openProfileEdit to load existing photo
(function(){
  var origOpen = typeof openProfileEdit === 'function' ? openProfileEdit : null;
  if(origOpen){
    window.openProfileEdit = function(){
      try { origOpen.apply(this, arguments); } catch(e){}
      // Clear stash
      window._pendingProfilePhoto = null;
      // Populate photo preview
      var disp = document.getElementById('pe-photo-display');
      var ini = document.getElementById('pe-photo-initials');
      var removeBtn = document.getElementById('pe-photo-remove-btn');
      if (disp && CU) {
        if (ini) ini.textContent = (typeof mkInit === 'function') ? mkInit(CU.name) : (CU.name||'?').slice(0,2).toUpperCase();
        if (CU.profilePhoto) {
          disp.style.backgroundImage = 'url("' + CU.profilePhoto + '")';
          if (ini) ini.style.display = 'none';
          if (removeBtn) removeBtn.style.display = '';
        } else {
          disp.style.backgroundImage = '';
          if (ini) ini.style.display = '';
          if (removeBtn) removeBtn.style.display = 'none';
        }
      }
    };
  }
})();

// Hook saveProfileEdit to persist photo
(function(){
  var origSave = typeof saveProfileEdit === 'function' ? saveProfileEdit : null;
  if(origSave){
    window.saveProfileEdit = function(){
      // Apply photo first (so user record has latest)
      if (window._pendingProfilePhoto && CU) {
        if (window._pendingProfilePhoto === '_REMOVE_') {
          delete CU.profilePhoto;
          var u = (DB.users||[]).find(function(x){return x.id===CU.id;});
          if (u) delete u.profilePhoto;
        } else {
          CU.profilePhoto = window._pendingProfilePhoto;
          var u2 = (DB.users||[]).find(function(x){return x.id===CU.id;});
          if (u2) u2.profilePhoto = window._pendingProfilePhoto;
        }
        window._pendingProfilePhoto = null;
      }
      try { origSave.apply(this, arguments); } catch(e){}
      // Refresh sidebar avatar + topbar immediately with new photo
      try { if(typeof refreshSidebar === 'function') refreshSidebar(); } catch(e){}
      try { if(typeof updateTopbar === 'function') updateTopbar(); } catch(e){}
      // Also sync photo to Firebase so it shows in other users' chat
      try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
    };
  }
})();

// Helper: get the profile photo data URL for a user
function getUserPhoto(userId){
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  return u ? (u.profilePhoto || '') : '';
}

// Apply photo to an avatar element (or fall back to initials)
function applyAvatarPhoto(elId, userId){
  var avEl = document.getElementById(elId);
  if (!avEl) return;
  var photo = getUserPhoto(userId);
  if (photo) {
    avEl.style.backgroundImage = 'url("' + photo + '")';
    avEl.style.backgroundSize = 'cover';
    avEl.style.backgroundPosition = 'center';
    avEl.textContent = '';
  }
}


// ═══════════════════════════════════════════════════════════════════
//  CHAT COMPOSER — toggle mic vs send based on input
// ═══════════════════════════════════════════════════════════════════

function onChatInputChange(mode){
  var inp = document.getElementById(mode === 'group' ? 'chat-group-input' : 'chat-dm-input');
  if (!inp) return;
  var hasText = (inp.value || '').trim().length > 0;
  var mic  = document.getElementById('chat-mic-' + mode);
  var send = document.getElementById('chat-send-' + mode);
  if (mic)  mic.style.display  = hasText ? 'none' : '';
  if (send) send.style.display = hasText ? '' : 'none';
}


// ═══════════════════════════════════════════════════════════════════
//  VOICE RECORDER (hold to record, release to send, max 3 min)
// ═══════════════════════════════════════════════════════════════════

let _voiceRec = {
  recorder: null,
  chunks: [],
  startTime: 0,
  mode: null,
  timer: null,
  stream: null,
  cancelled: false,
  MAX_SECONDS: 180  // 3 minutes
};

async function startVoiceRecord(ev, mode){
  if (ev) { try { ev.preventDefault(); } catch(e){} }
  if (_voiceRec.recorder) return;  // already recording
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Voice not supported on this device','er');
    return;
  }
  try {
    _voiceRec.stream = await navigator.mediaDevices.getUserMedia({audio: true});
    _voiceRec.chunks = [];
    _voiceRec.cancelled = false;
    _voiceRec.mode = mode;
    _voiceRec.startTime = Date.now();

    // Use compatible mime type
    var mimeType = '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
    else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
    else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

    _voiceRec.recorder = mimeType ? new MediaRecorder(_voiceRec.stream, {mimeType:mimeType, audioBitsPerSecond: 32000})
                                  : new MediaRecorder(_voiceRec.stream);
    _voiceRec.recorder.ondataavailable = function(e){
      if (e.data && e.data.size > 0) _voiceRec.chunks.push(e.data);
    };
    _voiceRec.recorder.onstop = function(){
      if (_voiceRec.cancelled) {
        cleanupVoiceRec();
        return;
      }
      var blob = new Blob(_voiceRec.chunks, {type: _voiceRec.recorder.mimeType || 'audio/webm'});
      var duration = Math.round((Date.now() - _voiceRec.startTime) / 1000);
      // Convert blob to base64 data URL
      var reader = new FileReader();
      reader.onload = function(e){
        sendVoiceMessage(_voiceRec.mode, e.target.result, duration);
        cleanupVoiceRec();
      };
      reader.readAsDataURL(blob);
    };
    _voiceRec.recorder.start();

    // Show overlay + indicate
    var ov = document.getElementById('voice-overlay');
    if (ov) ov.classList.add('on');
    var mic = document.getElementById('chat-mic-' + mode);
    if (mic) mic.classList.add('recording');

    // Timer
    _voiceRec.timer = setInterval(function(){
      var elapsed = Math.floor((Date.now() - _voiceRec.startTime) / 1000);
      var min = Math.floor(elapsed / 60);
      var sec = elapsed % 60;
      var t = document.getElementById('voice-overlay-time');
      if (t) t.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
      // Auto-stop at MAX
      if (elapsed >= _voiceRec.MAX_SECONDS) {
        var hint = document.getElementById('voice-overlay-hint');
        if (hint) hint.textContent = 'Max length reached — sending...';
        endVoiceRecord(null, _voiceRec.mode);
      }
    }, 200);
  } catch(err){
    console.warn('Voice record error:', err);
    if (err.name === 'NotAllowedError') {
      toast('Microphone access denied','er');
    } else {
      toast('Could not start recording','er');
    }
    cleanupVoiceRec();
  }
}

function endVoiceRecord(ev, mode){
  if (ev) { try { ev.preventDefault(); } catch(e){} }
  if (!_voiceRec.recorder || _voiceRec.cancelled) return;
  var elapsed = Math.floor((Date.now() - _voiceRec.startTime) / 1000);
  if (elapsed < 1) {
    // Too short — cancel
    cancelVoiceRecord(mode);
    toast('Hold longer to record','er');
    return;
  }
  try { _voiceRec.recorder.stop(); } catch(e){ console.warn(e); }
}

function cancelVoiceRecord(mode){
  if (!_voiceRec.recorder) return;
  _voiceRec.cancelled = true;
  try { _voiceRec.recorder.stop(); } catch(e){}
  cleanupVoiceRec();
  toast('Recording cancelled','er');
}

function cleanupVoiceRec(){
  if (_voiceRec.timer) clearInterval(_voiceRec.timer);
  if (_voiceRec.stream) {
    _voiceRec.stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} });
  }
  var ov = document.getElementById('voice-overlay');
  if (ov) ov.classList.remove('on');
  ['group','dm'].forEach(function(m){
    var mic = document.getElementById('chat-mic-' + m);
    if (mic) mic.classList.remove('recording');
  });
  _voiceRec = { recorder:null, chunks:[], startTime:0, mode:null, timer:null, stream:null, cancelled:false, MAX_SECONDS:180 };
}

function sendVoiceMessage(mode, dataUrl, durationSec){
  if (!CU || !CBI) { toast('Not signed in','er'); return; }
  if (!dataUrl) { toast('Empty recording','er'); return; }
  var convId = (mode === 'group') ? 'group' : chatConvId(CU.id, chatState.activePeer.id);

  if (!DB.chatMessages) DB.chatMessages = [];
  if (!DB.nextChatId) DB.nextChatId = 1;

  DB.chatMessages.push({
    id: DB.nextChatId++,
    bizId: CBI,
    conv: convId,
    from: CU.id,
    fromName: CU.name,
    text: '',
    photo: null,
    voice: dataUrl,
    voiceDur: durationSec,
    ts: Date.now(),
    readBy: [CU.id]
  });
  dbSave();
  try { if (typeof fbPush === 'function') fbPush(); } catch(e){}
  if (mode === 'group' && typeof renderGroupChat === 'function') renderGroupChat();
  else if (typeof renderDmConversation === 'function') renderDmConversation();
  toast('Voice sent','gd');
}


// ═══════════════════════════════════════════════════════════════════
//  CHAT BUBBLE — extended to render voice + use profile photo
// ═══════════════════════════════════════════════════════════════════

(function(){
  var origBuild = typeof buildChatBubble === 'function' ? buildChatBubble : null;
  // We override entirely to support voice + author avatar
  window.buildChatBubble = function(m, hideAuthor){
    var isMe = m.from === CU.id;
    var fromUser = (DB.users || []).find(function(u){ return u.id === m.from; });
    var fromName = fromUser ? (fromUser.name || fromUser.username) : (m.fromName || 'Unknown');
    var photoUrl = fromUser ? (fromUser.profilePhoto || '') : '';

    var photoHtml = m.photo ? '<img src="' + m.photo + '" alt="photo" onclick="viewChatPhoto(\'' + m.id + '\')">' : '';
    var textHtml  = m.text  ? esc(m.text) : '';
    var voiceHtml = '';
    if (m.voice) {
      var dur = m.voiceDur || 0;
      var min = Math.floor(dur / 60);
      var sec = dur % 60;
      var durLbl = min + ':' + (sec < 10 ? '0' : '') + sec;
      var bars = '';
      for (var i=0; i<18; i++){
        var hVal = 30 + (Math.sin(i*1.7) + Math.cos(i*0.5)) * 35;
        if (hVal < 20) hVal = 20;
        if (hVal > 100) hVal = 100;
        bars += '<div class="chat-voice-bar" style="height:' + Math.round(hVal*0.24) + 'px"></div>';
      }
      voiceHtml = '<div class="chat-voice">' +
        '<button type="button" class="chat-voice-play" onclick="playVoiceMsg(' + m.id + ', this)">▶</button>' +
        '<div class="chat-voice-bars">' + bars + '</div>' +
        '<div class="chat-voice-dur">' + durLbl + '</div>' +
        '<audio id="voice-audio-' + m.id + '" src="' + m.voice + '" preload="none" style="display:none"></audio>' +
      '</div>';
    }

    // Optional author avatar mini
    var avHtml = '';
    if (!isMe && !hideAuthor) {
      var bgStyle = photoUrl
        ? 'background-image:url(\'' + photoUrl + '\');background-size:cover;background-position:center'
        : 'background:linear-gradient(135deg,#64748b,#334155);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:800';
      avHtml = '<div style="' + bgStyle + ';width:16px;height:16px;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"></div>';
    }

    return '<div class="chat-msg ' + (isMe ? 'chat-msg-me' : 'chat-msg-them') + '">' +
      (isMe || hideAuthor ? '' : '<div class="chat-msg-author">' + avHtml + esc(fromName) + '</div>') +
      textHtml +
      photoHtml +
      voiceHtml +
      '<div class="chat-msg-meta">' + formatChatTime(m.ts) + '</div>' +
    '</div>';
  };
})();

// ─── Play voice message ───
function playVoiceMsg(msgId, btnEl){
  var audio = document.getElementById('voice-audio-' + msgId);
  if (!audio) return;
  // Stop all other audios
  document.querySelectorAll('audio[id^="voice-audio-"]').forEach(function(a){
    if (a !== audio) { try { a.pause(); a.currentTime = 0; } catch(e){} }
    // Reset their buttons
    var aid = a.id.replace('voice-audio-','');
    var bd = a.parentElement ? a.parentElement.querySelector('.chat-voice-play') : null;
    if (bd && a !== audio) bd.textContent = '▶';
  });
  if (audio.paused) {
    audio.play().then(function(){
      if (btnEl) btnEl.textContent = '⏸';
    }).catch(function(err){ console.warn(err); toast('Cannot play','er'); });
    audio.onended = function(){ if (btnEl) btnEl.textContent = '▶'; };
  } else {
    audio.pause();
    if (btnEl) btnEl.textContent = '▶';
  }
}

// ─── View chat photo full screen ───
function viewChatPhoto(msgId){
  var msg = (DB.chatMessages || []).find(function(m){ return String(m.id) === String(msgId); });
  if (!msg || !msg.photo) return;
  var w = window.open('','_blank');
  if (!w) { toast('Allow popups to view','er'); return; }
  w.document.write('<html><head><title>Photo</title></head><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="' + msg.photo + '" style="max-width:100%;max-height:100vh"></body></html>');
}




// ═══════════════════════════════════════════════════════════════════
//  REUSABLE BEAUTIFUL DELETE CONFIRMATION
//  Usage: confirmDelete({title, message, onYes})
// ═══════════════════════════════════════════════════════════════════

var _confirmDelCallback = null;

function confirmDelete(opts){
  if (!opts) return;
  _confirmDelCallback = opts.onYes || null;
  var t = document.getElementById('conf-title');
  var m = document.getElementById('conf-msg');
  if (t) t.textContent = opts.title || '⚠ Confirm Delete';
  if (m) m.innerHTML = opts.message || 'Are you sure you want to delete this?';
  openD('d-confirm-del');
}

function runConfirmDelete(){
  closeD('d-confirm-del');
  var cb = _confirmDelCallback;
  _confirmDelCallback = null;
  if (typeof cb === 'function') {
    try { cb(); } catch(e){ console.warn('confirmDelete callback error:', e); }
  }
}



// ─── Helper: get the active financial filter date range as {start, end} ───
function getFinFilterDateRange(){
  if (typeof finFilter === 'undefined' || !finFilter) return null;
  var today_ = (typeof today === 'function') ? today() : new Date().toISOString().split('T')[0];
  var ft = finFilter.dateMode || 'all';
  var start = '', end = today_;
  if (ft === 'today') {
    start = end = today_;
  } else if (ft === 'yesterday') {
    var y = new Date(today_ + 'T00:00:00');
    y.setDate(y.getDate() - 1);
    start = end = y.toISOString().split('T')[0];
  } else if (ft === 'thismonth') {
    var d1 = new Date(today_ + 'T00:00:00');
    start = new Date(d1.getFullYear(), d1.getMonth(), 1).toISOString().split('T')[0];
    end = today_;
  } else if (ft === 'lastmonth') {
    var d2 = new Date(today_ + 'T00:00:00');
    var lmFirst = new Date(d2.getFullYear(), d2.getMonth()-1, 1);
    var lmLast = new Date(d2.getFullYear(), d2.getMonth(), 0);
    start = lmFirst.toISOString().split('T')[0];
    end = lmLast.toISOString().split('T')[0];
  } else if (ft === 'single' && finFilter.singleDate) {
    start = end = finFilter.singleDate;
  } else if (ft === 'range' && finFilter.rangeStart && finFilter.rangeEnd) {
    start = finFilter.rangeStart;
    end = finFilter.rangeEnd;
  } else {
    // 'all' — find earliest/latest date from sales+expenses
    var b = biz();
    if (!b) return null;
    var allDates = [];
    (b.sales || []).forEach(function(s){ if(s.date) allDates.push(s.date); });
    (b.expenses || []).forEach(function(e){ if(e.date) allDates.push(e.date); });
    if (!allDates.length) return {start: today_, end: today_};
    allDates.sort();
    start = allDates[0];
    end = today_;
  }
  return {start: start, end: end};
}




// ═══════════════════════════════════════════════════════════════════
//  PROFIT BREAKDOWN — Gross + Net profit with Today/7Days/Month tabs
// ═══════════════════════════════════════════════════════════════════

let profitTab = 'day';

function switchProfitTab(tab){
  profitTab = tab;
  ['day','week','month'].forEach(function(t){
    var btn = document.getElementById('profit-tab-' + t);
    if(!btn) return;
    if(t === tab){
      btn.classList.add('on');
      btn.style.background = 'var(--g)';
      btn.style.color = '#000';
      btn.style.fontWeight = '700';
    } else {
      btn.classList.remove('on');
      btn.style.background = 'var(--s2)';
      btn.style.color = 'var(--t2)';
      btn.style.fontWeight = '600';
    }
  });
  renderProfitCard();
}

function getProfitData(period){
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return null;
  var now = today();
  var startDateStr, endDateStr, label;

  if (period === 'day') {
    startDateStr = endDateStr = now;
    label = 'Today';
  } else if (period === 'week') {
    var d = new Date(now + 'T00:00:00');
    var weekAgo = new Date(d);
    weekAgo.setDate(d.getDate() - 6);
    startDateStr = weekAgo.toISOString().split('T')[0];
    endDateStr = now;
    label = 'Last 7 Days';
  } else {
    var d2 = new Date(now + 'T00:00:00');
    startDateStr = new Date(d2.getFullYear(), d2.getMonth(), 1).toISOString().split('T')[0];
    endDateStr = now;
    label = d2.toLocaleString('default',{month:'long'}) + ' ' + d2.getFullYear();
  }

  // Revenue, product cost, gross profit
  var revenue = 0, productCost = 0, grossProfit = 0;
  (b.sales || []).forEach(function(s){
    if (!s || s.status === 'cancelled') return;
    if (s.date < startDateStr || s.date > endDateStr) return;
    var p = calcProfitForSale(s);
    revenue     += p.revenue;
    productCost += p.cost;
    grossProfit += p.profit;  // already discount-adjusted
  });

  // Cash expenses
  var actualExp = 0;
  (b.expenses || []).forEach(function(e){
    if (!e || e.status === 'cancelled') return;
    if (e.date < startDateStr || e.date > endDateStr) return;
    actualExp += (e.amount || 0);
  });

  // Allocations (respect toggle)
  var allocEnabled = (b.allocationsEnabled !== false);
  var allocExp = 0;
  if (allocEnabled) {
    var cur = new Date(startDateStr + 'T00:00:00');
    var endD = new Date(endDateStr + 'T00:00:00');
    while (cur <= endD) {
      var iso = cur.toISOString().split('T')[0];
      if (typeof getDayAllocations === 'function') {
        var a = getDayAllocations(iso);
        allocExp += (a && a.total) || 0;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  var totalExp = actualExp + allocExp;
  var netProfit = grossProfit - totalExp;
  var grossMargin = revenue > 0 ? (grossProfit / revenue * 100) : 0;
  var netMargin   = revenue > 0 ? (netProfit / revenue * 100) : 0;

  return {
    revenue: revenue,
    productCost: productCost,
    grossProfit: grossProfit,
    grossMargin: grossMargin,
    actualExp: actualExp,
    allocExp: allocExp,
    totalExp: totalExp,
    netProfit: netProfit,
    netMargin: netMargin,
    periodLabel: label
  };
}

function renderProfitCard(){
  var data = getProfitData(profitTab);
  if (!data) return;
  if (typeof f$ !== 'function') return;
  var fmt = f$;

  // Subtitle
  var subEl = document.getElementById('profit-sub');
  if (subEl) subEl.textContent = data.periodLabel + ' · gross profit vs net profit';

  // Gross side
  var gEl = document.getElementById('profit-gross');
  var gmEl = document.getElementById('profit-gross-margin');
  if (gEl)  {
    gEl.textContent = (data.grossProfit >= 0 ? '' : '-') + fmt(Math.abs(data.grossProfit));
    gEl.style.color = data.grossProfit >= 0 ? 'var(--in)' : 'var(--er)';
  }
  if (gmEl) gmEl.textContent = data.grossMargin.toFixed(1) + '% margin';

  // Net side
  var nEl = document.getElementById('profit-net');
  var nmEl = document.getElementById('profit-net-margin');
  if (nEl)  {
    nEl.textContent = (data.netProfit >= 0 ? '' : '-') + fmt(Math.abs(data.netProfit));
    nEl.style.color = data.netProfit >= 0 ? 'var(--ok)' : 'var(--er)';
  }
  if (nmEl) nmEl.textContent = data.netMargin.toFixed(1) + '% margin';

  // Badge
  var badgeEl = document.getElementById('profit-badge');
  if (badgeEl) {
    if (data.netProfit >= 0) {
      badgeEl.textContent = data.netProfit > 0.01 ? 'PROFITABLE' : 'BREAK EVEN';
      badgeEl.style.background = 'var(--okb)';
      badgeEl.style.color = 'var(--ok)';
    } else {
      badgeEl.textContent = 'LOSS';
      badgeEl.style.background = 'rgba(239,68,68,.15)';
      badgeEl.style.color = 'var(--er)';
    }
  }

  // Breakdown chip
  var bdEl = document.getElementById('profit-breakdown');
  if (bdEl) {
    var chips = ['Revenue ' + fmt(data.revenue)];
    if (data.productCost > 0.01) chips.push('Cost ' + fmt(data.productCost));
    if (data.totalExp > 0.01) chips.push('Expenses ' + fmt(data.totalExp));
    bdEl.innerHTML = chips.join(' · ');
  }

  // Hide if user lacks see_net_profit permission
  try {
    var cardEl = document.getElementById('profit-card');
    if (cardEl) {
      var canSee = (typeof isAdmin === 'function' && isAdmin()) ||
                   (typeof hasPerm === 'function' && hasPerm('see_net_profit'));
      cardEl.style.display = canSee ? '' : 'none';
    }
  } catch(e){}
}

// Hook renderProfitCard into renderDash
(function(){
  if (typeof renderDash === 'function') {
    var prev = renderDash;
    window.renderDash = function(){
      try { prev.apply(this, arguments); } catch(e){}
      try { renderProfitCard(); } catch(e){ console.warn('renderProfitCard:', e); }
    };
  }
})();




// ═══════════════════════════════════════════════════════════════════
//  PASSWORD HASHING  — SHA-256 via Web Crypto API
//  All passwords stored as "sha256:hexstring"
//  Plain-text passwords are auto-upgraded on first login
// ═══════════════════════════════════════════════════════════════════

const PW_PREFIX = 'sha256:';

async function hashPassword(plain) {
  // Try Web Crypto API first (requires HTTPS)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(plain));
      const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2,'0')).join('');
      return PW_PREFIX + hex;
    } catch(e) {
      console.warn('[Security] Web Crypto failed, using fallback:', e.message);
    }
  }
  // Fallback: pure-JS SHA-256 (works on HTTP/local files)
  return PW_PREFIX + _sha256(plain);
}

// Pure-JS SHA-256 (no dependencies, works everywhere)
function _sha256(str) {
  function rr(n,d){return n>>>d|n<<(32-d);}
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var msg=[];
  for(var i=0;i<str.length;i++){
    var c=str.charCodeAt(i);
    if(c<128)msg.push(c);
    else if(c<2048)msg.push(192|(c>>6),128|(c&63));
    else msg.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
  }
  var ml=msg.length*8;msg.push(0x80);
  while((msg.length%64)!==56)msg.push(0);
  msg.push(0,0,0,0,(ml>>>24)&0xff,(ml>>>16)&0xff,(ml>>>8)&0xff,ml&0xff);
  for(var i2=0;i2<msg.length;i2+=64){
    var w=[];
    for(var j=0;j<16;j++)w[j]=(msg[i2+j*4]<<24)|(msg[i2+j*4+1]<<16)|(msg[i2+j*4+2]<<8)|msg[i2+j*4+3];
    for(var j2=16;j2<64;j2++){var s0=rr(w[j2-15],7)^rr(w[j2-15],18)^(w[j2-15]>>>3);var s1=rr(w[j2-2],17)^rr(w[j2-2],19)^(w[j2-2]>>>10);w[j2]=(w[j2-16]+s0+w[j2-7]+s1)>>>0;}
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],hh=H[7];
    for(var j3=0;j3<64;j3++){var S1=rr(e,6)^rr(e,11)^rr(e,25);var ch=(e&f)^(~e&g);var t1=(hh+S1+ch+K[j3]+w[j3])>>>0;var S0=rr(a,2)^rr(a,13)^rr(a,22);var maj=(a&b)^(a&c)^(b&c);var t2=(S0+maj)>>>0;hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+hh)>>>0;
  }
  return H.map(function(n){return('00000000'+n.toString(16)).slice(-8);}).join('');
}

function isHashed(pw) {
  return typeof pw === 'string' && pw.startsWith(PW_PREFIX);
}

async function verifyPassword(plain, stored) {
  if (!stored) return false;
  try {
    if (!isHashed(stored)) return plain === stored;
    return await hashPassword(plain) === stored;
  } catch(e) {
    console.warn('[verifyPassword] Error:', e.message);
    return plain === stored;
  }
}

// Migrate a user's password from plain-text to hashed (called on successful login)
async function upgradePasswordIfNeeded(user, plainPw) {
  if (!isHashed(user.password)) {
    user.password = await hashPassword(plainPw);
    const u = (DB.users || []).find(function(x){ return x.id === user.id; });
    if (u) u.password = user.password;
    dbSave();
    try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
    console.log('[Security] Password upgraded to SHA-256 hash for:', user.username);
  }
}


// ═══════════════════════════════════════════════════════════════════
//  LOGIN RATE LIMITER — 5 attempts → 15 min lockout
//  Stored in localStorage (separate from DB so it survives DB resets)
// ═══════════════════════════════════════════════════════════════════

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000;  // 15 minutes
const LOCKOUT_KEY   = 'ss_login_attempts';

function getLockoutData() {
  try {
    var raw = localStorage.getItem(LOCKOUT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveLockoutData(data) {
  try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data)); } catch(e){}
}

function isAccountLocked(username) {
  var data = getLockoutData();
  var rec  = data[username.toLowerCase()];
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return rec.lockedUntil;  // returns timestamp
  }
  return false;
}

function recordFailedAttempt(username) {
  var data = getLockoutData();
  var key  = username.toLowerCase();
  if (!data[key]) data[key] = { attempts: 0, lockedUntil: 0, firstAttempt: Date.now() };
  data[key].attempts++;
  data[key].lastAttempt = Date.now();

  if (data[key].attempts >= MAX_ATTEMPTS) {
    data[key].lockedUntil = Date.now() + LOCKOUT_MS;
    data[key].attempts    = 0;
    // Alert admin if they exist
    try {
      var admin = (DB.users || []).find(function(u){
        return u.role === 'primaryAdmin';
      });
      if (admin && typeof addNotif === 'function') {
        addNotif('security', '⚠️ Security Alert: Account "' + username +
          '" was locked after ' + MAX_ATTEMPTS + ' failed login attempts at ' +
          new Date().toLocaleTimeString());
      }
    } catch(e){}
  }
  saveLockoutData(data);
  return data[key].attempts;
}

function clearFailedAttempts(username) {
  var data = getLockoutData();
  delete data[username.toLowerCase()];
  saveLockoutData(data);
}

function getRemainingLockout(lockedUntil) {
  var ms   = lockedUntil - Date.now();
  var mins = Math.floor(ms / 60000);
  var secs = Math.floor((ms % 60000) / 1000);
  return mins + ':' + (secs < 10 ? '0' : '') + secs;
}


// ═══════════════════════════════════════════════════════════════════
//  SESSION TIMEOUT — auto-logout after 30 min inactivity
//  Warning shown at 25 min: "Session expires in 5 min"
// ═══════════════════════════════════════════════════════════════════

var SESSION_TIMEOUT_MS  = 30 * 60 * 1000;   // 30 minutes
var SESSION_WARNING_MS  = 25 * 60 * 1000;   // warn at 25 min
var _sessionTimer       = null;
var _sessionWarnTimer   = null;
var _sessionWarnShown   = false;

function resetSessionTimer() {
  if (!CU) return;  // Not logged in — don't track
  clearTimeout(_sessionTimer);
  clearTimeout(_sessionWarnTimer);
  _sessionWarnShown = false;

  // Warning at 25 min
  _sessionWarnTimer = setTimeout(function(){
    if (!CU || _sessionWarnShown) return;
    _sessionWarnShown = true;
    if (typeof toast === 'function') {
      toast('⏱ Session expires in 5 minutes — tap anywhere to stay logged in', 'wa');
    }
  }, SESSION_WARNING_MS);

  // Auto-logout at 30 min
  _sessionTimer = setTimeout(function(){
    if (!CU) return;
    console.log('[Security] Session expired due to inactivity');
    if (typeof toast === 'function') toast('🔒 Session expired — please sign in again', 'er');
    setTimeout(function(){
      if (typeof doLogout === 'function') doLogout();
    }, 1500);
  }, SESSION_TIMEOUT_MS);
}

function stopSessionTimer() {
  clearTimeout(_sessionTimer);
  clearTimeout(_sessionWarnTimer);
  _sessionTimer = null;
  _sessionWarnTimer = null;
}

// Reset timer on ANY user activity
['click','touchstart','keydown','scroll','mousemove'].forEach(function(evt){
  document.addEventListener(evt, function(){
    if (CU) resetSessionTimer();
  }, { passive: true, capture: true });
});

// Also reset on page visibility change (returning to tab)
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && CU) {
    // Check if session has already expired while tab was hidden
    var sess = null;
    try { sess = JSON.parse(localStorage.getItem('ss_session')); } catch(e){}
    if (sess && sess.ts) {
      var idle = Date.now() - sess.ts;
      if (idle > SESSION_TIMEOUT_MS) {
        console.log('[Security] Session expired while app was in background');
        if (typeof toast === 'function') toast('🔒 Session expired — please sign in again', 'er');
        setTimeout(function(){ if (typeof doLogout === 'function') doLogout(); }, 1000);
        return;
      }
    }
    resetSessionTimer();
  }
});

// Update session timestamp regularly so we can detect bg expiry
setInterval(function(){
  if (CU) {
    try {
      var sess = JSON.parse(localStorage.getItem('ss_session') || '{}');
      if (sess && sess.uid) {
        sess.ts = Date.now();
        localStorage.setItem('ss_session', JSON.stringify(sess));
      }
    } catch(e){}
  }
}, 60000);  // Update every minute


// ═══════════════════════════════════════════════════════════════════
//  XSS PROTECTION — comprehensive input sanitization
// ═══════════════════════════════════════════════════════════════════

// Strengthen the existing esc() function (override it)
// This version handles all dangerous HTML/JS injection chars
window.escFull = function(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g,  '&#x60;');
};

// Sanitize user input before storing (strip script tags etc.)
function sanitizeInput(str) {
  if (!str) return '';
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<[^>]+>/g, '')  // strip all remaining HTML tags
    .trim();
}

// Wrap all form saves to sanitize inputs
// This patches the critical entry points
(function patchSanitize(){
  // Products
  var origSaveProd = window.saveProd;
  if (typeof origSaveProd === 'function') {
    window.saveProd = function() {
      // Sanitize product name and description before save
      var nameEl = document.getElementById('pname');
      var descEl = document.getElementById('pdesc');
      if (nameEl) nameEl.value = sanitizeInput(nameEl.value);
      if (descEl) descEl.value = sanitizeInput(descEl.value);
      return origSaveProd.apply(this, arguments);
    };
  }
  // Sales
  var origSaveSale = window.saveSale;
  if (typeof origSaveSale === 'function') {
    window.saveSale = function() {
      var custEl = document.getElementById('scust');
      var phoneEl = document.getElementById('sphone');
      if (custEl) custEl.value = sanitizeInput(custEl.value);
      if (phoneEl) phoneEl.value = sanitizeInput(phoneEl.value);
      return origSaveSale.apply(this, arguments);
    };
  }
})();



// ═══════════════════════════════════════════════════════════════════
//  APP PIN LOCK — 4-digit PIN, locks after 5 min inactivity
// ═══════════════════════════════════════════════════════════════════

var PIN_TIMEOUT_MS   = 5 * 60 * 1000;  // 5 minutes
var _pinTimer        = null;
var _pinBuffer       = '';
var _pinLocked       = false;
var _pinAttempts     = 0;
var MAX_PIN_ATTEMPTS = 5;

function getUserPin() {
  if (!CU) return null;
  return CU.appPin || null;
}

function startPinTimer() {
  if (!CU || !getUserPin()) return;  // Only if PIN is set
  clearTimeout(_pinTimer);
  _pinTimer = setTimeout(function(){
    if (CU && getUserPin()) lockApp();
  }, PIN_TIMEOUT_MS);
}

function stopPinTimer() {
  clearTimeout(_pinTimer);
  _pinTimer = null;
}

function lockApp() {
  if (!CU) return;
  var pin = getUserPin();
  if (!pin) return;  // No PIN set — don't lock
  _pinLocked = true;
  _pinBuffer = '';
  _pinAttempts = 0;
  updatePinDots();
  var nameEl = document.getElementById('pin-lock-name');
  if (nameEl) nameEl.textContent = CU.name + ' — Locked';
  var errEl = document.getElementById('pin-error');
  if (errEl) errEl.textContent = '';
  var screen = document.getElementById('pin-lock-screen');
  if (screen) screen.style.display = 'flex';
}

function unlockApp() {
  _pinLocked = false;
  _pinBuffer = '';
  _pinAttempts = 0;
  var screen = document.getElementById('pin-lock-screen');
  if (screen) screen.style.display = 'none';
  startPinTimer();
}

function pinPress(digit) {
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += digit;
  updatePinDots();
  if (_pinBuffer.length === 4) {
    setTimeout(checkPin, 100);  // Small delay so last dot shows
  }
}

function pinBackspace() {
  if (_pinBuffer.length > 0) {
    _pinBuffer = _pinBuffer.slice(0, -1);
    updatePinDots();
  }
}

function updatePinDots() {
  for (var i = 0; i < 4; i++) {
    var dot = document.getElementById('pd' + i);
    if (dot) {
      dot.classList.toggle('filled', i < _pinBuffer.length);
      dot.classList.remove('error');
    }
  }
}

function checkPin() {
  var pin = getUserPin();
  if (_pinBuffer === pin) {
    unlockApp();
    var errEl = document.getElementById('pin-error');
    if (errEl) errEl.textContent = '';
  } else {
    _pinAttempts++;
    _pinBuffer = '';
    // Flash dots red
    for (var i = 0; i < 4; i++) {
      var dot = document.getElementById('pd' + i);
      if (dot) { dot.classList.remove('filled'); dot.classList.add('error'); }
    }
    var errEl2 = document.getElementById('pin-error');
    if (_pinAttempts >= MAX_PIN_ATTEMPTS) {
      if (errEl2) errEl2.textContent = 'Too many attempts — signing out';
      setTimeout(function(){ pinSignOut(); }, 1500);
    } else {
      if (errEl2) errEl2.textContent = 'Wrong PIN · ' + (MAX_PIN_ATTEMPTS - _pinAttempts) + ' attempts left';
    }
    setTimeout(updatePinDots, 400);
  }
}

function pinSignOut() {
  unlockApp();
  doLogout();
}

function pinUsePassword() {
  // Let user bypass PIN with full password — sign them out to re-login
  unlockApp();
  doLogout();
}

// Reset PIN timer on activity (supplement session timer)
['click','touchstart','keydown'].forEach(function(evt){
  document.addEventListener(evt, function(){
    if (CU && getUserPin() && !_pinLocked) startPinTimer();
  }, { passive: true, capture: true });
});

// Check if should lock when returning to tab
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && CU && getUserPin()) {
    // Check how long we've been away
    var sess = null;
    try { sess = JSON.parse(localStorage.getItem('ss_session') || '{}'); } catch(e){}
    if (sess && sess.lastActive) {
      var idle = Date.now() - sess.lastActive;
      if (idle > PIN_TIMEOUT_MS) { lockApp(); return; }
    }
    startPinTimer();
  }
});

// Update lastActive timestamp regularly for background detection
setInterval(function(){
  if (CU && !_pinLocked) {
    try {
      var s = JSON.parse(localStorage.getItem('ss_session') || '{}');
      if (s && s.uid) { s.lastActive = Date.now(); localStorage.setItem('ss_session', JSON.stringify(s)); }
    } catch(e){}
  }
}, 30000);



// ═══════════════════════════════════════════════════════════════════
//  ACCOUNT DEACTIVATION — disable/enable staff accounts
// ═══════════════════════════════════════════════════════════════════

function deactivateUser(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) return;
  if (u.role === 'primaryAdmin') { toast('Cannot deactivate the Primary Admin', 'er'); return; }

  requireAdminPin(function(){
    showConf('🚫', 'Deactivate Account?',
      '"' + esc(u.name) + '" will be immediately signed out and cannot log in until reactivated.',
      function(){
        u.status = 'inactive';
        u.deactivatedAt = Date.now();
        u.deactivatedBy = CU.name;
        // Force session expiry — clear their session if on this device
        try {
          var sess = JSON.parse(localStorage.getItem('ss_session') || '{}');
          if (sess.uid === userId) { localStorage.removeItem('ss_session'); }
        } catch(e){}
        dbSave();
        try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
        addAdminLog('deactivate', 'Deactivated account: ' + u.name, CU.name);
        toast('Account deactivated — ' + u.name + ' cannot login', 'gd');
        renderTeam();
      }
    );
  }, null, 'Deactivate account — enter admin PIN');
}

function reactivateUser(userId) {
  var u = (DB.users || []).find(function(x){ return x.id === userId; });
  if (!u) return;
  requireAdminPin(function(){
    u.status = 'active';
    u.deactivatedAt = null;
    u.deactivatedBy = null;
    dbSave();
    try { if(typeof fbPush === 'function') fbPush(); } catch(e){}
    addAdminLog('reactivate', 'Reactivated account: ' + u.name, CU.name);
    toast('Account reactivated — ' + u.name + ' can login again', 'gd');
    renderTeam();
  }, null, 'Reactivate account — enter admin PIN');
}



function togglePinSetup(on) {
  var fields = el('pin-setup-fields');
  var lbl    = el('pin-toggle-lbl');
  if (fields) fields.style.display = on ? '' : 'none';
  if (lbl)    lbl.textContent = on ? 'ON' : 'OFF';
  if (!on) {
    sv('pe-pin', ''); sv('pe-pin2', '');
  }
}



// ═══════════════════════════════════════════════════════════════════
//  DELETE ACCOUNT — permanent deletion with password confirmation
// ═══════════════════════════════════════════════════════════════════

function openDeleteAccount() {
  if (!CU) return;
  closeD('d-profile');

  // Build warning message based on role
  var detailsEl = el('del-account-details');
  if (detailsEl) {
    var lines = [];
    if (CU.role === 'primaryAdmin') {
      lines.push('🔴 <strong>You are the Primary Admin.</strong>');
      lines.push('Deleting your account will permanently delete:');
      lines.push('• All your business data (sales, products, expenses)');
      lines.push('• All team member accounts linked to your business');
      lines.push('• All customer records, credits, and history');
      lines.push('• All documentation and salary records');
      lines.push('• Your Firebase database entry');
      lines.push('<br><strong style="color:var(--er)">This CANNOT be recovered.</strong>');
    } else {
      lines.push('Deleting your account will:');
      lines.push('• Remove your login access permanently');
      lines.push('• Remove you from the team roster');
      lines.push('• Your sales records will remain (for business records)');
      lines.push('<br>You will need a new invite to rejoin.');
    }
    detailsEl.innerHTML = lines.join('<br>');
  }

  // Reset form
  sv('del-account-confirm', '');
  sv('del-account-pw', '');
  var errEl = el('del-account-err');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  var btn = el('del-account-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; btn.style.cursor = 'not-allowed'; }

  openD('d-del-account');
  setTimeout(function(){ var inp = el('del-account-confirm'); if(inp) inp.focus(); }, 300);
}

function checkDelAccountConfirm(val) {
  var btn = el('del-account-btn');
  if (!btn) return;
  if (val && val.trim().toUpperCase() === 'DELETE') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.opacity = '.4';
    btn.style.cursor = 'not-allowed';
  }
}

async function confirmDeleteAccount() {
  if (!CU) return;
  var confirmText = (el('del-account-confirm') ? el('del-account-confirm').value : '').trim().toUpperCase();
  var pw = el('del-account-pw') ? el('del-account-pw').value : '';
  var errEl = el('del-account-err');

  function showErr(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
  }

  if (confirmText !== 'DELETE') {
    showErr('Please type DELETE to confirm'); return;
  }
  if (!pw) {
    showErr('Please enter your password'); return;
  }

  // Verify password
  var pwOk = await verifyPassword(pw, CU.password);
  if (!pwOk) {
    showErr('Incorrect password — account not deleted'); return;
  }

  // ── PERFORM DELETION ──
  var userId = CU.id;
  var isPrimary = (CU.role === 'primaryAdmin');

  if (isPrimary) {
    // Delete entire business data + all users in this business
    var b = (typeof biz === 'function') ? biz() : null;
    if (b) {
      var bizId = b.id;
      // Remove all users belonging to this business
      DB.users = (DB.users || []).filter(function(u) {
        return !(u.businessIds && u.businessIds.indexOf(bizId) !== -1);
      });
      // Remove the business itself
      DB.businesses = (DB.businesses || []).filter(function(bz) {
        return bz.id !== bizId;
      });
    } else {
      // Just remove this user
      DB.users = (DB.users || []).filter(function(u) { return u.id !== userId; });
    }
  } else {
    // Staff/Admin: just remove this user account
    DB.users = (DB.users || []).filter(function(u) { return u.id !== userId; });
    // Remove from business employees if listed
    (DB.businesses || []).forEach(function(bz) {
      if (bz.employees) {
        bz.employees = bz.employees.filter(function(e) { return e.userId !== userId; });
      }
    });
  }

  // Save + sync to Firebase
  try { dbSave(); } catch(e) {}
  try {
    if (typeof fbPushUsers === 'function') fbPushUsers();
    if (typeof fbPush === 'function') setTimeout(fbPush, 300);
  } catch(e) {}

  // Clear local session
  try { localStorage.removeItem('ss_session'); } catch(e) {}
  try { localStorage.removeItem('ss_last_page'); } catch(e) {}

  closeD('d-del-account');

  // Show farewell message then logout
  var shellEl = el('shell');
  if (shellEl) {
    shellEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;text-align:center;padding:20px">' +
      '<div style="font-size:48px">👋</div>' +
      '<div style="font-family:var(--fd);font-size:24px;font-weight:800;color:var(--t1)">Account Deleted</div>' +
      '<div style="font-size:14px;color:var(--t3);max-width:300px;line-height:1.6">Your account has been permanently deleted. Thank you for using SmartStock Pro.</div>' +
      '<button onclick="location.reload()" class="btn bg" style="margin-top:16px">Back to Start</button>' +
    '</div>';
  }
  CU = null;
  try { if(typeof stopSessionTimer==='function') stopSessionTimer(); } catch(e) {}
}



// ═══════════════════════════════════════════════════════════════════
//  localStorage ENCRYPTION
//  XOR cipher with password-derived key — works everywhere (no HTTPS needed)
//  Key = SHA-256 hash of user password + salt
// ═══════════════════════════════════════════════════════════════════

var _encKey = null;  // Set on login, cleared on logout

function setEncryptionKey(password) {
  // Derive a key from the password using SHA-256
  _encKey = _sha256(password + 'ss_salt_v1_smartstock');
}

function clearEncryptionKey() {
  _encKey = null;
}

function _xorEncrypt(text, key) {
  if (!key || !text) return text;
  var result = '';
  for (var i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  // Base64 encode to make it storable
  try { return btoa(unescape(encodeURIComponent(result))); } catch(e) { return text; }
}

function _xorDecrypt(encoded, key) {
  if (!key || !encoded) return encoded;
  try {
    var text = decodeURIComponent(escape(atob(encoded)));
    var result = '';
    for (var i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return result;
  } catch(e) { return encoded; }
}

function dbSaveEncrypted() {
  try {
    var json = JSON.stringify(DB);
    if (_encKey) {
      var encrypted = _xorEncrypt(json, _encKey);
      localStorage.setItem('ss_v4', 'enc:' + encrypted);
    } else {
      localStorage.setItem('ss_v4', json);
    }
  } catch(e) {
    console.warn('[Storage] Save failed:', e.message);
  }
}

function dbLoadDecrypted() {
  try {
    var raw = localStorage.getItem('ss_v4');
    if (!raw) return null;
    if (raw.startsWith('enc:')) {
      if (!_encKey) {
        // No key yet — can't decrypt. Return null to trigger Firebase pull
        console.warn('[Storage] Encrypted data found but no key set yet');
        return null;
      }
      var decrypted = _xorDecrypt(raw.slice(4), _encKey);
      return JSON.parse(decrypted);
    }
    // Unencrypted (old format or fresh) — parse normally
    return JSON.parse(raw);
  } catch(e) {
    console.warn('[Storage] Load/decrypt failed:', e.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════
//  RECYCLE BIN — 30-day soft delete for sales, expenses, products
// ═══════════════════════════════════════════════════════════════════

var TRASH_DAYS = 30;

function softDelete(record) {
  record.deletedAt  = Date.now();
  record.deletedBy  = CU ? CU.name : 'Unknown';
  record.status     = 'deleted';
  return record;
}

function isDeleted(record) {
  return record && record.status === 'deleted';
}

function isPermanentlyExpired(record) {
  if (!record || !record.deletedAt) return false;
  var age = Date.now() - record.deletedAt;
  return age > TRASH_DAYS * 24 * 60 * 60 * 1000;
}

// Auto-purge permanently expired records (run on dbLoad)
function purgExpiredTrash() {
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return;
  var purged = 0;
  ['sales','expenses','products'].forEach(function(type) {
    if (b[type]) {
      var before = b[type].length;
      b[type] = b[type].filter(function(r) {
        return !(isDeleted(r) && isPermanentlyExpired(r));
      });
      purged += before - b[type].length;
    }
  });
  if (purged > 0) {
    console.log('[Trash] Auto-purged ' + purged + ' expired records');
    try { dbSave(); } catch(e){}
  }
}

// Restore a deleted record
function restoreFromTrash(type, id) {
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b || !b[type]) return;
  var record = b[type].find(function(r){ return r.id === id; });
  if (!record) return;
  delete record.deletedAt;
  delete record.deletedBy;
  record.status = 'active';
  dbSave();
  toast('✅ Restored successfully', 'gd');
  if (typeof renderDash === 'function') renderDash();
}

// Get trash items (last 30 days)
function getTrashItems() {
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return [];
  var items = [];
  ['sales','expenses','products'].forEach(function(type) {
    (b[type] || []).filter(function(r){ return isDeleted(r) && !isPermanentlyExpired(r); })
    .forEach(function(r){ items.push({type:type, record:r}); });
  });
  items.sort(function(a,b){ return b.record.deletedAt - a.record.deletedAt; });
  return items;
}

// Count trash items
function getTrashCount() {
  return getTrashItems().length;
}


// ═══════════════════════════════════════════════════════════════════
//  EXPORT PROTECTION — admin PIN required before any data export
// ═══════════════════════════════════════════════════════════════════

function protectedExport(exportFn, label) {
  requireAdminPin(function() {
    addAdminLog('export', (label || 'Data export') + ' by ' + (CU ? CU.name : 'Unknown'), CU ? CU.name : '');
    try { exportFn(); } catch(e) { toast('Export error: ' + e.message, 'er'); }
  }, null, '🔐 ' + (label || 'Export') + ' — enter admin PIN to download');
}



// ─── RECYCLE BIN UI ───────────────────────────────────────
function openTrash() {
  renderTrashDrawer();
  openD('d-trash');
}

function renderTrashDrawer() {
  var items = getTrashItems();
  var body  = el('trash-body');
  var sub   = el('trash-dsub');
  if (sub) sub.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '') + ' · auto-purge after 30 days';

  // Update sidebar badge
  var badge = el('trash-count-badge');
  if (badge) {
    if (items.length > 0) { badge.style.display = ''; badge.textContent = items.length; }
    else badge.style.display = 'none';
  }

  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:40px;margin-bottom:10px">♻️</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--t2)">Recycle Bin is Empty</div>' +
      '<div style="font-size:12px;color:var(--t3);margin-top:6px">Deleted items appear here for 30 days</div>' +
    '</div>';
    return;
  }

  body.innerHTML = items.map(function(item) {
    var r = item.record;
    var typeIcon = item.type === 'sales' ? '🧾' : item.type === 'expenses' ? '💸' : '📦';
    var typeLbl  = item.type === 'sales' ? 'Sale' : item.type === 'expenses' ? 'Expense' : 'Product';
    var title    = r.customer || r.description || r.name || ('ID #' + r.id);
    var daysLeft = Math.max(0, 30 - Math.floor((Date.now() - r.deletedAt) / (1000*60*60*24)));
    var amount   = r.amount ? f$(r.amount) : (typeof sTotal === 'function' && item.type === 'sales' ? f$(sTotal(r)) : '');
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--bd)">' +
      '<div style="font-size:22px;flex-shrink:0">' + typeIcon + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:var(--t1)">' + esc(title) + '</div>' +
        '<div style="font-size:10px;color:var(--t3);margin-top:2px">' +
          typeLbl + ' · deleted by ' + esc(r.deletedBy || 'Unknown') + ' · ' + daysLeft + ' days left' +
        '</div>' +
      '</div>' +
      (amount ? '<div style="font-size:13px;font-weight:700;color:var(--wa);flex-shrink:0">' + amount + '</div>' : '') +
      '<button type="button" class="btn bok bsm" onclick="restoreFromTrash(\'' + item.type + '\',' + r.id + ');renderTrashDrawer()" ' +
        'style="flex-shrink:0;font-size:11px">↩ Restore</button>' +
    '</div>';
  }).join('');
}

function emptyTrash() {
  requireAdminPin(function() {
    var b = biz(); if(!b) return;
    ['sales','expenses','products'].forEach(function(type) {
      if (b[type]) b[type] = b[type].filter(function(r){ return r.status !== 'deleted'; });
    });
    dbSave();
    renderTrashDrawer();
    toast('Trash emptied permanently', 'gd');
  }, null, 'Empty Trash — enter admin PIN to permanently delete');
}



// ═══════════════════════════════════════════════════════════════════
//  FIREBASE AUTHENTICATION — Email + Password
//  Runs alongside custom auth for maximum security
// ═══════════════════════════════════════════════════════════════════

// Sign into Firebase Auth (called after our custom auth succeeds)
function fbAuthSignIn(email, password) {
  if (!FB_AUTH) return Promise.resolve(null);
  return FB_AUTH.signInWithEmailAndPassword(email, password)
    .then(function(cred) {
      console.log('[Firebase Auth] Signed in:', email);
      return cred;
    })
    .catch(function(err) {
      // If user doesn't exist in Firebase Auth yet, create them
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        return fbAuthCreateUser(email, password);
      }
      // Wrong password in Firebase Auth — update it to match our DB
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-login-credentials') {
        return fbAuthUpdatePassword(email, password);
      }
      console.warn('[Firebase Auth] Sign in error:', err.code);
      return null;
    });
}

// Create Firebase Auth user (for existing DB users migrating to Firebase Auth)
function fbAuthCreateUser(email, password) {
  // If FB_AUTH not ready yet — retry up to 10 times (5 seconds total)
  if (!FB_AUTH) {
    return new Promise(function(resolve) {
      var attempts = 0;
      var retry = setInterval(function() {
        attempts++;
        if (FB_AUTH) {
          clearInterval(retry);
          fbAuthCreateUser(email, password).then(resolve);
        } else if (attempts >= 10) {
          clearInterval(retry);
          console.warn('[Firebase Auth] FB_AUTH never became ready');
          resolve(null);
        }
      }, 500);
    });
  }

  return FB_AUTH.createUserWithEmailAndPassword(email, password)
    .then(function(cred) {
      console.log('[Firebase Auth] Created user:', email);
      if (cred.user && !cred.user.emailVerified) {
        var _actionSettings = {
          url: 'https://smartstock-pro.netlify.app?verified=1',
          handleCodeInApp: false
        };
        return cred.user.sendEmailVerification(_actionSettings)
          .then(function() {
            console.log('[Firebase Auth] Verification email sent to:', email);
            toast('📧 Verification email sent to ' + email + '. Please check your inbox.', 'gd');
            return cred;
          })
          .catch(function(verErr) {
            console.warn('[Firebase Auth] sendEmailVerification failed:', verErr.code, verErr.message);
            if (verErr.code === 'auth/too-many-requests') {
              toast('📧 Verification email already sent. Check your inbox or spam folder.', 'wa');
            } else {
              toast('⚠ Could not send verification email: ' + verErr.message, 'wa');
            }
            return cred;
          });
      }
      return cred;
    })
    .catch(function(err) {
      console.warn('[Firebase Auth] Create user error:', err.code, err.message);
      if (err.code === 'auth/email-already-in-use') {
        // User already exists — try to sign in and resend verification
        return FB_AUTH.signInWithEmailAndPassword(email, password)
          .then(function(cred) {
            if (cred.user && !cred.user.emailVerified) {
              return cred.user.sendEmailVerification()
                .then(function() {
                  toast('📧 Verification email resent to ' + email, 'gd');
                  return cred;
                });
            }
            return cred;
          })
          .catch(function(signInErr) {
            console.warn('[Firebase Auth] Sign-in for re-verify failed:', signInErr.code);
            return null;
          });
      }
      if (err.code === 'auth/operation-not-allowed') {
        console.warn('[Firebase Auth] Email/Password auth is NOT enabled in Firebase Console!');
        toast('⚠ Firebase Auth not enabled. Go to Firebase Console → Authentication → Enable Email/Password.', 'er');
      } else if (err.code === 'auth/network-request-failed') {
        toast('⚠ No internet connection. Verification email will be sent when online.', 'wa');
      } else {
        console.warn('[Firebase Auth] Unhandled error:', err.code, err.message);
      }
      return null;
    });
}

// Update Firebase Auth password (sync when our DB password changes)
function fbAuthUpdatePassword(email, password) {
  if (!FB_AUTH) return Promise.resolve(null);
  // Sign in with current Firebase creds to get user, then update
  return FB_AUTH.sendPasswordResetEmail(email).then(function() {
    // Can't update without old password - will sync on next login after reset
    return null;
  }).catch(function(err) {
    console.warn('[Firebase Auth] Update password error:', err.code);
    return null;
  });
}

// Sign out of Firebase Auth
function fbAuthSignOut() {
  if (!FB_AUTH) return;
  FB_AUTH.signOut().catch(function(e){
    console.warn('[Firebase Auth] Sign out error:', e);
  });
}

// Send password reset email
function fbAuthSendPasswordReset(email) {
  if (!FB_AUTH) {
    toast('Firebase Auth not available — refresh and try again', 'er');
    return Promise.reject('Not ready');
  }
  var _resetSettings = {
    url: 'https://smartstock-pro.netlify.app?reset=1',
    handleCodeInApp: false
  };
  return FB_AUTH.sendPasswordResetEmail(email, _resetSettings);
}

// Check if email is verified in Firebase Auth
function fbAuthIsEmailVerified() {
  if (!FB_AUTH || !FB_AUTH.currentUser) return false;
  return FB_AUTH.currentUser.emailVerified;
}

// Forgot password flow — opens a proper drawer
function openForgotPassword() {
  // Clear any login lockout when user opens forgot password
  // (they're already proving they know their email)
  try { localStorage.removeItem('ss_login_attempts'); } catch(e){}
  // Reset all field states
  var loginVal = el('lu') ? el('lu').value.trim() : '';
  if (loginVal.includes('@')) {
    sv('forgot-email', loginVal);
  } else {
    sv('forgot-email', '');
  }
  // Clear errors and success states
  ['forgot-err','forgot-ok','fp-err-code','fp-err-admin'].forEach(function(id){
    var e = el(id);
    if(e){ e.style.display = 'none'; e.textContent = ''; }
  });
  // Default to Email tab (primary recovery method)
  openD('d-forgot-pw');
  setTimeout(function(){
    if (typeof switchFpTab === 'function') switchFpTab('email');
    var inp = el('forgot-email');
    if (inp) inp.focus();
  }, 250);
}

function sendForgotPasswordReset() {
  var email = (el('forgot-email') ? el('forgot-email').value : '').trim().toLowerCase();
  var errEl = el('forgot-err');
  var okEl  = el('forgot-ok');
  var btn   = el('forgot-send-btn');

  function showErr(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
    if (okEl)  okEl.style.display = 'none';
  }

  if (!email) { showErr('Please enter your email address'); return; }
  if (!email.includes('@') || !email.includes('.')) { showErr('Please enter a valid email address'); return; }

  // Check if email exists in our database
  var userMatch = (DB.users || []).find(function(u){
    return u.email && u.email.toLowerCase() === email;
  });
  if (!userMatch) {
    showErr('No account found with that email address');
    return;
  }

  if (!FB_AUTH) {
    showErr('Firebase Auth not ready — please refresh and try again');
    return;
  }

  // Disable button while sending
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  var _resetSettings = { url: 'https://smartstock-pro.netlify.app?reset=1', handleCodeInApp: false };
  FB_AUTH.sendPasswordResetEmail(email, _resetSettings)
    .then(function() {
      if (errEl) errEl.style.display = 'none';
      if (okEl) {
        okEl.innerHTML = '✅ <strong>Email sent!</strong><br>' +
          'Check <strong>' + esc(email) + '</strong> for a reset link from Firebase.<br>' +
          '<span style="font-size:11px;color:var(--t3)">Don\'t see it? Check your spam folder.</span>';
        okEl.style.display = '';
      }
      if (btn) { btn.disabled = false; btn.textContent = '✓ Sent — Send Again'; }
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '📧 Send Reset Email'; }
      if (err.code === 'auth/user-not-found') {
        showErr('This email is not registered with Firebase Auth yet. Try signing in with your username and password first.');
      } else if (err.code === 'auth/invalid-email') {
        showErr('Invalid email format');
      } else if (err.code === 'auth/too-many-requests') {
        showErr('Too many attempts. Please wait a few minutes and try again.');
      } else {
        showErr('Error: ' + (err.message || err.code));
      }
    });
}



// ─── Resend verification email ───────────────────────────
function resendVerificationEmail(email) {
  if (!FB_AUTH) { toast('Firebase Auth not available', 'er'); return; }
  // Sign in silently to get user object, then send verification
  var pwInput = document.getElementById('lp');
  var pw = pwInput ? pwInput.value : '';
  if (!pw) { toast('Enter your password first, then try resending', 'wa'); return; }
  FB_AUTH.signInWithEmailAndPassword(email, pw)
    .then(function(cred) {
      if (cred.user && !cred.user.emailVerified) {
        return cred.user.sendEmailVerification();
      }
    })
    .then(function() {
      toast('✅ Verification email resent to ' + email, 'gd');
    })
    .catch(function(err) {
      toast('Could not resend: ' + err.message, 'er');
    });
}



// ─── Resend verification email from profile ───────────────
function resendVerificationFromProfile() {
  if (!CU || !CU.email) {
    toast('No email on your account', 'er');
    return;
  }
  if (!FB_AUTH || !FB_AUTH.currentUser) {
    // Not signed into Firebase Auth — try to sign in first
    toast('Please sign out and sign back in with your email to resend verification.', 'wa');
    return;
  }
  if (FB_AUTH.currentUser.emailVerified) {
    toast('✅ Your email is already verified!', 'gd');
    return;
  }
  FB_AUTH.currentUser.sendEmailVerification()
    .then(function() {
      toast('📧 Verification email sent to ' + CU.email + '. Check your inbox and spam folder.', 'gd');
    })
    .catch(function(err) {
      if (err.code === 'auth/too-many-requests') {
        toast('Please wait a few minutes before requesting another email.', 'wa');
      } else {
        toast('Error: ' + err.message, 'er');
      }
    });
}



// ── Detect if running from local file ──────────────────────
(function() {
  var proto = window.location.protocol;
  if (proto === 'file:' || proto === 'content:' || window.location.href.indexOf('content://') === 0) {
    // Running from local file — show warning after page loads
    window.addEventListener('DOMContentLoaded', function() {
      var warn = document.getElementById('local-file-warning');
      if (warn) warn.style.display = '';
      // Also show on login screen if visible
      var loginEl = document.getElementById('login');
      if (loginEl && loginEl.style.display !== 'none') {
        var warn2 = document.getElementById('local-file-warning');
        if (warn2) warn2.style.display = '';
      }
    });
    // Also disable email verification requirement for local testing
    window._isLocalFile = true;
    console.warn('[SmartStock] Running from local file — Firebase Auth email features limited');
  }
})();



// ═══════════════════════════════════════════════════════════════════
//  FIREBASE STORAGE — Product photos, logos, profile pictures
// ═══════════════════════════════════════════════════════════════════

// Upload a file (base64 dataURL) to Firebase Storage
// Returns a Promise that resolves to the download URL
function fbStorageUpload(path, dataURL, onProgress) {
  return new Promise(function(resolve, reject) {
    if (!FB_STORAGE) {
      // Firebase Storage not available — keep base64 locally
      resolve(null);
      return;
    }
    if (!dataURL || !dataURL.startsWith('data:')) {
      resolve(null);
      return;
    }
    try {
      // Convert base64 dataURL to blob
      var parts  = dataURL.split(',');
      var mime   = parts[0].match(/:(.*?);/)[1];
      var bStr   = atob(parts[1]);
      var n      = bStr.length;
      var u8arr  = new Uint8Array(n);
      while (n--) u8arr[n] = bStr.charCodeAt(n);
      var blob   = new Blob([u8arr], {type: mime});

      var ref    = FB_STORAGE.ref(path);
      var task   = ref.put(blob, {contentType: mime});

      task.on('state_changed',
        function(snapshot) {
          if (onProgress) {
            var pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        function(err) {
          console.warn('[Firebase Storage] Upload error:', err.code);
          resolve(null); // fail gracefully — keep local base64
        },
        function() {
          task.snapshot.ref.getDownloadURL().then(function(url) {
            console.log('[Firebase Storage] Uploaded:', path);
            resolve(url);
          }).catch(function(err) {
            console.warn('[Firebase Storage] getDownloadURL error:', err);
            resolve(null);
          });
        }
      );
    } catch(e) {
      console.warn('[Firebase Storage] Upload exception:', e.message);
      resolve(null);
    }
  });
}

// Delete a file from Firebase Storage by URL
function fbStorageDelete(url) {
  if (!FB_STORAGE || !url || !url.includes('firebasestorage')) return;
  try {
    FB_STORAGE.refFromURL(url).delete()
      .then(function(){ console.log('[Firebase Storage] Deleted:', url.slice(0,60)); })
      .catch(function(e){ console.warn('[Firebase Storage] Delete error:', e.code); });
  } catch(e){}
}

// Upload product photo and return {imgData, imgUrl}
// imgUrl = Firebase Storage URL (if online)
// imgData = base64 fallback (always set for offline)
async function uploadProductPhoto(base64DataURL, bizId, prodId) {
  if (!base64DataURL || !base64DataURL.startsWith('data:')) {
    return {imgData: '', imgUrl: ''};
  }
  // Always keep base64 locally for offline use
  var result = {imgData: base64DataURL, imgUrl: ''};
  try {
  // Also upload to Firebase Storage if available
  if (FB_STORAGE && bizId) {
    var ext  = base64DataURL.includes('image/png') ? 'png' : 'jpg';
    var path = 'products/' + bizId + '/' + (prodId || 'new') + '_' + Date.now() + '.' + ext;
    var url  = await fbStorageUpload(path, base64DataURL, null);
    if (url) {
      result.imgUrl  = url;
      result.imgData = ''; // clear base64 to save localStorage space
      console.log('[Storage] Product photo uploaded, base64 cleared');
    }
  }
  } catch(e) { console.warn('[uploadProductPhoto]',e.message); }
  return result;
}

// Get the best image src for a product (Storage URL first, fallback to base64)
function getProductImgSrc(prod) {
  if (!prod) return '';
  if (prod.imgUrl && prod.imgUrl.startsWith('http')) return prod.imgUrl;
  if (prod.imgData && prod.imgData.startsWith('data:')) return prod.imgData;
  return '';
}

// Upload profile photo to Firebase Storage
async function uploadProfilePhoto(base64DataURL, userId) {
  if (!base64DataURL || !base64DataURL.startsWith('data:')) return base64DataURL;
  if (!FB_STORAGE || !userId) return base64DataURL;
  var ext  = base64DataURL.includes('image/png') ? 'png' : 'jpg';
  var path = 'profiles/' + userId + '/photo.' + ext;
  var url  = await fbStorageUpload(path, base64DataURL, null);
  return url || base64DataURL; // fallback to base64 if upload fails
}

// Upload business logo to Firebase Storage
async function uploadBizLogo(base64DataURL, bizId) {
  if (!base64DataURL || !base64DataURL.startsWith('data:')) return base64DataURL;
  if (!FB_STORAGE || !bizId) return base64DataURL;
  var ext  = base64DataURL.includes('image/png') ? 'png' : 'jpg';
  var path = 'logos/' + bizId + '/logo.' + ext;
  var url  = await fbStorageUpload(path, base64DataURL, null);
  return url || base64DataURL;
}



// ─── Start Fresh — clear all data and restart ────────────
function confirmStartFresh() {
  showConf(
    '⚠️',
    'Start Fresh?',
    'This will delete ALL data on this device — accounts, sales, products, everything. This cannot be undone.\n\nOnly do this if you are completely locked out and want to start over.',
    function() {
      // Clear all SmartStock data from localStorage
      try {
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && (key.startsWith('ss_') || key === 'ss_v4')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(function(k){ localStorage.removeItem(k); });
        // Also clear the DB object in memory
        DB = { users: [], businesses: [], nextUserId: 1, nextBizId: 1 };
      } catch(e) {}
      // Show login fresh
      setTimeout(function(){ location.reload(); }, 300);
      toast('All data cleared. Starting fresh...', 'gd');
    }
  );
}



// ── Handle Firebase redirect callbacks ─────────────────────
(function handleFirebaseRedirects() {
  var params = new URLSearchParams(window.location.search);

  if (params.get('verified') === '1') {
    // User just clicked email verification link → show success
    window._showVerifiedSuccess = true;
    // Clean URL without reload
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (params.get('reset') === '1') {
    // User just clicked password reset link → show they can now log in
    window._showResetSuccess = true;
    window.history.replaceState({}, '', window.location.pathname);
  }
})();



// ── Login screen banner (success/error) ───────────────────
function showLoginBanner(msg, type) {
  var banner = document.getElementById('login-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.style.display = '';
  banner.style.background = type === 'ok'
    ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)';
  banner.style.borderColor = type === 'ok'
    ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)';
  banner.style.color = type === 'ok' ? 'var(--ok)' : 'var(--er)';
  // Auto-hide after 8 seconds
  setTimeout(function() {
    if (banner) banner.style.display = 'none';
  }, 8000);
}



// ── CONGRATULATION SCREEN ──────────────────────────────────
function showCongratsScreen(user, bizName) {
  var screen = document.getElementById('congrats-screen');
  if (!screen) return;

  // Fill in details
  var bizEl  = document.getElementById('congrats-biz-name');
  var nameEl = document.getElementById('congrats-name');
  var hintEl = document.getElementById('congrats-email-hint');

  if (bizEl)  bizEl.textContent  = bizName || '';
  if (nameEl) nameEl.textContent = 'Account created for ' + (user.name || user.username);
  if (hintEl) hintEl.innerHTML   =
    'We sent a verification link to<br>' +
    '<strong style="color:var(--t1)">' + esc(user.email || '') + '</strong><br><br>' +
    'Click the link in your email, then come back here and tap the button below.';

  // Show the screen
  screen.style.display = 'flex';

  // Store user for when they verify
  window._pendingVerifyUser = user;
  window._pendingVerifyBiz  = bizName;

  // Start polling for verification (check every 3 seconds)
  window._verifyPollInterval = setInterval(function() {
    if (FB_AUTH && FB_AUTH.currentUser) {
      FB_AUTH.currentUser.reload()
        .then(function() {
          if (FB_AUTH.currentUser.emailVerified) {
            clearInterval(window._verifyPollInterval);
            onEmailVerified();
          }
        })
        .catch(function(){});
    }
  }, 3000);
}

// Called when email is verified (auto-detected or button tapped)
function onEmailVerified() {
  var verifiedMsg = document.getElementById('congrats-verified-msg');
  var checkBtn    = document.getElementById('congrats-check-btn');
  if (verifiedMsg) verifiedMsg.style.display = '';
  if (checkBtn)    checkBtn.style.display     = 'none';

  // Wait 1.5s then log the user in
  setTimeout(function() {
    var screen = document.getElementById('congrats-screen');
    if (screen) screen.style.display = 'none';
    clearInterval(window._verifyPollInterval);

    // Log in the pending user
    var user = window._pendingVerifyUser;
    if (user) {
      loginAs(user);
      resetSessionTimer();
      toast('🎉 Welcome to SmartStock Pro, ' + (user.name || user.username) + '!', 'gd');
    }
    window._pendingVerifyUser = null;
    window._pendingVerifyBiz  = null;
  }, 1500);
}

// Manual check — user taps "I've verified my email"
function checkEmailVerificationStatus() {
  if (!FB_AUTH || !FB_AUTH.currentUser) {
    // No Firebase session — just let them in (offline/local file mode)
    var user = window._pendingVerifyUser;
    if (user) {
      var screen = document.getElementById('congrats-screen');
      if (screen) screen.style.display = 'none';
      clearInterval(window._verifyPollInterval);
      loginAs(user);
      resetSessionTimer();
      toast('🎉 Welcome, ' + (user.name || user.username) + '!', 'gd');
    }
    return;
  }

  var btn = document.getElementById('congrats-check-btn');
  if (btn) btn.textContent = 'Checking...';

  FB_AUTH.currentUser.reload()
    .then(function() {
      if (FB_AUTH.currentUser.emailVerified) {
        clearInterval(window._verifyPollInterval);
        onEmailVerified();
      } else {
        if (btn) btn.textContent = '✓ I\'ve verified my email — Continue';
        showLoginBanner('Email not verified yet. Please click the link in your email first.', 'er');
        toast('📧 Please click the verification link in your email first.', 'wa');
      }
    })
    .catch(function(err) {
      if (btn) btn.textContent = '✓ I\'ve verified my email — Continue';
      // On error (e.g. offline) — let them through
      var user = window._pendingVerifyUser;
      if (user) {
        var screen = document.getElementById('congrats-screen');
        if (screen) screen.style.display = 'none';
        clearInterval(window._verifyPollInterval);
        loginAs(user);
        resetSessionTimer();
      }
    });
}

// Resend verification email from congrats screen
function resendCongratsVerification() {
  if (!FB_AUTH || !FB_AUTH.currentUser) {
    toast('Firebase Auth not connected. Check your internet.', 'wa');
    return;
  }
  var actionSettings = {
    url: 'https://smartstock-pro.netlify.app?verified=1',
    handleCodeInApp: false
  };
  FB_AUTH.currentUser.sendEmailVerification(actionSettings)
    .then(function() {
      toast('📧 Verification email resent! Check your inbox.', 'gd');
    })
    .catch(function(err) {
      if (err.code === 'auth/too-many-requests') {
        toast('Please wait a few minutes before requesting another email.', 'wa');
      } else {
        toast('Error: ' + err.message, 'er');
      }
    });
}



// ── Prompt user to add email if missing ───────────────────
function promptAddEmail(userId, onSuccess) {
  var email = prompt(
    'Your account needs an email address for verification.\n\n' +
    'Please enter your email:'
  );
  if (!email || !email.includes('@') || !email.includes('.')) {
    toast('A valid email is required to continue.', 'er');
    return;
  }
  email = email.trim().toLowerCase();
  // Check not already taken
  var taken = (DB.users || []).find(function(u) {
    return u.id !== userId && u.email && u.email.toLowerCase() === email;
  });
  if (taken) {
    toast('That email is already used by another account.', 'er');
    return;
  }
  // Save email to user
  var user = (DB.users || []).find(function(u){ return u.id === userId; });
  if (user) {
    user.email = email;
    dbSave();
    try { if (typeof fbPushUsers === 'function') fbPushUsers(); } catch(e){}
    // Create Firebase Auth and send verification
    if (typeof fbAuthCreateUser === 'function') {
      fbAuthCreateUser(email, '').catch(function(){});
    }
    toast('📧 Email added! Verification email sent to ' + email, 'gd');
    if (onSuccess) onSuccess(user);
  }
}



// ═══════════════════════════════════════════════════════════════════
//  AI ASSISTANT — Chat with Claude about your business data
// ═══════════════════════════════════════════════════════════════════

var aiConversationHistory = [];
var aiIsTyping = false;

// Collect business data to send to AI
function getBusinessDataForAI() {
  var b = (typeof biz === 'function') ? biz() : null;
  if (!b) return {};

  var now = new Date();
  var todayStr = now.toISOString().split('T')[0];
  var monthStr = todayStr.slice(0, 7);

  // Products summary
  var products = (b.products || []).filter(function(p){ return p.status !== 'deleted'; });
  var lowStock = products.filter(function(p){ return p.qty <= (p.lowLevel || 5) && p.qty > 0; });
  var outOfStock = products.filter(function(p){ return p.qty <= 0; });

  // Sales summary
  var sales = (b.sales || []).filter(function(s){ return s.status !== 'deleted'; });
  var todaySales = sales.filter(function(s){ return s.date === todayStr; });
  var monthSales = sales.filter(function(s){ return s.date && s.date.startsWith(monthStr); });

  // Expenses
  var expenses = (b.expenses || []).filter(function(e){ return e.status !== 'deleted'; });
  var monthExp = expenses.filter(function(e){ return e.date && e.date.startsWith(monthStr); });

  // Credits (debtors)
  var credits = (b.credits || []).filter(function(c){ return c.status !== 'deleted'; });
  var unpaidCredits = credits.filter(function(c){ return (c.balance || 0) > 0; });

  // Calculate totals
  var f$ = function(n){ return '$' + Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); };
  var sTotal = function(s){ return (s.total || (s.items||[]).reduce(function(a,i){return a+i.qty*i.unitPrice;},0)) - (s.discount||0); };

  var todayRevenue = todaySales.reduce(function(a,s){ return a + sTotal(s); }, 0);
  var monthRevenue = monthSales.reduce(function(a,s){ return a + sTotal(s); }, 0);
  var monthExpTotal = monthExp.reduce(function(a,e){ return a + (e.amount||0); }, 0);
  var totalCreditOwed = unpaidCredits.reduce(function(a,c){ return a + (c.balance||0); }, 0);

  // Top products by sales
  var prodSales = {};
  sales.forEach(function(s){
    (s.items||[]).forEach(function(i){
      prodSales[i.name] = (prodSales[i.name]||0) + i.qty * i.unitPrice;
    });
  });
  var topProducts = Object.entries(prodSales)
    .sort(function(a,b){ return b[1]-a[1]; })
    .slice(0,5)
    .map(function(e){ return { name: e[0], revenue: f$(e[1]) }; });

  return {
    businessName: b.name || 'Your business',
    businessType: b.type || 'Tile/Building Materials Store',
    location: b.location || '',
    currency: b.currency || 'USD',
    today: todayStr,
    currentMonth: monthStr,

    inventory: {
      totalProducts: products.length,
      lowStockItems: lowStock.map(function(p){ return { name: p.name, qty: p.qty, unit: p.unit, threshold: p.lowLevel||5 }; }),
      outOfStockItems: outOfStock.map(function(p){ return { name: p.name }; }),
      totalStockValue: f$(products.reduce(function(a,p){ return a + p.qty * (p.cost||p.price||0); }, 0)),
      allProducts: products.map(function(p){ return { name: p.name, qty: p.qty, unit: p.unit, price: f$(p.price), cost: f$(p.cost||0), category: p.category }; })
    },

    sales: {
      todayCount: todaySales.length,
      todayRevenue: f$(todayRevenue),
      monthCount: monthSales.length,
      monthRevenue: f$(monthRevenue),
      recentSales: sales.slice(0,10).map(function(s){ return { date: s.date, customer: s.customer||'Walk-in', total: f$(sTotal(s)), status: s.payStatus, items: (s.items||[]).length + ' items' }; })
    },

    expenses: {
      monthTotal: f$(monthExpTotal),
      monthProfit: f$(monthRevenue - monthExpTotal),
      recentExpenses: expenses.slice(0,10).map(function(e){ return { date: e.date, description: e.description, amount: f$(e.amount) }; })
    },

    credits: {
      totalOwed: f$(totalCreditOwed),
      debtors: unpaidCredits.map(function(c){ return { name: c.customerName||c.name, amount: f$(c.balance) }; })
    },

    topSellingProducts: topProducts,

    team: {
      totalMembers: (b.employees||[]).length,
      members: (b.employees||[]).map(function(e){ return { name: e.name, role: e.role }; })
    }
  };
}

// Send message to AI
async function sendAIMessage() {
  var input = document.getElementById('ai-input');
  var question = input ? input.value.trim() : '';
  if (!question || aiIsTyping) return;

  // Clear input
  input.value = '';
  if (input.style) input.style.height = 'auto';

  // Hide welcome screen
  var welcome = document.getElementById('ai-welcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message to UI
  appendAIMessage('user', question);

  // Show typing indicator
  aiIsTyping = true;
  var typingId = 'ai-typing-' + Date.now();
  appendAITyping(typingId);

  // Add to history
  aiConversationHistory.push({ role: 'user', content: question });

  try {
    var businessData = getBusinessDataForAI();
    var response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        businessData: businessData,
        conversationHistory: aiConversationHistory.slice(-10)
      })
    });

    var data = await response.json();
    removeAITyping(typingId);
    aiIsTyping = false;

    if (data.answer) {
      appendAIMessage('assistant', data.answer);
      aiConversationHistory.push({ role: 'assistant', content: data.answer });
      // Keep history manageable
      if (aiConversationHistory.length > 20) aiConversationHistory = aiConversationHistory.slice(-20);
    } else {
      appendAIMessage('assistant', '⚠️ ' + (data.error || 'Something went wrong. Please try again.'));
    }
  } catch(e) {
    removeAITyping(typingId);
    aiIsTyping = false;
    appendAIMessage('assistant', '⚠️ Could not connect to AI. Please check your internet and try again.');
  }

  scrollAIToBottom();
}

// Quick question from chip buttons
function askAIQuick(question) {
  var input = document.getElementById('ai-input');
  if (input) input.value = question;
  sendAIMessage();
}

// Append a message bubble to AI chat
function appendAIMessage(role, text) {
  var msgs = document.getElementById('chat-ai-msgs');
  if (!msgs) return;

  var isUser = role === 'user';
  var div = document.createElement('div');
  div.style.cssText = 'display:flex;' + (isUser ? 'justify-content:flex-end' : 'justify-content:flex-start') + ';margin-bottom:4px';

  // Format markdown-like text
  var formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)/gm, '<li style="margin-left:14px;margin-bottom:3px">$1</li>')
    .replace(/^• (.+)/gm, '<li style="margin-left:14px;margin-bottom:3px">$1</li>')
    .replace(/\n/g, '<br>');

  div.innerHTML = '<div style="max-width:85%;padding:11px 14px;border-radius:' +
    (isUser ? '14px 14px 4px 14px;background:linear-gradient(135deg,var(--g),var(--g2));color:#060810' :
               '14px 14px 14px 4px;background:var(--s2);border:1px solid var(--bd);color:var(--t1)') +
    ';font-size:13px;line-height:1.6">' +
    (isUser ? '' : '<div style="font-size:10px;font-weight:700;color:var(--g);margin-bottom:5px;letter-spacing:.05em">🤖 SMARTSTOCK AI</div>') +
    formatted + '</div>';

  msgs.appendChild(div);
  scrollAIToBottom();
}

// Typing indicator
function appendAITyping(id) {
  var msgs = document.getElementById('chat-ai-msgs');
  if (!msgs) return;
  var div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:4px';
  div.innerHTML = '<div style="padding:12px 16px;background:var(--s2);border:1px solid var(--bd);border-radius:14px 14px 14px 4px">' +
    '<div style="display:flex;gap:5px;align-items:center">' +
    '<span style="width:7px;height:7px;background:var(--g);border-radius:50%;animation:pulse 1s infinite"></span>' +
    '<span style="width:7px;height:7px;background:var(--g);border-radius:50%;animation:pulse 1s .2s infinite"></span>' +
    '<span style="width:7px;height:7px;background:var(--g);border-radius:50%;animation:pulse 1s .4s infinite"></span>' +
    '</div></div>';
  msgs.appendChild(div);
  scrollAIToBottom();
}

function removeAITyping(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

function scrollAIToBottom() {
  var msgs = document.getElementById('chat-ai-msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// Clear AI conversation
function clearAIChat() {
  aiConversationHistory = [];
  var msgs = document.getElementById('chat-ai-msgs');
  if (!msgs) return;
  msgs.innerHTML = '';
  // Re-add welcome
  var welcome = document.createElement('div');
  welcome.id = 'ai-welcome';
  welcome.style.cssText = 'text-align:center;padding:20px 10px';
  welcome.innerHTML = '<div style="font-size:40px;margin-bottom:10px">🤖</div>' +
    '<div style="font-family:var(--fd);font-size:18px;font-weight:800;color:var(--t1);margin-bottom:6px">SmartStock AI</div>' +
    '<div style="font-size:12px;color:var(--t3);line-height:1.7">Ask me anything about your business.</div>';
  msgs.appendChild(welcome);
}



// ── STOCKTAKE — direct quantity edit ──────────────────────
function openStocktake(prodId) {
  var b = biz(); if(!b) return;
  var p = (b.products||[]).find(function(x){ return x.id === prodId; });
  if(!p) return;

  var newQty = prompt(
    '📦 STOCKTAKE: ' + p.name + '\n\n' +
    'System quantity: ' + p.qty + ' ' + (p.unit||'') + '\n' +
    'Enter ACTUAL physical count:'
  );

  if (newQty === null) return; // cancelled
  var qty = parseFloat(newQty);
  if (isNaN(qty)) { toast('Invalid quantity', 'er'); return; }

  var diff = qty - p.qty;
  var oldQty = p.qty;
  p.qty = qty;

  // Track negative
  if(p.qty < 0 && oldQty >= 0) p.wentNegativeAt = Date.now();
  if(p.qty >= 0) p.wentNegativeAt = null;

  // Log the adjustment
  var b2 = biz();
  if(!b2.stockHistory) b2.stockHistory = [];
  b2.stockHistory.unshift({
    id: b2.nextHistId++,
    date: today(),
    type: 'ADJUST',
    prodName: p.name,
    qty: diff,
    by: CU ? CU.name : 'Unknown',
    ref: 'STKTK-' + Date.now(),
    notes: 'Stocktake · System: ' + oldQty + ' → Physical: ' + qty,
    ts: Date.now()
  });

  addAdminLog('stocktake', 'Stocktake · ' + p.name + ' · ' + oldQty + ' → ' + qty, CU ? CU.name : '');
  dbSave();
  renderProducts();
  renderDash();

  var msg = diff === 0
    ? '✅ ' + p.name + ': quantity confirmed at ' + qty
    : (diff > 0 ? '📈 ' : '📉 ') + p.name + ': adjusted ' + (diff > 0 ? '+' : '') + diff + ' (was ' + oldQty + ', now ' + qty + ')';
  toast(msg, 'gd');
}

// ── STOCK HISTORY VIEWER ──────────────────────────────────
function openStockHistory(prodId) {
  var b = biz(); if(!b) return;
  var p = (b.products||[]).find(function(x){ return x.id === prodId; });
  if(!p) return;

  var history = (b.stockHistory||[])
    .filter(function(h){ return h.prodName === p.name; })
    .slice(0, 30);

  if(!history.length) {
    toast('No stock history for ' + p.name, 'wa');
    return;
  }

  var rows = history.map(function(h) {
    var typeColor = h.type === 'IN' ? 'var(--ok)' : h.type === 'ADJUST' ? 'var(--wa)' : 'var(--er)';
    var typeLabel = h.type === 'IN' ? '▲ IN' : h.type === 'ADJUST' ? '⚖ ADJ' : h.type === 'SALE' ? '🛍 SALE' : '▼ OUT';
    var qtyStr = (h.qty > 0 ? '+' : '') + h.qty;
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bd);font-size:12px">' +
      '<span style="font-weight:800;color:' + typeColor + ';width:60px;flex-shrink:0">' + typeLabel + '</span>' +
      '<span style="font-family:var(--fm);font-weight:700;color:' + typeColor + ';width:50px;flex-shrink:0">' + qtyStr + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="color:var(--t2)">' + (h.notes||'') + '</div>' +
        '<div style="color:var(--t3);font-size:10px">' + h.date + ' · ' + (h.by||'') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Show in a simple overlay
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;padding:0';
  overlay.innerHTML =
    '<div style="width:100%;max-height:80vh;background:var(--s1);border-radius:18px 18px 0 0;overflow:hidden;display:flex;flex-direction:column">' +
      '<div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-family:var(--fd);font-size:16px;font-weight:900;color:var(--t1)">📋 Stock History</div>' +
          '<div style="font-size:11px;color:var(--t3)">' + p.name + ' · Last 30 movements</div>' +
        '</div>' +
        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:var(--s2);border:1px solid var(--bd);border-radius:99px;width:30px;height:30px;cursor:pointer;font-size:14px;color:var(--t2)">✕</button>' +
      '</div>' +
      '<div style="overflow-y:auto;flex:1">' + rows + '</div>' +
    '</div>';
  overlay.onclick = function(e){ if(e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ── LOW STOCK NOTIFICATION ─────────────────────────────────
function checkLowStockAlert() {
  var b = biz(); if(!b) return;
  var lowItems = (b.products||[]).filter(function(p){
    return p.status !== 'deleted' && p.qty <= (p.lowLevel||5);
  });
  var badge = el('low-stock-badge');
  if(badge) {
    badge.textContent = lowItems.length;
    badge.style.display = lowItems.length > 0 ? '' : 'none';
  }
  return lowItems;
}



// ═══════════════════════════════════════════════════════════════════
//  QUOTATION SYSTEM
// ═══════════════════════════════════════════════════════════════════

var quoteItems = [];
var editingQuoteId = null;

function openNewQuote() {
  editingQuoteId = null;
  quoteItems = [];
  sv('qt-cust',''); sv('qt-phone',''); sv('qt-disc','0'); sv('qt-terms','');
  sv('qt-date', today());
  el('qt-validity').value = '7';
  el('quote-drawer-title').textContent = 'New Quotation';
  el('quote-drawer-sub').textContent   = 'Fill in customer and products';
  renderQuoteItems();
  updateQuoteTotals();
  openD('d-quote');
  setTimeout(function(){ el('qt-cust') && el('qt-cust').focus(); }, 300);
}

function addQuoteItem() {
  var b = biz(); if(!b) return;
  var prods = (b.products||[]).filter(function(p){ return p.status !== 'deleted'; });
  if(!prods.length){ toast('Add products first','er'); return; }
  quoteItems.push({ prodId: prods[0].id, name: prods[0].name, qty: 1, unitPrice: prods[0].price||0, unit: prods[0].unit||'Box' });
  renderQuoteItems();
  updateQuoteTotals();
}

function removeQuoteItem(idx) {
  quoteItems.splice(idx, 1);
  renderQuoteItems();
  updateQuoteTotals();
}

function renderQuoteItems() {
  var b = biz(); if(!b) return;
  var prods = (b.products||[]).filter(function(p){ return p.status !== 'deleted'; });
  var cont = el('qt-items'); if(!cont) return;
  if(!quoteItems.length){
    cont.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:var(--t3)">No products yet — tap + Add Product</div>';
    return;
  }
  cont.innerHTML = quoteItems.map(function(item, idx){
    var opts = prods.map(function(p){
      return '<option value="'+p.id+'"'+(p.id===item.prodId?' selected':'')+'>'+esc(p.name)+'</option>';
    }).join('');
    return '<div style="padding:10px 13px;border-bottom:1px solid var(--bd);display:grid;gap:6px">'+
      '<div style="display:flex;gap:6px;align-items:center">'+
        '<select class="fi" style="flex:1;padding:7px 9px;font-size:12px" onchange="onQuoteProdChange('+idx+',this.value)">'+opts+'</select>'+
        '<button type="button" onclick="removeQuoteItem('+idx+')" style="background:var(--erb);border:none;border-radius:8px;padding:6px 9px;color:var(--er);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
        '<div><label style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase;font-weight:700">Qty ('+esc(item.unit)+')</label>'+
          '<input type="number" class="fi" style="padding:7px 9px;font-size:13px" value="'+item.qty+'" min="0.01" step="0.01"'+
          ' oninput="quoteItems['+idx+'].qty=parseFloat(this.value)||0;updateQuoteTotals()"></div>'+
        '<div><label style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase;font-weight:700">Unit Price ($)</label>'+
          '<input type="number" class="fi" style="padding:7px 9px;font-size:13px" value="'+item.unitPrice+'" min="0" step="0.01"'+
          ' oninput="quoteItems['+idx+'].unitPrice=parseFloat(this.value)||0;updateQuoteTotals()"></div>'+
      '</div>'+
      '<div style="text-align:right;font-size:12px;font-weight:700;color:var(--g)">Line total: '+f$(item.qty*item.unitPrice)+'</div>'+
    '</div>';
  }).join('');
}

function onQuoteProdChange(idx, prodId) {
  var b = biz(); if(!b) return;
  var p = (b.products||[]).find(function(x){ return x.id === parseInt(prodId); });
  if(p){
    quoteItems[idx].prodId    = p.id;
    quoteItems[idx].name      = p.name;
    quoteItems[idx].unitPrice = p.price || 0;
    quoteItems[idx].unit      = p.unit  || 'Box';
    renderQuoteItems();
    updateQuoteTotals();
  }
}

function updateQuoteTotals() {
  var sub  = quoteItems.reduce(function(a,i){ return a + i.qty * i.unitPrice; }, 0);
  var disc = parseFloat(el('qt-disc') ? el('qt-disc').value : 0) || 0;
  var tot  = Math.max(0, sub - disc);
  if(el('qt-subtotal')) el('qt-subtotal').textContent = f$(sub);
  if(el('qt-total'))    el('qt-total').textContent    = f$(tot);
}

function saveQuote(action) {
  var b = biz(); if(!b) return;
  var cust  = gv('qt-cust');
  var phone = gv('qt-phone');
  var date  = el('qt-date') ? el('qt-date').value : today();
  var valid = parseInt(el('qt-validity') ? el('qt-validity').value : 7);
  var disc  = parseFloat(gv('qt-disc')) || 0;
  var terms = gv('qt-terms');

  // No validation — save freely
  if(!cust) cust = 'Walk-in';

  var sub   = quoteItems.reduce(function(a,i){ return a + i.qty * i.unitPrice; }, 0);
  var total = Math.max(0, sub - disc);

  // Expiry date
  var expDate = new Date(date);
  expDate.setDate(expDate.getDate() + valid);
  var expStr  = expDate.toISOString().split('T')[0];

  var ref = 'QT-' + String(b.nextQuoteId||1).padStart(4,'0');

  var quote = {
    id:         b.nextQuoteId++,
    ref:        ref,
    date:       date,
    expiryDate: expStr,
    validDays:  valid,
    customer:   cust,
    phone:      phone,
    items:      quoteItems.map(function(i){ return { prodId:i.prodId, name:i.name, qty:i.qty, unitPrice:i.unitPrice, unit:i.unit }; }),
    subtotal:   sub,
    discount:   disc,
    total:      total,
    terms:      terms,
    status:     action === 'send' ? 'Sent' : 'Draft',
    createdAt:  Date.now(),
    createdBy:  CU ? CU.name : 'Unknown'
  };

  if(!b.quotations) b.quotations = [];
  b.quotations.unshift(quote);
  dbSave();
  closeD('d-quote');
  renderQuotes();
  toast(ref + ' saved' + (action==='send'?' — sending WhatsApp...':''), 'gd');

  if(action === 'send') {
    setTimeout(function(){ sendQuoteWhatsApp(quote); }, 500);
  }
}

function renderQuotes() {
  var b   = biz(); if(!b) return;
  var cont = el('quotes-list'); if(!cont) return;
  var quotes = (b.quotations||[]);

  if(!quotes.length){
    cont.innerHTML = '<div style="text-align:center;padding:40px 20px">'+
      '<div style="font-size:36px;margin-bottom:10px">📋</div>'+
      '<div style="font-size:14px;font-weight:700;color:var(--t2)">No quotations yet</div>'+
      '<div style="font-size:12px;color:var(--t3);margin-top:5px">Tap + New Quote to create one</div>'+
    '</div>';
    return;
  }

  var today_str = today();
  cont.innerHTML = quotes.map(function(q){
    var isExpired = q.status !== 'Converted' && q.status !== 'Cancelled' && q.expiryDate < today_str;
    var status    = isExpired ? 'Expired' : q.status;
    var stColor   = status==='Converted'?'var(--ok)': status==='Accepted'?'#3b82f6': status==='Rejected'||status==='Expired'||status==='Cancelled'?'var(--er)':'var(--wa)';
    return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:13px 14px;margin-bottom:9px;cursor:pointer" onclick="viewQuote('+q.id+')">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:800;color:var(--t1)">'+esc(q.customer)+'</div>'+
          '<div style="font-size:11px;color:var(--t3);font-family:var(--fm)">'+q.ref+' · '+q.date+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:13px;font-weight:800;color:var(--g)">'+f$(q.total)+'</div>'+
          '<div style="font-size:10px;font-weight:700;color:'+stColor+'">'+status+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--t3)">'+q.items.length+' product'+(q.items.length!==1?'s':'')+
        (status==='Draft'||status==='Sent'?' · Expires '+q.expiryDate:'')+
      '</div>'+
    '</div>';
  }).join('');
}

function viewQuote(id) {
  var b = biz(); if(!b) return;
  var q = (b.quotations||[]).find(function(x){ return x.id === id; });
  if(!q) return;

  var today_str = today();
  var isExpired = q.status !== 'Converted' && q.status !== 'Cancelled' && q.expiryDate < today_str;
  var status    = isExpired ? 'Expired' : q.status;

  el('qv-ref').textContent = q.ref;
  el('qv-status-sub').textContent = status + ' · ' + q.customer;

  var body = el('qv-body'); if(!body) return;
  body.innerHTML =
    '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:13px;margin-bottom:12px">'+
      '<div style="font-size:12px;color:var(--t3);margin-bottom:3px;font-family:var(--fm)">CUSTOMER</div>'+
      '<div style="font-size:14px;font-weight:700;color:var(--t1)">'+esc(q.customer)+'</div>'+
      (q.phone?'<div style="font-size:12px;color:var(--t3)">📱 '+esc(q.phone)+'</div>':'')+
      '<div style="font-size:11px;color:var(--t3);margin-top:6px">Quote date: '+q.date+' · Valid until: <strong style="color:'+(isExpired?'var(--er)':'var(--ok)')+'">'+q.expiryDate+'</strong></div>'+
    '</div>'+
    '<div style="margin-bottom:12px">'+
      q.items.map(function(i){
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px">'+
          '<div><div style="font-weight:600;color:var(--t1)">'+esc(i.name)+'</div>'+
          '<div style="font-size:11px;color:var(--t3)">'+i.qty+' '+esc(i.unit||'')+'  ×  '+f$(i.unitPrice)+'</div></div>'+
          '<div style="font-weight:700;color:var(--g)">'+f$(i.qty*i.unitPrice)+'</div>'+
        '</div>';
      }).join('')+
    '</div>'+
    (q.discount>0?'<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--t3);margin-bottom:5px"><span>Discount</span><span>-'+f$(q.discount)+'</span></div>':'')+
    '<div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;padding:10px 0;border-top:2px solid var(--bd)">'+
      '<span style="color:var(--t1)">TOTAL</span><span style="color:var(--g)">'+f$(q.total)+'</span>'+
    '</div>'+
    (q.terms?'<div style="background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:8px;padding:10px;margin-top:8px;font-size:11px;color:var(--t2);line-height:1.6"><strong>📝 Notes:</strong> '+esc(q.terms)+'</div>':'');

  // Action buttons based on status
  var actions = el('qv-actions'); if(!actions) return;
  var btnHtml = '';

  if(status === 'Draft' || status === 'Sent'){
    btnHtml +=
      '<button type="button" class="btn bgh" style="flex:1" onclick="sendQuoteWhatsApp((biz().quotations||[]).find(function(x){return x.id==='+id+'}))">📱 WhatsApp</button>'+
      '<button type="button" class="btn bgh" style="flex:1" onclick="printQuote('+id+')">🖨 Print</button>'+
      '<button type="button" class="btn bg" style="flex:2" onclick="convertQuoteToSale('+id+')">✅ Convert to Sale</button>';
  }
  if(status === 'Draft' || status === 'Sent'){
    btnHtml += '</div><div style="display:flex;gap:8px;margin-top:6px">'+
      '<button type="button" class="btn bgh" style="flex:1" onclick="updateQuoteStatus('+id+',\'Accepted\')">👍 Mark Accepted</button>'+
      '<button type="button" class="btn ber" style="flex:1" onclick="updateQuoteStatus('+id+',\'Rejected\')">👎 Mark Rejected</button>';
  }
  if(status === 'Accepted'){
    btnHtml += '<button type="button" class="btn bg" style="flex:1" onclick="convertQuoteToSale('+id+')">✅ Convert to Sale</button>';
  }
  actions.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap">'+btnHtml+'</div>';

  openD('d-quote-view');
}

function updateQuoteStatus(id, newStatus) {
  var b = biz(); if(!b) return;
  var q = (b.quotations||[]).find(function(x){ return x.id === id; });
  if(!q) return;
  q.status = newStatus;
  q.updatedAt = Date.now();
  dbSave();
  closeD('d-quote-view');
  renderQuotes();
  toast('Quote ' + q.ref + ' marked as ' + newStatus, 'gd');
}

function convertQuoteToSale(id) {
  var b = biz(); if(!b) return;
  var q = (b.quotations||[]).find(function(x){ return x.id === id; });
  if(!q) return;

  // Pre-fill the New Sale drawer with quote data
  cartItems = q.items.map(function(i){
    return { prodId:i.prodId, name:i.name, qty:i.qty, unitPrice:i.unitPrice, unit:i.unit||'Box', cost:0, maxQty:9999 };
  });

  sv('scust', q.customer);
  sv('scont', q.phone || '');
  sv('sdisc', q.discount || '0');
  currentPayMode = 'Cash';

  // Update drawer title
  var titleEl = document.querySelector('#d-sale .dtitle');
  var subEl   = document.querySelector('#d-sale .dsub');
  if(titleEl) titleEl.textContent = 'Sale from ' + q.ref;
  if(subEl)   subEl.textContent   = 'Quote converted · ' + q.customer;

  // Mark quote as converted
  q.status = 'Converted';
  q.convertedAt = Date.now();
  dbSave();

  closeD('d-quote-view');
  renderCart();
  renderQuickProdGrid();
  updateCart();
  openD('d-sale');
  toast('Quote ' + q.ref + ' ready to complete as a sale', 'gd');
}

function sendQuoteWhatsApp(q) {
  if(!q) return;
  var b   = biz(); if(!b) return;
  var biz_name = b.name || 'SmartStock Pro';
  var biz_phone= b.phone || '';
  var biz_addr = b.address || '';

  var items = q.items.map(function(i){
    return '  • ' + i.name + '\n    ' + i.qty + ' ' + (i.unit||'Box') + '  ×  ' + f$(i.unitPrice) + ' = *' + f$(i.qty*i.unitPrice) + '*';
  }).join('\n');

  var msg =
    '🏪 *' + biz_name.toUpperCase() + '*\n' +
    (biz_addr ? '📍 ' + biz_addr + '\n' : '') +
    (biz_phone ? '📞 ' + biz_phone + '\n' : '') +
    '━━━━━━━━━━━━━━━━\n' +
    '📋 *QUOTATION ' + q.ref + '*\n' +
    '📅 Date: ' + q.date + '\n' +
    '⏳ Valid Until: *' + q.expiryDate + '*\n' +
    '👤 Customer: *' + q.customer + '*\n' +
    '━━━━━━━━━━━━━━━━\n' +
    '*PRODUCTS:*\n' + items + '\n' +
    '━━━━━━━━━━━━━━━━\n' +
    (q.discount > 0 ? '🏷 Discount: -' + f$(q.discount) + '\n' : '') +
    '💰 *TOTAL: ' + f$(q.total) + '*\n' +
    '━━━━━━━━━━━━━━━━\n' +
    (q.terms ? '📝 *Notes:* ' + q.terms + '\n' + '━━━━━━━━━━━━━━━━\n' : '') +
    '_To accept this quote, please reply or call us._\n' +
    '_Powered by SmartStock Pro_';

  var phone = (q.phone || '').replace(/[\s\-\(\)]/g,'');
  if(phone && !phone.startsWith('+') && !phone.startsWith('00')){
    phone = phone.startsWith('0') ? '+231' + phone.slice(1) : '+231' + phone;
  }
  var url = phone
    ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg)
    : 'https://wa.me/?text=' + encodeURIComponent(msg);

  window.open(url, '_blank');

  // Update status to Sent
  if(q.status === 'Draft'){
    q.status = 'Sent';
    dbSave();
    renderQuotes();
  }
}

function printQuote(id) {
  var b = biz(); if(!b) return;
  var q = (b.quotations||[]).find(function(x){ return x.id === id; });
  if(!q) return;

  var biz_name  = b.name || 'SmartStock Pro';
  var biz_phone = b.phone || '';
  var biz_addr  = b.address || '';

  var itemRows = q.items.map(function(i){
    return '<tr>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee">'+i.name+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">'+i.qty+' '+i.unit+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">'+f$(i.unitPrice)+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">'+f$(i.qty*i.unitPrice)+'</td>'+
    '</tr>';
  }).join('');

  // Get business logo if available
  var biz_logo = b.logo || b.logoUrl || '';

  var w = window.open('','_blank','width=800,height=900');
  w.document.write('<!DOCTYPE html><html><head><title>'+q.ref+'</title>'+
  '<style>body{font-family:Arial,sans-serif;margin:0;padding:30px;color:#111;max-width:700px;margin:0 auto}'+
  'h1{font-size:24px;margin:0}'+
  'table{width:100%;border-collapse:collapse;margin:20px 0}'+
  'th{background:#f5f5f5;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em}'+
  'th.tr{text-align:right}.total-row{font-weight:700;font-size:16px}'+
  '.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700}'+
  '@media print{button{display:none}}</style></head><body>'+
  '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1d4ed8;margin-bottom:20px">'+
    '<div style="display:flex;align-items:center;gap:14px">'+
    (biz_logo ? '<img src="'+biz_logo+'" style="width:64px;height:64px;object-fit:contain;border-radius:8px">' : '')+
    '<div><h1 style="color:#1d4ed8">'+biz_name+'</h1>'+
    (biz_addr?'<div style="color:#666;margin-top:4px;font-size:13px">📍 '+biz_addr+'</div>':'')+
    (biz_phone?'<div style="color:#666;font-size:13px">📞 '+biz_phone+'</div>':'')+
    '</div></div>'+
    '<div style="text-align:right">'+
      '<div style="font-size:20px;font-weight:900;color:#1d4ed8">QUOTATION</div>'+
      '<div style="font-size:18px;font-weight:700">'+q.ref+'</div>'+
      '<div style="color:#666;font-size:13px">Date: '+q.date+'</div>'+
      '<div style="color:#e11d48;font-size:13px">Valid Until: '+q.expiryDate+'</div>'+
    '</div>'+
  '</div>'+
  '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:20px">'+
    '<div style="font-size:11px;color:#666;text-transform:uppercase;font-weight:700;margin-bottom:4px">Bill To</div>'+
    '<div style="font-size:16px;font-weight:700">'+q.customer+'</div>'+
    (q.phone?'<div style="color:#666">'+q.phone+'</div>':'')+
  '</div>'+
  '<table><thead><tr>'+
    '<th>Product</th><th>Qty</th><th class="tr">Unit Price</th><th class="tr">Total</th>'+
  '</tr></thead><tbody>'+itemRows+'</tbody></table>'+
  (q.discount>0?'<div style="text-align:right;font-size:14px;color:#666;margin-bottom:6px">Discount: -'+f$(q.discount)+'</div>':'')+
  '<div style="text-align:right;font-size:22px;font-weight:900;padding:12px 0;border-top:2px solid #111">TOTAL: '+f$(q.total)+'</div>'+
  (q.terms?'<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;margin-top:16px;font-size:12px;color:#1e40af"><strong>📝 Notes:</strong><br>'+q.terms+'</div>':'')+
  '<div style="text-align:center;margin-top:30px;font-size:11px;color:#999">Generated by SmartStock Pro</div>'+
  '<div style="text-align:center;margin-top:10px"><button onclick="window.print()" style="padding:10px 24px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print</button></div>'+
  '</body></html>');
  w.document.close();
}



function openQuotesPage() {
  renderQuotes();
  openD('d-quotes-page');
}


// ═══════════════════════════════════════════════════════════════════
//  WAREHOUSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

function openWarehousePage() {
  renderWarehouses();
  openD('d-warehouses');
}

function renderWarehouses() {
  var b = biz(); if(!b) return;
  var cont = el('wh-list'); if(!cont) return;
  var whs = b.warehouses || [];

  if(!whs.length) {
    cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3)">No warehouses yet</div>';
    return;
  }

  cont.innerHTML = whs.map(function(wh) {
    // Calculate total stock value in this warehouse
    var totalItems = 0;
    (b.products||[]).forEach(function(p) {
      if(p.warehouseStock && p.warehouseStock[wh.id]) totalItems += p.warehouseStock[wh.id];
    });
    return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:14px;margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:800;color:var(--t1)">🏭 ' + esc(wh.name) + (wh.isDefault?' <span style="font-size:10px;color:var(--g);font-weight:700">(Default)</span>':'') + '</div>' +
          (wh.location ? '<div style="font-size:12px;color:var(--t3);margin-top:3px">📍 ' + esc(wh.location) + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:18px;font-weight:900;color:var(--g)">' + totalItems + '</div>' +
          '<div style="font-size:10px;color:var(--t3)">total units</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd);display:flex;gap:7px">' +
        '<button type="button" class="btn bgh bsm" style="flex:1" onclick="viewWarehouseStock(' + wh.id + ')">📦 View Stock</button>' +
        (!wh.isDefault ? '<button type="button" class="btn ber bsm" style="flex:1" onclick="deleteWarehouse(' + wh.id + ')">🗑 Remove</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function openNewWarehouse() {
  sv('wh-name',''); sv('wh-location','');
  el('wh-form-title').textContent = 'Add Warehouse';
  openD('d-new-wh');
  setTimeout(function(){ el('wh-name') && el('wh-name').focus(); }, 300);
}

function saveWarehouse(_saveMode) {
  var b = biz(); if(!b) return;
  var name = gv('wh-name');
  if(!name) { toast('Warehouse name required','er'); return; }
  var wh = { id: b.nextWhId++, name: name, location: gv('wh-location'), isDefault: false, createdAt: Date.now() };
  if(!b.warehouses) b.warehouses = [];
  b.warehouses.push(wh);
  // Initialize stock for all existing products
  (b.products||[]).forEach(function(p) {
    if(!p.warehouseStock) p.warehouseStock = {};
    if(!p.warehouseStock[wh.id]) p.warehouseStock[wh.id] = 0;
  });
  dbSave();
  renderWarehouses();
  toast('Warehouse "' + name + '" added', 'gd');
  if(_saveMode==='addnew'){ setTimeout(function(){openNewWarehouse();},150); }
  else { closeD('d-new-wh'); }
}

function deleteWarehouse(id) {
  var b = biz(); if(!b) return;
  var wh = (b.warehouses||[]).find(function(x){ return x.id === id; });
  if(!wh) return;
  showConf('🗑','Remove Warehouse?','All stock in this warehouse will be removed. This cannot be undone.', function() {
    b.warehouses = (b.warehouses||[]).filter(function(x){ return x.id !== id; });
    (b.products||[]).forEach(function(p) { if(p.warehouseStock) delete p.warehouseStock[id]; });
    dbSave(); renderWarehouses(); toast('Warehouse removed','gd');
  });
}

function viewWarehouseStock(whId) {
  var b = biz(); if(!b) return;
  var wh = (b.warehouses||[]).find(function(x){ return x.id === whId; });
  if(!wh) return;
  var prods = (b.products||[]).filter(function(p){ return p.status !== 'deleted'; });
  var rows = prods.map(function(p) {
    var qty = (p.warehouseStock && p.warehouseStock[whId]) ? p.warehouseStock[whId] : 0;
    var color = qty <= 0 ? 'var(--er)' : qty <= (p.lowLevel||5) ? 'var(--wa)' : 'var(--ok)';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bd);font-size:13px">' +
      '<div style="font-weight:600;color:var(--t1)">' + esc(p.name) + '</div>' +
      '<div style="font-weight:800;color:' + color + '">' + qty + ' ' + (p.unit||'Box') + '</div>' +
    '</div>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.7);display:flex;align-items:flex-end';
  overlay.innerHTML = '<div style="width:100%;max-height:80vh;background:var(--s1);border-radius:18px 18px 0 0;overflow:hidden;display:flex;flex-direction:column">' +
    '<div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-family:var(--fd);font-size:16px;font-weight:900;color:var(--t1)">🏭 ' + esc(wh.name) + '</div>' +
      '<div style="font-size:11px;color:var(--t3)">Current stock levels</div></div>' +
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:var(--s2);border:1px solid var(--bd);border-radius:99px;width:30px;height:30px;cursor:pointer;font-size:14px;color:var(--t2)">✕</button>' +
    '</div>' +
    '<div style="overflow-y:auto;flex:1">' + (rows||'<div style="padding:20px;text-align:center;color:var(--t3)">No products</div>') + '</div>' +
  '</div>';
  overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════════
//  SUPPLIER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

var sInvItems = [];
var editingSuppId = null;

function openSuppliersPage() {
  renderSuppInvoices();
  renderSuppList();
  openD('d-suppliers');
}

function switchSuppTab(tab) {
  el('supp-tab-invoices').style.background  = tab==='invoices' ? 'var(--gd)' : 'transparent';
  el('supp-tab-invoices').style.color       = tab==='invoices' ? 'var(--g)'  : 'var(--t3)';
  el('supp-tab-invoices').style.borderBottomColor = tab==='invoices' ? 'var(--g)' : 'transparent';
  el('supp-tab-suppliers').style.background = tab==='suppliers' ? 'var(--gd)' : 'transparent';
  el('supp-tab-suppliers').style.color      = tab==='suppliers' ? 'var(--g)'  : 'var(--t3)';
  el('supp-tab-suppliers').style.borderBottomColor = tab==='suppliers' ? 'var(--g)' : 'transparent';
  el('supp-panel-invoices').style.display  = tab==='invoices'  ? '' : 'none';
  el('supp-panel-suppliers').style.display = tab==='suppliers' ? '' : 'none';
}

// ── Suppliers CRUD ─────────────────────────────────────────
function openNewSupplier(id) {
  var b = biz(); if(!b) return;
  editingSuppId = id || null;
  if(id) {
    var s = (b.suppliers||[]).find(function(x){ return x.id===id; });
    if(s){ sv('supp-name', s.name); sv('supp-phone', s.phone||''); }
    el('supp-form-title').textContent = 'Edit Supplier';
  } else {
    sv('supp-name',''); sv('supp-phone','');
    el('supp-form-title').textContent = 'Add Supplier';
  }
  openD('d-new-supplier');
  setTimeout(function(){ el('supp-name') && el('supp-name').focus(); }, 300);
}

function saveSupplier(_saveMode) {
  var b = biz(); if(!b) return;
  var name = gv('supp-name');
  if(!name){ toast('Supplier name required','er'); return; }
  if(editingSuppId) {
    var s = (b.suppliers||[]).find(function(x){ return x.id===editingSuppId; });
    if(s){ s.name=name; s.phone=gv('supp-phone'); }
  } else {
    if(!b.suppliers) b.suppliers=[];
    b.suppliers.push({ id:b.nextSuppId++, name:name, phone:gv('supp-phone'), totalOwed:0, createdAt:Date.now() });
  }
  dbSave(); renderSuppList();
  toast(editingSuppId ? 'Supplier updated' : 'Supplier added', 'gd');
  if(_saveMode==='addnew' && !editingSuppId){ setTimeout(function(){openNewSupplier();},150); }
  else { closeD('d-new-supplier'); }
}

function renderSuppList() {
  var b = biz(); if(!b) return;
  var cont = el('supp-list'); if(!cont) return;
  var supps = b.suppliers||[];
  if(!supps.length) {
    cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t3)"><div style="font-size:32px;margin-bottom:8px">🏭</div><div>No suppliers yet</div><div style="font-size:12px;margin-top:4px">Tap + Add Supplier</div></div>';
    return;
  }
  cont.innerHTML = supps.map(function(s) {
    var invCount = (b.suppInvoices||[]).filter(function(i){ return i.supplierId===s.id && i.status!=='Received'; }).length;
    return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--t1)">🏭 ' + esc(s.name) + '</div>' +
        (s.phone ? '<div style="font-size:12px;color:var(--t3)">📞 ' + esc(s.phone) + '</div>' : '') +
        (s.totalOwed>0 ? '<div style="font-size:12px;font-weight:700;color:var(--er);margin-top:3px">Owed: ' + f$(s.totalOwed) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">' +
        (invCount>0 ? '<span style="background:var(--erb);color:var(--er);font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">' + invCount + ' pending</span>' : '') +
        '<div style="display:flex;gap:5px">' +
          '<button type="button" class="btn bgh bsm" onclick="openNewSupplier(' + s.id + ')">✏️</button>' +
          '<button type="button" class="btn ber bsm" onclick="deleteSupplier(' + s.id + ')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function deleteSupplier(id) {
  var b = biz(); if(!b) return;
  showConf('🗑','Remove Supplier?','Supplier will be removed. Invoices will remain.', function(){
    b.suppliers=(b.suppliers||[]).filter(function(x){return x.id!==id;});
    dbSave(); renderSuppList(); toast('Supplier removed','gd');
  });
}

// ── Supplier Invoices ──────────────────────────────────────
function openNewSuppInvoice() {
  var b = biz(); if(!b) return;
  sInvItems = [];
  // Fill supplier dropdown
  var suppSel = el('sinv-suppid');
  if(suppSel) {
    var supps = b.suppliers||[];
    if(!supps.length){ toast('Add a supplier first','er'); switchSuppTab('suppliers'); return; }
    suppSel.innerHTML = supps.map(function(s){ return '<option value="'+s.id+'">'+esc(s.name)+'</option>'; }).join('');
  }
  // Fill warehouse dropdown
  var whSel = el('sinv-whid');
  if(whSel) {
    whSel.innerHTML = (b.warehouses||[]).map(function(w){ return '<option value="'+w.id+'"'+(w.isDefault?' selected':'')+'>'+esc(w.name)+'</option>'; }).join('');
  }
  sv('sinv-date', today());
  sv('sinv-expected',''); sv('sinv-ref',''); sv('sinv-paydue','');
  renderSInvItems();
  updateSInvTotal();
  openD('d-sinv-new');
}

function addSInvItem() {
  var b = biz(); if(!b) return;
  var prods = (b.products||[]).filter(function(p){ return p.status!=='deleted'; });
  if(!prods.length){ toast('Add products first','er'); return; }
  sInvItems.push({ prodId:prods[0].id, name:prods[0].name, qtyOrdered:1, unitCost:prods[0].cost||0, unit:prods[0].unit||'Box', qtyReceived:0, status:'Pending' });
  renderSInvItems();
  updateSInvTotal();
}

function renderSInvItems() {
  var b = biz(); if(!b) return;
  var prods = (b.products||[]).filter(function(p){ return p.status!=='deleted'; });
  var cont = el('sinv-items'); if(!cont) return;
  if(!sInvItems.length){
    cont.innerHTML='<div style="padding:14px;text-align:center;font-size:12px;color:var(--t3)">No items — tap + Add Item</div>';
    return;
  }
  cont.innerHTML = sInvItems.map(function(item,idx){
    var opts = prods.map(function(p){ return '<option value="'+p.id+'"'+(p.id===item.prodId?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('');
    return '<div style="padding:10px 13px;border-bottom:1px solid var(--bd);display:grid;gap:6px">' +
      '<div style="display:flex;gap:6px">' +
        '<select class="fi" style="flex:1;padding:7px 9px;font-size:12px" onchange="onSInvProdChange('+idx+',this.value)">'+opts+'</select>' +
        '<button type="button" onclick="sInvItems.splice('+idx+',1);renderSInvItems();updateSInvTotal()" style="background:var(--erb);border:none;border-radius:8px;padding:6px 9px;color:var(--er);cursor:pointer;flex-shrink:0">✕</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
        '<div><label style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase;font-weight:700">Qty ('+esc(item.unit)+')</label>' +
        '<input type="number" class="fi" style="padding:7px 9px;font-size:13px" value="'+item.qtyOrdered+'" min="0.01" step="0.01" oninput="sInvItems['+idx+'].qtyOrdered=parseFloat(this.value)||0;updateSInvTotal()"></div>' +
        '<div><label style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase;font-weight:700">Unit Cost ($)</label>' +
        '<input type="number" class="fi" style="padding:7px 9px;font-size:13px" value="'+item.unitCost+'" min="0" step="0.01" oninput="sInvItems['+idx+'].unitCost=parseFloat(this.value)||0;updateSInvTotal()"></div>' +
      '</div>' +
      '<div style="text-align:right;font-size:12px;font-weight:700;color:var(--g)">Line: '+f$(item.qtyOrdered*item.unitCost)+'</div>' +
    '</div>';
  }).join('');
}

function onSInvProdChange(idx, prodId) {
  var b=biz(); if(!b) return;
  var p=(b.products||[]).find(function(x){return x.id===parseInt(prodId);});
  if(p){sInvItems[idx].prodId=p.id;sInvItems[idx].name=p.name;sInvItems[idx].unitCost=p.cost||0;sInvItems[idx].unit=p.unit||'Box';renderSInvItems();updateSInvTotal();}
}

function updateSInvTotal() {
  var tot=sInvItems.reduce(function(a,i){return a+i.qtyOrdered*i.unitCost;},0);
  if(el('sinv-total'))el('sinv-total').textContent=f$(tot);
}

function saveSuppInvoice(_saveMode) {
  var b=biz();if(!b)return;
  var suppId=parseInt(el('sinv-suppid')?el('sinv-suppid').value:0);
  var whId=parseInt(el('sinv-whid')?el('sinv-whid').value:1);
  var date=el('sinv-date')?el('sinv-date').value:today();
  var expected=gv('sinv-expected');
  var ref=gv('sinv-ref');
  var paydue=gv('sinv-paydue');
  var total=sInvItems.reduce(function(a,i){return a+i.qtyOrdered*i.unitCost;},0);
  var inv={
    id:b.nextSInvId++,ref:'SINV-'+String(b.nextSInvId-1).padStart(4,'0'),
    supplierId:suppId,warehouseId:whId,date:date,expectedDate:expected,
    supplierRef:ref,paymentDueDate:paydue,
    status:'Open',
    items:sInvItems.map(function(i){return{prodId:i.prodId,name:i.name,qtyOrdered:i.qtyOrdered,qtyReceived:0,unitCost:i.unitCost,unit:i.unit,status:'Pending'};}),
    total:total,paid:0,
    createdAt:Date.now(),createdBy:CU?CU.name:'Unknown'
  };
  if(!b.suppInvoices)b.suppInvoices=[];
  b.suppInvoices.unshift(inv);
  // Add to supplier owed
  var supp=(b.suppliers||[]).find(function(s){return s.id===suppId;});
  if(supp)supp.totalOwed=(supp.totalOwed||0)+total;
  dbSave();renderSuppInvoices();
  toast(inv.ref+' created','gd');
  if(_saveMode==='addnew'){ setTimeout(function(){openNewSuppInvoice();},150); }
  else { closeD('d-sinv-new'); }
}

function renderSuppInvoices() {
  var b=biz();if(!b)return;
  var cont=el('sinv-list');if(!cont)return;
  var filter=el('sinv-filter')?el('sinv-filter').value:'';
  var invs=(b.suppInvoices||[]).filter(function(i){return !filter||i.status===filter;});
  if(!invs.length){
    cont.innerHTML='<div style="text-align:center;padding:30px;color:var(--t3)"><div style="font-size:32px;margin-bottom:8px">📋</div><div>No invoices yet</div></div>';
    return;
  }
  var stColor={'Open':'#3b82f6','In Transit':'var(--wa)','Received':'var(--ok)','Disputed':'var(--er)'};
  cont.innerHTML=invs.map(function(inv){
    var supp=(b.suppliers||[]).find(function(s){return s.id===inv.supplierId;});
    var wh=(b.warehouses||[]).find(function(w){return w.id===inv.warehouseId;});
    var pendingItems=inv.items.filter(function(i){return i.status!=='Received';}).length;
    var sc=stColor[inv.status]||'var(--t3)';
    return '<div style="background:var(--s2);border:1px solid var(--bd);border-left:3px solid '+sc+';border-radius:12px;padding:13px;margin-bottom:9px;cursor:pointer" onclick="viewSuppInvoice('+inv.id+')">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
        '<div><div style="font-size:13px;font-weight:800;color:var(--t1)">'+esc(inv.ref)+(inv.supplierRef?' · <span style="color:var(--t3);font-size:11px">'+esc(inv.supplierRef)+'</span>':'')+'</div>' +
        '<div style="font-size:11px;color:var(--t3)">'+esc(supp?supp.name:'Unknown Supplier')+' · '+inv.date+'</div></div>' +
        '<div style="text-align:right"><div style="font-size:13px;font-weight:800;color:var(--g)">'+f$(inv.total)+'</div>' +
        '<div style="font-size:10px;font-weight:700;color:'+sc+'">'+inv.status+'</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;font-size:11px;color:var(--t3)">' +
        '<span>🏭 '+(wh?esc(wh.name):'Warehouse')+'</span>' +
        (pendingItems>0?'<span style="color:var(--wa)">⏳ '+pendingItems+' item'+(pendingItems!==1?'s':'')+' pending</span>':'<span style="color:var(--ok)">✅ All received</span>')+
        (inv.paymentDueDate?'<span>💰 Due: '+inv.paymentDueDate+'</span>':'')+
      '</div>' +
    '</div>';
  }).join('');
}

function viewSuppInvoice(id) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===id;});
  if(!inv)return;
  var supp=(b.suppliers||[]).find(function(s){return s.id===inv.supplierId;});
  var wh=(b.warehouses||[]).find(function(w){return w.id===inv.warehouseId;});

  el('sinvd-ref').textContent=inv.ref;
  el('sinvd-sub').textContent=(supp?supp.name:'Supplier')+' · '+inv.status;

  var body=el('sinvd-body');if(!body)return;
  var stColor={'Open':'#3b82f6','In Transit':'var(--wa)','Received':'var(--ok)','Disputed':'var(--er)'};
  var sc=stColor[inv.status]||'var(--t3)';

  // Header info
  var info='<div style="padding:12px 14px;border-bottom:1px solid var(--bd);background:var(--s2)">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">' +
      '<div><span style="color:var(--t3)">Supplier: </span><strong>'+esc(supp?supp.name:'—')+'</strong></div>' +
      '<div><span style="color:var(--t3)">Warehouse: </span><strong>'+esc(wh?wh.name:'—')+'</strong></div>' +
      '<div><span style="color:var(--t3)">Date: </span><strong>'+inv.date+'</strong></div>' +
      (inv.expectedDate?'<div><span style="color:var(--t3)">Expected: </span><strong>'+inv.expectedDate+'</strong></div>':'')+
      (inv.paymentDueDate?'<div><span style="color:var(--t3)">Pay Due: </span><strong style="color:var(--er)">'+inv.paymentDueDate+'</strong></div>':'')+
      '<div><span style="color:var(--t3)">Status: </span><strong style="color:'+sc+'">'+inv.status+'</strong></div>' +
    '</div>' +
  '</div>';

  // Items with receive buttons
  var items=inv.items.map(function(item,idx){
    var isSt={'Pending':'var(--wa)','Partially Received':'#3b82f6','Received':'var(--ok)'};
    var ic=isSt[item.status]||'var(--t3)';
    var canReceive=item.status!=='Received';
    return '<div style="padding:11px 14px;border-bottom:1px solid var(--bd)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--t1)">'+esc(item.name)+'</div>' +
        '<div style="font-size:11px;color:var(--t3)">Ordered: '+item.qtyOrdered+' '+esc(item.unit||'')+'  ·  '+f$(item.unitCost)+' each</div>' +
        '<div style="font-size:11px;font-weight:700;color:'+ic+'">'+item.status+' · Received: '+item.qtyReceived+'/'+item.qtyOrdered+'</div></div>' +
        '<div style="font-weight:700;font-size:13px;color:var(--g)">'+f$(item.qtyOrdered*item.unitCost)+'</div>' +
      '</div>' +
      (canReceive?
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<input type="number" id="rcv-qty-'+idx+'" class="fi" style="width:80px;padding:6px 9px;font-size:13px" placeholder="Qty" min="0.01" max="'+(item.qtyOrdered-item.qtyReceived)+'" value="'+(item.qtyOrdered-item.qtyReceived)+'">' +
          '<button type="button" class="btn bok bsm" style="flex:1" onclick="receiveItem('+id+','+idx+')">✅ Mark Received</button>' +
        '</div>'
      :'')+
    '</div>';
  }).join('');

  body.innerHTML=info+items+
    '<div style="padding:12px 14px;display:flex;justify-content:space-between;font-size:15px;font-weight:900;background:var(--s2)">' +
      '<span>Total</span><span style="color:var(--g)">'+f$(inv.total)+'</span>' +
    '</div>'+
    (inv.paid>0?'<div style="padding:8px 14px;font-size:12px;color:var(--t2)">Paid: '+f$(inv.paid)+' · Remaining: '+f$(inv.total-inv.paid)+'</div>':'');

  // Actions
  var actions=el('sinvd-actions');if(!actions)return;
  var btns='';
  if(inv.status==='Open')
    btns+='<button type="button" class="btn bgh" style="flex:1" onclick="updateSInvStatus('+id+',\'In Transit\')">🚛 Mark In Transit</button>';
  if(inv.status==='In Transit'||inv.status==='Open')
    btns+='<button type="button" class="btn ber" style="flex:1" onclick="updateSInvStatus('+id+',\'Disputed\')">⚠ Dispute</button>';
  btns+='<button type="button" class="btn bgh" style="flex:1" onclick="confirmDeliveryWhatsApp('+id+')">📱 WhatsApp</button>';
  btns+='<button type="button" class="btn bgh" style="flex:1" onclick="printSuppInvoice('+id+')">🖨 Print</button>';
  if(inv.status!=='Received')
    btns+='<button type="button" class="btn bg" style="flex:1" onclick="recordSuppPayment('+id+')">💰 Record Payment</button>';
  actions.innerHTML='<div style="display:flex;gap:7px;flex-wrap:wrap">'+btns+'</div>';

  openD('d-sinv-detail');
}

function receiveItem(invId, itemIdx) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===invId;});
  if(!inv)return;
  var item=inv.items[itemIdx];if(!item)return;
  var qtyInput=el('rcv-qty-'+itemIdx);
  var qty=parseFloat(qtyInput?qtyInput.value:0)||0;
  if(qty<=0){toast('Enter quantity to receive','er');return;}
  var maxQty=item.qtyOrdered-item.qtyReceived;
  if(qty>maxQty)qty=maxQty;

  item.qtyReceived+=qty;
  item.status=item.qtyReceived>=item.qtyOrdered?'Received':'Partially Received';

  // Auto-update warehouse stock
  var wh=(b.warehouses||[]).find(function(w){return w.id===inv.warehouseId;});
  var prod=(b.products||[]).find(function(p){return p.id===item.prodId;});
  if(prod){
    if(!prod.warehouseStock)prod.warehouseStock={};
    if(!prod.warehouseStock[inv.warehouseId])prod.warehouseStock[inv.warehouseId]=0;
    prod.warehouseStock[inv.warehouseId]+=qty;
    prod.qty+=qty; // update total
    // Log to stock history
    if(!b.stockHistory)b.stockHistory=[];
    b.stockHistory.unshift({id:b.nextHistId++,date:today(),type:'IN',prodName:prod.name,qty:qty,by:CU?CU.name:'Staff',ref:inv.ref,notes:'Supplier delivery · '+(wh?wh.name:'Warehouse'),ts:Date.now()});
  }

  // Check if all items received
  var allReceived=inv.items.every(function(i){return i.status==='Received';});
  if(allReceived)inv.status='Received';
  else if(inv.items.some(function(i){return i.qtyReceived>0;}))inv.status='In Transit';

  dbSave();
  toast(qty+' '+esc(item.unit||'units')+' of '+esc(item.name)+' received into '+(wh?wh.name:'warehouse'),'gd');
  viewSuppInvoice(invId); // refresh view
  renderSuppInvoices();
  renderProducts();
  renderDash();
}

function updateSInvStatus(id, status) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===id;});
  if(!inv)return;
  inv.status=status;inv.updatedAt=Date.now();
  dbSave();closeD('d-sinv-detail');renderSuppInvoices();
  toast('Invoice '+inv.ref+' marked '+status,'gd');
}

function recordSuppPayment(id) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===id;});
  if(!inv)return;
  var remaining=inv.total-inv.paid;
  var amt=prompt('Record payment for '+inv.ref+'\nRemaining: '+f$(remaining)+'\n\nEnter amount paid:');
  if(!amt)return;
  var amount=parseFloat(amt)||0;
  if(amount<=0)return;
  inv.paid+=amount;
  // Update supplier owed
  var supp=(b.suppliers||[]).find(function(s){return s.id===inv.supplierId;});
  if(supp)supp.totalOwed=Math.max(0,(supp.totalOwed||0)-amount);
  dbSave();toast('Payment of '+f$(amount)+' recorded','gd');
  viewSuppInvoice(id);
  renderSuppList();
}

function confirmDeliveryWhatsApp(id) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===id;});
  if(!inv)return;
  var supp=(b.suppliers||[]).find(function(s){return s.id===inv.supplierId;});
  var wh=(b.warehouses||[]).find(function(w){return w.id===inv.warehouseId;});
  var bname=b.name||'SmartStock Pro';
  var receivedItems=inv.items.filter(function(i){return i.qtyReceived>0;});
  var pendingItems=inv.items.filter(function(i){return i.status!=='Received';});

  var msg=
    '🏪 *'+bname.toUpperCase()+'*\n'+
    '━━━━━━━━━━━━━━━━\n'+
    '✅ *DELIVERY CONFIRMATION*\n'+
    '📋 Invoice: *'+inv.ref+'*'+(inv.supplierRef?' ('+inv.supplierRef+')':'')+'\n'+
    '📅 Date: '+today()+'\n'+
    '🏭 Warehouse: '+(wh?wh.name:'Main')+'\n'+
    '━━━━━━━━━━━━━━━━\n'+
    '*Items Received:*\n'+
    receivedItems.map(function(i){return '  ✅ '+i.name+': '+i.qtyReceived+'/'+i.qtyOrdered+' '+i.unit;}).join('\n')+'\n'+
    (pendingItems.length?'\n*Still Pending:*\n'+pendingItems.map(function(i){return '  ⏳ '+i.name+': '+(i.qtyOrdered-i.qtyReceived)+' '+i.unit+' remaining';}).join('\n')+'\n':'')+
    '━━━━━━━━━━━━━━━━\n'+
    '_Thank you — '+bname+'_';

  var phone=(supp&&supp.phone?supp.phone:'').replace(/[\s\-\(\)]/g,'');
  if(phone&&!phone.startsWith('+')&&!phone.startsWith('00')){
    phone=phone.startsWith('0')?'+231'+phone.slice(1):'+231'+phone;
  }
  var url=phone?'https://wa.me/'+phone+'?text='+encodeURIComponent(msg):'https://wa.me/?text='+encodeURIComponent(msg);
  window.open(url,'_blank');
}

function printSuppInvoice(id) {
  var b=biz();if(!b)return;
  var inv=(b.suppInvoices||[]).find(function(x){return x.id===id;});
  if(!inv)return;
  var supp=(b.suppliers||[]).find(function(s){return s.id===inv.supplierId;});
  var wh=(b.warehouses||[]).find(function(w){return w.id===inv.warehouseId;});
  var bname=b.name||'SmartStock Pro';
  var stColor={'Open':'#3b82f6','In Transit':'#d97706','Received':'#16a34a','Disputed':'#dc2626'};

  var rows=inv.items.map(function(i){
    var ic=stColor[i.status]||'#666';
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">'+i.name+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">'+i.qtyOrdered+' '+i.unit+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">'+f$(i.unitCost)+'</td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:'+ic+'"><strong>'+i.status+'</strong><br><small>'+i.qtyReceived+'/'+i.qtyOrdered+' received</small></td>'+
      '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">'+f$(i.qtyOrdered*i.unitCost)+'</td></tr>';
  }).join('');

  var w=window.open('','_blank','width=900,height=800');
  w.document.write('<!DOCTYPE html><html><head><title>'+inv.ref+'</title>'+
  '<style>body{font-family:Arial,sans-serif;margin:0;padding:30px;color:#111;max-width:750px;margin:0 auto}'+
  'table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#f5f5f5;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase}'+
  'th.tr{text-align:right}@media print{button{display:none}}</style></head><body>'+
  '<div style="display:flex;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #7c3aed;margin-bottom:20px">'+
    '<div><h1 style="color:#7c3aed;margin:0">'+bname+'</h1></div>'+
    '<div style="text-align:right"><div style="font-size:20px;font-weight:900;color:#7c3aed">SUPPLIER INVOICE</div>'+
    '<div style="font-size:18px;font-weight:700">'+inv.ref+'</div>'+
    (inv.supplierRef?'<div style="color:#666;font-size:13px">Supplier Ref: '+inv.supplierRef+'</div>':'')+
    '<div style="color:#666;font-size:13px">Date: '+inv.date+'</div>'+
    '<div style="font-weight:700;color:'+(stColor[inv.status]||'#666')+'">'+inv.status+'</div></div>'+
  '</div>'+
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">'+
    '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px">'+
    '<div style="font-size:11px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Supplier</div>'+
    '<div style="font-size:15px;font-weight:700">'+(supp?supp.name:'—')+'</div>'+
    (supp&&supp.phone?'<div style="color:#666">'+supp.phone+'</div>':'')+
    '</div>'+
    '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px">'+
    '<div style="font-size:11px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Destination</div>'+
    '<div style="font-size:15px;font-weight:700">🏭 '+(wh?wh.name:'Main Warehouse')+'</div>'+
    (inv.expectedDate?'<div style="color:#666;font-size:12px">Expected: '+inv.expectedDate+'</div>':'')+
    (inv.paymentDueDate?'<div style="color:#dc2626;font-size:12px;font-weight:700">Payment Due: '+inv.paymentDueDate+'</div>':'')+
    '</div>'+
  '</div>'+
  '<table><thead><tr><th>Product</th><th>Qty</th><th class="tr">Unit Cost</th><th>Status</th><th class="tr">Total</th></tr></thead>'+
  '<tbody>'+rows+'</tbody></table>'+
  '<div style="text-align:right;font-size:22px;font-weight:900;padding:12px 0;border-top:2px solid #111">TOTAL: '+f$(inv.total)+'</div>'+
  (inv.paid>0?'<div style="text-align:right;color:#16a34a;font-weight:700">Paid: '+f$(inv.paid)+' · Remaining: '+f$(inv.total-inv.paid)+'</div>':'')+
  '<div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print</button></div>'+
  '</body></html>');
  w.document.close();
}



// ── Ask Admin reset request ───────────────────────────────
function sendResetRequest() {
  var un    = gv('fp-admin-user');
  var bname = gv('fp-admin-biz');
  var errEl = el('fp-err-admin');
  function showErr(msg){ if(errEl){errEl.textContent=msg;errEl.style.display='';} }
  if(!un)   { showErr('Enter your username'); return; }
  if(!bname){ showErr('Enter your business name'); return; }
  var matchedBiz = (DB.businesses||[]).find(function(b){
    return b.name && b.name.toLowerCase() === bname.toLowerCase();
  });
  if(!matchedBiz){ showErr('Business not found. Check the exact name.'); return; }
  var admins = (DB.users||[]).filter(function(u){
    return u.businessIds && u.businessIds.indexOf(matchedBiz.id)!==-1 &&
           (u.role==='primaryAdmin'||u.role==='admin');
  });
  if(!admins.length){ showErr('No admin found for this business.'); return; }
  admins.forEach(function(admin){
    if(!DB.notifications) DB.notifications=[];
    DB.notifications.unshift({
      id:Date.now(),type:'password_reset_request',
      message:un+' needs a password reset for '+matchedBiz.name,
      username:un,bizName:bname,for:admin.id,read:false,createdAt:Date.now()
    });
  });
  try{ dbSave(); }catch(e){}
  try{ if(typeof fbPush==='function') fbPush(); }catch(e){}
  if(errEl) errEl.style.display='none';
  toast('Reset request sent to your admin','gd');
  var panel=el('fp-panel-admin');
  if(panel){
    var ok=document.createElement('div');
    ok.style.cssText='background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:10px;font-size:12px;color:var(--ok);margin-top:10px;line-height:1.6';
    ok.innerHTML='✅ Request sent! Your admin will see it in their notifications and share a new temporary password with you.';
    panel.appendChild(ok);
  }
}



// ═══════════════════════════════════════════════════════════════════
//  ORDER FULFILLMENT & PARTIAL DELIVERY SYSTEM
// ═══════════════════════════════════════════════════════════════════

var _fulSaleId = null;  // current sale being fulfilled

// Fulfillment status colors
var FUL_COLORS = {
  'Pending':              '#6b7280',
  'Assigned':             '#3b82f6',
  'In Progress':          '#f59e0b',
  'Partially Fulfilled':  '#f97316',
  'Fulfilled':            '#10b981',
  'Completed':            '#059669',
  'Backordered':          '#dc2626'
};

// Open fulfillment form for a sale
function openFulfillment(saleId) {
  var b = biz(); if(!b) return;
  var s = (b.sales||[]).find(function(x){ return x.id === saleId; });
  if(!s) return;
  _fulSaleId = saleId;

  el('ful-inv-sub').textContent = s.inv + ' — ' + (s.customer||'Walk-in');
  el('ful-date').value = today();

  // Fill staff dropdown
  var staffSel = el('ful-staff');
  if(staffSel){
    var emps = (b.employees||[]).filter(function(e){ return e.status !== 'inactive'; });
    staffSel.innerHTML = '<option value="">— Unassigned —</option>' +
      emps.map(function(e){ return '<option value="'+esc(e.name)+'"'+(s.assignedStaff===e.name?' selected':'')+'>'+esc(e.name)+' ('+esc(e.role||'')+')</option>'; }).join('');
    if(s.assignedStaff) staffSel.value = s.assignedStaff;
  }
  sv('ful-notes','');

  // Order summary
  var totalOrdered = (s.items||[]).reduce(function(a,i){ return a+i.qty; }, 0);
  var totalFulfilled = getFulfilledQty(s);
  var pct = totalOrdered > 0 ? Math.round(totalFulfilled/totalOrdered*100) : 0;
  var stColor = FUL_COLORS[s.fulStatus||'Pending'];

  el('ful-order-summary').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">' +
      '<div style="text-align:center"><div style="font-size:10px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Ordered</div>'+
        '<div style="font-size:18px;font-weight:900;color:var(--t1)">'+totalOrdered+'</div></div>' +
      '<div style="text-align:center"><div style="font-size:10px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Delivered</div>'+
        '<div style="font-size:18px;font-weight:900;color:var(--ok)">'+totalFulfilled+'</div></div>' +
      '<div style="text-align:center"><div style="font-size:10px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Remaining</div>'+
        '<div style="font-size:18px;font-weight:900;color:var(--er)">'+(totalOrdered-totalFulfilled)+'</div></div>' +
    '</div>' +
    '<div style="background:rgba(255,255,255,.06);border-radius:99px;height:8px;overflow:hidden;margin-bottom:8px">'+
      '<div style="height:100%;background:linear-gradient(90deg,#059669,#10b981);width:'+pct+'%;border-radius:99px;transition:width .4s"></div>'+
    '</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:11px">' +
      '<span style="color:var(--t3)">'+pct+'% delivered</span>' +
      '<span style="font-weight:700;color:'+stColor+'">'+esc(s.fulStatus||'Pending')+'</span>' +
    '</div>';

  // Items list
  renderFulItems(s);
  renderFulPreview(s);
  openD('d-fulfil');
}

// Get total qty fulfilled so far for a sale
function getFulfilledQty(s) {
  var total = 0;
  (s.fulfillments||[]).forEach(function(f){
    (f.items||[]).forEach(function(i){ total += i.qtySupplied||0; });
  });
  return total;
}

// Get fulfilled qty for a specific product in a sale
function getFulfilledQtyForProd(s, prodId) {
  var qty = 0;
  (s.fulfillments||[]).forEach(function(f){
    (f.items||[]).forEach(function(i){ if(i.prodId===prodId) qty += i.qtySupplied||0; });
  });
  return qty;
}

// Render items in fulfillment form
function renderFulItems(s) {
  var cont = el('ful-items'); if(!cont) return;
  cont.innerHTML = (s.items||[]).map(function(item, idx){
    var fulfilled = getFulfilledQtyForProd(s, item.prodId);
    var remaining = Math.max(0, item.qty - fulfilled);
    var isDone    = remaining <= 0;
    var lineColor = isDone ? 'var(--ok)' : remaining < item.qty ? '#f97316' : 'var(--t2)';
    return '<div style="padding:11px 14px;border-bottom:1px solid var(--bd)'+(isDone?';opacity:.5':'')+'">'+
      '<div style="display:flex;justify-content:space-between;margin-bottom:7px">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:var(--t1)">'+esc(item.name)+'</div>'+
          '<div style="font-size:11px;color:var(--t3)">'+
            'Ordered: <strong>'+item.qty+'</strong> · '+
            'Delivered: <strong style="color:var(--ok)">'+fulfilled+'</strong> · '+
            'Remaining: <strong style="color:'+lineColor+'">'+remaining+'</strong>'+
          '</div>'+
        '</div>'+
        '<div style="font-size:12px;font-weight:700;color:var(--g)">'+f$(item.qty*item.unitPrice)+'</div>'+
      '</div>'+
      (isDone ?
        '<div style="font-size:11px;font-weight:700;color:var(--ok);padding:5px 8px;background:var(--ok-dim);border-radius:7px">✅ Fully Delivered</div>' :
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<label style="font-size:11px;color:var(--t3);white-space:nowrap;font-family:var(--fm)">QTY TO DELIVER</label>'+
          '<input type="number" id="ful-qty-'+idx+'" class="fi" style="padding:7px 10px;font-size:13px;font-weight:700;width:90px"'+
          ' value="'+remaining+'" min="0" max="'+remaining+'" step="0.01"'+
          ' oninput="renderFulPreview(null)">'+
          '<span style="font-size:11px;color:var(--t3);white-space:nowrap">of '+remaining+' remaining</span>'+
        '</div>'
      )+
    '</div>';
  }).join('');
}

// Fulfill all remaining items at once
function fulFillAll() {
  var b=biz();if(!b)return;
  var s=(b.sales||[]).find(function(x){return x.id===_fulSaleId;});
  if(!s)return;
  (s.items||[]).forEach(function(item,idx){
    var fulfilled=getFulfilledQtyForProd(s,item.prodId);
    var remaining=Math.max(0,item.qty-fulfilled);
    var input=el('ful-qty-'+idx);
    if(input) input.value=remaining;
  });
  renderFulPreview(null);
}

// Preview totals
function renderFulPreview(s) {
  if(!s){
    var b=biz();if(!b)return;
    s=(b.sales||[]).find(function(x){return x.id===_fulSaleId;});
  }
  if(!s)return;
  var totalNow=0;
  (s.items||[]).forEach(function(item,idx){
    var fulfilled=getFulfilledQtyForProd(s,item.prodId);
    var remaining=Math.max(0,item.qty-fulfilled);
    if(remaining<=0)return;
    var input=el('ful-qty-'+idx);
    var qty=parseFloat(input?input.value:0)||0;
    totalNow+=qty;
  });
  var prev=el('ful-preview');
  if(!prev)return;
  prev.innerHTML=
    '<div style="display:flex;justify-content:space-between;font-size:13px">'+
      '<span style="color:var(--t3)">Items to deliver this session</span>'+
      '<span style="font-weight:800;color:var(--ok)">'+totalNow+' units</span>'+
    '</div>';
}

// Save a fulfillment record
function saveFulfillment(_saveMode) {
  var b=biz();if(!b)return;
  var s=(b.sales||[]).find(function(x){return x.id===_fulSaleId;});
  if(!s)return;

  // Build items supplied this session
  var sessionItems=[];
  (s.items||[]).forEach(function(item,idx){
    var fulfilled=getFulfilledQtyForProd(s,item.prodId);
    var remaining=Math.max(0,item.qty-fulfilled);
    if(remaining<=0)return;
    var input=el('ful-qty-'+idx);
    var qty=parseFloat(input?input.value:0)||0;
    if(qty<=0)return;
    qty=Math.min(qty,remaining); // cap at remaining
    sessionItems.push({prodId:item.prodId,name:item.name,qtyOrdered:item.qty,qtySupplied:qty,unitPrice:item.unitPrice});
  });

  if(!sessionItems.length){toast('Enter quantity to deliver for at least one item','er');return;}

  var staff=el('ful-staff')?el('ful-staff').value:'';
  var date=el('ful-date')?el('ful-date').value:today();
  var notes=gv('ful-notes');
  var ref='FUL-'+s.inv+'-'+String((s.fulfillments||[]).length+1).padStart(2,'0');

  // Create fulfillment record
  var fulfillment={
    id:ref,
    date:date,
    staff:staff,
    notes:notes,
    items:sessionItems,
    totalSupplied:sessionItems.reduce(function(a,i){return a+i.qtySupplied;},0),
    createdAt:Date.now(),
    createdBy:CU?CU.name:'Unknown'
  };

  if(!s.fulfillments)s.fulfillments=[];
  s.fulfillments.push(fulfillment);
  if(staff)s.assignedStaff=staff;

  // Update assigned staff if changed
  if(staff)s.assignedStaff=staff;

  // Auto-calculate fulfillment status
  s.fulStatus=calcFulStatus(s);
  s.updatedAt=Date.now();

  addAdminLog('fulfillment','Delivered '+fulfillment.totalSupplied+' units for '+s.inv,CU?CU.name:'Staff');
  dbSave();
  renderSales();
  renderDash();

  toast(ref+' recorded — '+fulfillment.totalSupplied+' units delivered','gd');

  if(_saveMode==='addnew'){
    // Reset and reopen
    sv('ful-notes','');
    el('ful-date').value=today();
    renderFulItems(s);
    renderFulPreview(s);
    // Update summary
    openFulfillment(_fulSaleId);
  } else {
    closeD('d-fulfil');
  }
}

// Calculate overall fulfillment status based on items delivered
function calcFulStatus(s) {
  var items=s.items||[];
  if(!items.length)return 'Pending';
  var totalOrdered=items.reduce(function(a,i){return a+i.qty;},0);
  var totalFulfilled=getFulfilledQty(s);
  if(totalFulfilled<=0)return 'Pending';
  if(totalFulfilled>=totalOrdered){
    // All delivered — check payment
    return s.payStatus==='PAID'?'Completed':'Fulfilled';
  }
  // Check for backorder (product qty was 0 when sold)
  var hasBackorder=items.some(function(i){
    var b=biz();var p=(b.products||[]).find(function(x){return x.id===i.prodId;});
    return p&&p.qty<0;
  });
  return hasBackorder?'Backordered':'Partially Fulfilled';
}

// View fulfillment history for a sale
function viewFulfillmentHistory(saleId) {
  var b=biz();if(!b)return;
  var s=(b.sales||[]).find(function(x){return x.id===saleId;});
  if(!s)return;

  el('fulfil-hist-sub').textContent=s.inv+' — '+(s.customer||'Walk-in');

  var fuls=s.fulfillments||[];
  var totalOrdered=(s.items||[]).reduce(function(a,i){return a+i.qty;},0);
  var totalFulfilled=getFulfilledQty(s);
  var pct=totalOrdered>0?Math.round(totalFulfilled/totalOrdered*100):0;
  var stColor=FUL_COLORS[s.fulStatus||'Pending'];

  var html=
    // Progress header
    '<div style="padding:14px;background:var(--s2);border-bottom:1px solid var(--bd)">'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Ordered</div>'+
          '<div style="font-size:20px;font-weight:900;color:var(--t1)">'+totalOrdered+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Delivered</div>'+
          '<div style="font-size:20px;font-weight:900;color:var(--ok)">'+totalFulfilled+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--t3);font-family:var(--fm);text-transform:uppercase">Remaining</div>'+
          '<div style="font-size:20px;font-weight:900;color:var(--er)">'+(totalOrdered-totalFulfilled)+'</div></div>'+
      '</div>'+
      '<div style="background:rgba(255,255,255,.06);border-radius:99px;height:8px;overflow:hidden;margin-bottom:6px">'+
        '<div style="height:100%;background:linear-gradient(90deg,#059669,#10b981);width:'+pct+'%;border-radius:99px"></div>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;font-size:11px">'+
        '<span style="color:var(--t3)">'+pct+'% fulfilled</span>'+
        '<span style="font-weight:700;color:'+stColor+'">'+esc(s.fulStatus||'Pending')+'</span>'+
      '</div>'+
    '</div>'+

    // Item status table
    '<div style="padding:12px 14px;border-bottom:1px solid var(--bd)">'+
      '<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;font-family:var(--fm);margin-bottom:8px">Item Status</div>'+
      (s.items||[]).map(function(item){
        var ful=getFulfilledQtyForProd(s,item.prodId);
        var rem=Math.max(0,item.qty-ful);
        var isDone=rem<=0;
        var pct2=item.qty>0?Math.round(ful/item.qty*100):0;
        return '<div style="margin-bottom:10px">'+
          '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">'+
            '<span style="font-weight:600;color:var(--t1)">'+esc(item.name)+'</span>'+
            '<span style="color:var(--t3)">'+ful+'/'+item.qty+(isDone?' ✅':'')+'</span>'+
          '</div>'+
          '<div style="background:rgba(255,255,255,.06);border-radius:99px;height:5px;overflow:hidden">'+
            '<div style="height:100%;background:'+(isDone?'#059669':'#f97316')+';width:'+pct2+'%;border-radius:99px"></div>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';

    // Fulfillment sessions
    if(!fuls.length){
      html+='<div style="padding:24px;text-align:center;color:var(--t3)"><div style="font-size:28px;margin-bottom:8px">📦</div><div>No deliveries recorded yet</div></div>';
    } else {
      html+='<div style="padding:0">'+
        '<div style="padding:10px 14px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;font-family:var(--fm);border-bottom:1px solid var(--bd)">Delivery Sessions</div>'+
        fuls.map(function(f){
          return '<div style="padding:12px 14px;border-bottom:1px solid var(--bd)">'+
            '<div style="display:flex;justify-content:space-between;margin-bottom:6px">'+
              '<div>'+
                '<div style="font-size:12px;font-weight:800;color:var(--t1)">'+esc(f.id)+'</div>'+
                '<div style="font-size:11px;color:var(--t3)">'+f.date+(f.staff?' · 👤 '+esc(f.staff):'')+'</div>'+
              '</div>'+
              '<div style="font-size:13px;font-weight:800;color:var(--ok)">'+f.totalSupplied+' units</div>'+
            '</div>'+
            '<div style="display:flex;flex-wrap:wrap;gap:5px">'+
              (f.items||[]).map(function(i){
                return '<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);border-radius:6px;padding:3px 8px;font-size:11px;color:#10b981">'+
                  esc(i.name)+': +'+i.qtySupplied+
                '</span>';
              }).join('')+
            '</div>'+
            (f.notes?'<div style="font-size:11px;color:var(--t3);margin-top:5px">📝 '+esc(f.notes)+'</div>':'')+
          '</div>';
        }).join('')+
      '</div>';
    }
    html+='<div style="padding:12px 14px;border-top:1px solid var(--bd)">'+
      '<button type="button" class="btn bg bbl" onclick="openFulfillment('+saleId+');closeD(\'d-fulfil-hist\')" style="width:100%">📦 Record New Delivery</button>'+
    '</div>';

  el('fulfil-hist-body').innerHTML=html;
  openD('d-fulfil-hist');
}

// Get fulfillment badge HTML for sale cards
function getFulBadge(s) {
  var st = s.fulStatus || 'Pending';
  var color = FUL_COLORS[st] || '#6b7280';
  var bg = st==='Completed'?'rgba(5,150,105,.12)':st==='Fulfilled'?'rgba(16,185,129,.12)':st==='Partially Fulfilled'?'rgba(249,115,22,.12)':st==='Backordered'?'rgba(220,38,38,.12)':'rgba(107,114,128,.1)';
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;color:'+color+';background:'+bg+';border:1px solid '+color+'40">'+
    (st==='Completed'?'✅':st==='Fulfilled'?'📦':st==='Partially Fulfilled'?'🔶':st==='Backordered'?'⚠️':'⏳')+
    ' '+esc(st)+
  '</span>';
}



// ── Fulfillment dashboard summary ─────────────────────────
function renderFulfillmentSummary() {
  var b = biz(); if(!b) return;
  var sales = (b.sales||[]).filter(function(s){ return s.status !== 'deleted' && s.status !== 'cancelled'; });
  var pending    = sales.filter(function(s){ return !s.fulStatus || s.fulStatus==='Pending' || s.fulStatus==='Assigned'; }).length;
  var partial    = sales.filter(function(s){ return s.fulStatus==='Partially Fulfilled' || s.fulStatus==='In Progress'; }).length;
  var backordered= sales.filter(function(s){ return s.fulStatus==='Backordered'; }).length;
  var completed  = sales.filter(function(s){ return s.fulStatus==='Completed' || s.fulStatus==='Fulfilled'; }).length;

  // Update fulfillment stat card if it exists
  var pc = document.getElementById('ful-stat-pending');
  var pp = document.getElementById('ful-stat-partial');
  var pb = document.getElementById('ful-stat-back');
  if(pc) pc.textContent = pending;
  if(pp) pp.textContent = partial;
  if(pb) pb.textContent = backordered;
}

// ── Pending fulfillments report ────────────────────────────
function openPendingFulfillments() {
  var b = biz(); if(!b) return;
  var sales = (b.sales||[]).filter(function(s){
    return s.status !== 'deleted' &&
           s.fulStatus !== 'Completed' &&
           s.fulStatus !== 'Fulfilled';
  });

  var rows = sales.map(function(s){
    var totalOrdered   = (s.items||[]).reduce(function(a,i){return a+i.qty;},0);
    var totalFulfilled = getFulfilledQty(s);
    var remaining      = totalOrdered - totalFulfilled;
    var pct = totalOrdered>0?Math.round(totalFulfilled/totalOrdered*100):0;
    var stColor = FUL_COLORS[s.fulStatus||'Pending'];
    return '<div style="padding:12px 14px;border-bottom:1px solid var(--bd);cursor:pointer" onclick="viewFulfillmentHistory('+s.id+')">'+
      '<div style="display:flex;justify-content:space-between;margin-bottom:5px">'+
        '<div><div style="font-size:13px;font-weight:700;color:var(--t1)">'+esc(s.customer||'Walk-in')+'</div>'+
          '<div style="font-size:11px;color:var(--t3)">'+esc(s.inv)+' · '+s.date+(s.assignedStaff?' · 👤 '+esc(s.assignedStaff):'')+'</div></div>'+
        '<div style="text-align:right">'+
          '<span style="font-size:10px;font-weight:700;color:'+stColor+'">'+esc(s.fulStatus||'Pending')+'</span>'+
          '<div style="font-size:12px;color:var(--t3)">'+remaining+' units left</div>'+
        '</div>'+
      '</div>'+
      '<div style="background:rgba(255,255,255,.06);border-radius:99px;height:5px;overflow:hidden">'+
        '<div style="height:100%;background:linear-gradient(90deg,#059669,#10b981);width:'+pct+'%;border-radius:99px"></div>'+
      '</div>'+
    '</div>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,.7);display:flex;align-items:flex-end';
  overlay.innerHTML = '<div style="width:100%;max-height:85vh;background:var(--s1);border-radius:18px 18px 0 0;overflow:hidden;display:flex;flex-direction:column">'+
    '<div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-family:var(--fd);font-size:16px;font-weight:900;color:var(--t1)">📦 Pending Fulfillments</div>'+
        '<div style="font-size:11px;color:var(--t3)">'+sales.length+' orders need attention</div></div>'+
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:var(--s2);border:1px solid var(--bd);border-radius:99px;width:30px;height:30px;cursor:pointer;font-size:14px;color:var(--t2)">✕</button>'+
    '</div>'+
    '<div style="overflow-y:auto;flex:1">'+(rows||'<div style="padding:24px;text-align:center;color:var(--t3)">✅ All orders fulfilled!</div>')+'</div>'+
  '</div>';
  overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}



// ═══════════════════════════════════════════════════════════════════
//  ORDER FULFILLMENT & PARTIAL DELIVERY SYSTEM
// ═══════════════════════════════════════════════════════════════════

var _fulSaleId = null;  // current sale being fulfilled
var _fulItems  = [];    // items with their fulfillment quantities

// Fulfillment status colors
function fulColor(st) {
  return {'Pending':'var(--t3)','Assigned':'#3b82f6','In Progress':'var(--wa)',
          'Partially Fulfilled':'var(--wa)','Fulfilled':'var(--ok)',
          'Completed':'var(--ok)','Backordered':'var(--er)'}[st]||'var(--t3)';
}

// ── Open Fulfillment Drawer ────────────────────────────────
function openFulfillment(saleId) {
  var b = biz(); if(!b) return;
  var s = (b.sales||[]).find(function(x){ return x.id === saleId; });
  if(!s) return;

  _fulSaleId = saleId;

  // Build per-item fulfilled quantities
  _fulItems = (s.items||[]).map(function(item) {
    var totalSupplied = (s.fulfillments||[]).reduce(function(acc, f) {
      var fi = (f.items||[]).find(function(x){ return x.prodId === item.prodId; });
      return acc + (fi ? fi.qtySupplied : 0);
    }, 0);
    return {
      prodId:       item.prodId,
      name:         item.name,
      qtyOrdered:   item.qty,
      qtySupplied:  totalSupplied,
      qtyRemaining: Math.max(0, item.qty - totalSupplied),
      qtyThisRound: Math.max(0, item.qty - totalSupplied),  // default = all remaining
      unitPrice:    item.unitPrice,
      unit:         item.unit || 'Box'
    };
  });

  // Fill staff dropdown
  var staffSel = el('ful-staff');
  if(staffSel) {
    var staff = (b.employees||[]).filter(function(e){ return e.status !== 'deleted'; });
    staffSel.innerHTML = '<option value="">Select Staff Member</option>' +
      staff.map(function(e){ return '<option value="'+esc(e.name)+'"'+(s.assignedStaff===e.name?' selected':'')+'>'+esc(e.name)+'</option>'; }).join('');
    // Also allow owner
    staffSel.innerHTML += '<option value="Owner">Owner / Admin</option>';
  }

  el('ful-date').value = today();
  sv('ful-notes', '');

  // Update title
  el('ful-title').textContent = 'Fulfill Order — ' + esc(s.inv||'');
  el('ful-sub').textContent   = 'Customer: ' + esc(s.customer||'Walk-in') + ' · ' + (s.fulStatus||'Pending');

  renderFulItems();
  renderFulSummary(s);
  openD('d-fulfill');
}

function renderFulSummary(s) {
  var div = el('ful-summary'); if(!div) return;
  var tot = sTotal(s);
  var allSupplied = _fulItems.reduce(function(a,i){ return a + i.qtySupplied; }, 0);
  var allOrdered  = _fulItems.reduce(function(a,i){ return a + i.qtyOrdered; }, 0);
  var allRemain   = _fulItems.reduce(function(a,i){ return a + i.qtyRemaining; }, 0);
  var pct = allOrdered > 0 ? Math.round((allSupplied/allOrdered)*100) : 0;

  div.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:12px;font-weight:700;color:var(--t1)">Fulfillment Progress</span>' +
      '<span style="font-size:12px;font-weight:800;color:'+fulColor(s.fulStatus||'Pending')+'">'+
        (s.fulStatus||'Pending')+'</span>'+
    '</div>'+
    '<div style="height:8px;background:var(--bd);border-radius:4px;overflow:hidden;margin-bottom:8px">' +
      '<div style="height:100%;border-radius:4px;background:linear-gradient(90deg,#0891b2,#0e7490);width:'+pct+'%;transition:width .4s"></div>' +
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;text-align:center">' +
      '<div><div style="font-weight:800;font-size:16px;color:var(--ok)">'+allSupplied+'</div><div style="color:var(--t3)">Delivered</div></div>' +
      '<div><div style="font-weight:800;font-size:16px;color:var(--wa)">'+allRemain+'</div><div style="color:var(--t3)">Remaining</div></div>' +
      '<div><div style="font-weight:800;font-size:16px;color:var(--t1)">'+allOrdered+'</div><div style="color:var(--t3)">Total Ordered</div></div>' +
    '</div>';

  // Progress bar indicator
  var prog = el('ful-progress');
  if(prog) prog.textContent = pct + '% delivered · ' + _fulItems.length + ' products';
}

function renderFulItems() {
  var cont = el('ful-items'); if(!cont) return;
  if(!_fulItems.length) {
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3)">No items</div>';
    return;
  }
  cont.innerHTML = _fulItems.map(function(item, idx) {
    var remaining = item.qtyRemaining;
    var isFullyDone = remaining <= 0;
    var pct = item.qtyOrdered > 0 ? Math.round((item.qtySupplied/item.qtyOrdered)*100) : 0;
    var barColor = pct === 100 ? 'var(--ok)' : pct > 0 ? 'var(--wa)' : 'var(--er)';

    return '<div style="padding:11px 13px;border-bottom:1px solid var(--bd);'+(isFullyDone?'opacity:.5':'')+'">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:700;color:var(--t1)">'+esc(item.name)+'</div>'+
          '<div style="font-size:11px;color:var(--t3)">Ordered: <strong>'+item.qtyOrdered+'</strong> · Supplied: <strong style="color:var(--ok)">'+item.qtySupplied+'</strong> · Remaining: <strong style="color:'+(remaining>0?'var(--wa)':'var(--ok)')+'">'+remaining+'</strong></div>'+
          '<div style="height:4px;background:var(--bd);border-radius:2px;margin-top:5px;overflow:hidden">' +
            '<div style="height:100%;border-radius:2px;background:'+barColor+';width:'+pct+'%"></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      (isFullyDone ?
        '<div style="text-align:center;font-size:11px;font-weight:700;color:var(--ok);padding:4px">✅ Fully Delivered</div>' :
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<label style="font-size:11px;color:var(--t3);flex-shrink:0">Qty to deliver now:</label>' +
          '<input type="number" class="fi" style="width:90px;padding:6px 9px;font-size:13px;font-weight:700" ' +
            'id="ful-qty-'+idx+'" value="'+item.qtyThisRound+'" min="0" max="'+remaining+'" step="0.01" ' +
            'oninput="_fulItems['+idx+'].qtyThisRound=parseFloat(this.value)||0">'+
          '<span style="font-size:11px;color:var(--t3)">/ '+remaining+' remaining</span>'+
        '</div>'
      )+
    '</div>';
  }).join('');
}

// ── Save Fulfillment ──────────────────────────────────────
function saveFulfillment(_saveMode) {
  var b = biz(); if(!b) return;
  var s = (b.sales||[]).find(function(x){ return x.id === _fulSaleId; });
  if(!s) return;

  var staffName = el('ful-staff') ? el('ful-staff').value : '';
  var date      = el('ful-date') ? el('ful-date').value : today();
  var notes     = gv('ful-notes');

  // Validate at least one item has qty > 0
  var hasItems = _fulItems.some(function(i){ return i.qtyThisRound > 0; });
  if(!hasItems) { toast('Enter quantity to deliver for at least one item','er'); return; }

  // Build fulfillment record
  var fulRecord = {
    id:        Date.now(),
    date:      date,
    staffName: staffName,
    notes:     notes,
    createdBy: CU ? CU.name : 'Unknown',
    items: _fulItems
      .filter(function(i){ return i.qtyThisRound > 0; })
      .map(function(i) {
        return {
          prodId:       i.prodId,
          name:         i.name,
          qtyOrdered:   i.qtyOrdered,
          qtySupplied:  i.qtyThisRound,
          qtyRemaining: Math.max(0, i.qtyRemaining - i.qtyThisRound),
          unitPrice:    i.unitPrice
        };
      })
  };

  // Save to sale
  if(!s.fulfillments) s.fulfillments = [];
  s.fulfillments.push(fulRecord);

  // Update assigned staff
  if(staffName) s.assignedStaff = staffName;

  // Recalculate fulStatus
  var updatedItems = (s.items||[]).map(function(item) {
    var totalSup = (s.fulfillments||[]).reduce(function(acc, f) {
      var fi = (f.items||[]).find(function(x){ return x.prodId === item.prodId; });
      return acc + (fi ? fi.qtySupplied : 0);
    }, 0);
    return { qtyOrdered: item.qty, totalSupplied: totalSup };
  });

  var allFulfilled  = updatedItems.every(function(i){ return i.totalSupplied >= i.qtyOrdered; });
  var someFulfilled = updatedItems.some(function(i){ return i.totalSupplied > 0; });
  var payDue        = (s.due || 0) > 0;

  if(allFulfilled && !payDue)       s.fulStatus = 'Completed';
  else if(allFulfilled && payDue)   s.fulStatus = 'Fulfilled';
  else if(someFulfilled)            s.fulStatus = 'Partially Fulfilled';
  else if(staffName)                s.fulStatus = 'Assigned';
  else                              s.fulStatus = 'Pending';

  s.updatedAt = Date.now();

  // Stock history log
  if(!b.stockHistory) b.stockHistory = [];
  fulRecord.items.forEach(function(item) {
    b.stockHistory.unshift({
      id: b.nextHistId++, date: date, type: 'DELIVERY',
      prodName: item.name, qty: -item.qtySupplied,
      by: staffName||'Staff', ref: s.inv||'',
      notes: 'Delivered to ' + (s.customer||'customer') + (notes?' · '+notes:''),
      ts: Date.now()
    });
  });

  addAdminLog('fulfillment', 'Fulfillment · '+s.inv+' · '+s.fulStatus+' · '+( staffName||'Unassigned'), CU?CU.name:'System');
  dbSave();
  renderSales();
  renderDash();

  var itemCount = fulRecord.items.length;
  toast('✅ Delivery recorded — '+ s.fulStatus, 'gd');

  if(_saveMode === 'addnew') {
    // Reopen with reset for same order
    setTimeout(function(){ openFulfillment(_fulSaleId); }, 300);
  } else {
    closeD('d-fulfill');
    // Auto-show history
    setTimeout(function(){ viewFulfillmentHistory(_fulSaleId); }, 400);
  }
}

// ── Fulfillment History ────────────────────────────────────
function viewFulfillmentHistory(saleId) {
  var b = biz(); if(!b) return;
  var s = (b.sales||[]).find(function(x){ return x.id === saleId; });
  if(!s) return;

  el('fulh-title').textContent = 'Delivery History — ' + esc(s.inv||'');
  el('fulh-sub').textContent   = esc(s.customer||'Walk-in') + ' · Status: ' + (s.fulStatus||'Pending');

  // "New Delivery" button wires to openFulfillment
  var newBtn = el('ful-new-btn');
  if(newBtn) {
    newBtn.onclick = function(){ closeD('d-ful-history'); openFulfillment(saleId); };
    // Disable if fully completed
    newBtn.style.opacity = (s.fulStatus==='Completed') ? '.4' : '1';
    newBtn.disabled = (s.fulStatus==='Completed');
  }

  var body = el('fulh-body'); if(!body) return;
  var fuls = s.fulfillments||[];

  // Overall summary
  var allItems = (s.items||[]).map(function(item) {
    var totalSup = fuls.reduce(function(acc, f) {
      var fi = (f.items||[]).find(function(x){ return x.prodId === item.prodId; });
      return acc + (fi ? fi.qtySupplied : 0);
    }, 0);
    return { name: item.name, qtyOrdered: item.qty, totalSupplied: totalSup,
             qtyRemaining: Math.max(0, item.qty - totalSup) };
  });

  var allFulPct = allItems.length > 0
    ? Math.round((allItems.reduce(function(a,i){ return a + i.totalSupplied; }, 0) /
       allItems.reduce(function(a,i){ return a + i.qtyOrdered; }, 0)) * 100) : 0;

  var fc = fulColor(s.fulStatus||'Pending');

  var summary =
    '<div style="padding:12px 14px;background:var(--s2);border-bottom:1px solid var(--bd)">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
        '<span style="font-size:13px;font-weight:700">Overall Progress</span>' +
        '<span style="font-size:12px;font-weight:800;color:'+fc+'">'+(s.fulStatus||'Pending')+'</span>' +
      '</div>'+
      '<div style="height:8px;background:var(--bd);border-radius:4px;overflow:hidden;margin-bottom:10px">' +
        '<div style="height:100%;border-radius:4px;background:linear-gradient(90deg,#0891b2,#0e7490);width:'+allFulPct+'%"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px;text-align:center">' +
        allItems.map(function(i) {
          var pc = i.qtyOrdered > 0 ? Math.round((i.totalSupplied/i.qtyOrdered)*100) : 0;
          var ic = pc===100?'var(--ok)':pc>0?'var(--wa)':'var(--er)';
          return '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:6px">' +
            '<div style="font-weight:800;color:'+ic+';font-size:13px">'+i.totalSupplied+'/'+i.qtyOrdered+'</div>'+
            '<div style="color:var(--t3);font-size:10px;margin-top:1px">'+esc(i.name.slice(0,18))+'</div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>';

  var assigned = s.assignedStaff
    ? '<div style="padding:8px 14px;border-bottom:1px solid var(--bd);font-size:12px;color:var(--t2)">👤 Assigned to: <strong style="color:var(--t1)">'+esc(s.assignedStaff)+'</strong></div>'
    : '';

  // Fulfillment entries
  var entries = '';
  if(!fuls.length) {
    entries = '<div style="padding:24px;text-align:center;color:var(--t3)"><div style="font-size:28px;margin-bottom:8px">📦</div><div>No deliveries recorded yet</div></div>';
  } else {
    entries = fuls.map(function(f, idx) {
      var itemRows = (f.items||[]).map(function(i) {
        return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--bd)">' +
          '<span style="color:var(--t1)">'+esc(i.name)+'</span>'+
          '<span><strong style="color:var(--ok)">'+i.qtySupplied+' delivered</strong>'+
            (i.qtyRemaining>0?' · <span style="color:var(--wa)">'+i.qtyRemaining+' remaining</span>':'')+
          '</span>'+
        '</div>';
      }).join('');
      return '<div style="padding:12px 14px;border-bottom:2px solid var(--bd)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div>'+
            '<div style="font-size:13px;font-weight:800;color:var(--t1)">Delivery #'+(idx+1)+'</div>'+
            '<div style="font-size:11px;color:var(--t3)">📅 '+f.date+(f.staffName?' · 👤 '+esc(f.staffName):'')+' · By '+esc(f.createdBy||'')+' </div>'+
          '</div>'+
          '<span style="font-size:10px;background:rgba(8,145,178,.15);color:#0891b2;padding:3px 9px;border-radius:99px;font-weight:700">'+f.items.length+' item'+(f.items.length!==1?'s':'')+'</span>'+
        '</div>'+
        itemRows+
        (f.notes?'<div style="margin-top:6px;font-size:11px;color:var(--t3)">📝 '+esc(f.notes)+'</div>':'')+
      '</div>';
    }).join('');
  }

  body.innerHTML = summary + assigned + entries;
  openD('d-ful-history');
}

// ── Quick staff assign from receipt ─────────────────────────
function assignStaffToSale(saleId, staffName) {
  var b = biz(); if(!b) return;
  var s = (b.sales||[]).find(function(x){ return x.id === saleId; });
  if(!s) return;
  s.assignedStaff = staffName;
  if(s.fulStatus === 'Pending' && staffName) s.fulStatus = 'Assigned';
  dbSave();
  renderSales();
  toast('Assigned to '+staffName,'gd');
}


try { initTheme(); } catch(e) { console.warn('initTheme error:',e); }

try { dbLoad(); } catch(e) { console.warn('dbLoad error:',e); }
try { updateTopbar(); } catch(e) { console.warn('updateTopbar error:',e); }

// ═══════════════════════════════════════════════════════════
// AUTO-CONNECT FIREBASE SILENTLY
// If Firebase config is saved, connect on startup so all devices
// share data without anyone needing to touch the Sync menu
// ═══════════════════════════════════════════════════════════
(function autoConnectFirebase() {
  try {
    var raw = localStorage.getItem('ss_fb_config');
    if (!raw) {
      console.log('[Auto-FB] No saved config, skipping');
      return;
    }
    // Make sure fbInit exists
    if (typeof fbInit !== 'function') {
      console.log('[Auto-FB] fbInit not defined yet, retrying...');
      setTimeout(autoConnectFirebase, 800);
      return;
    }
    console.log('[Auto-FB] Connecting silently to Firebase...');
    fbInit();
  } catch(e) {
    console.warn('[Auto-FB] error:', e);
  }
})();

// ═══════════════════════════════════════════════════════════
// AUTO-LOGIN FROM SAVED SESSION
// If a previous session exists, log the user in automatically
// (stays logged in until they manually tap Sign Out)
// ═══════════════════════════════════════════════════════════
(function tryAutoLogin() {

  function showLogin() {
    // Remove instant-restore CSS so login shows normally
    var ir = document.getElementById('instant-restore-css');
    if (ir) ir.remove();
    var sp = document.getElementById('splash-restore');
    var sh = document.getElementById('shell');
    var lg = document.getElementById('login');
    if (sp) sp.style.display = 'none';
    if (sh) sh.style.display = 'none';
    if (lg) lg.style.display = 'flex';
  }

  function failRestore(reason) {
    console.warn('[Session] Restore failed:', reason);
    localStorage.removeItem('ss_session');
    showLogin();
  }

  function doRestore(user) {
    try {
      loginAs(user);
      // Hide splash if it was showing
      var sp = document.getElementById('splash-restore');
      if (sp) sp.style.display = 'none';
    } catch(e) {
      console.warn('[Session] loginAs error:', e);
      failRestore('Login error: ' + e.message);
    }
  }

  // ── Check session ──
  var raw, session;
  try {
    raw = localStorage.getItem('ss_session');
  } catch(e) { showLogin(); return; }

  if (!raw) { showLogin(); return; }

  try { session = JSON.parse(raw); } catch(e) { showLogin(); return; }
  if (!session || !session.uid) { showLogin(); return; }

  // ── Try to find user, retrying for Firebase sync ──
  var attempts = 0;
  var MAX = 40;  // 40 × 150ms = 6 seconds max

  function findUser() {
    attempts++;

    var user = (typeof DB !== 'undefined' && DB && DB.users || [])
      .find(function(u){ return u.id === session.uid; });

    if (user) {
      if (user.status === 'pending') { failRestore('Account pending'); return; }
      doRestore(user);
      return;
    }

    if (attempts < MAX) {
      setTimeout(findUser, 150);
    } else {
      failRestore('User not found in database');
    }
  }

  findUser();

})();



