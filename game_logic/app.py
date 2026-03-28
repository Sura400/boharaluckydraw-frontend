from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_from_directory
import random, os

app = Flask(__name__)
app.secret_key = "SUPER_SECRET_KEY"

NUMBER_RANGE = list(range(1, 101))
requests_db = []
round_winners = []
superadmin_override = None  # store Super Admin’s chosen winners

users = {
    "superadmin": {
        "password": "sura@2026",
        "role": "superadmin",
        "secret_question": "What is your favorite color?",
        "secret_answer": "blue"
    },
    "admin": {
        "password": "Bohara2026",
        "role": "admin",
        "secret_question": "What is your pet’s name?",
        "secret_answer": "lucky"
    }
}

# ------------------ STATIC FILES ------------------
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory("static", filename)

# ------------------ HOME ------------------
@app.route('/')
def home():
    return render_template("index.html")

# ------------------ LOGIN ------------------
@app.route('/login', methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = users.get(username)
        if user and user["password"] == password:
            session["role"] = user["role"]
            session["username"] = username
            if user["role"] == "admin":
                return redirect(url_for("admin_home"))
            elif user["role"] == "superadmin":
                return redirect(url_for("superadmin_home"))
        else:
            return render_template("login.html", error="Invalid credentials")
    return render_template("login.html")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for("home"))

# ------------------ DASHBOARDS ------------------
@app.route('/admin')
def admin_home():
    if session.get("role") != "admin":
        return redirect(url_for("login"))
    return render_template("admin.html")

@app.route('/superadmin')
def superadmin_home():
    if session.get("role") != "superadmin":
        return redirect(url_for("login"))
    return render_template("superadmin.html")

# ------------------ PARTICIPANTS ------------------
@app.route('/choose', methods=['POST'])
def choose_number():
    name = request.form.get("name")
    phone = request.form.get("phone")
    numbers = request.form.getlist("numbers")
    numbers = [int(n) for n in numbers]

    if not name or not phone or not numbers:
        return jsonify({"error": "Name, phone number, and at least one number are required"}), 400

    receipt_path = None
    if 'receipt' in request.files:
        file = request.files['receipt']
        upload_folder = "uploads"
        os.makedirs(upload_folder, exist_ok=True)
        receipt_path = os.path.join(upload_folder, file.filename)
        file.save(receipt_path)

    for number in numbers:
        if number not in NUMBER_RANGE:
            return jsonify({"error": f"Invalid number {number}"}), 400
        for r in requests_db:
            if r["number"] == number:
                return jsonify({"error": f"Number {number} is already chosen"}), 400
        requests_db.append({"name": name, "phone": phone, "number": number, "receipt": receipt_path})

    return jsonify({"message": f"{name} ({phone}) successfully chose numbers {numbers}"})

@app.route('/participants')
def participants():
    return jsonify({"requests": requests_db})

# ------------------ WINNERS ------------------
@app.route('/draw', methods=['POST'])
def draw_winner():
    global superadmin_override
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    if not requests_db:
        return jsonify({"error": "No requests yet"}), 400

    messages = []
    labels = ["First", "Second", "Third"]

    # If Super Admin has set winners, use those instead of random
    if superadmin_override:
        for idx, num in enumerate(superadmin_override):
            winner = next((r for r in requests_db if r["number"] == num), None)
            if winner:
                msg = f"{labels[idx]} Winner: Number {num} belongs to {winner['name']} ({winner['phone']})"
            else:
                msg = f"{labels[idx]} Winner: Number {num} (no participant found)"
            messages.append(msg)
        round_winners.append({"round": len(round_winners)+1, "messages": messages, "set_by": "superadmin"})
        return jsonify({"messages": messages, "note": "Super Admin winners applied"})

    # Otherwise, Admin draws randomly
    winning_numbers = random.sample(NUMBER_RANGE, 3)
    for idx, num in enumerate(winning_numbers):
        winner = next((r for r in requests_db if r["number"] == num), None)
        if winner:
            msg = f"{labels[idx]} Winner: Number {num} belongs to {winner['name']} ({winner['phone']})"
        else:
            msg = f"{labels[idx]} Winner: Number {num} (no participant found)"
        messages.append(msg)

    round_winners.append({"round": len(round_winners)+1, "messages": messages, "set_by": "admin"})
    # Frontend will animate + play sound + confetti
    return jsonify({"winners": winning_numbers, "messages": messages})

@app.route('/superadmin/set_winners', methods=['POST'])
def set_winners():
    global superadmin_override
    if session.get("role") != "superadmin":
        return jsonify({"error": "Unauthorized"}), 403

    numbers = request.json.get("numbers")
    if not numbers or len(numbers) == 0:
        return jsonify({"error": "Provide at least one number"}), 400
    if len(numbers) > 3:
        return jsonify({"error": "You can only set up to 3 winners"}), 400

    superadmin_override = numbers
    labels = ["First", "Second", "Third"]
    messages = []

    for idx, num in enumerate(numbers):
        winner = next((r for r in requests_db if r["number"] == num), None)
        if winner:
            msg = f"{labels[idx]} Winner: Number {num} belongs to {winner['name']} ({winner['phone']})"
        else:
            msg = f"{labels[idx]} Winner: Number {num} (no participant found)"
        messages.append(msg)

    round_winners.append({"round": len(round_winners)+1, "messages": messages, "set_by": "superadmin"})
    return jsonify({"messages": messages})

@app.route('/winners')
def get_winners():
    return jsonify({"rounds": round_winners})

@app.route('/reset', methods=['POST'])
def reset_game():
    global requests_db, round_winners, superadmin_override
    if session.get("role") not in ["admin", "superadmin"]:
        return jsonify({"error": "Unauthorized"}), 403
    requests_db = []
    round_winners = []
    superadmin_override = None
    return jsonify({"message": "Game has been reset successfully"})

# ------------------ ADMIN PASSWORD MANAGEMENT ------------------
@app.route('/admin/change_password', methods=['POST'])
def admin_change_password():
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    new_password = request.json.get("password")
    if not new_password:
        return jsonify({"error": "New password required"}), 400
    users["admin"]["password"] = new_password
    session.clear()
    return jsonify({"message": "Password changed successfully. Please log in again."})

# ------------------ ADMIN REMOVE NUMBER ------------------
@app.route('/admin/remove_number', methods=['POST'])
def remove_number():
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    number = request.json.get("number")
    reason = request.json.get("reason", "No reason provided")

    for r in requests_db:
        if r["number"] == number:
            requests_db.remove(r)
            return jsonify({"message": f"Number {number} removed. Reason: {reason}"})
    return jsonify({"error": f"Number {number} not found"}), 404

# ------------------ SUPERADMIN MANAGEMENT ------------------
@app.route('/superadmin/create_admin', methods=['POST'])
def create_admin():
    if session.get("role") != "superadmin":
        return jsonify({"error": "Unauthorized"}), 403
    username = request.json.get("username")
    password = request.json.get("password")
    question = request.json.get("question")
    answer = request.json.get("answer")
    if not username or not password or not question or not answer:
        return jsonify({"error": "Username, password, question, and answer required"}), 400
    if username in users:
        return jsonify({"error": "User already exists"}), 400
        users[username] = {
        "password": password,
        "role": "admin",
        "secret_question": question,
        "secret_answer": answer
    }
    return jsonify({"message": f"Admin {username} created successfully"})

# ------------------ MAIN ------------------
if __name__ == "__main__":
    # Ensure uploads and static folders exist
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("static", exist_ok=True)

    # Run the Flask app
    app.run(host="0.0.0.0", port=8000, debug=True)
