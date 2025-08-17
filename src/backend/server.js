const express = require('express');
const { db } = require('../db/database');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Helper to generate unique IDs
const uid = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

// --- API Endpoints ---

// GET All Data (for initial load)
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
        res.status(500).json({ error: error.message });
    }
});

// --- Customers ---
app.post('/api/customers', (req, res) => {
    const { name, phone, nationalId, address, status, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const newCustomer = { id: uid('C'), name, phone, nationalId, address, status, notes };
        db.prepare('INSERT INTO customers (id, name, phone, nationalId, address, status, notes) VALUES (@id, @name, @phone, @nationalId, @address, @status, @notes)').run(newCustomer);
        res.status(201).json(newCustomer);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/customers/:id', (req, res) => {
    try {
        const contractCheck = db.prepare('SELECT id FROM contracts WHERE customerId = ?').get(req.params.id);
        if(contractCheck) return res.status(400).json({error: 'لا يمكن حذف العميل لوجود عقود مرتبطة به.'});

        const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
        if (info.changes > 0) res.json({ message: 'Customer deleted' });
        else res.status(404).json({ error: 'Customer not found' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- Units ---
app.post('/api/units', (req, res) => {
    const { name, floor, building, totalPrice, area, unitType, notes, partnerGroupId } = req.body;
    if(!name || !floor || !building || !totalPrice || !partnerGroupId) return res.status(400).json({ error: 'Incomplete unit data.' });

    const code = `${building.replace(/\s/g, '')}-${floor.replace(/\s/g, '')}-${name.replace(/\s/g, '')}`;
    const transaction = db.transaction(() => {
        if (db.prepare('SELECT id FROM units WHERE code = ?').get(code)) throw new Error('Unit with this code already exists.');
        const groupPartners = db.prepare('SELECT * FROM partnerGroupLinks WHERE groupId = ?').all(partnerGroupId);
        if (groupPartners.reduce((sum, p) => sum + p.percent, 0) !== 100) throw new Error('Partner group percentages do not sum to 100.');

        const newUnit = { id: uid('U'), code, name, status: 'متاحة', area, floor, building, notes, totalPrice, unitType };
        db.prepare('INSERT INTO units (id, code, name, status, area, floor, building, notes, totalPrice, unitType) VALUES (@id, @code, @name, @status, @area, @floor, @building, @notes, @totalPrice, @unitType)').run(newUnit);
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


// --- Contracts ---
app.post('/api/contracts', (req, res) => {
    const { unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start } = req.body;
    if (!unitId || !customerId || !totalPrice) return res.status(400).json({ error: 'Incomplete contract data' });

    const transaction = db.transaction(() => {
        db.prepare("UPDATE units SET status = 'مباعة' WHERE id = ?").run(unitId);
        const code = 'CTR-' + String(db.prepare('SELECT COUNT(*) as c FROM contracts').get().c + 1).padStart(5, '0');
        const newContract = { id: uid('CT'), code, unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start };
        db.prepare('INSERT INTO contracts (id, code, unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start) VALUES (@id, @code, @unitId, @customerId, @totalPrice, @downPayment, @discountAmount, @maintenanceDeposit, @brokerName, @brokerPercent, @brokerAmount, @commissionSafeId, @type, @count, @extraAnnual, @annualPaymentValue, @start)').run(newContract);

        if (downPayment > 0 && commissionSafeId) {
            db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(downPayment, commissionSafeId);
            const desc = `مقدم عقد للوحدة ${db.prepare('SELECT name FROM units WHERE id = ?').get(unitId).name}`;
            const customerName = (db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) || {}).name;
            db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', start, downPayment, commissionSafeId, desc, customerName, newContract.id);
        }

        const installmentBase = totalPrice - (maintenanceDeposit || 0);
        const totalAfterDown = installmentBase - (discountAmount || 0) - (downPayment || 0);
        const totalAnnualPayments = (extraAnnual || 0) * (annualPaymentValue || 0);
        const amountForRegularInstallments = totalAfterDown - totalAnnualPayments;
        const months = {'شهري': 1, 'ربع سنوي': 3, 'نصف سنوي': 6, 'سنوي': 12}[type] || 1;

        if (count > 0 && amountForRegularInstallments > 0) {
            const baseAmount = Math.floor((amountForRegularInstallments / count) * 100) / 100;
            let accumulatedAmount = 0;
            for(let i=0; i<count; i++){
              const d = new Date(start);
              d.setMonth(d.getMonth() + months * (i + 1));
              const amount = (i === count - 1) ? Math.round((amountForRegularInstallments - accumulatedAmount) * 100) / 100 : baseAmount;
              accumulatedAmount += amount;
              db.prepare('INSERT INTO installments (id, unitId, type, amount, originalAmount, dueDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid('I'), unitId, type, amount, amount, d.toISOString().slice(0,10), 'غير مدفوع');
            }
        }
        return newContract;
    });

    try { res.status(201).json(transaction()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/contracts/:id', (req, res) => {
    const transaction = db.transaction(() => {
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) throw new Error('Contract not found');

        db.prepare("UPDATE units SET status = 'متاحة' WHERE id = ?").run(contract.unitId);
        db.prepare('DELETE FROM installments WHERE unitId = ?').run(contract.unitId);
        // Also need to revert vouchers and safe balances, which adds complexity.
        // For now, a simple deletion.
        db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
        return { message: 'Contract and related data deleted' };
    });
    try { res.json(transaction()); }
    catch(e) { res.status(404).json({error: e.message}); }
});

// --- Installments ---
app.post('/api/installments/:id/pay', (req, res) => {
    const { amount, safeId, date } = req.body;
    const installmentId = req.params.id;
    if (!amount || !safeId || !date) return res.status(400).json({ error: 'Incomplete payment data' });

    const transaction = db.transaction(() => {
        const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(installmentId);
        if (!inst || inst.status === 'مدفوع') throw new Error('Installment not found or already paid.');

        const paidAmount = Math.min(amount, inst.amount);
        const newRemaining = inst.amount - paidAmount;
        const newStatus = newRemaining <= 0.005 ? 'مدفوع' : 'مدفوع جزئياً';

        db.prepare('UPDATE installments SET amount = ?, status = ?, paymentDate = ? WHERE id = ?').run(newRemaining, newStatus, date, installmentId);
        db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(paidAmount, safeId);

        const contract = db.prepare('SELECT customerId FROM contracts WHERE unitId = ?').get(inst.unitId);
        const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(contract.customerId);
        const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(inst.unitId);
        const desc = `سداد قسط للوحدة ${unit.name}`;
        db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', date, paidAmount, safeId, desc, customer.name, installmentId);
        return { message: 'Payment successful' };
    });

    try { res.status(201).json(transaction()); }
    catch (error) { res.status(400).json({ error: error.message }); }
});


module.exports = app;
