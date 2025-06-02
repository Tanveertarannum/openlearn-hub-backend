require("dotenv").config();
console.log("🔑 OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY);
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
if (!process.env.OPENROUTER_API_KEY) {
  console.error("ERROR: OPENROUTER_API_KEY is missing!");
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
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000", // or your actual domain
        "X-Title": "OpenLearnHub"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",  // FREE and chat-friendly
        messages: [
          { role: "system", content: "You are a helpful and friendly course recommendation assistant." },
          { role: "user", content: userInput }
        ]
      })
    });

    const data = await response.json();
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    } else {
      console.error("OpenRouter response error:", data);
      return "AI service is currently unavailable.";
    }
  } catch (error) {
    console.error("Error with OpenRouter fetch:", error);
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
const authMiddleware = require("../authMiddleware");

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
const youtubeRoutes = require("./youtubeRoutes");
app.use("/api/youtube", youtubeRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// QUIZ GENERATION ROUTE
app.post("/generate-quiz", async (req, res) => {
  const { videoTitle, difficulty = "beginner", topic } = req.body;

  if (!videoTitle) {
    return res.status(400).json({ error: "Video title is required" });
  }

  const prompt = `
Generate exactly 10 multiple-choice questions based on the video titled "${videoTitle}" (topic: ${topic}, difficulty: ${difficulty}).

Each question must have this format only:
{
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "answer": "A" | "B" | "C" | "D"
}

Output a valid JSON array ONLY, like this:
[
  { "question": "...", "options": [...], "answer": "B" },
  ...
]
DO NOT include explanations. Output ONLY the JSON array.
`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "OpenLearnHub"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1-0528:free",
        messages: [
          { role: "system", content: "You are a quiz master AI for educational videos." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    console.log("🧠 Full AI response:", data);
const rawOutput = data?.choices?.[0]?.message?.content;

if (!rawOutput) {
  console.error("❌ AI returned undefined response content.");
  return res.status(500).json({ error: "AI returned no quiz content." });
}

fs.writeFileSync("ai-output.txt", rawOutput); // Only writes if valid

console.log("📦 AI Raw Output:", rawOutput);
console.log("🎯 Quiz Request Body:", req.body);

let quizJSON = [];
try {
  const match = rawOutput.match(/\[\s*{[\s\S]*?}\s*\]/);
  if (match) {
    quizJSON = JSON.parse(match[0]);
  } else {
    console.error("⚠️ No valid JSON array found in AI response:", rawOutput);
    return res.status(500).json({ error: "AI returned invalid quiz format." });
  }
} catch (e) {
  console.error("❌ JSON parsing failed for quiz:", rawOutput);
  return res.status(500).json({ error: "AI returned malformed JSON." });
}

res.json({ quiz: quizJSON });


  } catch (err) {
  console.error("Quiz Generation Error:", err);

  // Log if OpenRouter sends an error message
  if (err.response) {
    const errorData = await err.response.json();
    console.error("🛑 API Error Details:", errorData);
  }

  res.status(500).json({ error: "Failed to generate quiz." });
}
});


//submit quiz 
app.post("/submit-quiz", async (req, res) => {
  const { uid, videoId, score, total, difficulty } = req.body;

  console.log("✅ Submitting to backend:", uid, videoId, score, total);

  if (!uid || !videoId || score == null || !total) {
    return res.status(400).json({ error: "Incomplete quiz submission." });
  }

  try {
    console.log("🔥 Submitting quiz result:", { uid, videoId, score, total, difficulty });
    const firestore = admin.firestore();
    await firestore.collection("quizResults").add({
      uid,
      videoId,
      score,
      total,
      difficulty,
      timestamp: new Date()
    });

    res.status(200).json({ message: "Quiz submitted successfully!" });
  } catch (err) {
    console.error("Error storing quiz result:", err);
    res.status(500).json({ error: "Could not store quiz result." });
  }
});

// GET QUIZ RESULTS for a specific user
app.get("/quiz-results/:uid", async (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ error: "Missing UID" });
  }

  try {
    const firestore = admin.firestore();
    const snapshot = await firestore.collection("quizResults").where("uid", "==", uid).get();

    if (snapshot.empty) {
      return res.json([]); // Return empty array if no results
    }

    const results = [];
    snapshot.forEach(doc => results.push(doc.data()));

    res.json(results);
  } catch (error) {
    console.error("🔥 Failed to fetch quiz results:", error);
    res.status(500).json({ error: "Failed to fetch quiz results" });
  }
});

