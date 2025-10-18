const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
// const nodemailer = require('nodemailer');
// const ejs = require('ejs');
// const path = require('path');

// Commented out Nodemailer config since Railway does not support mailing
/*
const transporter = nodemailer.createTransport({ ... });

async function renderTemplate(templateName, data) {
  const templatePath = path.join(__dirname, '../email-templates', `${templateName}.ejs`);
  return ejs.renderFile(templatePath, data);
}
*/

router.get("/", async (req, res) => {
  let connection;
  try {
    connection = await req.db.promise().getConnection();

    const [bookings] = await connection.query(`
      SELECT 
        b.id,
        b.booking_reference as bookingReference,
        b.first_name as firstName,
        b.last_name as lastName,
        b.email,
        b.phone,
        b.check_in as checkIn,
        b.check_out as checkOut,
        b.special_requests as specialRequests,
        b.payment_method as paymentMethod,
        b.total_amount as total,
        b.status,
        b.created_at as createdAt,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', br.room_type_id,
            'quantity', br.quantity
          )
        ) as rooms
      FROM bookings b
      LEFT JOIN booking_rooms br ON b.id = br.booking_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);

    const formattedBookings = bookings.map(booking => ({
      ...booking,
      rooms: booking.rooms ? JSON.parse(`[${booking.rooms}]`) : [],
      total: parseFloat(booking.total),
    }));

    res.status(200).json(formattedBookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  } finally {
    if (connection) connection.release();
  }
});

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

  if (!firstName || !lastName || !email || !phone || !checkIn || !checkOut || !paymentMethod || !rooms || !total) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!Array.isArray(rooms) || rooms.length === 0) {
    return res.status(400).json({ error: "Invalid rooms data" });
  }

  let connection;
  try {
    connection = await req.db.promise().getConnection();
    await connection.beginTransaction();

    const roomIds = rooms.map(room => room.id);
    const placeholders = roomIds.map(() => '?').join(',');

    // Use RoomType instead of rooms
    const [roomResults] = await connection.query(
      `SELECT id, price, name FROM RoomType WHERE id IN (${placeholders})`,
      roomIds
    );

    const roomPriceMap = {};
    const roomDetails = {};
    roomResults.forEach(room => {
      roomPriceMap[room.id] = parseFloat(room.price);
      roomDetails[room.id] = room.name;
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

    const bookingReference = `BOOK-${uuidv4().substring(0, 8).toUpperCase()}`;

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
        total_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        total,
        'confirmed'
      ]
    );

    const bookingId = bookingResult.insertId;

    for (const room of rooms) {
      const [updateResult] = await connection.query(
        `UPDATE RoomType 
         SET available_rooms = available_rooms - ? 
         WHERE id = ? AND available_rooms >= ?`,
        [room.quantity, room.id, room.quantity]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error(`Not enough availability for room ${room.id}`);
      }

      await connection.query(
        "INSERT INTO booking_rooms (booking_id, room_type_id, quantity) VALUES (?, ?, ?)",
        [bookingId, room.id, room.quantity]
      );
    }

    await connection.commit();

    // Commented out email sending code
    /*
    const emailData = { ... };
    const html = await renderTemplate('booking-confirmation', emailData);
    await transporter.sendMail({ ... });
    */

    res.status(201).json({
      success: true,
      bookingReference,
      bookingId,
      totalAmount: total,
      calculatedTotal: expectedTotal,
      message: "Booking confirmed"
    });

  } catch (error) {
    if (connection) await connection.rollback();

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

    console.error("Booking error:", error);

    res.status(500).json({
      error: "Booking failed",
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
