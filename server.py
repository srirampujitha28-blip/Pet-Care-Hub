from __future__ import annotations

import json
import sqlite3
import threading
import webbrowser
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from http.client import HTTPConnection, HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "petcare.db"
OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "llama3.2"
PET_ASSISTANT_PROMPT = (
    "You are Pawprint's friendly pet-care assistant. Answer questions about pet care, "
    "grooming, food, products, and everyday life with pets in a warm, practical way. "
    "For Pawprint product questions, use the live catalog supplied in the system context; "
    "do not invent products, prices, or stock availability. Grooming services include "
    "Bath & brush from $35, Full groom from $65, and Puppy introduction from $28. "
    "Give general information only, never diagnose or prescribe, and advise contacting "
    "a veterinarian for concerning symptoms or urgent situations. Keep replies concise."
)

PRODUCTS = [
    ("Cloud-soft Pet Bed", "Beds & comfort", 54.00, "https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=800&q=85", 4.9, 128, 14, "A washable, cloud-soft bed with a removable cover."),
    ("Everyday Walk Set", "Walk essentials", 28.00, "https://images.unsplash.com/photo-1601758123927-1960a6cd44da?auto=format&fit=crop&w=800&q=85", 4.8, 96, 22, "A comfortable adjustable harness and lead for daily adventures."),
    ("Slow-feeder Bowl", "Food & treats", 19.00, "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=800&q=85", 4.7, 74, 18, "A steady, easy-clean bowl designed to make mealtimes last."),
    ("Tug & Fetch Duo", "Toys & play", 16.00, "https://images.unsplash.com/photo-1535294435445-d7249524ef2e?auto=format&fit=crop&w=800&q=85", 4.9, 203, 31, "Two durable playtime favorites for tugging, tossing, and fetching."),
    ("Cozy Cat Cave", "Beds & comfort", 46.00, "https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=800&q=85", 4.8, 88, 9, "A snug felt hideaway for curling up and watching the world."),
    ("Gentle Groom Kit", "Grooming", 24.00, "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=800&q=85", 4.6, 57, 12, "A soft brush, paw balm, and pet-safe grooming essentials."),
    ("Training Treat Bites", "Food & treats", 12.00, "https://images.unsplash.com/photo-1582798358481-d199fb7347bb?auto=format&fit=crop&w=800&q=85", 4.9, 165, 40, "Small-batch, soft-baked treats for rewarding good moments."),
    ("Pawprint ID Tag", "Walk essentials", 14.00, "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=800&q=85", 4.8, 112, 26, "A lightweight engraved tag with room for your contact details."),
]


@contextmanager
def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def row_dict(row):
    return dict(row) if row else None


def init_db():
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
                price REAL NOT NULL, image TEXT NOT NULL, rating REAL NOT NULL DEFAULT 5,
                review_count INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
                description TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS pets (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, species TEXT NOT NULL,
                breed TEXT NOT NULL DEFAULT '', age TEXT NOT NULL DEFAULT '', weight TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, service TEXT NOT NULL,
                date TEXT NOT NULL, time TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Requested', FOREIGN KEY(pet_id) REFERENCES pets(id)
            );
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, title TEXT NOT NULL,
                due_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Wellness', done INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(pet_id) REFERENCES pets(id)
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT NOT NULL, items TEXT NOT NULL,
                total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Processing', created_at TEXT NOT NULL
            );
        """)
        if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            db.executemany("INSERT INTO products (name,category,price,image,rating,review_count,stock,description) VALUES (?,?,?,?,?,?,?,?)", PRODUCTS)
        if db.execute("SELECT COUNT(*) FROM pets").fetchone()[0] == 0:
            db.executemany("INSERT INTO pets (name,species,breed,age,weight,notes,image) VALUES (?,?,?,?,?,?,?)", [
                ("Milo", "Dog", "Golden retriever", "4 years", "62 lb", "Allergic to chicken", "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=300&q=80"),
                ("Miso", "Cat", "Calico", "2 years", "9 lb", "Loves sunny windows", "https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=300&q=80"),
            ])
        if db.execute("SELECT COUNT(*) FROM reminders").fetchone()[0] == 0:
            today = date.today()
            db.executemany("INSERT INTO reminders (pet_id,title,due_date,kind) VALUES (?,?,?,?)", [
                (1, "Flea & tick treatment", (today + timedelta(days=3)).isoformat(), "Medication"),
                (2, "Annual wellness check", (today + timedelta(days=8)).isoformat(), "Wellness"),
                (1, "Rabies booster", (today + timedelta(days=22)).isoformat(), "Vaccination"),
            ])
        if db.execute("SELECT COUNT(*) FROM appointments").fetchone()[0] == 0:
            db.execute("INSERT INTO appointments (pet_id,service,date,time,notes,status) VALUES (1,'Annual wellness check',?,?,?,'Confirmed')", ((date.today() + timedelta(days=5)).isoformat(), "10:30 AM", "Bring Milo's vaccine records"))


class Handler(BaseHTTPRequestHandler):
    server_version = "PawprintLocal/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self.api_get(path)
        requested = "index.html" if path == "/" else path.lstrip("/")
        target = (ROOT / requested).resolve()
        if ROOT not in target.parents and target != ROOT:
            return self.send_error(403)
        if not target.is_file():
            return self.send_error(404)
        content_type = {".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml"}.get(target.suffix, "application/octet-stream")
        content = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def api_get(self, path):
        with connect() as db:
            if path == "/api/data":
                data = {table: [row_dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY id")] for table in ("products", "pets", "appointments", "reminders")}
                data["reminders"] = [{**item, "done": bool(item["done"])} for item in data["reminders"]]
                data["orders"] = self.get_orders(db)
                return self.send_json(data)
            if path == "/api/orders":
                return self.send_json(self.get_orders(db))
        return self.send_json({"error": "Not found"}, 404)

    def get_orders(self, db):
        orders = [row_dict(row) for row in db.execute("SELECT * FROM orders ORDER BY id DESC")]
        for order in orders:
            order["items"] = json.loads(order["items"])
        return orders

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self.read_json()
            if path == "/api/chat":
                return self.api_chat(payload)
            with connect() as db:
                if path == "/api/pets":
                    fields = (payload.get("name", "").strip(), payload.get("species", "Dog"), payload.get("breed", ""), payload.get("age", ""), payload.get("weight", ""), payload.get("notes", ""), payload.get("image", ""))
                    if not fields[0]: return self.send_json({"error": "Pet name is required"}, 400)
                    cursor = db.execute("INSERT INTO pets (name,species,breed,age,weight,notes,image) VALUES (?,?,?,?,?,?,?)", fields)
                    return self.send_json({"id": cursor.lastrowid}, 201)
                if path == "/api/appointments":
                    pet_id = int(payload["pet_id"])
                    cursor = db.execute("INSERT INTO appointments (pet_id,service,date,time,notes) VALUES (?,?,?,?,?)", (pet_id, payload["service"], payload["date"], payload["time"], payload.get("notes", "")))
                    return self.send_json({"id": cursor.lastrowid}, 201)
                if path == "/api/reminders":
                    cursor = db.execute("INSERT INTO reminders (pet_id,title,due_date,kind) VALUES (?,?,?,?)", (int(payload["pet_id"]), payload["title"].strip(), payload["due_date"], payload.get("kind", "Wellness")))
                    return self.send_json({"id": cursor.lastrowid}, 201)
                if path == "/api/orders":
                    customer = payload.get("customer", "Pet parent").strip() or "Pet parent"
                    requested = payload.get("items", [])
                    if not requested: return self.send_json({"error": "Your cart is empty"}, 400)
                    order_items, total = [], 0.0
                    for item in requested:
                        product = db.execute("SELECT * FROM products WHERE id=?", (int(item["product_id"]),)).fetchone()
                        quantity = int(item["quantity"])
                        if not product or quantity < 1: return self.send_json({"error": "A product in the cart is unavailable"}, 400)
                        if product["stock"] < quantity: return self.send_json({"error": f"Only {product['stock']} of {product['name']} are in stock"}, 409)
                        total += product["price"] * quantity
                        order_items.append({"product_id": product["id"], "name": product["name"], "price": product["price"], "quantity": quantity})
                    for item in order_items:
                        db.execute("UPDATE products SET stock=stock-? WHERE id=?", (item["quantity"], item["product_id"]))
                    cursor = db.execute("INSERT INTO orders (customer,items,total,created_at) VALUES (?,?,?,?)", (customer, json.dumps(order_items), round(total, 2), datetime.now().isoformat(timespec="seconds")))
                    return self.send_json({"id": cursor.lastrowid, "total": round(total, 2)}, 201)
                if path == "/api/products":
                    fields = (payload["name"].strip(), payload["category"].strip(), float(payload["price"]), payload.get("image", ""), float(payload.get("rating", 5)), int(payload.get("review_count", 0)), int(payload.get("stock", 0)), payload.get("description", ""))
                    cursor = db.execute("INSERT INTO products (name,category,price,image,rating,review_count,stock,description) VALUES (?,?,?,?,?,?,?,?)", fields)
                    return self.send_json({"id": cursor.lastrowid}, 201)
            return self.send_json({"error": "Not found"}, 404)
        except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error:
            return self.send_json({"error": str(error) or "Invalid request"}, 400)

    def api_chat(self, payload):
        message = payload.get("message", "")
        if not isinstance(message, str) or not message.strip():
            return self.send_json({"error": "Type a message to chat with the pet assistant."}, 400)
        if len(message) > 4000:
            return self.send_json({"error": "Please keep your message under 4,000 characters."}, 400)

        with connect() as db:
            catalog = [row_dict(row) for row in db.execute(
                "SELECT name, category, price, stock, description FROM products ORDER BY name"
            )]
        system_context = f"{PET_ASSISTANT_PROMPT}\nCurrent product catalog (JSON): {json.dumps(catalog)}"
        messages = [{"role": "system", "content": system_context}]
        history = payload.get("history", [])
        if isinstance(history, list):
            for entry in history[-12:]:
                if not isinstance(entry, dict):
                    continue
                role = entry.get("role")
                content = entry.get("content")
                if role in {"user", "assistant"} and isinstance(content, str):
                    messages.append({"role": role, "content": content[:4000]})
        messages.append({"role": "user", "content": message.strip()})

        endpoint = urlparse(OLLAMA_CHAT_URL)
        connection = HTTPConnection(endpoint.hostname, endpoint.port, timeout=4)
        error_message = None
        error_status = 502
        reply = ""
        try:
            connection.connect()
            connection.sock.settimeout(120)
            connection.request(
                "POST",
                endpoint.path,
                body=json.dumps({"model": OLLAMA_MODEL, "messages": messages, "stream": False}),
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            if response.status == 404:
                error_message = "The llama3.2 model is not available in Ollama. Run `ollama pull llama3.2` and try again."
                error_status = 503
            elif response.status != 200:
                error_message = f"Ollama returned an error ({response.status}). Please try again."
            else:
                result = json.loads(response.read().decode("utf-8"))
                reply = result.get("message", {}).get("content", "").strip()
                if not reply:
                    error_message = "Ollama returned an empty reply. Please try again."
        except TimeoutError:
            error_message = "Ollama took too long to reply. Please try again."
            error_status = 504
        except (OSError, HTTPException):
            error_message = "Ollama is not responding. Start Ollama, make sure llama3.2 is installed, and try again."
            error_status = 503
        except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
            error_message = "Ollama returned an invalid response. Please try again."
        finally:
            connection.close()
        if error_message:
            return self.send_json({"error": error_message}, error_status)
        return self.send_json({"reply": reply})

    def do_PUT(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/products/"):
            return self.send_json({"error": "Not found"}, 404)
        try:
            product_id = int(path.rsplit("/", 1)[1])
            payload = self.read_json()
            with connect() as db:
                cursor = db.execute("UPDATE products SET name=?,category=?,price=?,image=?,rating=?,review_count=?,stock=?,description=? WHERE id=?", (payload["name"].strip(), payload["category"].strip(), float(payload["price"]), payload.get("image", ""), float(payload.get("rating", 5)), int(payload.get("review_count", 0)), int(payload.get("stock", 0)), payload.get("description", ""), product_id))
                if not cursor.rowcount: return self.send_json({"error": "Product not found"}, 404)
            return self.send_json({"ok": True})
        except (ValueError, KeyError, TypeError) as error:
            return self.send_json({"error": str(error)}, 400)

    def do_PATCH(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "api": return self.send_json({"error": "Not found"}, 404)
        table, record_id = parts[1], parts[2]
        try:
            payload = self.read_json()
            allowed = {"orders": {"status": {"Processing", "Packed", "Shipped", "Delivered", "Cancelled"}}, "appointments": {"status": {"Requested", "Confirmed", "Completed", "Cancelled"}}, "reminders": {"done": {True, False}}}
            if table not in allowed: return self.send_json({"error": "Not found"}, 404)
            field = next(iter(payload), "")
            value = payload.get(field)
            if field not in allowed[table] or value not in allowed[table][field]: return self.send_json({"error": "Invalid update"}, 400)
            with connect() as db:
                cursor = db.execute(f"UPDATE {table} SET {field}=? WHERE id=?", (int(value) if field == "done" else value, int(record_id)))
                if not cursor.rowcount: return self.send_json({"error": "Record not found"}, 404)
            return self.send_json({"ok": True})
        except (ValueError, TypeError) as error:
            return self.send_json({"error": str(error)}, 400)


def main():
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    url = "http://127.0.0.1:8000"
    print(f"Pawprint Pet Care Hub is running at {url}")
    print("Local demo only: admin routes have no authentication or payment processing.")
    threading.Timer(0.8, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping Pawprint server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
