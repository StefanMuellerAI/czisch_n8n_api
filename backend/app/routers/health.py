from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.config import get_settings
from app.schemas import HealthResponse
from app.temporal.client import TemporalConnectionError, get_temporal_client
from app.temporal.sftp import SFTPUploader, SFTPUploadError

router = APIRouter()
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    """
    Health check endpoint - no authentication required.
    
    Returns the service status, version, and database connectivity.
    """
    # Check database connection
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    # Check Temporal connectivity
    try:
        await get_temporal_client()
        temporal_status = "connected"
    except TemporalConnectionError as exc:
        temporal_status = f"unreachable: {exc}"
    except Exception as exc:
        temporal_status = f"error: {exc}"

    # Check SFTP connectivity (optional)
    sftp_configured = all([settings.sftp_host, settings.sftp_username, settings.sftp_password])
    sftp_status = "not_configured"
    if sftp_configured:
        try:
            with SFTPUploader() as sftp:
                sftp_status = "connected"
        except SFTPUploadError as exc:
            sftp_status = f"error: {exc}"
        except Exception as exc:
            sftp_status = f"error: {exc}"

    components_healthy = db_status == "connected" and temporal_status == "connected"
    if sftp_configured:
        components_healthy = components_healthy and sftp_status == "connected"
    overall_status = "healthy" if components_healthy else "degraded"

    return HealthResponse(
        status=overall_status,
        version=settings.app_version,
        database=db_status,
        temporal=temporal_status,
        sftp=sftp_status
    )



