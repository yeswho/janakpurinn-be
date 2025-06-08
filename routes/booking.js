const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

router.post("/", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    checkIn,
    checkOut,
    specialRequests,
    paymentMethod,
    rooms,
    total
  } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email || !phone || !checkIn || !checkOut || !paymentMethod || !rooms || !total) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate rooms array
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return res.status(400).json({ error: "Invalid rooms data" });
  }

  let connection;
  try {
    // Get a connection from the pool
    connection = await req.db.promise().getConnection();

    // Start transaction
    await connection.beginTransaction();

    // Get room prices
    const roomIds = rooms.map(room => room.id);
    const placeholders = roomIds.map(() => '?').join(',');
    
    const [roomResults] = await connection.query(
      `SELECT id, price FROM rooms WHERE id IN (${placeholders})`,
      roomIds
    );

    // Validate rooms and calculate expected total
    const roomPriceMap = {};
    roomResults.forEach(room => {
      roomPriceMap[room.id] = parseFloat(room.price);
    });

    let expectedTotal = 0;
    for (const room of rooms) {
      if (!roomPriceMap[room.id]) {
        throw new Error(`Invalid room ID: ${room.id}`);
      }
      expectedTotal += roomPriceMap[room.id] * room.quantity;
    }

    expectedTotal = Math.round(expectedTotal * 100) / 100;

    if (Math.abs(expectedTotal - total) > 0.01) {
      throw new Error(`Price mismatch. Expected: ${expectedTotal}, Provided: ${total}`);
    }

    // Generate booking reference
    const bookingReference = `BOOK-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Insert booking
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings (
        booking_reference,
        first_name,
        last_name,
        email,
        phone,
        check_in,
        check_out,
        special_requests,
        payment_method,
        total_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingReference,
        firstName,
        lastName,
        email,
        phone,
        checkIn,
        checkOut,
        specialRequests || null,
        paymentMethod,
        total
      ]
    );

    const bookingId = bookingResult.insertId;

    // Process room bookings
    for (const room of rooms) {
      // Update room availability
      const [updateResult] = await connection.query(
        `UPDATE rooms 
         SET available_rooms = available_rooms - ? 
         WHERE id = ? AND available_rooms >= ?`,
        [room.quantity, room.id, room.quantity]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error(`Not enough availability for room ${room.id}`);
      }

      // Insert booking room record
      await connection.query(
        "INSERT INTO booking_rooms (booking_id, room_id, quantity) VALUES (?, ?, ?)",
        [bookingId, room.id, room.quantity]
      );
    }

    // Commit transaction
    await connection.commit();

    // Return success response
    res.status(201).json({ 
      success: true, 
      bookingReference,
      bookingId,
      totalAmount: total,
      calculatedTotal: expectedTotal
    });

  } catch (error) {
    // Rollback transaction if there was an error
    if (connection) {
      await connection.rollback();
    }

    // Handle specific errors
    if (error.message.includes('Invalid room ID')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('Price mismatch')) {
      return res.status(400).json({ 
        error: error.message,
        details: {
          providedTotal: total,
          calculatedTotal: expectedTotal,
          difference: Math.abs(total - expectedTotal)
        }
      });
    }
    if (error.message.includes('Not enough availability')) {
      return res.status(400).json({ error: error.message });
    }

    // Generic error response
    console.error("Booking error:", error);
    res.status(500).json({ error: "Booking failed", details: error.message });
  } finally {
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;