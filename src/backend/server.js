const express = require('express');
const { db } = require('../db/database');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Helper to generate unique IDs
const uid = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

// --- GET ALL DATA ---
app.get('/api/alldata', (req, res) => {
    try {
        const data = {};
        const tables = ['customers', 'units', 'partners', 'unitPartners', 'contracts', 'installments', 'safes', 'vouchers', 'brokers', 'brokerDues', 'partnerGroups', 'partnerDebts', 'auditLog', 'transfers'];
        tables.forEach(table => {
            data[table] = db.prepare(`SELECT * FROM ${table}`).all();
        });
        const links = db.prepare('SELECT * FROM partnerGroupLinks').all();
        data.partnerGroups.forEach(g => {
            g.partners = links.filter(l => l.groupId === g.id).map(l => ({ partnerId: l.partnerId, percent: l.percent }));
        });
        data.settings = { theme: 'dark', font: 16 };
        data.locked = false;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: `Failed to load all data: ${error.message}` });
    }
});

// --- GENERIC CRUD ---
function setupGenericRoutes(tableName, requiredFields = ['name']) {
    // GET all
    app.get(`/api/${tableName}`, (req, res) => {
        try {
            res.json(db.prepare(`SELECT * FROM ${tableName}`).all());
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // POST new
    app.post(`/api/${tableName}`, (req, res) => {
        for (const field of requiredFields) {
            if (!req.body[field]) return res.status(400).json({ error: `${field} is required` });
        }
        try {
            const columns = Object.keys(req.body);
            const values = Object.values(req.body);
            const id = uid(tableName.slice(0, 1).toUpperCase());

            const stmt = db.prepare(`INSERT INTO ${tableName} (id, ${columns.join(', ')}) VALUES (?, ${'?'.repeat(columns.length)})`);
            stmt.run(id, ...values);
            res.status(201).json({ id, ...req.body });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // DELETE
    app.delete(`/api/${tableName}/:id`, (req, res) => {
        try {
            const info = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
            if (info.changes > 0) res.json({ message: 'Deleted successfully' });
            else res.status(404).json({ error: 'Item not found' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // PUT (Update)
    app.put(`/api/${tableName}/:id`, (req, res) => {
        try {
            const columns = Object.keys(req.body).map(col => `${col} = ?`).join(', ');
            const values = Object.values(req.body);
            const stmt = db.prepare(`UPDATE ${tableName} SET ${columns} WHERE id = ?`);
            const info = stmt.run(...values, req.params.id);
            if (info.changes > 0) res.json({ message: 'Updated successfully' });
            else res.status(404).json({ error: 'Item not found' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
}
setupGenericRoutes('customers', ['name', 'phone']);
setupGenericRoutes('partners', ['name']);
setupGenericRoutes('brokers', ['name']);
setupGenericRoutes('safes', ['name']);
setupGenericRoutes('partnerGroups', ['name']);

// --- COMPLEX ROUTES ---

// UNITS
app.post('/api/units', (req, res) => {
    const { name, floor, building, totalPrice, partnerGroupId } = req.body;
    if(!name || !floor || !building || !totalPrice || !partnerGroupId) return res.status(400).json({ error: 'Incomplete unit data.' });
    const code = `${building.replace(/\s/g, '')}-${floor.replace(/\s/g, '')}-${name.replace(/\s/g, '')}`;
    const transaction = db.transaction(() => {
        if (db.prepare('SELECT id FROM units WHERE code = ?').get(code)) throw new Error('Unit with this code already exists.');
        const groupPartners = db.prepare('SELECT * FROM partnerGroupLinks WHERE groupId = ?').all(partnerGroupId);
        if (groupPartners.reduce((sum, p) => sum + p.percent, 0) !== 100) throw new Error('Partner group percentages do not sum to 100.');
        const newUnit = { id: uid('U'), code, ...req.body, status: 'متاحة' };
        const { id, ...unitData } = newUnit;
        const columns = Object.keys(unitData);
        db.prepare(`INSERT INTO units (id, ${columns.join(', ')}) VALUES (?, ${'?'.repeat(columns.length)})`).run(id, ...Object.values(unitData));
        const insertLink = db.prepare('INSERT INTO unitPartners (id, unitId, partnerId, percent) VALUES (?, ?, ?, ?)');
        groupPartners.forEach(p => { insertLink.run(uid('UP'), newUnit.id, p.partnerId, p.percent); });
        return newUnit;
    });
    try { res.status(201).json(transaction()); }
    catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/units/:id', (req, res) => {
    try {
        const contractCheck = db.prepare('SELECT id FROM contracts WHERE unitId = ?').get(req.params.id);
        if(contractCheck) return res.status(400).json({error: 'لا يمكن حذف هذه الوحدة لأنها مرتبطة بعقد قائم.'});
        const info = db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
        if (info.changes > 0) res.json({ message: 'Unit deleted' });
        else res.status(404).json({ error: 'Unit not found' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


// CONTRACTS
app.post('/api/contracts', (req, res) => {
    const { unitId, customerId, totalPrice, downPayment, start, count, type } = req.body;
    if (!unitId || !customerId || !totalPrice) return res.status(400).json({ error: 'Incomplete contract data' });

    const transaction = db.transaction(() => {
        db.prepare("UPDATE units SET status = 'مباعة' WHERE id = ?").run(unitId);
        const code = 'CTR-' + String(db.prepare('SELECT COUNT(*) as c FROM contracts').get().c + 1).padStart(5, '0');
        const newContract = { id: uid('CT'), code, ...req.body };
        const {id, ...contractData} = newContract;
        const columns = Object.keys(contractData);
        db.prepare(`INSERT INTO contracts (id, ${columns.join(', ')}) VALUES (?, ${'?'.repeat(columns.length)})`).run(id, ...Object.values(contractData));

        if (downPayment > 0) {
            const safeId = newContract.downPaymentSafeId || newContract.commissionSafeId;
            if(safeId) {
                db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(downPayment, safeId);
                const desc = `مقدم عقد للوحدة ${db.prepare('SELECT name FROM units WHERE id = ?').get(unitId).name}`;
                const customerName = (db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) || {}).name;
                db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', start, downPayment, safeId, desc, customerName, newContract.id);
            }
        }

        const remaining = totalPrice - (downPayment || 0) - (req.body.discountAmount || 0);
        const months = {'شهري': 1, 'ربع سنوي': 3, 'نصف سنوي': 6, 'سنوي': 12}[type] || 1;
        if (count > 0 && remaining > 0) {
            const installmentAmount = Math.round((remaining / count) * 100) / 100;
            for(let i=0; i<count; i++){
              const d = new Date(start);
              d.setMonth(d.getMonth() + months * (i + 1));
              db.prepare('INSERT INTO installments (id, unitId, type, amount, originalAmount, dueDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid('I'), unitId, type, installmentAmount, installmentAmount, d.toISOString().slice(0,10), 'غير مدفوع');
            }
        }
        return newContract;
    });
    try { res.status(201).json(transaction()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

// INSTALLMENTS
app.post('/api/installments/:id/pay', (req, res) => {
    const { amount, safeId, date } = req.body;
    if (!amount || !safeId || !date) return res.status(400).json({ error: 'Incomplete payment data' });
    const transaction = db.transaction(() => {
        const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(req.params.id);
        if (!inst || inst.status === 'مدفوع') throw new Error('Installment not found or already paid.');
        const paidAmount = Math.min(amount, inst.amount);
        const newRemaining = inst.amount - paidAmount;
        const newStatus = newRemaining <= 0.005 ? 'مدفوع' : 'مدفوع جزئياً';
        db.prepare('UPDATE installments SET amount = ?, status = ?, paymentDate = ? WHERE id = ?').run(newRemaining, newStatus, date, req.params.id);
        db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(paidAmount, safeId);
        const contract = db.prepare('SELECT customerId FROM contracts WHERE unitId = ?').get(inst.unitId);
        const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(contract.customerId);
        const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(inst.unitId);
        const desc = `سداد قسط للوحدة ${unit.name}`;
        db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', date, paidAmount, safeId, desc, customer.name, req.params.id);
        return { message: 'Payment successful' };
    });
    try { res.status(201).json(transaction()); }
    catch (error) { res.status(400).json({ error: error.message }); }
});


module.exports = app;
