const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Get all menu sections
    const [sections] = await req.dbPromise.query(
      "SELECT * FROM menu_sections ORDER BY display_order"
    );

    if (sections.length === 0) {
      return res.json([]);
    }

    // Process each section
    const formattedSections = await Promise.all(
      sections.map(async (section) => {
        // Get subsections for this section
        const [subsections] = await req.dbPromise.query(
          "SELECT * FROM menu_subsections WHERE section_id = ? ORDER BY display_order",
          [section.section_id]
        );

        // Process each subsection
        const subsWithItems = await Promise.all(
          subsections.map(async (subsection) => {
            // Get items for this subsection
            const [items] = await req.dbPromise.query(
              "SELECT name, price FROM menu_items WHERE subsection_id = ? ORDER BY display_order",
              [subsection.subsection_id]
            );

            return {
              title: subsection.title,
              description: subsection.description || undefined,
              items: items.map(item => ({
                name: item.name,
                price: item.price
              }))
            };
          })
        );

        return {
          title: section.title,
          subsections: subsWithItems
        };
      })
    );

    res.json(formattedSections);
  } catch (err) {
    console.error("Error fetching menu data:", err);
    res.status(500).json({ error: "Failed to fetch menu data" });
  }
});

module.exports = router;