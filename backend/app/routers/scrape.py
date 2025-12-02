import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import verify_api_key
from app.enums import OrderStatus
from app.models import Order, OrderExport, ScrapeConfig
from app.schemas import (
    ScrapeRequest,
    ScrapeErrorResponse,
    OrderExportResponse,
    ScrapeConfigResponse,
    ScrapeConfigUpdate
)
from app.temporal.client import TemporalConnectionError, WorkflowOperationError

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/scrape/orders",
    responses={
        500: {"model": ScrapeErrorResponse}
    },
    dependencies=[Depends(verify_api_key)]
)
async def scrape_orders(
    request: ScrapeRequest = ScrapeRequest(),
) -> dict:
    """
    Trigger scraping and processing of orders from the Handwerkerportal Duisburg website.
    
    This endpoint triggers a Temporal workflow that:
    1. Scrapes the order list from the website
    2. Filters for new orders (not yet in database)
    3. For each new order: scrape XML → convert → upload to SFTP
    
    The entire process runs as a Temporal workflow, so you can track progress in the Temporal UI.
    Use GET /api/v1/workflows/{workflow_id}/status to poll for completion.
    
    Requires API key authentication via X-API-Key header.
    """
    try:
        from app.temporal.client import trigger_scrape_and_process

        logger.info(f"Triggering scrape and process workflow with URL: {request.order_list_url}")
        workflow_id = await trigger_scrape_and_process(request.order_list_url)

        logger.info(f"Workflow started: {workflow_id}")

        return {
            "status": "triggered",
            "workflow_id": workflow_id,
            "message": "Scrape and process workflow started."
        }

    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        logger.error(f"Failed to trigger workflow: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger workflow: {str(e)}"
        )


@router.get(
    "/workflows/{workflow_id}/status",
    dependencies=[Depends(verify_api_key)]
)
async def get_workflow_status(workflow_id: str) -> dict:
    """
    Get the current status of a Temporal workflow.
    
    Returns:
        - status: RUNNING, COMPLETED, FAILED, CANCELED, TERMINATED, TIMED_OUT, NOT_FOUND
        - result: The workflow result if completed
        - error: Error message if failed
    
    Requires API key authentication via X-API-Key header.
    """
    try:
        from app.temporal.client import get_workflow_status as get_status

        status_result = await get_status(workflow_id)

        return {
            "workflow_id": status_result.workflow_id,
            "status": status_result.status,
            "result": status_result.result,
            "error": status_result.error
        }

    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        logger.error(f"Failed to get workflow status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get workflow status: {str(e)}"
        )


@router.get(
    "/orders/{order_id}/exports",
    response_model=list[OrderExportResponse],
    dependencies=[Depends(verify_api_key)]
)
async def get_order_exports(
    order_id: int,
    export_type: str | None = None,
    db: Session = Depends(get_db)
) -> list[OrderExportResponse]:
    """
    Get all XML exports for a specific order.
    
    Args:
        order_id: The order ID
        export_type: Optional filter by type ("hapodu" or "taifun")
    
    Requires API key authentication via X-API-Key header.
    """
    db_order = db.query(Order).filter(Order.id == order_id).first()
    
    if db_order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found."
        )
    
    query = db.query(OrderExport).filter(OrderExport.order_id == order_id)
    
    if export_type:
        query = query.filter(OrderExport.export_type == export_type)
    
    exports = query.all()
    
    return exports


@router.get(
    "/exports/{export_id}/xml",
    response_model=dict,
    dependencies=[Depends(verify_api_key)]
)
async def get_export_xml(
    export_id: int,
    db: Session = Depends(get_db)
) -> dict:
    """
    Get the raw XML content of a specific export.
    
    Requires API key authentication via X-API-Key header.
    """
    export = db.query(OrderExport).filter(OrderExport.id == export_id).first()
    
    if export is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Export with id {export_id} not found."
        )
    
    return {
        "id": export.id,
        "belnr": export.belnr,
        "external_order_id": export.external_order_id,
        "xml_content": export.xml_content,
        "export_type": export.export_type
    }


@router.post(
    "/exports/{export_id}/convert",
    dependencies=[Depends(verify_api_key)]
)
async def trigger_conversion(
    export_id: int,
    db: Session = Depends(get_db)
) -> dict:
    """
    Manually trigger XML conversion for a specific Hapodu export.
    
    Requires API key authentication via X-API-Key header.
    """
    export = db.query(OrderExport).filter(
        OrderExport.id == export_id,
        OrderExport.export_type == "hapodu"
    ).first()
    
    if export is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hapodu export with id {export_id} not found."
        )
    
    try:
        from app.temporal.client import trigger_xml_conversion
        workflow_id = await trigger_xml_conversion(export_id)
        return {
            "status": "triggered",
            "workflow_id": workflow_id,
            "export_id": export_id
        }
    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger conversion: {str(e)}"
        )


@router.get(
    "/exports/pending",
    dependencies=[Depends(verify_api_key)]
)
async def get_pending_conversions(
    db: Session = Depends(get_db)
) -> dict:
    """
    Get all Hapodu exports that don't have a corresponding Taifun export yet.
    
    Requires API key authentication via X-API-Key header.
    """
    from sqlalchemy import and_, not_, exists, select
    
    # Find hapodu exports without a taifun counterpart
    taifun_exists = (
        select(OrderExport.id)
        .where(
            and_(
                OrderExport.order_id == Order.id,
                OrderExport.export_type == "taifun"
            )
        )
        .correlate(Order)
        .exists()
    )
    
    pending_exports = db.query(OrderExport).join(Order).filter(
        OrderExport.export_type == "hapodu",
        ~taifun_exists
    ).all()
    
    return {
        "pending_count": len(pending_exports),
        "exports": [
            {
                "id": e.id,
                "order_id": e.order_id,
                "belnr": e.belnr,
                "external_order_id": e.external_order_id
            }
            for e in pending_exports
        ]
    }


@router.post(
    "/exports/convert-all",
    dependencies=[Depends(verify_api_key)]
)
async def trigger_all_conversions(
    db: Session = Depends(get_db)
) -> dict:
    """
    Trigger XML conversion for all Hapodu exports that don't have a Taifun export yet.
    
    Requires API key authentication via X-API-Key header.
    """
    from sqlalchemy import and_, exists, select
    
    # Find hapodu exports without a taifun counterpart
    taifun_exists = (
        select(OrderExport.id)
        .where(
            and_(
                OrderExport.order_id == Order.id,
                OrderExport.export_type == "taifun"
            )
        )
        .correlate(Order)
        .exists()
    )
    
    pending_exports = db.query(OrderExport).join(Order).filter(
        OrderExport.export_type == "hapodu",
        ~taifun_exists
    ).all()
    
    if not pending_exports:
        return {
            "status": "no_pending",
            "message": "No pending conversions found",
            "triggered_count": 0,
            "workflow_ids": []
        }
    
    try:
        from app.temporal.client import trigger_batch_conversion
        export_ids = [e.id for e in pending_exports]
        workflow_ids = await trigger_batch_conversion(export_ids)
        
        return {
            "status": "triggered",
            "message": f"Triggered {len(workflow_ids)} conversions",
            "triggered_count": len(workflow_ids),
            "workflow_ids": workflow_ids
        }
    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger conversions: {str(e)}"
        )


@router.get(
    "/exports/pending-upload",
    dependencies=[Depends(verify_api_key)]
)
async def get_pending_uploads(
    db: Session = Depends(get_db)
) -> dict:
    """
    Get all orders that are 'converted' but not yet 'sent'.
    
    Requires API key authentication via X-API-Key header.
    """
    pending_orders = db.query(Order).filter(Order.status == OrderStatus.CONVERTED).all()
    
    return {
        "pending_count": len(pending_orders),
        "orders": [
            {
                "id": o.id,
                "order_id": o.order_id,
                "status": o.status
            }
            for o in pending_orders
        ]
    }


@router.post(
    "/exports/{order_id}/upload",
    dependencies=[Depends(verify_api_key)]
)
async def trigger_upload(
    order_id: int,
    db: Session = Depends(get_db)
) -> dict:
    """
    Manually trigger SFTP upload for a specific converted order.
    
    Args:
        order_id: The database ID of the order
    
    Requires API key authentication via X-API-Key header.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found."
        )
    
    # Check if order has a Taifun export
    taifun_export = db.query(OrderExport).filter(
        OrderExport.order_id == order_id,
        OrderExport.export_type == "taifun"
    ).first()
    
    if not taifun_export:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order {order_id} has no Taifun XML to upload. Convert first."
        )
    
    try:
        from app.temporal.client import trigger_sftp_upload
        workflow_id = await trigger_sftp_upload(order_id)
        return {
            "status": "triggered",
            "workflow_id": workflow_id,
            "order_id": order_id
        }
    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger upload: {str(e)}"
        )


@router.post(
    "/exports/upload-all",
    dependencies=[Depends(verify_api_key)]
)
async def trigger_all_uploads(
    db: Session = Depends(get_db)
) -> dict:
    """
    Trigger SFTP upload for all orders that are 'converted' but not 'sent'.
    
    Requires API key authentication via X-API-Key header.
    """
    pending_orders = db.query(Order).filter(Order.status == OrderStatus.CONVERTED).all()
    
    if not pending_orders:
        return {
            "status": "no_pending",
            "message": "No pending uploads found",
            "triggered_count": 0,
            "workflow_ids": []
        }
    
    try:
        from app.temporal.client import trigger_batch_upload
        order_ids = [o.id for o in pending_orders]
        workflow_ids = await trigger_batch_upload(order_ids)

        return {
            "status": "triggered",
            "message": f"Triggered {len(workflow_ids)} uploads",
            "triggered_count": len(workflow_ids),
            "workflow_ids": workflow_ids
        }
    except TemporalConnectionError as e:
        logger.error(f"Temporal unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal connection failed. Please retry later."
        )
    except WorkflowOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger uploads: {str(e)}"
        )


# ==================== SCRAPE CONFIG ENDPOINTS ====================

@router.get(
    "/scrape/config",
    response_model=ScrapeConfigResponse,
    dependencies=[Depends(verify_api_key)]
)
async def get_scrape_config(
    db: Session = Depends(get_db)
) -> ScrapeConfigResponse:
    """
    Get the current scrape configuration (custom URL for automatic scraping).
    
    Requires API key authentication via X-API-Key header.
    """
    config = db.query(ScrapeConfig).filter(ScrapeConfig.id == 1).first()
    
    if config is None:
        return ScrapeConfigResponse(custom_order_list_url=None, updated_at=None)
    
    return ScrapeConfigResponse(
        custom_order_list_url=config.custom_order_list_url,
        updated_at=config.updated_at
    )


@router.put(
    "/scrape/config",
    response_model=ScrapeConfigResponse,
    dependencies=[Depends(verify_api_key)]
)
async def update_scrape_config(
    config_data: ScrapeConfigUpdate,
    db: Session = Depends(get_db)
) -> ScrapeConfigResponse:
    """
    Update the scrape configuration (custom URL for automatic scraping).
    
    This URL will be used by the automatic scheduled scraping.
    Set to null or empty string to use the default URL.
    
    Requires API key authentication via X-API-Key header.
    """
    config = db.query(ScrapeConfig).filter(ScrapeConfig.id == 1).first()
    
    # Normalize empty strings to None
    custom_url = config_data.custom_order_list_url
    if custom_url is not None and custom_url.strip() == "":
        custom_url = None
    
    if config is None:
        # Create new config
        config = ScrapeConfig(id=1, custom_order_list_url=custom_url)
        db.add(config)
    else:
        config.custom_order_list_url = custom_url
    
    db.commit()
    db.refresh(config)
    
    logger.info(f"Scrape config updated: custom_url={custom_url}")
    
    return ScrapeConfigResponse(
        custom_order_list_url=config.custom_order_list_url,
        updated_at=config.updated_at
    )
