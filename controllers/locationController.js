const fs = require("fs");
const path = require("path");

const STATES_DIR = path.join(__dirname, "../states");

// Get list of states from filenames in states directory
exports.getLocations = (req, res) => {
    try {
        const files = fs.readdirSync(STATES_DIR);
        const states = files
            .filter(file => file.endsWith(".json"))
            .map(file => file.replace(".json", ""));
        
        // We'll return a minimal hierarchy for the initial load if needed, 
        // but usually front-end just needs the state names first.
        const hierarchy = states.map(state => ({ state, districts: [] }));
        
        return res.status(200).json({ states: hierarchy });
    } catch (err) {
        console.error("Error reading states directory:", err);
        return res.status(500).json({ msg: "Cannot fetch location data" });
    }
};

exports.getDistricts = (req, res) => {
    try {
        const { state } = req.query;
        if (!state) return res.status(400).json({ msg: "State is required" });

        const statePath = path.join(STATES_DIR, `${state}.json`);
        if (!fs.existsSync(statePath)) return res.status(404).json({ msg: "State not found" });

        const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        const districts = data.districts.map(d => d.district).sort();
        
        return res.status(200).json({ districts });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching districts" });
    }
};

exports.getSubDistricts = (req, res) => {
    try {
        const { state, district } = req.query;
        if (!state || !district) return res.status(400).json({ msg: "State and District are required" });

        const statePath = path.join(STATES_DIR, `${state}.json`);
        if (!fs.existsSync(statePath)) return res.status(404).json({ msg: "State not found" });

        const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        const districtData = data.districts.find(d => d.district === district);
        
        if (!districtData) return res.status(200).json({ subDistricts: [] });

        const subDistricts = districtData.subDistricts.map(sd => sd.subDistrict).sort();
        return res.status(200).json({ subDistricts });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching sub-districts" });
    }
};

exports.getCities = (req, res) => {
    try {
        const { state, district, subDistrict } = req.query;
        if (!state || !district || !subDistrict) {
            return res.status(400).json({ msg: "State, District and Sub-District are required" });
        }

        const statePath = path.join(STATES_DIR, `${state}.json`);
        if (!fs.existsSync(statePath)) return res.status(404).json({ msg: "State not found" });

        const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        const districtData = data.districts.find(d => d.district === district);
        if (!districtData) return res.status(200).json({ cities: [] });

        const subDistrictData = districtData.subDistricts.find(sd => sd.subDistrict === subDistrict);
        if (!subDistrictData) return res.status(200).json({ cities: [] });

        const cities = (subDistrictData.villages || []).sort();
        return res.status(200).json({ cities });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching cities" });
    }
};
