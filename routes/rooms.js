const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  req.db.query("SELECT * FROM rooms", (err, results) => {
    if (err) return res.status(500).json({ error: "Server error" });

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
  });
});


module.exports = router;
