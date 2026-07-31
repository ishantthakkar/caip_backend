const admin = require('firebase-admin');

let appInitialized = false;

function loadServiceAccount() {
    if (process.env.FIREBASE_CREDENTIALS_JSON) {
        try {
            return JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
        } catch (e) {
            throw new Error('FIREBASE_CREDENTIALS_JSON is not valid JSON');
        }
    }

    if (process.env.FIREBASE_CREDENTIALS_PATH) {
        try {
            return require(process.env.FIREBASE_CREDENTIALS_PATH);
        } catch (err) {
            throw new Error(`Unable to load Firebase credentials from path ${process.env.FIREBASE_CREDENTIALS_PATH}: ${err.message}`);
        }
    }

    throw new Error('Firebase credentials not configured. Set FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_PATH.');
}

function initFirebase() {
    if (appInitialized) return admin;

    const serviceAccount = loadServiceAccount();

    if (!serviceAccount || typeof serviceAccount.project_id !== 'string' || serviceAccount.project_id.length === 0) {
        throw new Error('Service account object must contain a string "project_id" property. Please provide a valid Firebase service account JSON.');
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        appInitialized = true;
        console.log('Firebase admin initialized for project', serviceAccount.project_id);
    } catch (err) {
        console.error('Firebase initialization failed:', err.message);
        throw err;
    }

    return admin;
}

async function sendToDevice(token, payload, dryRun = false) {
    const fb = initFirebase();
    const message = {
        token,
        notification: {
            title: payload.title,
            body: payload.body
        },
        data: payload.data || {}
    };

    return fb.messaging().send(message, dryRun);
}

module.exports = { initFirebase, sendToDevice };
