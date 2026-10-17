from __future__ import annotations

import json
import mimetypes
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_ROOT = ROOT / "static"
DATABASE = ROOT / "store.db"
HOST = "127.0.0.1"
PORT = 8000

PRODUCTS = json.loads((STATIC_ROOT / "products.json").read_text(encoding="utf-8"))["products"]
PRODUCT_BY_ID = {product["id"]: product for product in PRODUCTS}


def init_db() -> None:
    with sqlite3.connect(DATABASE) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                address TEXT NOT NULL,
                total_cents INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL REFERENCES orders(id),
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price_cents INTEGER NOT NULL
            )"""
        )


class StoreHandler(BaseHTTPRequestHandler):
    server_version = "FormeStore/1.0"

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/products":
            params = parse_qs(parsed.query)
            category = params.get("category", [""])[0].lower()
            search = params.get("q", [""])[0].strip().casefold()
            products = PRODUCTS
            if category in {"men", "women", "unisex"}:
                products = [item for item in products if item["category"] in {category, "unisex"}]
            if search:
                products = [
                    item for item in products
                    if search in " ".join(str(item[key]) for key in ("name", "type", "color", "category")).casefold()
                ]
            self.send_json(200, {"products": products})
            return

        if parsed.path.startswith("/api/products/"):
            product_id = unquote(parsed.path.removeprefix("/api/products/"))
            product = PRODUCT_BY_ID.get(product_id)
            if product is None:
                self.send_json(404, {"error": "Product not found."})
            else:
                self.send_json(200, {"product": product})
            return

        if parsed.path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return

        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/orders":
            self.send_json(404, {"error": "Endpoint not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 1_000_000:
                raise ValueError("Invalid request size.")
            payload = json.loads(self.rfile.read(content_length))
            customer = payload.get("customer", {})
            name = str(customer.get("name", "")).strip()
            email = str(customer.get("email", "")).strip()
            address = str(customer.get("address", "")).strip()
            items = payload.get("items", [])
            if not name or len(name) > 120:
                raise ValueError("Enter a valid name.")
            if "@" not in email or len(email) > 254:
                raise ValueError("Enter a valid email address.")
            if not address or len(address) > 300:
                raise ValueError("Enter a valid delivery address.")
            if not isinstance(items, list) or not items or len(items) > len(PRODUCTS):
                raise ValueError("Your bag is empty or invalid.")

            normalized_items = []
            total_cents = 0
            seen_ids = set()
            for item in items:
                product_id = str(item.get("id", ""))
                quantity = item.get("quantity")
                product = PRODUCT_BY_ID.get(product_id)
                if (
                    product is None or product_id in seen_ids
                    or not isinstance(quantity, int) or isinstance(quantity, bool)
                    or quantity < 1 or quantity > 20
                ):
                    raise ValueError("One or more items in your bag are invalid.")
                seen_ids.add(product_id)
                total_cents += product["price"] * quantity
                normalized_items.append((product, quantity))

            order_id = uuid.uuid4().hex[:10].upper()
            with sqlite3.connect(DATABASE) as connection:
                connection.execute("PRAGMA foreign_keys = ON")
                connection.execute(
                    "INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)",
                    (order_id, name, email, address, total_cents, datetime.now(timezone.utc).isoformat()),
                )
                connection.executemany(
                    "INSERT INTO order_items "
                    "(order_id, product_id, product_name, quantity, unit_price_cents) "
                    "VALUES (?, ?, ?, ?, ?)",
                    [(order_id, product["id"], product["name"], quantity, product["price"])
                     for product, quantity in normalized_items],
                )
            self.send_json(201, {"orderId": order_id, "totalCents": total_cents})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error) or "Invalid order."})

    def serve_static(self, request_path: str) -> None:
        relative_path = unquote(request_path).lstrip("/") or "index.html"
        target = (STATIC_ROOT / relative_path).resolve()
        if not target.is_relative_to(STATIC_ROOT.resolve()) or not target.is_file():
            target = STATIC_ROOT / "index.html"
        try:
            body = target.read_bytes()
        except OSError:
            self.send_json(404, {"error": "Page not found."})
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), StoreHandler)
    print(f"FORME is running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down FORME.")
        server.server_close()