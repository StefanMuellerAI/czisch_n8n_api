import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import (
    get_redoc_html,
    get_swagger_ui_html,
    get_swagger_ui_oauth2_redirect_html,
)
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import health, orders, scrape, schedule, agfeo
from app.auth import verify_api_key

settings = get_settings()
logger = logging.getLogger("app")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    if not settings.api_key:
        raise RuntimeError("API key must be configured via the API_KEY environment variable.")
    if not settings.database_url:
        raise RuntimeError("Database URL must be configured via the DATABASE_URL environment variable.")
    # Startup: Create database tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: Nothing to do here


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API für Order-Management mit CRUD-Operationen und Web-Scraping",
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    start_time = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.exception(
            "Request %s %s failed after %.2f ms [request_id=%s]",
            request.method,
            request.url.path,
            duration_ms,
            request_id,
        )
        raise

    duration_ms = (time.perf_counter() - start_time) * 1000
    response.headers["X-Request-ID"] = request_id

    log_method = logger.info
    if response.status_code >= 500:
        log_method = logger.error
    elif response.status_code >= 400:
        log_method = logger.warning

    log_method(
        "Request %s %s completed with %s in %.2f ms [request_id=%s]",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )

    return response

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(orders.router, prefix="/api/v1", tags=["Orders"])
app.include_router(scrape.router, prefix="/api/v1", tags=["Scraping"])
app.include_router(schedule.router, prefix="/api/v1", tags=["Schedules"])
app.include_router(agfeo.router, prefix="/api/v1", tags=["AGFEO Calls"])


def custom_openapi() -> dict:
    """Generate and cache the OpenAPI schema for the application."""
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema


@app.get("/openapi.json", dependencies=[Depends(verify_api_key)], include_in_schema=False)
async def get_openapi_schema() -> JSONResponse:
    """Serve the OpenAPI schema behind API key authentication."""
    return JSONResponse(custom_openapi())


@app.get("/docs", dependencies=[Depends(verify_api_key)], include_in_schema=False)
async def get_documentation():
    """Serve the Swagger UI documentation behind API key authentication."""
    return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{app.title} - Docs")


@app.get("/docs/oauth2-redirect", include_in_schema=False)
async def swagger_ui_redirect():
    return get_swagger_ui_oauth2_redirect_html()


@app.get("/redoc", dependencies=[Depends(verify_api_key)], include_in_schema=False)
async def redoc_html():
    """Serve the ReDoc documentation behind API key authentication."""
    return get_redoc_html(openapi_url="/openapi.json", title=f"{app.title} - ReDoc")
