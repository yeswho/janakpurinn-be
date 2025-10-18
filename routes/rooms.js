const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Fetch room types only
    const [results] = await req.dbPromise.query(`
      SELECT id, name AS title, description, price, size, capacity, amenities, main_image, gallery_images, available_rooms
      FROM RoomType
    `);

    const formatted = results.map(row => ({
      id: row.id,
      title: row.title,
      // No 'category' now; title itself can represent it
      description: row.description,
      price: parseFloat(row.price),
      size: row.size,
      capacity: row.capacity,
      amenities: row.amenities ? row.amenities.split(",") : [],
      images: {
        main: row.main_image,
        gallery: row.gallery_images ? row.gallery_images.split(",") : []
      },
      availableRooms: row.available_rooms
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
