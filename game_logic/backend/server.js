const express = require("express");
const session = require("express-session");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: "https://boharaluckydraw-frontend7.onrender.com", // your frontend URL
  credentials: true
}));
app.set("trust proxy", 1);

app.use(session({
  secret: "SUPER_SECRET_KEY",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: "none",
    httpOnly: true
  }
}));

// Uploads folder
const upload = multer({ dest: "uploads/" });
fs.mkdirSync("uploads", { recursive: true });

// In-memory storage
let participants = [];
let winners = [];
let secretWinner = null;
let currentRound = 1;
let spinsLeft = 3;

// Hard-coded users
const users = {
  admin: { password: "Bohara2026", role: "admin" },
  superadmin: { password: "sura@2026", role: "superadmin" }
};

// --- AUTH ROUTES ---
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  if (user && user.password === password) {
    req.session.user = { role: user.role, username };
    return res.json({ success: true, role: user.role, message: `${user.role} login successful` });
  }
  return res.status(401).json({ success: false, error: "Invalid credentials" });
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

app.post("/choose", upload.single("receipt"), (req, res) => {
  const { name, phone, numbers } = req.body;
  let chosenNumbers = [];

  try {
    chosenNumbers = Array.isArray(numbers) ? numbers.map(n => parseInt(n)) : JSON.parse(numbers);
  } catch {
    return res.status(400).json({ error: "Invalid numbers format" });
  }

  if (!name || !phone || !chosenNumbers.length) {
    return res.status(400).json({ error: "Name, phone, and at least one number required" });
  }

  const receiptPath = req.file ? req.file.path : null;

  for (let num of chosenNumbers) {
    if (num < 1 || num > 150) {
      return res.status(400).json({ error: `Invalid number ${num}` });
    }
    if (participants.find(p => p.numbers.includes(num))) {
      return res.status(400).json({ error: `Number ${num} already taken` });
    }
  }

  participants.push({ name, phone, numbers: chosenNumbers, receipt: receiptPath });
  res.json({ message: `${name} (${phone}) successfully chose numbers ${chosenNumbers}` });
});

// --- REMOVE PARTICIPANT ---
app.post("/removeParticipant", (req, res) => {
  if (!req.session.user || !["admin","superadmin"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Unauthorized - please login as admin or superadmin" });
  }
  const { phone } = req.body;
  const index = participants.findIndex(p => p.phone === phone);
  if (index === -1) {
    return res.status(404).json({ error: "Participant not found" });
  }
  const removed = participants.splice(index, 1)[0];
  res.json({ message: `Participant ${removed.name} (${removed.phone}) removed successfully.` });
});

// --- WINNERS ROUTES ---
app.get("/winners", (req, res) => {
  res.json({ rounds: winners });
});

app.post("/drawWinner", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized - please login as admin" });
  }
  if (participants.length === 0) {
    return res.status(400).json({ error: "No participants yet" });
  }
  if (spinsLeft <= 0) {
    return res.status(400).json({ error: "No spins left in this round. Please reset to start next round." });
  }

  // --- Superadmin override ---
  if (secretWinner) {
    let messages = [];
    secretWinner.forEach((num, idx) => {
      const winner = participants.find(p => p.numbers.includes(num));
      const msg = winner
        ? `Secret Winner ${idx+1}: Number ${num} belongs to ${winner.name} (${winner.phone})`
        : `Secret Winner ${idx+1}: Number ${num} (no participant found)`;
      messages.push(msg);
    });
    winners.push({ round: currentRound, messages, set_by: "superadmin" });
    secretWinner = null;
    spinsLeft = 0;
    return res.json({ messages, spinsLeft, currentRound });
  }

  // --- Normal spin ---
  const allNumbers = participants.flatMap(p => p.numbers);
  const rand = allNumbers[Math.floor(Math.random() * allNumbers.length)];
  const winner = participants.find(p => p.numbers.includes(rand));
  const msg = winner
    ? `Winner: Number ${rand} belongs to ${winner.name} (${winner.phone})`
    : `Winner: Number ${rand} (no participant found)`;

  winners.push({ round: currentRound, messages: [msg], set_by: "admin" });
  spinsLeft -= 1;

  return res.json({ message: msg, spinsLeft, currentRound });
});

app.post("/setSecretWinner", (req, res) => {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized - please login as superadmin" });
  }
  const { numbers } = req.body;
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: "Provide at least one number" });
  }
  if (numbers.length > 3) {
    return res.status(400).json({ error: "You can only set up to 3 winners" });
  }
  secretWinner = numbers;
  res.json({ message: `Secret winners ${numbers} set successfully` });
});

// --- RESET ---
app.post("/reset", (req, res) => {
  if (!req.session.user || !["admin", "superadmin"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Unauthorized - please login first" });
  }
  participants = [];
  secretWinner = null;
  spinsLeft = 3;
  currentRound += 1;
  res.json({ message: `System reset successful. Starting Round ${currentRound}`, currentRound, spinsLeft });
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`✅ Bohara Lucky Draw backend running on port ${PORT}`);
});
