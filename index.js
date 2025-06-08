require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const roomsRoutes = require("./routes/rooms");
const aboutRoutes = require("./routes/about");
const menuRoutes = require("./routes/menu");
const bookingRoutes = require("./routes/booking");
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Connected to MySQL database.");
    connection.release();
  }
});

app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use("/api/rooms", roomsRoutes);
app.use("/api/about", aboutRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/booking", bookingRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
