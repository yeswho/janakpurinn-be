const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

router.post("/", (req, res) => {
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

  const roomIds = rooms.map(room => room.id);
  const placeholders = roomIds.map(() => '?').join(',');
  
  req.db.query(
    `SELECT id, price FROM rooms WHERE id IN (${placeholders})`,
    roomIds,
    (err, roomResults) => {
      if (err) return res.status(500).json({ error: "Failed to fetch room prices" });

      const roomPriceMap = {};
      roomResults.forEach(room => {
        roomPriceMap[room.id] = parseFloat(room.price);
      });

      let expectedTotal = 0;
      for (const room of rooms) {
        if (!roomPriceMap[room.id]) {
          return res.status(400).json({ 
            error: `Invalid room ID: ${room.id}` 
          });
        }
        expectedTotal += roomPriceMap[room.id] * room.quantity;
      }

      expectedTotal = Math.round(expectedTotal * 100) / 100;

      if (Math.abs(expectedTotal - total) > 0.01) { // Allow for small rounding differences
        return res.status(400).json({ 
          error: "Price mismatch",
          details: {
            providedTotal: total,
            calculatedTotal: expectedTotal,
            difference: Math.abs(total - expectedTotal)
          }
        });
      }

      const bookingReference = `BOOK-${uuidv4().substring(0, 8).toUpperCase()}`;

      req.db.beginTransaction(err => {
        if (err) return res.status(500).json({ error: "Transaction error" });

        const bookingQuery = `
          INSERT INTO bookings (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        req.db.query(
          bookingQuery,
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
          ],
          (err, results) => {
            if (err) {
              return req.db.rollback(() => {
                res.status(500).json({ error: "Booking creation failed" });
              });
            }

            const bookingId = results.insertId;
            const roomQueries = rooms.map(room => {
              return new Promise((resolve, reject) => {
                // Update room availability as well
                req.db.query(
                  `UPDATE rooms 
                   SET available_rooms = available_rooms - ? 
                   WHERE id = ? AND available_rooms >= ?`,
                  [room.quantity, room.id, room.quantity],
                  (updateErr) => {
                    if (updateErr) {
                      reject(new Error(`Not enough availability for room ${room.id}`));
                      return;
                    }

                    // Insert booking room record
                    req.db.query(
                      "INSERT INTO booking_rooms (booking_id, room_id, quantity) VALUES (?, ?, ?)",
                      [bookingId, room.id, room.quantity],
                      (insertErr) => {
                        if (insertErr) reject(insertErr);
                        else resolve();
                      }
                    );
                  }
                );
              });
            });

            Promise.all(roomQueries)
              .then(() => {
                req.db.commit(err => {
                  if (err) {
                    return req.db.rollback(() => {
                      res.status(500).json({ error: "Commit failed" });
                    });
                  }
                  res.status(201).json({ 
                    success: true, 
                    bookingReference,
                    bookingId,
                    totalAmount: total,
                    calculatedTotal: expectedTotal
                  });
                });
              })
              .catch(error => {
                req.db.rollback(() => {
                  res.status(400).json({ 
                    error: "Room booking failed",
                    details: error.message
                  });
                });
              });
          }
        );
      });
    }
  );
});