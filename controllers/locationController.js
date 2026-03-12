const fs = require("fs");
const path = require("path");

exports.getLocations = (req, res) => {
    try {
        const locationsPath = path.join(__dirname, "../locations.json");
        const data = fs.readFileSync(locationsPath, "utf-8");
        return res.status(200).json(JSON.parse(data));
    } catch (err) {
        console.error("Error reading locations:", err);
        return res.status(500).json({ msg: "Cannot fetch location data" });
    }
};
