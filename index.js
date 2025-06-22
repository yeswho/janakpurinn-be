require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// Middleware setup
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  credentials: true
}));

// Database connection setup
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const dbPromise = db.promise();

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Connected to MySQL database");
    connection.release();
  }
});

// Middleware to attach db interfaces and parse pagination
app.use((req, res, next) => {
  req.db = db;
  req.dbPromise = dbPromise;
  
  // Parse pagination parameters from query string
  req.pagination = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    offset: (parseInt(req.query.page || 1) - 1) * (parseInt(req.query.limit) || 10)
  };
  
  next();
});

// Import routes
const roomsRoutes = require("./routes/rooms");
const aboutRoutes = require("./routes/about");
const menuRoutes = require("./routes/menu");
const bookingRoutes = require("./routes/booking");
const { router: authRouter, authenticateAdmin } = require("./routes/auth");

// Admin routes
const adminBookingRoutes = require("./routes/admin/booking");

// Public routes
app.use("/api/rooms", roomsRoutes);
app.use("/api/about", aboutRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/auth", authRouter);

// Protected admin routes with pagination support
app.use("/api/admin/bookings", authenticateAdmin, adminBookingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    pagination: req.pagination
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    ...(req.pagination && { pagination: req.pagination })
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = {
  db,
  dbPromise,
  app
};