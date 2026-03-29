const express = require("express");
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: "https://boharaluckydraw-frontend7.onrender.com", // your frontend Render URL
  credentials: true
}));
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set secure:true if using HTTPS
}));

// In-memory storage (replace with DB if needed)
let participants = [];
let winners = [];
let adminPassword = process.env.ADMIN_PASS || "admin123";
let superadminPassword = process.env.SUPERADMIN_PASS || "superadmin123";
let secretWinner = null; // superadmin override

// --- AUTH ROUTES ---
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  if (username === "admin" && password === adminPassword) {
    req.session.user = { role: "admin" };
    return res.json({ message: "Admin login successful", role: "admin" });
  }
  if (username === "superadmin" && password === superadminPassword) {
    req.session.user = { role: "superadmin" };
    return res.json({ message: "Superadmin login successful", role: "superadmin" });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// --- PARTICIPANTS ROUTES ---
app.get("/participants", (req, res) => {
  res.json({ requests: participants });
});

app.post("/choose", (req, res) => {
  const { name, phone, numbers } = req.body;
  if (!name || !phone || !numbers || numbers.length === 0) {
    return res.status(400).json({ error: "Missing participant info" });
  }

  // Prevent duplicate number selection
  for (let num of numbers) {
    if (participants.find(p => p.number === num)) {
      return res.status(400).json({ error: `Number ${num} already taken` });
    }
  }

  numbers.forEach(num => {
    participants.push({ name, phone, number: num });
  });

  res.json({ message: "Selection successful!" });
});

// --- WINNERS ROUTES ---
app.get("/winners", (req, res) => {
  res.json({ rounds: winners });
});

// Admin draw route
app.post("/drawWinner", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized" });
  }

  let chosenNumber;
  if (secretWinner) {
    // Superadmin override
    chosenNumber = secretWinner;
    secretWinner = null; // clear after use
  } else {
    // Normal random draw
    const availableNumbers = participants.map(p => p.number);
    if (availableNumbers.length === 0) {
      return res.status(400).json({ error: "No participants to draw from" });
    }
    chosenNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
  }

  const winner = participants.find(p => p.number === chosenNumber);
  const round = winners.length + 1;
  const message = winner ? `${winner.name} (${winner.phone}) won with #${winner.number}` : `No winner found`;

  winners.push({ round, messages: [message] });
  res.json({ message: "Winner drawn", result: message });
});

// Superadmin can secretly set the winner
app.post("/setSecretWinner", (req, res) => {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized" });
  }
  const { number } = req.body;
  if (!number) {
    return res.status(400).json({ error: "Missing number" });
  }
  secretWinner = number;
  res.json({ message: `Secret winner #${number} set successfully` });
});

// --- ADMIN / SUPERADMIN ROUTES ---
app.post("/reset", (req, res) => {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized" });
  }
  participants = [];
  winners = [];
  secretWinner = null;
  res.json({ message: "System reset successful" });
});

app.post("/changePassword", (req, res) => {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized" });
  }
  const { target, newPassword } = req.body;
  if (target === "admin") {
    adminPassword = newPassword;
    return res.json({ message: "Admin password updated" });
  }
  if (target === "superadmin") {
    superadminPassword = newPassword;
    return res.json({ message: "Superadmin password updated" });
  }
  res.status(400).json({ error: "Invalid target" });
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`✅ Bohara Lucky Draw backend running on port ${PORT}`);
  console.log(`Frontend allowed origin: https://boharaluckydraw-frontend7.onrender.com`);
});
