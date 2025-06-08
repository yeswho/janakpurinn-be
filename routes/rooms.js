const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Use the promise interface (req.dbPromise)
    const [results] = await req.dbPromise.query("SELECT * FROM rooms");

    const formatted = results.map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      price: parseFloat(row.price),
      size: row.size,
      capacity: row.capacity,
      amenities: row.amenities.split(","),
      images: {
        main: row.main_image,
        gallery: row.gallery_images.split(",")
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