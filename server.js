const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'hilina_reports',
    user: 'postgres',
    password: '1234', // Replace with your PostgreSQL password
});

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
});
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, requireRole, JWT_SECRET } = require('./middleware/auth');

// Auth routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name, role = 'viewer' } = req.body;
        
        // Check if user exists
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
            [email, hashedPassword, name, role]
        );

        // Generate token
        const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'User registered successfully',
            token,
            user: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Generate token
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

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

// Protected routes example
app.get('/api/admin/users', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, name, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

app.post('/api/import/financial-data', authMiddleware, requireRole(['admin', 'finance']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const results = [];
        const errors = [];

        // Parse CSV file
        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
                // Validate and transform CSV data
                const transformed = transformFinancialData(data);
                if (transformed.valid) {
                    results.push(transformed.data);
                } else {
                    errors.push(transformed.error);
                }
            })
            .on('end', async () => {
                try {
                    // Import valid records to database
                    const importResults = await importFinancialData(results);
                    
                    // Clean up uploaded file
                    fs.unlinkSync(req.file.path);

                    res.json({
                        message: 'Data import completed',
                        summary: {
                            totalRecords: results.length + errors.length,
                            successful: importResults.successful,
                            failed: importResults.failed,
                            errors: errors
                        },
                        details: importResults.details
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function transformFinancialData(data) {
    try {
        // Transform CSV data to match database structure
        return {
            valid: true,
            data: {
                period_date: data.period_date || data.date,
                product_name: data.product_name || data.product,
                sales_volume: parseFloat(data.sales_volume || data.sales),
                production_volume: parseFloat(data.production_volume || data.production),
                turnover_eur: parseFloat(data.turnover_eur || data.turnover),
                rmpm_cost: parseFloat(data.rmpm_cost || data.rmpm),
                operating_cost: parseFloat(data.operating_cost || data.operating),
                net_profit: parseFloat(data.net_profit || data.profit),
                net_margin: parseFloat(data.net_margin || (data.net_profit / data.turnover_eur))
            }
        };
    } catch (error) {
        return {
            valid: false,
            error: `Invalid data: ${error.message}`
        };
    }
}

async function importFinancialData(records) {
    const results = {
        successful: 0,
        failed: 0,
        details: []
    };

    for (const record of records) {
        try {
            // Similar to your existing financial data insertion logic
            const fiscalYear = getFiscalYear(record.period_date);
            const periodResult = await pool.query(
                'INSERT INTO periods (period_date, period_type, fiscal_year) VALUES ($1, $2, $3) ON CONFLICT (period_date) DO UPDATE SET period_type = $2 RETURNING id',
                [record.period_date, 'Monthly', fiscalYear]
            );

            const productResult = await pool.query(
                'SELECT id FROM products WHERE name = $1',
                [record.product_name]
            );

            if (productResult.rows.length === 0) {
                throw new Error(`Invalid product: ${record.product_name}`);
            }

            await pool.query(
                `INSERT INTO financial_data 
                 (period_id, product_id, sales_volume, production_volume, turnover_eur, rmpm_cost, operating_cost, net_profit, net_margin) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    periodResult.rows[0].id,
                    productResult.rows[0].id,
                    record.sales_volume,
                    record.production_volume,
                    record.turnover_eur,
                    record.rmpm_cost,
                    record.operating_cost,
                    record.net_profit,
                    record.net_margin
                ]
            );

            results.successful++;
            results.details.push({ record, status: 'success' });
        } catch (error) {
            results.failed++;
            results.details.push({ record, status: 'failed', error: error.message });
        }
    }

    return results;
}
const cron = require('node-cron');
const EmailService = require('./services/emailService');

// Schedule KPI alerts every Monday at 9 AM
cron.schedule('0 9 * * 1', () => {
    console.log('Sending weekly KPI alerts...');
    EmailService.sendKPINotification();
});

// Schedule monthly reports on 1st of every month at 10 AM
cron.schedule('0 10 1 * *', () => {
    console.log('Sending monthly reports...');
    EmailService.sendMonthlyReport();
});

// Advanced analytics endpoints
app.get('/api/analytics/forecast', authMiddleware, async (req, res) => {
    try {
        const { product, periods = 6 } = req.query;
        
        const historicalData = await pool.query(`
            SELECT 
                p.period_date,
                fd.sales_volume,
                fd.production_volume,
                fd.turnover_eur
            FROM financial_data fd
            JOIN periods p ON fd.period_id = p.id
            WHERE fd.product_id = (SELECT id FROM products WHERE name = $1)
            ORDER BY p.period_date DESC
            LIMIT 12
        `, [product]);

        // Simple linear regression forecast
        const forecast = generateForecast(historicalData.rows, parseInt(periods));
        
        res.json(forecast);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateForecast(historicalData, periods) {
    // Simple moving average forecast
    const salesData = historicalData.map(d => d.sales_volume).reverse();
    const forecast = [];
    
    for (let i = 0; i < periods; i++) {
        const lastValues = salesData.slice(-3); // Last 3 periods
        const average = lastValues.reduce((a, b) => a + b, 0) / lastValues.length;
        forecast.push({
            period: i + 1,
            forecast_sales: Math.round(average * 1.05), // 5% growth assumption
            confidence: 0.85 - (i * 0.1) // Decreasing confidence for further periods
        });
    }
    
    return {
        historical: historicalData,
        forecast: forecast,
        generated_at: new Date().toISOString()
    };
}