// Add this to your existing database configuration
const initDatabase = async () => {
    try {
        // Create users table
        await pool.query(`
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
        console.log('✅ Users table initialized');
    } catch (error) {
        console.error('Error initializing users table:', error);
    }
};

// Call this function when server starts
initDatabase();

module.exports = pool;