const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration for both local and production
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || {
    host: 'localhost',
    port: 5432,
    database: 'hilina_reports', 
    user: 'postgres',
    password: '1234',
  },
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Simple JWT configuration (no external files needed)
const JWT_SECRET = process.env.JWT_SECRET || 'hilina_foods_secret_2025';

// Simple auth middleware (no external files needed)
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token, authorization denied' });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // For now, just set the user from the token
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role || 'viewer'
        };
        
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token is not valid' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// Test database connection
app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            message: 'Database connected successfully!',
            timestamp: result.rows[0].now 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initialize database tables
app.get('/api/init-db', async (req, res) => {
    try {
        // Create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS periods (
                id SERIAL PRIMARY KEY,
                period_date DATE NOT NULL,
                period_type VARCHAR(20) NOT NULL,
                fiscal_year VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS financial_data (
                id SERIAL PRIMARY KEY,
                period_id INTEGER,
                product_id INTEGER,
                sales_volume DECIMAL(10,2),
                production_volume DECIMAL(10,2),
                turnover_eur DECIMAL(15,2),
                rmpm_cost DECIMAL(15,2),
                operating_cost DECIMAL(15,2),
                net_profit DECIMAL(15,2),
                net_margin DECIMAL(5,4),
                contributive_margin DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS kpi_data (
                id SERIAL PRIMARY KEY,
                period_id INTEGER,
                kpi_name VARCHAR(100) NOT NULL,
                target_value DECIMAL(15,2),
                actual_value DECIMAL(15,2),
                unit VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'viewer',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );
        `);

        // Insert initial data
        await pool.query(`
            INSERT INTO products (name, category) VALUES 
            ('Plumpy*Nut', 'RUTF'),
            ('Plumpy*Sup', 'RUSF'), 
            ('Maleda PB', 'Peanut Butter'),
            ('SQLNS 20g', 'Supplement')
            ON CONFLICT DO NOTHING;

            INSERT INTO periods (period_date, period_type, fiscal_year) VALUES
            ('2025-09-30', 'Monthly', '2025-26'),
            ('2025-08-31', 'Monthly', '2025-26'),
            ('2025-07-31', 'Monthly', '2025-26')
            ON CONFLICT DO NOTHING;

            INSERT INTO financial_data (period_id, product_id, sales_volume, production_volume, turnover_eur, net_profit, net_margin) 
            VALUES 
            (1, 1, 1223, 913, 3746481, 1135021, 0.23),
            (2, 1, 607, 606, 1850000, 425000, 0.23)
            ON CONFLICT DO NOTHING;

            INSERT INTO kpi_data (period_id, kpi_name, target_value, actual_value, unit) VALUES
            (1, 'Q3 Production', 2542, 1519, 'T'),
            (1, 'Local Peanut %', 6, 0, '%'),
            (1, 'Net Margin %', 17, 23, '%'),
            (1, 'YTD Remittance', 328650, 328650, 'EUR')
            ON CONFLICT DO NOTHING;

            -- Insert default admin user (password: admin123)
            INSERT INTO users (email, password, name, role) 
            VALUES (
                'admin@hilinafoods.com', 
                '$2a$10$8K1p/a0dRL1SzdiKJ.2.duZUMTp7pW7.OZ5B.8b.OdOMo3/.e.YsK', 
                'System Administrator', 
                'admin'
            ) ON CONFLICT (email) DO NOTHING;

            -- Insert finance user (password: finance123)
            INSERT INTO users (email, password, name, role) 
            VALUES (
                'finance@hilinafoods.com', 
                '$2a$10$8K1p/a0dRL1SzdiKJ.2.duZUMTp7pW7.OZ5B.8b.OdOMo3/.e.YsK', 
                'Finance Manager', 
                'finance'
            ) ON CONFLICT (email) DO NOTHING;
        `);

        res.json({ message: 'Database initialized successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get financial data
app.get('/api/financials', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.period_date,
                p.period_type,
                p.fiscal_year,
                prod.name as product_name,
                fd.sales_volume,
                fd.production_volume,
                fd.turnover_eur,
                fd.net_profit,
                fd.net_margin,
                fd.contributive_margin
            FROM financial_data fd
            JOIN periods p ON fd.period_id = p.id
            JOIN products prod ON fd.product_id = prod.id
            ORDER BY p.period_date DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get KPI data
app.get('/api/kpis', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.period_date,
                k.kpi_name,
                k.target_value,
                k.actual_value,
                k.unit
            FROM kpi_data k
            JOIN periods p ON k.period_id = p.id
            ORDER BY p.period_date DESC, k.kpi_name
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new financial data
app.post('/api/financials', async (req, res) => {
    try {
        const {
            period_date,
            product_name,
            sales_volume,
            production_volume,
            turnover_eur,
            rmpm_cost,
            operating_cost,
            net_profit,
            net_margin
        } = req.body;

        // Get or create period
        const fiscalYear = getFiscalYear(period_date);
        const periodResult = await pool.query(
            'INSERT INTO periods (period_date, period_type, fiscal_year) VALUES ($1, $2, $3) ON CONFLICT (period_date) DO UPDATE SET period_type = $2 RETURNING id',
            [period_date, 'Monthly', fiscalYear]
        );
        const periodId = periodResult.rows[0].id;

        // Get product ID
        const productResult = await pool.query(
            'SELECT id FROM products WHERE name = $1',
            [product_name]
        );
        
        if (productResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid product name' });
        }
        const productId = productResult.rows[0].id;

        // Insert financial data
        const insertResult = await pool.query(
            `INSERT INTO financial_data 
             (period_id, product_id, sales_volume, production_volume, turnover_eur, rmpm_cost, operating_cost, net_profit, net_margin) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING *`,
            [
                periodId,
                productId,
                sales_volume || null,
                production_volume || null,
                turnover_eur || null,
                rmpm_cost || null,
                operating_cost || null,
                net_profit || null,
                net_margin || null
            ]
        );

        res.json({
            message: 'Financial data saved successfully!',
            data: insertResult.rows[0]
        });

    } catch (err) {
        console.error('Error saving financial data:', err);
        res.status(500).json({ error: err.message });
    }
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await pool.query(
            'SELECT id, email, password, name, role FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Generate token
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ 
            userId: user.id,
            email: user.email,
            role: user.role 
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({ user: req.user });
});

// Helper function to determine fiscal year
function getFiscalYear(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    // Fiscal year starts in July (month 7)
    if (month >= 7) {
        return `${year}-${(year + 1).toString().slice(2)}`;
    } else {
        return `${year - 1}-${year.toString().slice(2)}`;
    }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🎯 Hilina Foods Server running on port ${PORT}`);
    console.log(`📊 Test database: http://localhost:${PORT}/api/test-db`);
    console.log(`🗃️ Initialize DB: http://localhost:${PORT}/api/init-db`);
    console.log(`🔐 Login endpoint: http://localhost:${PORT}/api/auth/login`);
});