const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "frontend"))); // serve frontend files

// ------------------ GLOBAL STATE ------------------
let requests_db = [];
let round_winners = [];
let superadmin_override = { first: null, second: null, third: null };

const NUMBER_RANGE = Array.from({ length: 150 }, (_, i) => i + 1);

const users = {
  superadmin: {
    password: "sura@2026",
    role: "superadmin",
    secret_question: "What is your favorite color?",
    secret_answer: "blue"
  },
  admin: {
    password: "Bohara2026",
    role: "admin",
    secret_question: "What is your pet’s name?",
    secret_answer: "lucky"
  }
};

// ------------------ LOGIN ------------------
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  if (user && user.password === password) {
    return res.json({ role: user.role, username });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// ------------------ LOGOUT ------------------
app.get("/logout", (req, res) => {
  // redirect back to participants page
  res.redirect("/participants.html");
});

// ------------------ PARTICIPANTS ------------------
app.post("/choose", (req, res) => {
  const { name, phone, numbers } = req.body;
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

app.get("/participants", (req, res) => {
  res.json({ requests: requests_db });
});

// ------------------ DRAW WINNERS ------------------
app.post("/draw", (req, res) => {
  if (requests_db.length === 0) {
    return res.status(400).json({ error: "No requests yet" });
  }

  const labels = ["First", "Second", "Third"];
  const slots = ["first", "second", "third"];

  let currentRound = round_winners[round_winners.length - 1];
  if (!currentRound || currentRound.messages.length === 3) {
    currentRound = { round: round_winners.length + 1, messages: [], set_by: "admin" };
    round_winners.push(currentRound);
  }

  const slotIndex = currentRound.messages.length;
  const slot = slots[slotIndex];
  let num;

  // Secret Superadmin Override
  if (superadmin_override[slot]) {
    num = superadmin_override[slot];
  } else {
    do {
      num = Math.floor(Math.random() * 150) + 1;
    } while (currentRound.messages.find(m => m.includes(`Number ${num}`)));
  }

  const winner = requests_db.find(r => r.number === num);
  const message = winner
    ? `${labels[slotIndex]} Winner: Number ${num} belongs to ${winner.name} (${winner.phone})`
    : `${labels[slotIndex]} Winner: Number ${num} (no participant found)`;

  currentRound.messages.push(message);

  // Clear override for this slot
  superadmin_override[slot] = null;

  return res.json({ messages: currentRound.messages });
});

// ------------------ SUPERADMIN SET WINNERS ------------------
app.post("/superadmin/set_winners", (req, res) => {
  let { slot, number } = req.body;

  if (slot === 1 || slot === "1") slot = "first";
  if (slot === 2 || slot === "2") slot = "second";
  if (slot === 3 || slot === "3") slot = "third";

  if (!["first", "second", "third"].includes(slot)) {
    return res.status(400).json({ error: "Invalid slot" });
  }

  superadmin_override[slot] = number;
  return res.json({ message: `Superadmin secretly set ${slot} winner to number ${number}` });
});

// ------------------ WINNERS ------------------
app.get("/winners", (req, res) => {
  res.json({ rounds: round_winners });
});

// ------------------ RESET ------------------
app.post("/reset", (req, res) => {
  requests_db = [];
  round_winners = [];
  superadmin_override = { first: null, second: null, third: null };
  return res.json({ message: "Game reset successfully" });
});

// ------------------ ADMIN CHANGE PASSWORD ------------------
app.post("/admin/change_password", (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "New password required" });
  }
  users["admin"].password = password;
  return res.json({ message: "Password changed successfully. Please log in again." });
});

// ------------------ SUPERADMIN CHANGE PASSWORD ------------------
app.post("/superadmin/change_password", (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "New password required" });
  }
  users["superadmin"].password = password;
  return res.json({ message: "Superadmin password changed successfully. Please log in again." });
});

// ------------------ ADMIN REMOVE NUMBER ------------------
app.post("/admin/remove_number", (req, res) => {
  const { number, reason } = req.body;
  const idx = requests_db.findIndex(r => r.number === number);
  if (idx !== -1) {
    requests_db.splice(idx, 1);
    return res.json({ message: `Number ${number} removed. Reason: ${reason || "No reason provided"}` });
  }
  return res.status(404).json({ error: `Number ${number} not found` });
});

// ------------------ SUPERADMIN CREATE ADMIN ------------------
app.post("/superadmin/create_admin", (req, res) => {
  const { username, password, question, answer } = req.body;
  if (!username || !password || !question || !answer) {
    return res.status(400).json({ error: "Username, password, question, and answer required" });
  }
  if (users[username]) {
    return res.status(400).json({ error: "User already exists" });
  }
  users[username] = {
    password,
    role: "admin",
    secret_question: question,
    secret_answer: answer
  };
  return res.json({ message: `Admin ${username} created successfully` });
});

// ------------------ FALLBACK ------------------
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
