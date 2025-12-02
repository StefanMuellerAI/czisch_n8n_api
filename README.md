# Czisch N8N API

Ein FastAPI-Backend mit PostgreSQL-Datenbank und Next.js-Frontend zum Testen der API-Endpunkte. Inkludiert Web-Scraping für das Handwerkerportal Duisburg.

## Projektstruktur

```
czisch_n8n_api/
├── backend/                 # FastAPI Backend
│   ├── app/
│   │   ├── main.py         # FastAPI App
│   │   ├── config.py       # Konfiguration
│   │   ├── database.py     # SQLAlchemy Setup
│   │   ├── models.py       # Datenbank-Modelle
│   │   ├── schemas.py      # Pydantic Schemas
│   │   ├── auth.py         # API Key Auth
│   │   ├── scraper.py      # Playwright Web-Scraper
│   │   └── routers/        # API Endpunkte
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # Next.js Frontend
├── docker-compose.yml      # Docker Setup
└── env.example            # Beispiel Umgebungsvariablen
```

## Schnellstart

### 1. Umgebungsvariablen

```bash
cp env.example .env
```

Passe die Werte in `.env` nach Bedarf an:
- `API_KEY` - API Schlüssel für Authentifizierung
- `HAPODU_USERNAME` - Benutzername für hapodu.duisburg.de
- `HAPODU_PASSWORD` - Passwort für hapodu.duisburg.de

### 2. Alles mit Docker starten

```bash
# PostgreSQL, Backend und Frontend starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f
```

Alle Services sind nun erreichbar unter:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Einzelne Services starten

```bash
# Nur Backend + PostgreSQL (ohne Frontend)
docker-compose up -d postgres backend

# Alle Services neu bauen
docker-compose up -d --build
```

## API Endpunkte

### Orders

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| GET | `/health` | Health Check | Nein |
| POST | `/api/v1/orders` | Order erstellen | Ja |
| GET | `/api/v1/orders` | Alle Orders auflisten | Ja |
| GET | `/api/v1/orders/{id}` | Einzelne Order abrufen | Ja |
| PUT | `/api/v1/orders/{id}` | Order aktualisieren | Ja |
| DELETE | `/api/v1/orders/{id}` | Order löschen | Ja |

### Scraping

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| POST | `/api/v1/scrape/orders` | Orders von Hapodu scrapen | Ja |
| GET | `/api/v1/orders/{id}/exports` | XML Exports einer Order | Ja |
| GET | `/api/v1/exports/{id}/xml` | Einzelnes XML abrufen | Ja |

## Authentifizierung

Alle Endpunkte außer `/health` erfordern den API Key im Header:

```bash
curl -H "X-API-Key: your-secret-api-key" http://localhost:8000/api/v1/orders
```

## Beispiele

### Order erstellen

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{"order_id": "ORD-001", "status": "pending"}'
```

### Alle Orders abrufen

```bash
curl http://localhost:8000/api/v1/orders \
  -H "X-API-Key: your-secret-api-key"
```

### Scraping starten

```bash
curl -X POST http://localhost:8000/api/v1/scrape/orders \
  -H "X-API-Key: your-secret-api-key"
```

### Order aktualisieren

```bash
curl -X PUT http://localhost:8000/api/v1/orders/1 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{"status": "completed"}'
```

### Order löschen

```bash
curl -X DELETE http://localhost:8000/api/v1/orders/1 \
  -H "X-API-Key: your-secret-api-key"
```

## Lokale Entwicklung (ohne Docker)

### Backend

```bash
cd backend

# Virtual Environment erstellen
python -m venv venv
source venv/bin/activate  # Linux/Mac
# oder: venv\Scripts\activate  # Windows

# Dependencies installieren
pip install -r requirements.txt

# Playwright Browser installieren
playwright install chromium

# PostgreSQL muss lokal laufen oder via Docker:
docker-compose up -d postgres

# Backend starten
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Datenbank-Schemas

### Order

```json
{
  "id": 1,
  "order_id": "ORD-001",
  "status": "pending",
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

Mögliche Status-Werte:
- `pending` - Ausstehend
- `processing` - In Bearbeitung
- `completed` - Abgeschlossen
- `cancelled` - Storniert
- `scraped` - Via Scraping importiert

### OrderExport

```json
{
  "id": 1,
  "order_id": 1,
  "belnr": "8440000658",
  "external_order_id": "301065",
  "xml_content": "<?xml ...>",
  "created_at": "2024-01-01T12:00:00Z"
}
```

## Web-Scraping Ablauf

1. Login auf hapodu.duisburg.de
2. Navigation zur Order-Liste
3. Extraktion aller Order-Links aus der Tabelle
4. Für jede neue Order:
   - Order-Detailseite öffnen
   - XML-Export herunterladen
   - Order und XML in Datenbank speichern

## Technologie-Stack

### Backend
- Python 3.11
- FastAPI
- SQLAlchemy
- PostgreSQL
- Pydantic
- Playwright (Web-Scraping)

### Frontend
- Next.js 15
- TypeScript
- Tailwind CSS
