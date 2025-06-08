const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  const db = req.db;

  const sectionsQuery = "SELECT * FROM about_sections";
  const teamQuery = "SELECT * FROM team_members";

  db.query(sectionsQuery, (err, sectionsResults) => {
    if (err) return res.status(500).json({ error: "Server error (sections)" });

    db.query(teamQuery, (err2, teamResults) => {
      if (err2) return res.status(500).json({ error: "Server error (team)" });

      const sections = sectionsResults.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        image: row.image
      }));

      const team = teamResults.map(row => ({
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
    });
  });
});

module.exports = router;
