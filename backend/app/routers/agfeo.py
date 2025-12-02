"""
API Router for AGFEO phone events.
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_api_key
from app.models import Call, CallExport
from app.schemas import (
    CallEventCreate,
    CallResponse,
    CallListResponse,
    CallExportResponse,
    CallWithExports,
    MessageResponse
)

router = APIRouter()
logger = logging.getLogger(__name__)


def generate_call_id(from_number: str, timestamp: datetime) -> str:
    """Generate a unique call ID from phone number and timestamp."""
    ts_str = timestamp.strftime("%Y%m%d%H%M%S")
    # Clean phone number (remove + and spaces)
    clean_number = from_number.replace("+", "").replace(" ", "").replace("-", "")
    return f"{ts_str}_{clean_number}"


async def trigger_call_workflow(call_db_id: int):
    """Trigger Temporal workflow for call processing."""
    try:
        from app.temporal.client import trigger_call_processing
        logger.info(f"Triggering call processing workflow for call_db_id={call_db_id}")
        workflow_id = await trigger_call_processing(call_db_id)
        logger.info(f"Triggered workflow: {workflow_id}")
        return workflow_id
    except Exception as e:
        logger.error(f"Failed to trigger call workflow: {e}")
        raise


@router.post(
    "/agfeo/events/incoming",
    response_model=CallResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_api_key)]
)
async def receive_call_event(
    event: CallEventCreate,
    db: Session = Depends(get_db)
) -> CallResponse:
    """
    Receive an incoming call event from AGFEO.
    
    This endpoint:
    1. Stores the call event in the database
    2. Saves the original JSON as an export
    3. Triggers a Temporal workflow to convert JSON to XML
    
    Requires API key authentication via X-API-Key header.
    """
    # Generate unique call_id
    call_id = generate_call_id(event.from_number, event.timestamp)
    
    # Check if call already exists
    existing = db.query(Call).filter(Call.call_id == call_id).first()
    if existing:
        # Update existing call state
        existing.state = event.state
        existing.caller_name = event.caller_name or existing.caller_name
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new call
    db_call = Call(
        call_id=call_id,
        state=event.state,
        from_number=event.from_number,
        to_number=event.to_number,
        extension=event.extension,
        caller_name=event.caller_name,
        call_timestamp=event.timestamp,
        status="received"
    )
    db.add(db_call)
    db.flush()
    
    # Save original JSON as export
    json_content = json.dumps({
        "state": event.state,
        "from": event.from_number,
        "to": event.to_number,
        "extension": event.extension,
        "caller_name": event.caller_name,
        "timestamp": event.timestamp.isoformat()
    }, indent=2)
    
    db_export = CallExport(
        call_id=db_call.id,
        content=json_content,
        export_type="agfeo"
    )
    db.add(db_export)
    db.commit()
    db.refresh(db_call)
    
    # Trigger Temporal workflow for conversion
    try:
        await trigger_call_workflow(db_call.id)
    except Exception as e:
        logger.error(f"Failed to trigger call workflow: {e}")
        # Don't fail the request, call is saved
    
    return db_call


@router.get(
    "/agfeo/calls",
    response_model=CallListResponse,
    dependencies=[Depends(verify_api_key)]
)
async def list_calls(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db)
) -> CallListResponse:
    """
    Get all calls with pagination, sorted by timestamp (newest first).
    
    Requires API key authentication via X-API-Key header.
    """
    calls = db.query(Call).order_by(Call.call_timestamp.desc()).offset(skip).limit(limit).all()
    total = db.query(Call).count()
    
    return CallListResponse(calls=calls, total=total)


@router.get(
    "/agfeo/calls/{call_id}",
    response_model=CallWithExports,
    dependencies=[Depends(verify_api_key)]
)
async def get_call(
    call_id: int,
    db: Session = Depends(get_db)
) -> CallWithExports:
    """
    Get a single call by its database ID, including exports.
    
    Requires API key authentication via X-API-Key header.
    """
    db_call = db.query(Call).filter(Call.id == call_id).first()
    
    if db_call is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Call with id {call_id} not found."
        )
    
    # Get exports
    exports = db.query(CallExport).filter(CallExport.call_id == call_id).all()
    
    return CallWithExports(
        id=db_call.id,
        call_id=db_call.call_id,
        state=db_call.state,
        from_number=db_call.from_number,
        to_number=db_call.to_number,
        extension=db_call.extension,
        caller_name=db_call.caller_name,
        call_timestamp=db_call.call_timestamp,
        status=db_call.status,
        created_at=db_call.created_at,
        updated_at=db_call.updated_at,
        exports=exports
    )


@router.get(
    "/agfeo/calls/{call_id}/exports",
    response_model=list[CallExportResponse],
    dependencies=[Depends(verify_api_key)]
)
async def get_call_exports(
    call_id: int,
    export_type: str | None = None,
    db: Session = Depends(get_db)
) -> list[CallExportResponse]:
    """
    Get all exports for a specific call.
    
    Args:
        call_id: The call's database ID
        export_type: Optional filter by type ("agfeo" or "taifun")
    
    Requires API key authentication via X-API-Key header.
    """
    db_call = db.query(Call).filter(Call.id == call_id).first()
    
    if db_call is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Call with id {call_id} not found."
        )
    
    query = db.query(CallExport).filter(CallExport.call_id == call_id)
    
    if export_type:
        query = query.filter(CallExport.export_type == export_type)
    
    exports = query.all()
    
    return exports


@router.delete(
    "/agfeo/calls/{call_id}",
    response_model=MessageResponse,
    dependencies=[Depends(verify_api_key)]
)
async def delete_call(
    call_id: int,
    db: Session = Depends(get_db)
) -> MessageResponse:
    """
    Delete a call by its database ID.
    
    Requires API key authentication via X-API-Key header.
    """
    db_call = db.query(Call).filter(Call.id == call_id).first()
    
    if db_call is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Call with id {call_id} not found."
        )
    
    db.delete(db_call)
    db.commit()
    
    return MessageResponse(message=f"Call with id {call_id} has been deleted.")

