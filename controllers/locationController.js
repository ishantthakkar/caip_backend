const fs = require("fs");
const path = require("path");

// Load locations once or on every request (keeping it simple for now)
const getFlattenedData = () => {
    try {
        const locationsPath = path.join(__dirname, "../flattened_locations.json");
        return JSON.parse(fs.readFileSync(locationsPath, "utf-8"));
    } catch (err) {
        console.error("Error reading flattened locations:", err);
        return [];
    }
};

exports.getLocations = (req, res) => {
    try {
        const data = getFlattenedData();
        const hierarchy = [];
        const stateMap = new Map();

        data.forEach(item => {
            if (!stateMap.has(item.state)) {
                const stateObj = { state: item.state, districts: [] };
                stateMap.set(item.state, stateObj);
                hierarchy.push(stateObj);
            }
            const stateObj = stateMap.get(item.state);
            let districtObj = stateObj.districts.find(d => d.district === item.district);
            if (!districtObj) {
                districtObj = { district: item.district, subDistricts: [] };
                stateObj.districts.push(districtObj);
            }
            if (!districtObj.subDistricts.includes(item.subDistrict)) {
                districtObj.subDistricts.push(item.subDistrict);
            }
        });

        hierarchy.sort((a, b) => a.state.localeCompare(b.state));
        hierarchy.forEach(s => {
            s.districts.sort((a, b) => a.district.localeCompare(b.district));
            s.districts.forEach(d => d.subDistricts.sort());
        });

        return res.status(200).json({ states: hierarchy });
    } catch (err) {
        return res.status(500).json({ msg: "Cannot fetch location data" });
    }
};

exports.getDistricts = (req, res) => {
    try {
        const { state } = req.query;
        const data = getFlattenedData();
        const districts = [...new Set(data.filter(item => item.state === state).map(item => item.district))].sort();
        return res.status(200).json({ districts });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching districts" });
    }
};

exports.getSubDistricts = (req, res) => {
    try {
        const { state, district } = req.query;
        const data = getFlattenedData();
        const subDistricts = [...new Set(data.filter(item => item.state === state && item.district === district).map(item => item.subDistrict))].sort();
        return res.status(200).json({ subDistricts });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching sub-districts" });
    }
};

exports.getCities = (req, res) => {
    try {
        const { state, district, subDistrict } = req.query;
        const data = getFlattenedData();
        const cities = [...new Set(data.filter(item => 
            item.state === state && 
            item.district === district && 
            item.subDistrict === subDistrict
        ).map(item => item.city))].sort();
        return res.status(200).json({ cities });
    } catch (err) {
        return res.status(500).json({ msg: "Error fetching cities" });
    }
};
