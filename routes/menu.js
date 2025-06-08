const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  req.db.query("SELECT * FROM menu_sections ORDER BY display_order", (err, sections) => {
    if (err) return res.status(500).json({ error: "Server error" });

    if (sections.length === 0) return res.json([]);

    const sectionPromises = sections.map(section => {
      return new Promise((resolve, reject) => {
        req.db.query(
          "SELECT * FROM menu_subsections WHERE section_id = ? ORDER BY display_order",
          [section.section_id],
          (err, subsections) => {
            if (err) return reject(err);

            const subsectionPromises = subsections.map(subsection => {
              return new Promise((resolveSub, rejectSub) => {
                req.db.query(
                  "SELECT name, price FROM menu_items WHERE subsection_id = ? ORDER BY display_order",
                  [subsection.subsection_id],
                  (err, items) => {
                    if (err) return rejectSub(err);

                    resolveSub({
                      title: subsection.title,
                      description: subsection.description || undefined,
                      items: items.map(item => ({
                        name: item.name,
                        price: item.price
                      }))
                    });
                  }
                );
              });
            });

            Promise.all(subsectionPromises)
              .then(subsWithItems => {
                resolve({
                  title: section.title,
                  subsections: subsWithItems
                });
              })
              .catch(err => reject(err));
          }
        );
      });
    });

    Promise.all(sectionPromises)
      .then(formattedSections => {
        res.json(formattedSections);
      })
      .catch(err => {
        console.error("Error fetching menu data:", err);
        res.status(500).json({ error: "Failed to fetch menu data" });
      });
  });
});

module.exports = router;