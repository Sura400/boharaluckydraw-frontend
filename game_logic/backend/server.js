const express = require("express");
const session = require("express-session");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// MIDDLEWARE CONFIGURATION
// ========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration - support multiple frontend URLs
const allowedOrigins = [
  "https://boharaluckydraw-frontend7.onrender.com",
  "https://boharaluckydraw-frontend.onrender.com",
  "http://localhost:5500",
  "http://localhost:3001",
  "http://127.0.0.1:5500",
  "https://boharaluckydraw.netlify.app",
  "https://boharaluckydraw.vercel.app"
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
}));

app.set("trust proxy", 1);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "BOHARA_LUCKY_DRAW_SUPER_SECRET_KEY_2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: "none",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    domain: undefined
  },
  name: "bohara_session_id"
}));

// ========================
// FILE STORAGE SETUP
// ========================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Clean up old uploads periodically (every 24 hours)
setInterval(() => {
  const now = Date.now();
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        // Delete files older than 7 days
        if (now - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 24 * 60 * 60 * 1000);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `receipt_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
  }
});

// ========================
// DATA STORE (In-Memory)
// ========================
let participants = [];
let winners = [];
let secretWinner = { first: null, second: null, third: null };
let currentRound = 1;
let spinsLeft = 3;
let drawHistory = [];

// User credentials (in production, use environment variables)
const users = {
  admin: { 
    password: "Bohara2026", 
    role: "admin",
    created: new Date().toISOString()
  },
  superadmin: { 
    password: "sura@2026", 
    role: "superadmin",
    created: new Date().toISOString()
  }
};

// Dynamic admins created by superadmin
let customAdmins = {};

// ========================
// HELPER FUNCTIONS
// ========================
function isAuthenticated(req, roles = []) {
  if (!req.session.user) return false;
  if (roles.length === 0) return true;
  return roles.includes(req.session.user.role);
}

function getGameStatus() {
  return {
    currentRound,
    spinsLeft,
    totalParticipants: participants.length,
    totalWinners: winners.reduce((acc, w) => acc + w.messages.length, 0),
    serverTime: new Date().toISOString()
  };
}

function addWinnerMessage(round, message) {
  let roundData = winners.find(r => r.round === round);
  if (!roundData) {
    roundData = { round, messages: [], drawnAt: new Date().toISOString() };
    winners.push(roundData);
  }
  roundData.messages.push(message);
  drawHistory.push({ round, message, timestamp: new Date().toISOString() });
  
  // Keep only last 100 draws
  if (drawHistory.length > 100) drawHistory.shift();
}

// ========================
// AUTHENTICATION ROUTES
// ========================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Username and password required" });
  }
  
  // Check main users
  let user = users[username];
  
  // Check custom admins
  if (!user && customAdmins[username]) {
    user = customAdmins[username];
  }
  
  if (user && user.password === password) {
    req.session.user = { 
      role: user.role, 
      username: username,
      loginTime: Date.now(),
      sessionId: Math.random().toString(36).substring(7)
    };
    
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: "Session error" });
      }
      res.json({ 
        success: true, 
        role: user.role, 
        message: `Welcome ${username}! You are logged in as ${user.role}.` 
      });
    });
  } else {
    res.status(401).json({ success: false, error: "Invalid username or password" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logged out successfully", timestamp: new Date().toISOString() });
  });
});

app.get("/checkSession", (req, res) => {
  if (req.session.user) {
    res.json({ 
      authenticated: true, 
      user: { 
        role: req.session.user.role, 
        username: req.session.user.username 
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ========================
// PARTICIPANT ROUTES
// ========================
app.get("/participants", (req, res) => {
  // Return sanitized participant list for privacy
  const sanitized = participants.map(p => ({
    name: p.name,
    phone: p.phone.substring(0, 3) + "****" + p.phone.slice(-4),
    numbers: p.numbers,
    registeredAt: p.registeredAt
  }));
  res.json({ requests: sanitized, total: sanitized.length, timestamp: new Date().toISOString() });
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

  // Phone validation
  const phoneRegex = /^[0-9]{10,15}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "Invalid phone number format. Must be 10-15 digits." });
  }

  // Check if phone already registered
  const existingUser = participants.find(p => p.phone === phone);
  if (existingUser) {
    return res.status(400).json({ error: "This phone number has already been registered." });
  }

  const receiptPath = req.file ? req.file.path : null;

  // Validate numbers
  for (let num of chosenNumbers) {
    if (num < 1 || num > 150) {
      return res.status(400).json({ error: `Invalid number ${num}. Numbers must be between 1-150.` });
    }
    if (participants.some(p => p.numbers.includes(num))) {
      return res.status(400).json({ error: `Number ${num} is already taken by another participant.` });
    }
  }

  const newParticipant = { 
    name: name.trim(), 
    phone, 
    numbers: chosenNumbers.sort((a, b) => a - b), 
    receipt: receiptPath,
    registeredAt: new Date().toISOString()
  };
  participants.push(newParticipant);
  
  res.json({ 
    success: true,
    message: `${name} successfully chose numbers: ${chosenNumbers.join(", ")}`,
    numbers: chosenNumbers,
    timestamp: new Date().toISOString()
  });
});

// ========================
// ADMIN PARTICIPANT MANAGEMENT
// ========================
app.post("/removeParticipant", (req, res) => {
  if (!isAuthenticated(req, ["admin", "superadmin"])) {
    return res.status(403).json({ error: "Unauthorized - Admin access required" });
  }
  
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Phone number required" });
  }
  
  const index = participants.findIndex(p => p.phone === phone);
  if (index === -1) {
    return res.status(404).json({ error: "Participant not found" });
  }
  
  const removed = participants.splice(index, 1)[0];
  
  // Clean up receipt file if exists
  if (removed.receipt && fs.existsSync(removed.receipt)) {
    fs.unlink(removed.receipt, (err) => {
      if (err) console.error("Error deleting receipt:", err);
    });
  }
  
  res.json({ 
    success: true,
    message: `Participant ${removed.name} (${removed.phone}) has been removed successfully.`,
    removed: { name: removed.name, phone: removed.phone }
  });
});

// ========================
// WINNERS & DRAW ROUTES
// ========================
app.get("/winners", (req, res) => {
  // Sort rounds in descending order (newest first)
  const sortedRounds = [...winners].sort((a, b) => b.round - a.round);
  res.json({ rounds: sortedRounds, totalRounds: winners.length, timestamp: new Date().toISOString() });
});

app.get("/gameStatus", (req, res) => {
  res.json(getGameStatus());
});

app.post("/drawWinner", (req, res) => {
  if (!isAuthenticated(req, ["admin", "superadmin"])) {
    return res.status(403).json({ error: "Unauthorized - Admin access required" });
  }
  
  if (participants.length === 0) {
    return res.status(400).json({ error: "No participants registered yet. Cannot draw winner." });
  }
  
  if (spinsLeft <= 0) {
    return res.status(400).json({ 
      error: "No spins left in this round. Please reset to start a new round.",
      spinsLeft: 0,
      currentRound
    });
  }

  // Determine which slot is being drawn
  let slot;
  if (spinsLeft === 3) slot = "first";
  else if (spinsLeft === 2) slot = "second";
  else slot = "third";

  // Collect all available numbers from participants
  const allNumbers = participants.flatMap(p => p.numbers);
  
  if (allNumbers.length === 0) {
    return res.status(400).json({ error: "No numbers available to draw from." });
  }
  
  // Draw winner - if secret winner is set, use it; otherwise random
  let chosenNumber;
  let isSecretOverride = false;
  
  if (secretWinner[slot] !== null && secretWinner[slot] !== undefined) {
    chosenNumber = secretWinner[slot];
    isSecretOverride = true;
    // Clear the secret winner after use to prevent reuse
    secretWinner[slot] = null;
  } else {
    const randomIndex = Math.floor(Math.random() * allNumbers.length);
    chosenNumber = allNumbers[randomIndex];
  }

  // Find winner participant
  const winner = participants.find(p => p.numbers.includes(chosenNumber));
  
  let winnerMessage;
  if (winner) {
    winnerMessage = `🏆 ${slot.toUpperCase()} SLOT WINNER 🏆\nNumber ${chosenNumber} → ${winner.name} (${winner.phone})`;
    if (isSecretOverride) winnerMessage += " [SECRET OVERRIDE ACTIVATED]";
  } else {
    winnerMessage = `🎲 ${slot.toUpperCase()} SLOT DRAW 🎲\nNumber ${chosenNumber} drawn - No participant found with this number.`;
    if (isSecretOverride) winnerMessage += " [SECRET OVERRIDE - NO MATCH]";
  }

  // Add to winners history
  addWinnerMessage(currentRound, winnerMessage);
  
  // Decrease spins
  spinsLeft -= 1;
  
  const response = {
    success: true,
    message: winnerMessage,
    spinsLeft,
    currentRound,
    slot,
    drawnNumber: chosenNumber,
    hasWinner: !!winner,
    roundCompleted: spinsLeft === 0,
    timestamp: new Date().toISOString()
  };
  
  if (winner) {
    response.winner = { name: winner.name, phone: winner.phone, number: chosenNumber };
  }
  
  res.json(response);
});

// ========================
// SUPERADMIN ROUTES
// ========================
app.post("/setSecretWinner", (req, res) => {
  if (!isAuthenticated(req, ["superadmin"])) {
    return res.status(403).json({ error: "Unauthorized - Superadmin access required" });
  }
  
  const { slot, number } = req.body;
  
  if (!["first", "second", "third"].includes(slot)) {
    return res.status(400).json({ error: "Slot must be 'first', 'second', or 'third'" });
  }
  
  if (!number || typeof number !== "number" || number < 1 || number > 150) {
    return res.status(400).json({ error: "Provide a valid number between 1 and 150" });
  }
  
  secretWinner[slot] = number;
  
  res.json({ 
    success: true,
    message: `✅ Secret override set: ${slot.toUpperCase()} slot winner will be number ${number}`,
    slot,
    number,
    timestamp: new Date().toISOString()
  });
});

app.post("/superadmin/create_admin", (req, res) => {
  if (!isAuthenticated(req, ["superadmin"])) {
    return res.status(403).json({ error: "Unauthorized - Superadmin access required" });
  }
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  
  if (users[username] || customAdmins[username]) {
    return res.status(400).json({ error: "Username already exists" });
  }
  
  customAdmins[username] = {
    password: password,
    role: "admin",
    createdBy: req.session.user.username,
    createdAt: new Date().toISOString()
  };
  
  res.json({ 
    success: true,
    message: `✅ Admin user "${username}" created successfully`,
    username,
    role: "admin",
    timestamp: new Date().toISOString()
  });
});

app.post("/changePassword", (req, res) => {
  if (!isAuthenticated(req, ["admin", "superadmin"])) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  const { target, newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  
  if (target === "superadmin") {
    if (req.session.user.role !== "superadmin") {
      return res.status(403).json({ error: "Only superadmin can change superadmin password" });
    }
    users.superadmin.password = newPassword;
    res.json({ success: true, message: "Superadmin password updated successfully" });
  } 
  else if (target === "admin") {
    if (req.session.user.role === "superadmin") {
      res.json({ success: true, message: "Admin password updated successfully" });
    } else if (req.session.user.role === "admin") {
      users.admin.password = newPassword;
      res.json({ success: true, message: "Your admin password has been updated" });
    } else {
      res.status(403).json({ error: "Permission denied" });
    }
  }
  else {
    res.status(400).json({ error: "Invalid target" });
  }
});

// ========================
// RESET SYSTEM ROUTE
// ========================
app.post("/reset", (req, res) => {
  if (!isAuthenticated(req, ["admin", "superadmin"])) {
    return res.status(403).json({ error: "Unauthorized - Admin access required" });
  }
  
  // Reset all game data
  participants = [];
  secretWinner = { first: null, second: null, third: null };
  spinsLeft = 3;
  currentRound += 1;
  
  // Add reset marker to winners history
  winners.push({
    round: currentRound - 1,
    messages: [`🔄 SYSTEM RESET - Round ${currentRound - 1} finalized. New round ${currentRound} started.`],
    resetAt: new Date().toISOString()
  });
  
  res.json({ 
    success: true,
    message: `🔄 System reset complete. Starting Round ${currentRound} with 3 spins.`,
    currentRound,
    spinsLeft,
    timestamp: new Date().toISOString()
  });
});

// ========================
// HEALTH CHECK & UTILITY ROUTES
// ========================
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    participants: participants.length,
    rounds: winners.length,
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB"
  });
});

app.get("/stats", (req, res) => {
  const allNumbers = participants.flatMap(p => p.numbers);
  const numberFrequency = {};
  allNumbers.forEach(num => {
    numberFrequency[num] = (numberFrequency[num] || 0) + 1;
  });
  
  const mostPopular = Object.entries(numberFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([num, count]) => ({ number: parseInt(num), count }));
  
  res.json({
    totalParticipants: participants.length,
    totalNumbersChosen: allNumbers.length,
    currentRound,
    spinsLeft,
    roundsCompleted: winners.length,
    uniqueNumbersChosen: Object.keys(numberFrequency).length,
    numberFrequency,
    mostPopularNumbers: mostPopular,
    timestamp: new Date().toISOString()
  });
});

// ========================
// ERROR HANDLING MIDDLEWARE
// ========================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ error: "File too large. Max size 5MB." });
    }
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ========================
// SERVER START
// ========================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     🎉✨ BOHARA LUCKY DRAW BACKEND SERVER v2.0 ✨🎉           ║
║                                                               ║
║   🚀 Server Status: RUNNING                                  ║
║   📡 Port: ${PORT}                                              ║
║   🌐 Environment: ${process.env.NODE_ENV || 'development'}     ║
║                                                               ║
║   👥 Default Credentials:                                    ║
║      📛 Admin: admin / Bohara2026                           ║
║      👑 Superadmin: superadmin / sura@2026                   ║
║                                                               ║
║   📊 API Endpoints:                                          ║
║      GET  /health        - System health check              ║
║      GET  /stats         - Statistics                       ║
║      GET  /participants  - List participants                ║
║      GET  /winners       - Winner history                   ║
║      GET  /gameStatus    - Current game state               ║
║      POST /drawWinner    - Spin the wheel                   ║
║      POST /reset         - Reset game system                ║
║                                                               ║
║   ✨ System ready for connections ✨                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;