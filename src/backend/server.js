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

        // Handle nested partner group data
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


// Generic GET all for a table
const setupGetall = (tableName) => {
    app.get(`/api/${tableName}`, (req, res) => {
        try {
            const items = db.prepare(`SELECT * FROM ${tableName}`).all();
            res.json(items);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
};
['customers', 'units', 'partners', 'contracts', 'installments', 'safes', 'vouchers', 'brokers'].forEach(setupGetall);


// Generic DELETE for a table
const setupDelete = (tableName) => {
    app.delete(`/api/${tableName}/:id`, (req, res) => {
        try {
            const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);
            const info = stmt.run(req.params.id);
            if (info.changes > 0) {
                res.json({ message: `${tableName} item deleted successfully` });
            } else {
                res.status(404).json({ error: 'Item not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
};
['customers', 'units', 'partners', 'contracts', 'installments', 'safes', 'brokers'].forEach(setupDelete);


// POST a new customer
app.post('/api/customers', (req, res) => {
    const { name, phone, nationalId, address, status, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const newCustomer = { id: uid('C'), name, phone, nationalId, address, status, notes };
        db.prepare('INSERT INTO customers (id, name, phone, nationalId, address, status, notes) VALUES (@id, @name, @phone, @nationalId, @address, @status, @notes)').run(newCustomer);
        res.status(201).json(newCustomer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST a new unit
app.post('/api/units', (req, res) => {
    const { name, floor, building, totalPrice, area, unitType, notes, partnerGroupId } = req.body;
    if(!name || !floor || !building || !totalPrice || !partnerGroupId) {
        return res.status(400).json({ error: 'Incomplete unit data.' });
    }
    const code = `${building.replace(/\s/g, '')}-${floor.replace(/\s/g, '')}-${name.replace(/\s/g, '')}`;

    const transaction = db.transaction(() => {
        if (db.prepare('SELECT id FROM units WHERE code = ?').get(code)) {
            throw new Error('Unit with this code already exists.');
        }
        const groupPartners = db.prepare('SELECT * FROM partnerGroupLinks WHERE groupId = ?').all(partnerGroupId);
        if (groupPartners.reduce((sum, p) => sum + p.percent, 0) !== 100) {
            throw new Error('Partner group percentages do not sum to 100.');
        }

        const newUnit = { id: uid('U'), code, name, status: 'متاحة', area, floor, building, notes, totalPrice, unitType };
        db.prepare('INSERT INTO units (id, code, name, status, area, floor, building, notes, totalPrice, unitType) VALUES (@id, @code, @name, @status, @area, @floor, @building, @notes, @totalPrice, @unitType)').run(newUnit);

        const insertLink = db.prepare('INSERT INTO unitPartners (id, unitId, partnerId, percent) VALUES (?, ?, ?, ?)');
        groupPartners.forEach(p => {
            insertLink.run(uid('UP'), newUnit.id, p.partnerId, p.percent);
        });
        return newUnit;
    });

    try {
        res.status(201).json(transaction());
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST a new contract and generate installments
app.post('/api/contracts', (req, res) => {
    const { unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start } = req.body;

    if (!unitId || !customerId || !totalPrice) {
        return res.status(400).json({ error: 'Incomplete contract data' });
    }

    const transaction = db.transaction(() => {
        // Mark unit as sold
        db.prepare("UPDATE units SET status = 'مباعة' WHERE id = ?").run(unitId);

        // Create contract
        const code = 'CTR-' + String(db.prepare('SELECT COUNT(*) as c FROM contracts').get().c + 1).padStart(5, '0');
        const newContract = { id: uid('CT'), code, unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start };
        db.prepare('INSERT INTO contracts (id, code, unitId, customerId, totalPrice, downPayment, discountAmount, maintenanceDeposit, brokerName, brokerPercent, brokerAmount, commissionSafeId, type, count, extraAnnual, annualPaymentValue, start) VALUES (@id, @code, @unitId, @customerId, @totalPrice, @downPayment, @discountAmount, @maintenanceDeposit, @brokerName, @brokerPercent, @brokerAmount, @commissionSafeId, @type, @count, @extraAnnual, @annualPaymentValue, @start)').run(newContract);

        // Handle down payment voucher
        if (downPayment > 0) {
            const safe = db.prepare('SELECT * FROM safes WHERE id = ?').get(newContract.downPaymentSafeId || commissionSafeId); // fallback for older data
            if(safe) {
                db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(downPayment, safe.id);
                const desc = `مقدم عقد للوحدة ${db.prepare('SELECT name FROM units WHERE id = ?').get(unitId).name}`;
                db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', start, downPayment, safe.id, desc, db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId).name, newContract.id);
            }
        }

        // Installment generation logic
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
        // ... add logic for annual and maintenance installments ...

        return newContract;
    });

    try {
        res.status(201).json(transaction());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST a payment for an installment
app.post('/api/installments/:id/pay', (req, res) => {
    const { amount, safeId, date } = req.body;
    const installmentId = req.params.id;

    if (!amount || !safeId || !date) {
        return res.status(400).json({ error: 'Incomplete payment data' });
    }

    const transaction = db.transaction(() => {
        const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(installmentId);
        if (!inst || inst.status === 'مدفوع') throw new Error('Installment not found or already paid.');

        const paidAmount = Math.min(amount, inst.amount);
        const newRemaining = inst.amount - paidAmount;
        const newStatus = newRemaining <= 0.005 ? 'مدفوع' : 'مدفوع جزئياً';

        // Update installment
        db.prepare('UPDATE installments SET amount = ?, status = ?, paymentDate = ? WHERE id = ?').run(newRemaining, newStatus, date, installmentId);

        // Update safe balance
        db.prepare('UPDATE safes SET balance = balance + ? WHERE id = ?').run(paidAmount, safeId);

        // Create voucher
        const contract = db.prepare('SELECT customerId FROM contracts WHERE unitId = ?').get(inst.unitId);
        const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(contract.customerId);
        const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(inst.unitId);
        const desc = `سداد قسط للوحدة ${unit.name}`;
        db.prepare('INSERT INTO vouchers (id, type, date, amount, safeId, description, payer, linked_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uid('V'), 'receipt', date, paidAmount, safeId, desc, customer.name, installmentId);

        return { installmentId, paidAmount };
    });

    try {
        res.status(201).json(transaction());
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = app;
