const fetch = require('node-fetch');

async function checkApi() {
    try {
        const response = await fetch('http://localhost:5000/api/membership-plans');
        const data = await response.json();
        console.log('API Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error fetching API:', error.message);
    }
}

checkApi();
