require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

//Debugging: Ensure environment variables are loaded
console.log("Checking Environment Variables...");
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error("ERROR: FIREBASE_CREDENTIALS is not set in .env!");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing!");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("ERROR: JWT_SECRET is missing!");
  process.exit(1);
}
console.log("Environment Variables Loaded Successfully!");

// Initialize Firebase (Only Once)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("Firebase Admin SDK Initialized Successfully!");
} else {
  console.log("Firebase Admin SDK Already Initialized!");
}

// Initialize Express App
const app = express();
const PORT = 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

async function getAIResponse(userInput) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userInput }]
            }
          ]
        }),
      }
    );

    const data = await response.json();

    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error("Gemini error response:", data);
      return "AI service is currently unavailable.";
    }
  } catch (err) {
    console.error("Error with Gemini fetch:", err);
    return "AI service is currently unavailable.";
  }
}


app.post("/recommend-courses", async (req, res) => {
    const userInput = req.body.userInput;
    if (!userInput) {
        return res.status(400).json({ error: "User input is required." });
    }

    try {
        const aiResponse = await getAIResponse(userInput);
        res.json({ recommendation: aiResponse });
    } catch (error) {
        res.status(500).json({ error: "Something went wrong!" });
    }
});

const auth = admin.auth(); // Declare only once, outside the routes

// Test server
app.get("/", (req, res) => {
  res.send("OpenLearn Hub Backend is running successfully!");
});

app.get("/test-firebase", async (req, res) => {
  try {
    const firestore = admin.firestore();
    const testDoc = await firestore.collection("test").add({ message: "Firebase is connected!" });
    res.send(`Firebase test document created with ID: ${testDoc.id}`);
  } catch (error) {
    res.status(500).send("Firebase error: " + error.message);
  }
});

// SIGNUP Route
app.post("/signup", async (req, res) => {
  try {
    const { fullName, username, email, password, confirmPassword } = req.body;

    if (!fullName || !username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // Create user in Firebase Authentication
    const user = await auth.createUser({
      email,
      password,
      displayName: fullName,
    });

    // Store additional user details in Firestore
    const firestore = admin.firestore();
    await firestore.collection("users").doc(user.uid).set({
      fullName,
      username,
      email,
    });

    // Generate JWT Token
    const token = jwt.sign({ uid: user.uid },process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(201).json({ message: "User created successfully", token, uid: user.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN Route
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Fetch user data from Firestore
    const firestore = admin.firestore();
    const userSnapshot = await firestore.collection("users").where("email", "==", email).get();

    if (userSnapshot.empty) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const userData = userSnapshot.docs[0].data();

    // Generate JWT Token
    const uid = userSnapshot.docs[0].id;
    const token = jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "Login successful", token, user: userData });
  } catch (error) {
    res.status(500).json({ error: "Authentication failed: " + error.message });
  }
});

// FIXED GOOGLE SIGN-IN Route
app.post("/google-signin", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Google ID token is required" });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email, name } = decodedToken;

    // Store user details if not already in Firestore
    const firestore = admin.firestore();
    const userDoc = firestore.collection("users").doc(uid);
    const user = await userDoc.get();

    if (!user.exists) {
      await userDoc.set({
        fullName: name || "Google User",
        username: email.split("@")[0],
        email,
      });
    }

    // Generate JWT Token
    const token = jwt.sign({ uid }, process.env.JWT_SECRET);

    res.json({ message: "Google sign-in successful", token, uid });
  } catch (error) {
    res.status(500).json({ error: "Google sign-in failed: " + error.message });
  }
});

// AUTH MIDDLEWARE
const authMiddleware = require("./authMiddleware");

// PROTECTED ROUTES (Require JWT Token)
app.get("/profile", authMiddleware, (req, res) => {
  res.json({ message: "Welcome to your profile!", user: req.user });
});

app.get("/dashboard", authMiddleware, (req, res) => {
  res.json({ message: "This is your dashboard!", user: req.user });
});

app.post("/create-post", authMiddleware, (req, res) => {
  const { title, content } = req.body;
  res.json({ message: "Post created successfully!", title, content });
});
 // Your new YouTube route
const youtubeRoutes = require("./routes/youtubeRoutes");
app.use("/api/youtube", youtubeRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});