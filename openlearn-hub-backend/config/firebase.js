/* const admin = require("firebase-admin");
const serviceAccount = require("../firebase-key.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://your-database-name.firebaseio.com"
});

const db = admin.firestore();
module.exports = { admin, db};*/

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = { admin, db };