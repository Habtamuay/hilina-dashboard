const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hilina_foods_secret_2025';

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token, authorization denied' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        // For now, just set the user from the token
        // In a real app, you'd verify against the database
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

module.exports = { authMiddleware, requireRole, JWT_SECRET };