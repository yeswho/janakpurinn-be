const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const db = req.dbPromise; // Using the promise interface

    // Execute both queries in parallel
    const [sectionsResults, teamResults] = await Promise.all([
      db.query("SELECT * FROM about_sections"),
      db.query("SELECT * FROM team_members")
    ]);

    const sections = sectionsResults[0].map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      image: row.image
    }));

    const team = teamResults[0].map(row => ({
      id: row.id,
      name: row.name,
      position: row.position,
      bio: row.bio,
      image: row.image
    }));

    res.json({
      subtitle: "We are a Boutique Experience in the Heart of Janakpur",
      sections,
      team
    });
    
  } catch (err) {
    console.error("About page error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;