const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(session({
  secret: "bohara-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Serve frontend files
app.use(express.static(path.join(__dirname, "frontend")));

// In-memory storage
let requests_db = [];
let round_winners = [];
let superadmin_override = { first: null, second: null, third: null };

const NUMBER_RANGE = Array.from({ length: 150 }, (_, i) => i + 1);

// User accounts
const users = {
  superadmin: { password: "sura@2026", role: "superadmin" },
  admin: { password: "Bohara2026", role: "admin" }
};

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt:", req.body);

  const user = users[username];
  if (user && user.password === password) {
    req.session.user = { username, role: user.role };
    return res.json({ role: user.role, username });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// AUTH MIDDLEWARE
function requireLogin(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect("/login.html");
    if (role && req.session.user.role !== role) return res.status(403).send("Forbidden");
    next();
  };
}

// PARTICIPANTS
app.post("/choose", (req, res) => {
  const { name, phone, numbers } = req.body;
  console.log("Received choose request:", req.body);

  if (!name || !phone || !numbers || numbers.length === 0) {
    return res.status(400).json({ error: "Name, phone, and numbers required" });
  }

  for (let number of numbers) {
    if (!NUMBER_RANGE.includes(number)) {
      return res.status(400).json({ error: `Invalid number ${number}` });
    }
    if (requests_db.find(r => r.number === number)) {
      return res.status(400).json({ error: `Number ${number} already chosen` });
    }
    requests_db.push({ name, phone, number });
  }
  return res.json({ message: `${name} (${phone}) chose numbers ${numbers}` });
});

app.get("/participants", (req, res) => res.json({ requests: requests_db }));

// WINNERS (example route)
app.get("/winners", (req, res) => {
  res.json({ rounds: round_winners });
});

// RESET (admin only)
app.post("/reset", requireLogin("admin"), (req, res) => {
  requests_db = [];
  round_winners = [];
  superadmin_override = { first: null, second: null, third: null };
  res.json({ message: "Game reset complete" });
});

// SUPERADMIN override winners
app.post("/override", requireLogin("superadmin"), (req, res) => {
  const { first, second, third } = req.body;
  superadmin_override = { first, second, third };
  res.json({ message: "Winners overridden", override: superadmin_override });
});

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));
