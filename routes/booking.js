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

    // 1️⃣ Check if customer exists
    let [customerRows] = await connection.query(
      "SELECT id FROM Customers WHERE email = ?",
      [email]
    );

    let customerId;
    if (customerRows.length > 0) {
      customerId = customerRows[0].id;
    } else {
      // Create customer
      const [customerResult] = await connection.query(
        "INSERT INTO Customers (firstname, lastname, email, contact, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [firstName, lastName, email, phone]
      );
      customerId = customerResult.insertId;
    }

    // 2️⃣ Fetch room details from RoomType
    const roomIds = rooms.map(room => room.id);
    const placeholders = roomIds.map(() => '?').join(',');

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
      if (!roomPriceMap[room.id]) throw new Error(`Invalid room ID: ${room.id}`);
      expectedTotal += roomPriceMap[room.id] * room.quantity;
    }
    expectedTotal = Math.round(expectedTotal * 100) / 100;

    if (Math.abs(expectedTotal - total) > 0.01)
      throw new Error(`Price mismatch. Expected: ${expectedTotal}, Provided: ${total}`);

    const bookingReference = `BOOK-${uuidv4().substring(0, 8).toUpperCase()}`;

    // 3️⃣ Insert booking with customerId
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings (
        customer_id,
        booking_reference,
        check_in,
        check_out,
        requested_roomType,
        payment_mode,
        status,
        source,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Web', NOW(), NOW())`,
      [
        customerId,
        bookingReference,
        checkIn,
        checkOut,
        JSON.stringify(rooms),
        paymentMethod,
        'Booked' // Use allowed ENUM value
      ]
    );

    const bookingId = bookingResult.insertId;

    // 4️⃣ Update available rooms
    for (const room of rooms) {
      const [updateResult] = await connection.query(
        `UPDATE RoomType 
         SET available_rooms = available_rooms - ? 
         WHERE id = ? AND available_rooms >= ?`,
        [room.quantity, room.id, room.quantity]
      );

      if (updateResult.affectedRows === 0)
        throw new Error(`Not enough availability for room ${room.id}`);
    }

    await connection.commit();

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
    console.error("Booking error:", error);
    res.status(500).json({
      error: "Booking failed",
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  } finally {
    if (connection) connection.release();
  }
});
