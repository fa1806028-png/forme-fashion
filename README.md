# FORME

A full-stack fashion storefront built with the Python standard library, SQLite, and browser-native JavaScript. It has a searchable, filterable catalog, a local shopping bag, and checkout that stores orders in SQLite.

## Run locally

Requirements: Python 3.10 or newer.

```powershell
python app.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The first run creates `store.db` automatically. Stop the server with `Ctrl+C`.

## API

- `GET /api/products` supports optional `category` (`men`, `women`, or `unisex`) and `q` query parameters.
- `GET /api/products/{id}` returns a product.
- `POST /api/orders` validates the submitted customer and items against server-side prices, then stores the order and line items in SQLite.
- `GET /api/health` is a health check.

Product photography is served from Unsplash; an internet connection is needed to load the images and web fonts.

## GitHub Pages portfolio

The `main` branch deploys the `static/` directory using `.github/workflows/pages.yml`. Enable GitHub Actions as the Pages source in the repository's Pages settings. Pages is static hosting, so its checkout is a clearly labeled demo and does not save orders or process payments. Run `python app.py` locally for the full SQLite-backed checkout.