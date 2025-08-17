/* ===== Application Setup ===== */
let state = {};
const API_URL = 'http://localhost:3000';

// --- API Communication Layer ---
const api = {
    async get(endpoint) {
        const response = await fetch(`${API_URL}/api/${endpoint}`);
        if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
        return response.json();
    },
    async post(endpoint, data) {
        const response = await fetch(`${API_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'POST request failed');
        return response.json();
    },
    async delete(endpoint, id) {
        const response = await fetch(`${API_URL}/api/${endpoint}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error((await response.json()).error || 'DELETE request failed');
        return response.json();
    }
};

async function loadData() {
    try {
        return await api.get('alldata');
    } catch (error) {
        console.error("Could not load data from backend:", error);
        alert('فشل تحميل البيانات من السيرفر. قد تحتاج إلى إعادة تشغيل التطبيق.');
        return { customers:[], units:[], partners:[], unitPartners:[], contracts:[], installments:[], safes:[], vouchers:[], brokers:[], brokerDues:[], partnerGroups:[], partnerDebts:[], auditLog:[], transfers:[], settings:{theme:'dark',font:16}, locked:false };
    }
}

async function refreshStateAndRender(view = currentView, param = currentParam) {
    try {
        state = await loadData();
        nav(view, param);
    } catch (e) {
        console.error("Failed to refresh state:", e);
    }
}

// --- Generic Helpers ---
function today(){ return new Date().toISOString().slice(0,10); }
const fmt = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function egp(v){ v=Number(v||0); return isFinite(v)?fmt.format(v)+' ج.م':'' }
function parseNumber(v){ v=String(v||'').replace(/[^\d.]/g,''); return Number(v||0); }
function unitById(id){ return state.units.find(u=>u.id===id); }
function custById(id){ return state.customers.find(c=>c.id===id); }
function partnerById(id){ return state.partners.find(p=>p.id===id); }
function getUnitDisplayName(unit) {
    if (!unit) return '—';
    return `${unit.name || ''} (B:${unit.building || ''} F:${unit.floor || ''})`;
}

// --- UI Components ---
function table(headers, rows){
  const head = headers.map(h=>`<th>${h}</th>`).join('');
  const body = rows.length? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}"><small>لا توجد بيانات</small></td></tr>`;
  return `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// --- Navigation ---
let currentView = 'dash';
let currentParam = null;
const viewEl = document.getElementById('view');
const routes=[
  {id:'dash',title:'لوحة التحكم',render:renderDash, tab: true},
  {id:'customers',title:'العملاء',render:renderCustomers, tab: true},
  {id:'units',title:'الوحدات',render:renderUnits, tab: true},
  {id:'contracts',title:'العقود',render:renderContracts, tab: true},
  // Placeholders for other routes. They will be implemented as needed.
];
function nav(id, param = null){
  currentView = id;
  currentParam = param;
  const route = routes.find(x=>x.id===id);
  if(!route) return (viewEl.innerHTML = `<h2>Page not found: ${id}</h2>`);

  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const tab = document.getElementById('tab-'+id);
  if(tab) tab.classList.add('active');

  route.render(param);
}

// --- Render Functions ---

function renderDash() {
    const totalSales = state.contracts.reduce((sum, c) => sum + Number(c.totalPrice || 0), 0);
    const totalReceipts = state.vouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + v.amount, 0);

    viewEl.innerHTML = `
        <div class="grid grid-4">
            <div class="card"><h4>إجمالي المبيعات</h4><div class="big">${egp(totalSales)}</div></div>
            <div class="card"><h4>إجمالي المتحصلات</h4><div class="big">${egp(totalReceipts)}</div></div>
        </div>
    `;
}

function renderCustomers() {
    const rows = state.customers.map(c => [ c.name, c.phone, `<button class="btn secondary" onclick="window.actions.deleteCustomer('${c.id}')">حذف</button>` ]);
    viewEl.innerHTML = `
        <div class="card">
            <h3>إضافة عميل</h3>
            <input class="input" id="c-name" placeholder="اسم العميل">
            <input class="input" id="c-phone" placeholder="الهاتف" style="margin-top:8px;">
            <button class="btn" style="margin-top:8px;" onclick="window.actions.addCustomer()">حفظ</button>
        </div>
        <div class="card" style="margin-top:16px;">
            <h3>قائمة العملاء</h3>
            ${table(['الاسم', 'الهاتف', ''], rows)}
        </div>
    `;
}

function renderUnits() {
    const rows = state.units.map(u => [ u.code, u.status, egp(u.totalPrice), `<button class="btn secondary" onclick="window.actions.deleteUnit('${u.id}')">حذف</button>` ]);
     viewEl.innerHTML = `
        <div class="card">
            <h3>إضافة وحدة</h3>
            <input class="input" id="u-name" placeholder="اسم الوحدة">
            <input class="input" id="u-floor" placeholder="الدور">
            <input class="input" id="u-building" placeholder="البرج">
            <input class="input" id="u-total-price" placeholder="السعر" type="number">
            <select class="select" id="u-partner-group"><option value="">اختر مجموعة شركاء...</option>${state.partnerGroups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select>
            <button class="btn" style="margin-top:8px;" onclick="window.actions.addUnit()">حفظ</button>
        </div>
        <div class="card" style="margin-top:16px;">
            <h3>قائمة الوحدات</h3>
            ${table(['الكود', 'الحالة', 'السعر', ''], rows)}
        </div>
    `;
}

function renderContracts() {
    const rows = state.contracts.map(c => [ c.code, unitById(c.unitId)?.code, custById(c.customerId)?.name, egp(c.totalPrice), c.start ]);
    viewEl.innerHTML = `
        <div class="card">
            <h3>إضافة عقد</h3>
            <select class="select" id="ct-unit"><option value="">اختر وحدة متاحة...</option>${state.units.filter(u=>u.status==='متاحة').map(u=>`<option value="${u.id}">${u.code}</option>`).join('')}</select>
            <select class="select" id="ct-cust"><option value="">اختر العميل...</option>${state.customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
            <input class="input" id="ct-down" placeholder="المقدم" type="number">
            <input class="input" id="ct-count" placeholder="عدد الأقساط الشهرية" type="number">
            <input class="input" id="ct-start" type="date" value="${today()}">
            <button class="btn" style="margin-top:8px;" onclick="window.actions.createContract()">حفظ العقد</button>
        </div>
        <div class="card" style="margin-top:16px;">
            <h3>قائمة العقود</h3>
            ${table(['الكود', 'الوحدة', 'العميل', 'السعر', 'التاريخ'], rows)}
        </div>
    `;
}

// --- Actions exposed to the window ---
window.actions = {
    async addCustomer() {
        const name = document.getElementById('c-name').value.trim();
        const phone = document.getElementById('c-phone').value.trim();
        if (!name) return alert('الاسم مطلوب.');
        try {
            await api.post('customers', { name, phone });
            await refreshStateAndRender('customers');
        } catch (e) { alert(`خطأ: ${e.message}`); }
    },
    async deleteCustomer(id) {
        if (confirm('هل أنت متأكد؟')) {
            try {
                await api.delete('customers', id);
                await refreshStateAndRender('customers');
            } catch (e) { alert(`خطأ: ${e.message}`); }
        }
    },
    async addUnit() {
        const data = {
            name: document.getElementById('u-name').value.trim(),
            floor: document.getElementById('u-floor').value.trim(),
            building: document.getElementById('u-building').value.trim(),
            totalPrice: parseNumber(document.getElementById('u-total-price').value),
            partnerGroupId: document.getElementById('u-partner-group').value
        };
        if (!data.name || !data.totalPrice || !data.partnerGroupId) return alert('بيانات غير مكتملة');
        try {
            await api.post('units', data);
            await refreshStateAndRender('units');
        } catch (e) { alert(`خطأ: ${e.message}`); }
    },
    async deleteUnit(id) {
        if (confirm('هل أنت متأكد؟')) {
            try {
                await api.delete('units', id);
                await refreshStateAndRender('units');
            } catch (e) { alert(`خطأ: ${e.message}`); }
        }
    },
    async createContract() {
        const unitId = document.getElementById('ct-unit').value;
        const unit = unitById(unitId);
        const data = {
            unitId,
            customerId: document.getElementById('ct-cust').value,
            totalPrice: unit ? unit.totalPrice : 0,
            downPayment: parseNumber(document.getElementById('ct-down').value),
            count: parseInt(document.getElementById('ct-count').value || '0', 10),
            start: document.getElementById('ct-start').value,
            type: 'شهري'
        };
        if (!data.unitId || !data.customerId) return alert('بيانات غير مكتملة');
        try {
            await api.post('contracts', data);
            await refreshStateAndRender('contracts');
        } catch(e) { alert(`خطأ: ${e.message}`); }
    }
};


// --- App Initialization ---
async function main() {
    state = await loadData();

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

    nav('dash');
}

main();
