// Global frontend JS for Lucky Draw
// All fetch calls point to Render backend

const BACKEND_URL = "https://boharaluckydraw-backend.onrender.com";

// ------------------ PARTICIPANTS ------------------
async function loadParticipants() {
  const response = await fetch(`${BACKEND_URL}/participants`);
  const data = await response.json();
  return data.requests || [];
}

async function registerParticipant(name, phone, numbers) {
  const response = await fetch(`${BACKEND_URL}/choose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone, numbers })
  });
  return await response.json();
}

// ------------------ DRAW ------------------
async function drawWinner() {
  const response = await fetch(`${BACKEND_URL}/draw`, { method: "POST" });
  return await response.json();
}

// ------------------ WINNERS ------------------
async function loadWinners() {
  const response = await fetch(`${BACKEND_URL}/winners`);
  return await response.json();
}

// ------------------ RESET ------------------
async function resetGame() {
  const response = await fetch(`${BACKEND_URL}/reset`, { method: "POST" });
  return await response.json();
}

// ------------------ ADMIN ------------------
async function changeAdminPassword(newPass) {
  const response = await fetch(`${BACKEND_URL}/admin/change_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPass })
  });
  return await response.json();
}

async function removeNumber(num, reason) {
  const response = await fetch(`${BACKEND_URL}/admin/remove_number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number: num, reason })
  });
  return await response.json();
}

// ------------------ SUPERADMIN ------------------
async function setSuperadminWinner(slot, number) {
  const response = await fetch(`${BACKEND_URL}/superadmin/set_winners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot, number })
  });
  return await response.json();
}

async function changeSuperadminPassword(newPass) {
  const response = await fetch(`${BACKEND_URL}/superadmin/change_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPass })
  });
  return await response.json();
}

async function createAdmin(username, password, question, answer) {
  const response = await fetch(`${BACKEND_URL}/superadmin/create_admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, question, answer })
  });
  return await response.json();
}
