# Czisch N8N API

Ein FastAPI-Backend mit PostgreSQL-Datenbank, Temporal Workflows und Next.js-Frontend. Inkludiert Web-Scraping für das Handwerkerportal Duisburg und AGFEO Telefonanlagen-Integration.

## Features

- **Order Management** - CRUD-Operationen für Bestellungen
- **Web Scraping** - Automatischer Import von Hapodu-Bestellungen
- **AGFEO Telefonie** - Eingehende Anrufe erfassen und als Kundenstammdaten exportieren
- **Temporal Workflows** - Orchestrierte XML-Konvertierung und SFTP-Upload
- **Automatisches Scheduling** - Zeitgesteuerte Scraping-Jobs
- **n8n Integration** - Workflow-Automatisierung

## Projektstruktur

```
czisch_n8n_api/
├── backend/                 # FastAPI Backend
│   ├── app/
│   │   ├── main.py         # FastAPI App
│   │   ├── config.py       # Konfiguration
│   │   ├── database.py     # SQLAlchemy Setup
│   │   ├── models.py       # Datenbank-Modelle (Order, Call, Schedule)
│   │   ├── schemas.py      # Pydantic Schemas
│   │   ├── auth.py         # API Key Auth
│   │   ├── scraper.py      # Playwright Web-Scraper
│   │   ├── routers/        # API Endpunkte
│   │   │   ├── orders.py   # Order CRUD
│   │   │   ├── scrape.py   # Scraping Trigger
│   │   │   ├── schedule.py # Zeitplanung
│   │   │   └── agfeo.py    # Telefonie
│   │   └── temporal/       # Temporal Workflows
│   │       ├── workflows.py
│   │       ├── activities.py
│   │       ├── worker.py
│   │       └── sftp.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # Next.js Frontend
├── temporal-config/        # Temporal Konfiguration
├── docker-compose.yml      # Docker Setup
└── env.example            # Beispiel Umgebungsvariablen
```

## Schnellstart

### 1. Umgebungsvariablen

```bash
cp env.example .env
```

Passe die Werte in `.env` an:

| Variable | Beschreibung |
|----------|--------------|
| `API_KEY` | API Schlüssel für Authentifizierung |
| `HAPODU_USERNAME` | Benutzername für hapodu.duisburg.de |
| `HAPODU_PASSWORD` | Passwort für hapodu.duisburg.de |
| `SFTP_HOST` | SFTP Server für Taifun-Import |
| `SFTP_USERNAME` | SFTP Benutzername |
| `SFTP_PASSWORD` | SFTP Passwort |
| `SFTP_REMOTE_PATH` | Zielverzeichnis auf SFTP |

### 2. Alles mit Docker starten

```bash
docker-compose up -d
```

### Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Frontend | http://localhost:3000 | Dashboard |
| Backend API | http://localhost:8000 | FastAPI |
| Swagger UI | http://localhost:8000/docs | API Dokumentation |
| Temporal UI | http://localhost:8088 | Workflow Monitoring |
| n8n | http://localhost:5678 | Workflow Automation |

## API Endpunkte

### Health

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| GET | `/health` | Health Check | Nein |

### Orders

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| GET | `/api/v1/orders` | Alle Orders (paginiert) | Ja |
| GET | `/api/v1/orders/{id}` | Einzelne Order | Ja |
| PUT | `/api/v1/orders/{id}` | Order aktualisieren | Ja |
| DELETE | `/api/v1/orders/{id}` | Order löschen | Ja |
| GET | `/api/v1/orders/{id}/exports` | XML Exports einer Order | Ja |

### Scraping

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| POST | `/api/v1/scrape/orders` | Scraping starten (Temporal Workflow) | Ja |
| GET | `/api/v1/workflows/{id}/status` | Workflow-Status abfragen | Ja |

### Scheduling

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| GET | `/api/v1/schedules` | Alle Zeitpläne | Ja |
| POST | `/api/v1/schedules` | Zeitplan hinzufügen | Ja |
| DELETE | `/api/v1/schedules/{id}` | Zeitplan löschen | Ja |
| POST | `/api/v1/schedules/sync` | Mit Temporal synchronisieren | Ja |

### AGFEO Telefonie

| Methode | Endpunkt | Beschreibung | Auth |
|---------|----------|--------------|------|
| POST | `/api/v1/agfeo/events/incoming` | Anruf-Event empfangen | Ja |
| GET | `/api/v1/agfeo/calls` | Alle Anrufe (paginiert) | Ja |
| GET | `/api/v1/agfeo/calls/{id}` | Einzelner Anruf mit Exports | Ja |
| GET | `/api/v1/agfeo/calls/{id}/exports` | Exports eines Anrufs | Ja |
| DELETE | `/api/v1/agfeo/calls/{id}` | Anruf löschen | Ja |

## Authentifizierung

Alle Endpunkte außer `/health` erfordern den API Key im Header:

```bash
curl -H "X-API-Key: your-secret-api-key" http://localhost:8000/api/v1/orders
```

## Beispiele

### Scraping starten

```bash
curl -X POST http://localhost:8000/api/v1/scrape/orders \
  -H "X-API-Key: your-secret-api-key"
```

Response:
```json
{
  "status": "started",
  "workflow_id": "scrape-orders-1733156789"
}
```

### AGFEO Anruf-Event senden

```bash
curl -X POST http://localhost:8000/api/v1/agfeo/events/incoming \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "state": "ringing",
    "from": "+492211234567",
    "to": "+492219876543",
    "extension": "23",
    "caller_name": "Max Mustermann",
    "timestamp": "2025-12-02T15:40:12+01:00"
  }'
```

Der Anruf wird:
1. In der Datenbank gespeichert
2. Automatisch zu Taifun KdList XML konvertiert
3. Per SFTP auf den Server hochgeladen

### Alle Anrufe abrufen

```bash
curl http://localhost:8000/api/v1/agfeo/calls \
  -H "X-API-Key: your-secret-api-key"
```

### Zeitplan hinzufügen

```bash
curl -X POST http://localhost:8000/api/v1/schedules \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{"hour": 6, "minute": 0}'
```

## Datenmodelle

### Order

```json
{
  "id": 1,
  "order_id": "301065_8440000658",
  "status": "sent",
  "created_at": "2025-12-02T12:00:00Z",
  "updated_at": "2025-12-02T12:05:00Z"
}
```

**Status-Werte:**
- `scraped` - Importiert von Hapodu
- `converted` - XML konvertiert
- `sent` - Auf SFTP hochgeladen

### Call

```json
{
  "id": 1,
  "call_id": "20251202154012_492211234567",
  "state": "ringing",
  "from_number": "+492211234567",
  "to_number": "+492219876543",
  "extension": "23",
  "caller_name": "Max Mustermann",
  "call_timestamp": "2025-12-02T15:40:12+01:00",
  "status": "sent",
  "created_at": "2025-12-02T15:40:12Z"
}
```

**Status-Werte:**
- `received` - Anruf empfangen
- `converted` - XML generiert
- `sent` - Auf SFTP hochgeladen

### Taifun KdList XML (Anruf-Export)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<KdList xmlns="urn:taifun-software.de:schema:TAIFUN">
  <Kd>
    <KdNr>0</KdNr>
    <Match>MAXMUSTERMANN</Match>
    <Name1>Max Mustermann</Name1>
    <Anrede>Firma/Damen u. Herren</Anrede>
    <Land>DE</Land>
    <Telefon>+492211234567</Telefon>
    <KdUse>true</KdUse>
    <Brutto>false</Brutto>
    <Sperre>false</Sperre>
    <Waehrung>0</Waehrung>
  </Kd>
</KdList>
```

## Temporal Workflows

### ScrapeAndProcessOrdersWorkflow

Orchestriert den kompletten Scraping-Prozess:
1. Order-Liste von Hapodu scrapen
2. Neue Orders filtern
3. Für jede neue Order: XML herunterladen → konvertieren → hochladen

### ProcessCallWorkflow

Verarbeitet eingehende Anrufe:
1. JSON laden
2. Zu Taifun KdList XML konvertieren
3. XML in Datenbank speichern
4. Per SFTP hochladen
5. Status auf "sent" setzen

## SFTP Dateinamen

- **Orders:** `order_{order_id}_{belnr}.xml`
- **Calls:** `call_{call_id}.xml`

## Lokale Entwicklung

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# PostgreSQL und Temporal starten
docker-compose up -d postgres temporal

# Backend starten
uvicorn app.main:app --reload --port 8000

# Temporal Worker starten
python -m app.temporal.worker
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Technologie-Stack

### Backend
- Python 3.11
- FastAPI
- SQLAlchemy + PostgreSQL
- Temporal (Workflow Engine)
- Playwright (Web-Scraping)
- Paramiko (SFTP)

### Frontend
- Next.js 15
- TypeScript
- Tailwind CSS

### Infrastructure
- Docker Compose
- Temporal Server
- n8n
