require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const roomsRoutes = require("./routes/rooms");
const aboutRoutes = require("./routes/about");
const menuRoutes = require("./routes/menu");
const bookingRoutes = require("./routes/booking");
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Create MySQL connection pool with promise support
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise(); // Enable promise interface

// Test database connection
async function testDatabaseConnection() {
  try {
    const connection = await db.getConnection();
    console.log("Connected to MySQL database successfully");
    connection.release();
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1); // Exit if database connection fails
  }
}

// Middleware to attach db to requests
app.use((req, res, next) => {
  req.db = db; // Now using the promise interface
  next();
});

// Routes
app.use("/api/rooms", roomsRoutes);
app.use("/api/about", aboutRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/booking", bookingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await testDatabaseConnection();
});