const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database. It will be created if it doesn't exist.
const db = new Database(path.join(__dirname, 'data.db'), { verbose: console.log });

function initializeDatabase() {
    console.log('Initializing database...');

    const createTables = db.transaction(() => {
        // Customers Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT,
                nationalId TEXT,
                address TEXT,
                status TEXT DEFAULT 'نشط',
                notes TEXT
            )
        `).run();

        // Units Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT,
                status TEXT DEFAULT 'متاحة',
                area TEXT,
                floor TEXT,
                building TEXT,
                notes TEXT,
                totalPrice REAL,
                unitType TEXT
            )
        `).run();

        // Partners Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS partners (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT
            )
        `).run();

        // Unit-Partners Link Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS unitPartners (
                id TEXT PRIMARY KEY,
                unitId TEXT NOT NULL,
                partnerId TEXT NOT NULL,
                percent REAL,
                FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE,
                FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE CASCADE
            )
        `).run();

        // Contracts Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS contracts (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                unitId TEXT NOT NULL,
                customerId TEXT NOT NULL,
                totalPrice REAL,
                downPayment REAL,
                discountAmount REAL,
                maintenanceDeposit REAL,
                brokerName TEXT,
                brokerPercent REAL,
                brokerAmount REAL,
                commissionSafeId TEXT,
                type TEXT,
                count INTEGER,
                extraAnnual INTEGER,
                annualPaymentValue REAL,
                start TEXT,
                FOREIGN KEY (unitId) REFERENCES units(id),
                FOREIGN KEY (customerId) REFERENCES customers(id)
            )
        `).run();

        // Installments Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS installments (
                id TEXT PRIMARY KEY,
                unitId TEXT NOT NULL,
                type TEXT,
                amount REAL,
                originalAmount REAL,
                dueDate TEXT,
                paymentDate TEXT,
                status TEXT DEFAULT 'غير مدفوع',
                FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE
            )
        `).run();

        // Safes Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS safes (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                balance REAL DEFAULT 0
            )
        `).run();

        // Vouchers Table (for all financial transactions)
        db.prepare(`
            CREATE TABLE IF NOT EXISTS vouchers (
                id TEXT PRIMARY KEY,
                type TEXT, -- 'receipt' or 'payment'
                date TEXT,
                amount REAL,
                safeId TEXT,
                description TEXT,
                payer TEXT,
                beneficiary TEXT,
                linked_ref TEXT,
                FOREIGN KEY (safeId) REFERENCES safes(id)
            )
        `).run();

        // Brokers Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS brokers (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                phone TEXT,
                notes TEXT
            )
        `).run();

        // Broker Dues Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS brokerDues (
                id TEXT PRIMARY KEY,
                contractId TEXT,
                brokerName TEXT,
                amount REAL,
                dueDate TEXT,
                status TEXT,
                paymentDate TEXT,
                paidFromSafeId TEXT,
                FOREIGN KEY (contractId) REFERENCES contracts(id) ON DELETE SET NULL
            )
        `).run();

        // Partner Groups Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS partnerGroups (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            )
        `).run();

        // Partner Group Links
        db.prepare(`
            CREATE TABLE IF NOT EXISTS partnerGroupLinks (
                id TEXT PRIMARY KEY,
                groupId TEXT NOT NULL,
                partnerId TEXT NOT NULL,
                percent REAL,
                FOREIGN KEY (groupId) REFERENCES partnerGroups(id) ON DELETE CASCADE,
                FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE CASCADE
            )
        `).run();

        // Partner Debts Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS partnerDebts (
                id TEXT PRIMARY KEY,
                unitId TEXT,
                payingPartnerId TEXT,
                owedPartnerId TEXT,
                amount REAL,
                dueDate TEXT,
                status TEXT,
                paymentDate TEXT,
                FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE SET NULL
            )
        `).run();

        // Audit Log Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS auditLog (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                description TEXT,
                details TEXT
            )
        `).run();
    });

    try {
        createTables();
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

module.exports = { db, initializeDatabase };
