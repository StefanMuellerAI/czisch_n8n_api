from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import health, orders, scrape, schedule, agfeo

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup: Create database tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: Nothing to do here


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API für Order-Management mit CRUD-Operationen und Web-Scraping",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(orders.router, prefix="/api/v1", tags=["Orders"])
app.include_router(scrape.router, prefix="/api/v1", tags=["Scraping"])
app.include_router(schedule.router, prefix="/api/v1", tags=["Schedules"])
app.include_router(agfeo.router, prefix="/api/v1", tags=["AGFEO Calls"])
