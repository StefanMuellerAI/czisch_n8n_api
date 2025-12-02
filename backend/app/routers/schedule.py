"""
API Router for managing scrape schedules.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_api_key
from app.models import ScrapeSchedule, ScrapeConfig
from app.temporal.client import TemporalConnectionError, WorkflowOperationError
from app.schemas import (
    ScheduleCreate,
    ScheduleResponse,
    ScheduleListResponse,
    MessageResponse
)

router = APIRouter()
logger = logging.getLogger(__name__)


async def sync_schedule_with_temporal(db: Session):
    """Sync database schedules with Temporal."""
    from app.temporal.client import sync_scrape_schedule
    
    schedules = db.query(ScrapeSchedule).filter(ScrapeSchedule.enabled == True).all()
    times = [(s.hour, s.minute) for s in schedules]
    
    # Get custom URL from config
    config = db.query(ScrapeConfig).filter(ScrapeConfig.id == 1).first()
    custom_url = config.custom_order_list_url if config else None
    
    try:
        await sync_scrape_schedule(times, custom_url)
        logger.info(f"Synced {len(times)} schedule times with Temporal (custom_url={custom_url})")
    except TemporalConnectionError as e:
        logger.error(f"Failed to sync schedule with Temporal: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to sync schedule with Temporal: {e}")
        raise WorkflowOperationError(str(e)) from e


@router.get(
    "/schedules",
    response_model=ScheduleListResponse,
    dependencies=[Depends(verify_api_key)]
)
async def list_schedules(
    db: Session = Depends(get_db)
) -> ScheduleListResponse:
    """
    Get all configured scraping schedules.
    
    Requires API key authentication via X-API-Key header.
    """
    from app.temporal.client import get_schedule_info
    
    schedules = db.query(ScrapeSchedule).order_by(
        ScrapeSchedule.hour, ScrapeSchedule.minute
    ).all()
    
    # Get Temporal schedule status
    try:
        schedule_info = await get_schedule_info()
    except TemporalConnectionError as exc:
        logger.error(f"Temporal unavailable when fetching schedule info: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as exc:
        logger.error(f"Failed to load schedule info: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to read schedule state from Temporal."
        )
    
    schedule_responses = []
    for s in schedules:
        schedule_responses.append(ScheduleResponse(
            id=s.id,
            hour=s.hour,
            minute=s.minute,
            enabled=s.enabled,
            created_at=s.created_at,
            time_display=f"{s.hour:02d}:{s.minute:02d}"
        ))
    
    return ScheduleListResponse(
        schedules=schedule_responses,
        total=len(schedules),
        schedule_active=schedule_info.exists and not schedule_info.paused
    )


@router.post(
    "/schedules",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_api_key)]
)
async def create_schedule(
    schedule_data: ScheduleCreate,
    db: Session = Depends(get_db)
) -> ScheduleResponse:
    """
    Add a new scraping time.
    
    Requires API key authentication via X-API-Key header.
    """
    # Check if time already exists
    existing = db.query(ScrapeSchedule).filter(
        ScrapeSchedule.hour == schedule_data.hour,
        ScrapeSchedule.minute == schedule_data.minute
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Schedule for {schedule_data.hour:02d}:{schedule_data.minute:02d} already exists"
        )
    
    # Create new schedule
    db_schedule = ScrapeSchedule(
        hour=schedule_data.hour,
        minute=schedule_data.minute,
        enabled=True
    )
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    
    # Sync with Temporal
    try:
        await sync_schedule_with_temporal(db)
    except Exception as e:
        logger.error(f"Failed to sync with Temporal: {e}")
        # Don't rollback - schedule is saved, just Temporal sync failed
    
    return ScheduleResponse(
        id=db_schedule.id,
        hour=db_schedule.hour,
        minute=db_schedule.minute,
        enabled=db_schedule.enabled,
        created_at=db_schedule.created_at,
        time_display=f"{db_schedule.hour:02d}:{db_schedule.minute:02d}"
    )


@router.delete(
    "/schedules/{schedule_id}",
    response_model=MessageResponse,
    dependencies=[Depends(verify_api_key)]
)
async def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db)
) -> MessageResponse:
    """
    Remove a scraping time.
    
    Requires API key authentication via X-API-Key header.
    """
    db_schedule = db.query(ScrapeSchedule).filter(ScrapeSchedule.id == schedule_id).first()
    
    if db_schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with id {schedule_id} not found"
        )
    
    time_str = f"{db_schedule.hour:02d}:{db_schedule.minute:02d}"
    
    db.delete(db_schedule)
    db.commit()
    
    # Sync with Temporal
    try:
        await sync_schedule_with_temporal(db)
    except Exception as e:
        logger.error(f"Failed to sync with Temporal: {e}")
    
    return MessageResponse(message=f"Schedule {time_str} deleted")


@router.post(
    "/schedules/sync",
    response_model=MessageResponse,
    dependencies=[Depends(verify_api_key)]
)
async def sync_schedules(
    db: Session = Depends(get_db)
) -> MessageResponse:
    """
    Manually sync database schedules with Temporal.
    
    Use this if the Temporal schedule got out of sync.
    
    Requires API key authentication via X-API-Key header.
    """
    try:
        await sync_schedule_with_temporal(db)

        schedules = db.query(ScrapeSchedule).filter(ScrapeSchedule.enabled == True).all()

        return MessageResponse(
            message=f"Synced {len(schedules)} schedule(s) with Temporal"
        )
    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable when syncing schedules: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync: {str(e)}"
        )


@router.put(
    "/schedules/{schedule_id}/toggle",
    response_model=ScheduleResponse,
    dependencies=[Depends(verify_api_key)]
)
async def toggle_schedule(
    schedule_id: int,
    db: Session = Depends(get_db)
) -> ScheduleResponse:
    """
    Toggle a schedule on/off.
    
    Requires API key authentication via X-API-Key header.
    """
    db_schedule = db.query(ScrapeSchedule).filter(ScrapeSchedule.id == schedule_id).first()
    
    if db_schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with id {schedule_id} not found"
        )
    
    db_schedule.enabled = not db_schedule.enabled
    db.commit()
    db.refresh(db_schedule)
    
    # Sync with Temporal
    try:
        await sync_schedule_with_temporal(db)
    except Exception as e:
        logger.error(f"Failed to sync with Temporal: {e}")
    
    return ScheduleResponse(
        id=db_schedule.id,
        hour=db_schedule.hour,
        minute=db_schedule.minute,
        enabled=db_schedule.enabled,
        created_at=db_schedule.created_at,
        time_display=f"{db_schedule.hour:02d}:{db_schedule.minute:02d}"
    )

