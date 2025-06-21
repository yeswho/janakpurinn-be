const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Admin login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const [results] = await req.dbPromise.query(
      "SELECT * FROM admins WHERE username = ?",
      [username]
    );

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const admin = results[0];
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await req.dbPromise.query(
      "UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
      [admin.id]
    );

    // Create JWT token
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '8h' }
    );

    res.json({ 
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        fullName: admin.full_name
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// Middleware to verify JWT
const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Verify admin still exists
    const [admin] = await req.dbPromise.query(
      "SELECT id FROM admins WHERE id = ?",
      [decoded.id]
    );

    if (!admin.length) {
      return res.status(401).json({ error: "Admin no longer exists" });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};

// Protected route example
router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    const [admin] = await req.dbPromise.query(
      "SELECT id, username, full_name FROM admins WHERE id = ?",
      [req.admin.id]
    );
    
    res.json({
      id: admin[0].id,
      username: admin[0].username,
      fullName: admin[0].full_name
    });
  } catch (err) {
    console.error("Error fetching admin:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = { router, authenticateAdmin };