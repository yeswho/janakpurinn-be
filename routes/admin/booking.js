const express = require("express");
const router = express.Router();

// Get paginated bookings
router.get("/", async (req, res) => {
  const { page, limit, offset } = req.pagination;
  const { status } = req.query;

  try {
    let baseQuery = `
      SELECT 
        b.id,
        b.booking_reference,
        b.first_name,
        b.last_name,
        b.email,
        b.phone,
        b.check_in,
        b.check_out,
        b.special_requests,
        b.payment_method,
        b.total_amount,
        b.status,
        b.created_at,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', br.room_id,
            'quantity', br.quantity,
            'title', r.title,
            'category', r.category
          )
        ) as rooms
      FROM bookings b
      LEFT JOIN booking_rooms br ON b.id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.id
    `;

    let countQuery = `SELECT COUNT(*) as total FROM bookings`;
    const queryParams = [];
    const countParams = [];

    // Add status filter if provided
    if (status) {
      baseQuery += ` WHERE b.status = ?`;
      countQuery += ` WHERE status = ?`;
      queryParams.push(status);
      countParams.push(status);
    }

    // Complete the queries with pagination
    baseQuery += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Execute both queries in parallel
    const [bookings, [[{ total }]]] = await Promise.all([
      req.dbPromise.query(baseQuery, queryParams),
      req.dbPromise.query(countQuery, countParams)
    ]);

    // Format response
    const formattedBookings = bookings[0].map(booking => ({
      ...booking,
      rooms: booking.rooms ? JSON.parse(`[${booking.rooms}]`) : [],
      total_amount: parseFloat(booking.total_amount),
    }));

    res.json({
      data: formattedBookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      error: "Failed to fetch bookings",
      pagination: req.pagination
    });
  }
});

router.put("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  let connection;
  try {
    connection = await req.dbPromise.getConnection();
    await connection.beginTransaction();

    // Get current booking status and associated rooms
    const [[booking]] = await connection.query(
      `SELECT status FROM bookings WHERE id = ?`,
      [id]
    );

    if (!booking) {
      throw new Error("Booking not found");
    }

    const currentStatus = booking.status;

    // Update booking status
    await connection.query(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [status, id]
    );

    // Get all rooms associated with this booking
    const [rooms] = await connection.query(
      "SELECT room_id, quantity FROM booking_rooms WHERE booking_id = ?",
      [id]
    );

    if (status === 'completed' || status === 'cancelled') {
      // Free rooms when marking as completed OR cancelled
      // Only if it wasn't already completed or cancelled
      if (currentStatus !== 'completed' && currentStatus !== 'cancelled') {
        for (const room of rooms) {
          await connection.query(
            "UPDATE rooms SET available_rooms = available_rooms + ? WHERE id = ?",
            [room.quantity, room.room_id]
          );
        }
      }
    } else if (currentStatus === 'completed' || currentStatus === 'cancelled') {
      // Re-deduct rooms if changing back from completed/cancelled to another status
      // Only if the new status is NOT completed or cancelled
      if (status !== 'completed' && status !== 'cancelled') {
        for (const room of rooms) {
          await connection.query(
            "UPDATE rooms SET available_rooms = available_rooms - ? WHERE id = ? AND available_rooms >= ?",
            [room.quantity, room.room_id, room.quantity]
          );
        }
      }
    }

    await connection.commit();
    res.json({
      success: true,
      message: `Booking ${status} successfully`
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error updating booking status:", error);

    if (error.message.includes('available_rooms')) {
      return res.status(400).json({
        error: "Not enough room availability to revert status"
      });
    }

    res.status(500).json({
      error: error.message || "Failed to update booking status"
    });
  } finally {
    if (connection) connection.release();
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [[booking]] = await req.dbPromise.query(`
      SELECT 
        b.*,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', br.room_id,
            'quantity', br.quantity,
            'price', br.price_at_booking,
            'title', r.title,
            'category', r.category
          )
        ) as rooms
      FROM bookings b
      LEFT JOIN booking_rooms br ON b.id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.id
      WHERE b.id = ?
      GROUP BY b.id
    `, [req.params.id]);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const formatted = {
      ...booking,
      rooms: booking.rooms ? JSON.parse(`[${booking.rooms}]`) : [],
      total_amount: parseFloat(booking.total_amount),
    };

    res.json(formatted);
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({ error: "Failed to fetch booking" });
  }
});

module.exports = router;