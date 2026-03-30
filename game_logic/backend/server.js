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
let secretWinner = { first: null, second: null, third: null };
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

  let slot;
  if (spinsLeft === 3) slot = "first";
  else if (spinsLeft === 2) slot = "second";
  else slot = "third";

  // Always spin, but override if superadmin set a number
  const allNumbers = participants.flatMap(p => p.numbers);
  const rand = allNumbers[Math.floor(Math.random() * allNumbers.length)];
  const chosenNumber = secretWinner[slot] ? secretWinner[slot] : rand;

  const winner = participants.find(p => p.numbers.includes(chosenNumber));
  const msg = winner
    ? `Winner (${slot}): Number ${chosenNumber} belongs to ${winner.name} (${winner.phone})`
    : `Winner (${slot}): Number ${chosenNumber} (no participant found)`;

  if (!winners.find(r => r.round === currentRound)) {
    winners.push({ round: currentRound, messages: [], set_by: "admin" });
  }
  const roundData = winners.find(r => r.round === currentRound);
  roundData.messages.push(msg);

  spinsLeft -= 1;
  res.json({ message: msg, spinsLeft, currentRound });
});

// --- SUPERADMIN OVERRIDE ---
app.post("/setSecretWinner", (req, res) => {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).json({ error: "Unauthorized - please login as superadmin" });
  }
  const { slot, number } = req.body;
  if (!["first","second","third"].includes(slot)) {
    return res.status(400).json({ error: "Slot must be first, second, or third" });
  }
  if (!number || typeof number !== "number") {
    return res.status(400).json({ error: "Provide a valid number" });
  }
  secretWinner[slot] = number;
  res.json({ message: `Superadmin set ${slot} winner to number ${number}` });
});

// --- RESET ---
app.post("/reset", (req, res) => {
  if (!req.session.user || !["admin", "superadmin"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Unauthorized - please login first" });
  }
  participants = [];
  secretWinner = { first: null, second: null, third: null };
  spinsLeft = 3;
  currentRound += 1;
  res.json({ message: `System reset successful. Starting Round ${currentRound}`, currentRound, spinsLeft });
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`✅ Bohara Lucky Draw backend running on port ${PORT}`);
});
