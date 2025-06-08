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
    specialRequests = '',
    paymentMethod,
    rooms,
    total
  } = req.body;

  if (!firstName || !lastName || !email || !phone || !checkIn || !checkOut || !paymentMethod || !rooms || rooms.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await req.db.beginTransaction();
    let calculatedTotal = 0;
    const roomUpdates = [];
    
    for (const roomBooking of rooms) {
      const [room] = await req.db.query("SELECT * FROM rooms WHERE id = ? FOR UPDATE", [roomBooking.id]);
      
      if (!room) {
        await req.db.rollback();
        return res.status(400).json({ error: `Room ${roomBooking.id} not found` });
      }
      
      if (room.available_rooms < roomBooking.quantity) {
        await req.db.rollback();
        return res.status(400).json({ error: `Not enough available rooms for ${room.title}` });
      }
      
      calculatedTotal += room.price * roomBooking.quantity;
      roomUpdates.push({
        id: room.id,
        quantity: roomBooking.quantity,
        price: room.price,
        availableRooms: room.available_rooms - roomBooking.quantity
      });
    }

    if (calculatedTotal !== total) {
      await req.db.rollback();
      return res.status(400).json({ error: "Price mismatch detected" });
    }

    const bookingId = uuidv4();
    const bookingNumber = `BKG-${Date.now().toString().slice(-6)}`;
    
    await req.db.query(
      `INSERT INTO bookings (
        id, booking_number, first_name, last_name, email, phone, 
        check_in, check_out, special_requests, payment_method, 
        total_amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        bookingId, bookingNumber, firstName, lastName, email, phone,
        checkIn, checkOut, specialRequests, paymentMethod, total
      ]
    );

    for (const roomBooking of rooms) {
      await req.db.query(
        `INSERT INTO booking_rooms (booking_id, room_id, quantity, price_at_booking)
         VALUES (?, ?, ?, ?)`,
        [bookingId, roomBooking.id, roomBooking.quantity, roomBooking.price]
      );
    }

    for (const update of roomUpdates) {
      await req.db.query(
        `UPDATE rooms SET available_rooms = ? WHERE id = ?`,
        [update.availableRooms, update.id]
      );
    }
    await req.db.commit();

    res.status(201).json({
      id: bookingId,
      bookingNumber,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    await req.db.rollback();
    console.error("Booking error:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

module.exports = router;