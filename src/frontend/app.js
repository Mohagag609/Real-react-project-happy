/* ===== Application Setup ===== */
let state = {};
const API_URL = 'http://localhost:3000';

async function loadData() {
    try {
        const response = await fetch(`${API_URL}/api/alldata`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Could not load data from backend:", error);
        alert('فشل تحميل البيانات من السيرفر. قد تحتاج إلى إعادة تشغيل التطبيق.');
        // Return a default empty state to prevent crashing
        return { customers:[], units:[], partners:[], unitPartners:[], contracts:[], installments:[], safes:[], vouchers:[], brokers:[], brokerDues:[], partnerGroups:[], partnerDebts:[], auditLog:[], transfers:[], settings:{theme:'dark',font:16}, locked:false };
    }
}

function today(){ return new Date().toISOString().slice(0,10); }
const fmt = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function egp(v){ v=Number(v||0); return isFinite(v)?fmt.format(v)+' ج.م':'' }
function parseNumber(v){ v=String(v||'').replace(/[^\d.]/g,''); return Number(v||0); }

function applySettings(){
    if (!state.settings) return;
    document.documentElement.setAttribute('data-theme', state.settings.theme||'dark');
    document.documentElement.style.fontSize=(state.settings.font||16)+'px';
}

/* ===== Navigation ===== */
let currentView = 'dash';
let currentParam = null;

const routes=[
  {id:'dash',title:'لوحة التحكم',render:renderDash, tab: true},
  {id:'customers',title:'العملاء',render:renderCustomers, tab: true},
  {id:'units',title:'الوحدات',render:renderUnits, tab: true},
  {id:'contracts',title:'العقود',render:renderContracts, tab: true},
  {id:'brokers',title:'السماسرة',render:renderBrokers, tab: true},
  {id:'installments',title:'الأقساط',render:renderInstallments, tab: true},
  {id:'vouchers',title:'السندات',render:renderVouchers, tab: true},
  {id:'partners',title:'الشركاء',render:renderPartners, tab: true},
  {id:'treasury',title:'الخزينة',render:renderTreasury, tab: true},
  {id:'reports',title:'التقارير',render:renderReports, tab: true},
  {id:'audit', title: 'سجل التغييرات', render: renderAuditLog, tab: true},
  {id:'backup',title:'نسخة احتياطية',render:renderBackup, tab: true},
  {id:'unit-details', title:'تفاصيل الوحدة', render:renderUnitDetails, tab: false},
  {id:'partner-group-details', title:'تفاصيل مجموعة الشركاء', render:renderPartnerGroupDetails, tab: false},
  {id: 'broker-details', title: 'تفاصيل السمسار', render: renderBrokerDetails, tab: false},
  {id: 'partner-details', title: 'تفاصيل الشريك', render: renderPartnerDetails, tab: false},
  {id: 'customer-details', title: 'تفاصيل العميل', render: renderCustomerDetails, tab: false},
  {id: 'unit-edit', title: 'تعديل الوحدة', render: renderUnitEdit, tab: false},
];

function nav(id, param = null){
  currentView = id;
  currentParam = param;
  const route = routes.find(x=>x.id===id);
  if(!route) return;

  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const tab = document.getElementById('tab-'+id);
  if(tab) tab.classList.add('active');

  route.render(param);
}

/* ===== Generic Helper Functions ===== */
function unitById(id){ return state.units.find(u=>u.id===id); }
function custById(id){ return state.customers.find(c=>c.id===id); }
function partnerById(id){ return state.partners.find(p=>p.id===id); }
function brokerById(id){ return state.brokers.find(b=>b.id===id); }
function unitCode(id){ return (unitById(id)||{}).code||'—'; }
function getUnitDisplayName(unit) {
    if (!unit) return '—';
    return `${unit.name || ''} (B:${unit.building || ''} F:${unit.floor || ''})`;
}

async function refreshStateAndRender(view = currentView, param = currentParam) {
    state = await loadData();
    nav(view, param);
}

/* ===== Generic UI Components ===== */
function showModal(title, content, onSave) {
    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
    modal.innerHTML = `
        <div style="background:var(--panel);padding:20px;border-radius:12px;width:90%;max-width:500px;">
            <h3>${title}</h3>
            <div>${content}</div>
            <div class="tools" style="margin-top:20px;justify-content:flex-end;">
                <button class="btn secondary" id="modal-cancel">إلغاء</button>
                <button class="btn" id="modal-save">حفظ</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('modal-cancel').onclick = () => document.body.removeChild(modal);
    document.getElementById('modal-save').onclick = async () => {
        if (await onSave()) {
            document.body.removeChild(modal);
        }
    };
}

function table(headers, rows, sortKey=null, onSort=null){
  const head = headers.map((h,i)=>`<th data-idx="${i}">${h}${sortKey&&sortKey.idx===i?(sortKey.dir==='asc'?' ▲':' ▼'):''}</th>`).join('');
  const body = rows.length? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}"><small>لا توجد بيانات</small></td></tr>`;
  const html = `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const wrap=document.createElement('div'); wrap.innerHTML=html;
  if(onSort){
    wrap.querySelectorAll('th').forEach(th=> th.onclick=()=>{
      const idx=Number(th.dataset.idx); const dir = sortKey && sortKey.idx===idx && sortKey.dir==='asc' ? 'desc' : 'asc';
      onSort({idx,dir});
    });
  }
  return wrap.innerHTML;
}

/* ===== Customers ===== */
function renderCustomers(){
  let sort={idx:0,dir:'asc'};
  function draw(){
    const q=(document.getElementById('c-q')?.value || '').trim().toLowerCase();
    let list=state.customers.slice();
    if(q) {
      list=list.filter(c=> `${c.name||''} ${c.phone||''}`.toLowerCase().includes(q));
    }
    list.sort((a,b)=> (a.name+'').localeCompare(b.name+'') * (sort.dir==='asc'?1:-1));
    const rows=list.map(c=>[
      `<a href="#" onclick="nav('customer-details', '${c.id}'); return false;">${c.name||''}</a>`,
      c.phone||'',
      c.nationalId||'',
      c.status||'نشط',
      `<button class="btn secondary" onclick="delRow('customers','${c.id}')">حذف</button>`
    ]);
    document.getElementById('c-list').innerHTML=table(['الاسم','الهاتف','الرقم القومي','الحالة',''], rows, sort, ns=>{sort=ns;draw();});
  }

  view.innerHTML=`
    <div class="card"><h3>إضافة عميل</h3>
        <input class="input" id="c-name" placeholder="اسم العميل">
        <input class="input" id="c-phone" placeholder="الهاتف">
        <button class="btn" onclick="addCustomer()">حفظ</button>
    </div>
    <div class="card"><h3>العملاء</h3>
      <input class="input" id="c-q" placeholder="بحث..." oninput="draw()">
      <div id="c-list"></div>
    </div>`;
  draw();
}

async function addCustomer() {
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    if(!name) return alert('الاسم مطلوب.');

    try {
        const response = await fetch(`${API_URL}/api/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        await refreshStateAndRender('customers');
        alert('تم إضافة العميل بنجاح');
    } catch (error) {
        alert(`فشل إضافة العميل: ${error.message}`);
    }
}

async function delRow(collection, id) {
    const item = state[collection]?.find(i => i.id === id);
    if (!item) return;
    if (confirm(`هل أنت متأكد من حذف هذا العنصر؟`)) {
        try {
            const response = await fetch(`${API_URL}/api/${collection}/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).error);
            await refreshStateAndRender();
            alert('تم الحذف بنجاح');
        } catch (error) {
            alert(`فشل الحذف: ${error.message}`);
        }
    }
}

/* ===== Units ===== */
function calcRemaining(u){
  const ct = state.contracts.find(c => c.unitId === u.id);
  if (!ct) return 0;
  const totalOwed = (ct.totalPrice || 0) - (ct.discountAmount || 0);
  const installmentIds = new Set(state.installments.filter(i => i.unitId === u.id).map(i => i.id));
  const totalPaid = state.vouchers
      .filter(v => v.type === 'receipt' && (v.linked_ref === ct.id || installmentIds.has(v.linked_ref)))
      .reduce((sum, v) => sum + v.amount, 0);
  return Math.max(0, totalOwed - totalPaid);
}

function renderUnits(){
  function draw(){
    const rows=state.units.map(u=> {
      const partners = state.unitPartners.filter(up => up.unitId === u.id)
          .map(up => `${(partnerById(up.partnerId) || {}).name} (${up.percent}%)`).join(', ');
      return [ u.name, u.floor, u.building, partners, egp(u.totalPrice), egp(calcRemaining(u)), u.status,
        `<button class="btn" onclick="nav('unit-details', '${u.id}')">إدارة</button>
         <button class="btn secondary" onclick="delRow('units', '${u.id}')">حذف</button>`];
    });
    document.getElementById('u-list').innerHTML= table(['اسم الوحدة','الدور','البرج','الشركاء','السعر','المتبقي','الحالة','إجراءات'], rows);
  }

  view.innerHTML=`
    <div class="card"><h3>إضافة وحدة</h3>
        <input class="input" id="u-name" placeholder="اسم الوحدة">
        <input class="input" id="u-floor" placeholder="الدور">
        <input class="input" id="u-building" placeholder="البرج/العمارة">
        <input class="input" id="u-total-price" placeholder="السعر" type="number">
        <select class="select" id="u-partner-group"><option value="">اختر مجموعة شركاء...</option>${state.partnerGroups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select>
        <button class="btn" onclick="addUnit()">حفظ</button>
    </div>
    <div class="card"><h3>قائمة الوحدات</h3><div id="u-list"></div></div>`;
  draw();
}

async function addUnit() {
    const unitData = {
        name: document.getElementById('u-name').value.trim(),
        floor: document.getElementById('u-floor').value.trim(),
        building: document.getElementById('u-building').value.trim(),
        totalPrice: parseNumber(document.getElementById('u-total-price').value),
        partnerGroupId: document.getElementById('u-partner-group').value
    };
    if(!unitData.name || !unitData.totalPrice || !unitData.partnerGroupId) return alert('بيانات غير مكتملة');
    try {
        const response = await fetch(`${API_URL}/api/units`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(unitData)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        const newUnit = await response.json();
        await refreshStateAndRender('unit-details', newUnit.id);
        alert('تمت إضافة الوحدة بنجاح');
    } catch(e) {
        alert(`فشل إضافة الوحدة: ${e.message}`);
    }
}

/* ===== Contracts ===== */
function renderContracts(){
  const rows = state.contracts.map(c=> [
      c.code, getUnitDisplayName(unitById(c.unitId)), (custById(c.customerId)||{}).name||'—',
      egp(c.totalPrice), c.start,
      `<button class="btn" onclick="openContractDetails('${c.id}')">عرض</button>
       <button class="btn secondary" onclick="delRow('contracts', '${c.id}')">حذف</button>`
  ]);
  view.innerHTML = `<div class="card"><h3>إضافة عقد</h3>
    <select class="select" id="ct-unit"><option value="">اختر وحدة متاحة...</option>${state.units.filter(u=>u.status==='متاحة').map(u=>`<option value="${u.id}">${u.code}</option>`).join('')}</select>
    <select class="select" id="ct-cust"><option value="">اختر العميل...</option>${state.customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
    <input class="input" id="ct-down" placeholder="المقدم" type="number">
    <input class="input" id="ct-count" placeholder="عدد الأقساط الشهرية" type="number">
    <input class="input" id="ct-start" type="date" value="${today()}">
    <button class="btn" onclick="createContract()">حفظ العقد وتوليد الأقساط</button>
    </div>
    <div class="card"><h3>العقود</h3>${table(['كود','وحدة','عميل','سعر','تاريخ',''],rows)}</div>`;
}

async function createContract() {
    const unitId = document.getElementById('ct-unit').value;
    const unit = unitById(unitId);
    const contractData = {
        unitId, customerId: document.getElementById('ct-cust').value,
        totalPrice: unit ? unit.totalPrice : 0,
        downPayment: parseNumber(document.getElementById('ct-down').value),
        count: parseInt(document.getElementById('ct-count').value || '0', 10),
        start: document.getElementById('ct-start').value,
        type: 'شهري' // Simplified for this refactor
    };
    if (!contractData.unitId || !contractData.customerId) return alert('بيانات غير مكتملة');
    try {
        const response = await fetch(`${API_URL}/api/contracts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractData)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        await refreshStateAndRender('contracts');
        alert('تم إنشاء العقد بنجاح');
    } catch(e) {
        alert(`فشل إنشاء العقد: ${e.message}`);
    }
}

/* ===== Installments ===== */
function renderInstallments(){
    const rows = state.installments.map(i => [
        getUnitDisplayName(unitById(i.unitId)), egp(i.amount), i.dueDate, i.status,
        i.status !== 'مدفوع' ? `<button class="btn ok" onclick="payInstallment('${i.id}')">دفع</button>` : 'تم الدفع'
    ]);
    view.innerHTML = `<div class="card"><h3>الأقساط</h3>${table(['وحدة','مبلغ','استحقاق','حالة',''],rows)}</div>`;
}

async function payInstallment(id) {
    const inst = state.installments.find(i => i.id === id);
    if (!inst) return;
    const amount = parseNumber(prompt('أدخل المبلغ المدفوع:', inst.amount));
    if (!amount || amount <= 0) return;
    const safeOptions = state.safes.map(s => `${s.id}: ${s.name}`).join('\n');
    const safeId = prompt(`اختر خزنة:\n${safeOptions}`)?.split(':')[0];
    if (!safeId) return;

    try {
        const response = await fetch(`${API_URL}/api/installments/${id}/pay`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, safeId, date: today() })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        await refreshStateAndRender('installments');
        alert('تم تسجيل الدفعة بنجاح');
    } catch(e) {
        alert(`فشل تسجيل الدفعة: ${e.message}`);
    }
}

// Other render functions would go here...
function renderDash(){ view.innerHTML = `<h1>لوحة التحكم</h1><p>مرحباً بك في النسخة الجديدة من البرنامج.</p>`; }
function renderBrokers(){ view.innerHTML = `<h1>السماسرة</h1>`; }
function renderVouchers(){ view.innerHTML = `<h1>السندات</h1>`; }
function renderPartners(){ view.innerHTML = `<h1>الشركاء</h1>`; }
function renderTreasury(){ view.innerHTML = `<h1>الخزينة</h1>`; }
function renderReports(){ view.innerHTML = `<h1>التقارير</h1>`; }
function renderAuditLog(){ view.innerHTML = `<h1>سجل التغييرات</h1>`; }
function renderBackup(){ view.innerHTML = `<h1>النسخ الاحتياطي</h1>`; }
function renderUnitDetails(id){ view.innerHTML = `<h1>تفاصيل الوحدة: ${id}</h1>`; }
function renderPartnerGroupDetails(id){ view.innerHTML = `<h1>تفاصيل مجموعة الشركاء: ${id}</h1>`; }
function renderBrokerDetails(id){ view.innerHTML = `<h1>تفاصيل السمسار: ${id}</h1>`; }
function renderPartnerDetails(id){ view.innerHTML = `<h1>تفاصيل الشريك: ${id}</h1>`; }
function renderCustomerDetails(id){ view.innerHTML = `<h1>تفاصيل العميل: ${id}</h1>`; }
function renderUnitEdit(id){ view.innerHTML = `<h1>تعديل الوحدة: ${id}</h1>`; }
function openContractDetails(id){ view.innerHTML = `<h1>تفاصيل العقد: ${id}</h1>`; }


/* ===== App Initialization ===== */
async function main() {
    state = await loadData();
    applySettings();

    // Setup static event listeners
    document.getElementById('themeSel').onchange = (e) => {
        state.settings.theme = e.target.value;
        applySettings();
        // Maybe add a call to save settings to the backend here in the future
    };
    document.getElementById('fontSel').onchange = (e) => {
        state.settings.font = Number(e.target.value);
        applySettings();
    };

    // Setup navigation tabs
    const tabsContainer = document.getElementById('tabs');
    routes.forEach(r => {
        if (r.tab) {
            const b = document.createElement('button');
            b.className = 'tab';
            b.id = 'tab-' + r.id;
            b.textContent = r.title;
            b.onclick = () => nav(r.id);
            tabsContainer.appendChild(b);
        }
    });

    nav('dash'); // Navigate to initial view
}

main();
