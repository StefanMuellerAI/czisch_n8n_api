"""
Temporal Client for triggering workflows from the API.
"""

from dataclasses import dataclass
from temporalio.client import Client, WorkflowExecutionStatus
from app.config import get_settings
from app.temporal.workflows import (
    ConvertXmlWorkflow,
    UploadXmlWorkflow,
    ProcessOrderWorkflow,
    ScrapeAndProcessOrdersWorkflow,
    ProcessCallWorkflow
)

settings = get_settings()
TEMPORAL_HOST = settings.temporal_host
TASK_QUEUE = "xml-conversion-queue"

_client: Client | None = None


@dataclass
class WorkflowStatus:
    """Status of a workflow execution."""
    workflow_id: str
    status: str  # RUNNING, COMPLETED, FAILED, CANCELED, TERMINATED, TIMED_OUT
    result: dict | None = None
    error: str | None = None


async def get_temporal_client() -> Client:
    """Get or create Temporal client."""
    global _client
    if _client is None:
        _client = await Client.connect(TEMPORAL_HOST)
    return _client


async def get_workflow_status(workflow_id: str) -> WorkflowStatus:
    """
    Get the current status of a workflow.
    
    Args:
        workflow_id: The workflow ID to check
        
    Returns:
        WorkflowStatus with current state and result if completed
    """
    client = await get_temporal_client()
    
    try:
        handle = client.get_workflow_handle(workflow_id)
        describe = await handle.describe()
        
        status_map = {
            WorkflowExecutionStatus.RUNNING: "RUNNING",
            WorkflowExecutionStatus.COMPLETED: "COMPLETED",
            WorkflowExecutionStatus.FAILED: "FAILED",
            WorkflowExecutionStatus.CANCELED: "CANCELED",
            WorkflowExecutionStatus.TERMINATED: "TERMINATED",
            WorkflowExecutionStatus.TIMED_OUT: "TIMED_OUT",
        }
        
        status = status_map.get(describe.status, "UNKNOWN")
        
        result = None
        error = None
        
        if status == "COMPLETED":
            try:
                result = await handle.result()
            except Exception as e:
                error = str(e)
        elif status == "FAILED":
            error = "Workflow failed"
        
        return WorkflowStatus(
            workflow_id=workflow_id,
            status=status,
            result=result,
            error=error
        )
        
    except Exception as e:
        return WorkflowStatus(
            workflow_id=workflow_id,
            status="NOT_FOUND",
            error=str(e)
        )


# ==================== NEW END-TO-END WORKFLOW TRIGGERS ====================

async def trigger_scrape_and_process(order_list_url: str | None = None) -> str:
    """
    Trigger the complete scrape and process workflow.
    
    This starts the orchestrator workflow that:
    1. Scrapes the order list
    2. Filters for new orders
    3. Processes each new order (scrape XML → convert → upload)
    
    Args:
        order_list_url: Optional custom URL to the order list page
        
    Returns:
        Workflow ID
    """
    import uuid
    
    client = await get_temporal_client()
    
    # Use unique ID with timestamp to allow multiple runs
    workflow_id = f"scrape-and-process-{uuid.uuid4().hex[:8]}"
    
    handle = await client.start_workflow(
        ScrapeAndProcessOrdersWorkflow.run,
        order_list_url,
        id=workflow_id,
        task_queue=TASK_QUEUE
    )
    
    return handle.id


async def trigger_process_single_order(
    belnr: str,
    external_order_id: str,
    detail_url: str
) -> str:
    """
    Trigger processing workflow for a single order.
    
    Args:
        belnr: Belegnummer
        external_order_id: External order ID
        detail_url: URL to the order detail page
        
    Returns:
        Workflow ID
    """
    client = await get_temporal_client()
    
    workflow_id = f"process-order-{external_order_id}"
    
    handle = await client.start_workflow(
        ProcessOrderWorkflow.run,
        args=[belnr, external_order_id, detail_url],
        id=workflow_id,
        task_queue=TASK_QUEUE
    )
    
    return handle.id


async def trigger_call_processing(call_db_id: int) -> str:
    """
    Trigger call processing workflow.
    
    Args:
        call_db_id: Database ID of the call to process
        
    Returns:
        Workflow ID
    """
    client = await get_temporal_client()
    
    workflow_id = f"process-call-{call_db_id}"
    
    handle = await client.start_workflow(
        ProcessCallWorkflow.run,
        call_db_id,
        id=workflow_id,
        task_queue=TASK_QUEUE
    )
    
    return handle.id


# ==================== LEGACY WORKFLOW TRIGGERS ====================
# These are kept for backward compatibility and manual operations

async def trigger_xml_conversion(export_id: int) -> str:
    """
    Trigger XML conversion workflow for a specific export.
    
    NOTE: This is the legacy method. For new orders, use trigger_scrape_and_process() instead.
    
    Args:
        export_id: ID of the Hapodu export to convert
        
    Returns:
        Workflow ID
    """
    client = await get_temporal_client()
    
    workflow_id = f"convert-xml-{export_id}"
    
    handle = await client.start_workflow(
        ConvertXmlWorkflow.run,
        export_id,
        id=workflow_id,
        task_queue=TASK_QUEUE
    )
    
    return handle.id


async def trigger_batch_conversion(export_ids: list[int]) -> list[str]:
    """
    Trigger XML conversion for multiple exports.
    
    NOTE: This is the legacy method. For new orders, use trigger_scrape_and_process() instead.
    
    Args:
        export_ids: List of export IDs to convert
        
    Returns:
        List of workflow IDs
    """
    workflow_ids = []
    for export_id in export_ids:
        wf_id = await trigger_xml_conversion(export_id)
        workflow_ids.append(wf_id)
    return workflow_ids


async def trigger_sftp_upload(order_db_id: int) -> str:
    """
    Trigger SFTP upload workflow for an already converted order.
    
    Args:
        order_db_id: Database ID of the order
        
    Returns:
        Workflow ID
    """
    client = await get_temporal_client()
    
    workflow_id = f"upload-xml-{order_db_id}"
    
    handle = await client.start_workflow(
        UploadXmlWorkflow.run,
        order_db_id,
        id=workflow_id,
        task_queue=TASK_QUEUE
    )
    
    return handle.id


async def trigger_batch_upload(order_db_ids: list[int]) -> list[str]:
    """
    Trigger SFTP upload for multiple orders.
    
    Args:
        order_db_ids: List of order database IDs to upload
        
    Returns:
        List of workflow IDs
    """
    workflow_ids = []
    for order_id in order_db_ids:
        wf_id = await trigger_sftp_upload(order_id)
        workflow_ids.append(wf_id)
    return workflow_ids


# ==================== SCHEDULE MANAGEMENT ====================

SCRAPE_SCHEDULE_ID = "scrape-schedule"


@dataclass
class ScheduleInfo:
    """Information about the scrape schedule."""
    exists: bool
    paused: bool = False
    next_run: str | None = None
    times: list[tuple[int, int]] | None = None


async def get_schedule_info() -> ScheduleInfo:
    """
    Get information about the current scrape schedule.
    
    Returns:
        ScheduleInfo with schedule status
    """
    client = await get_temporal_client()
    
    try:
        handle = client.get_schedule_handle(SCRAPE_SCHEDULE_ID)
        describe = await handle.describe()
        
        return ScheduleInfo(
            exists=True,
            paused=describe.schedule.state.paused if describe.schedule.state else False,
        )
    except Exception:
        return ScheduleInfo(exists=False)


async def sync_scrape_schedule(times: list[tuple[int, int]]) -> bool:
    """
    Synchronize the Temporal schedule with the given times.
    
    Creates a new schedule or updates existing one.
    If times list is empty, deletes the schedule.
    
    Args:
        times: List of (hour, minute) tuples for scheduled runs
        
    Returns:
        True if successful
    """
    from temporalio.client import (
        Schedule, 
        ScheduleSpec, 
        ScheduleCalendarSpec, 
        ScheduleActionStartWorkflow, 
        ScheduleState,
        ScheduleRange
    )
    
    client = await get_temporal_client()
    
    # If no times, delete the schedule
    if not times:
        try:
            handle = client.get_schedule_handle(SCRAPE_SCHEDULE_ID)
            await handle.delete()
        except Exception:
            pass  # Schedule didn't exist
        return True
    
    # Build calendar specs for each time
    # ScheduleCalendarSpec requires ScheduleRange objects, not plain integers
    calendar_specs = []
    for hour, minute in times:
        calendar_specs.append(
            ScheduleCalendarSpec(
                hour=[ScheduleRange(start=hour)],
                minute=[ScheduleRange(start=minute)],
                second=[ScheduleRange(start=0)]
            )
        )
    
    # Create schedule spec
    schedule_spec = ScheduleSpec(
        calendars=calendar_specs
    )
    
    # Create action to start the workflow
    action = ScheduleActionStartWorkflow(
        ScrapeAndProcessOrdersWorkflow.run,
        None,  # order_list_url = None (use default)
        id=f"scheduled-scrape",
        task_queue=TASK_QUEUE
    )
    
    # Create the schedule
    schedule = Schedule(
        action=action,
        spec=schedule_spec,
        state=ScheduleState(
            paused=False,
            note="Automatic scraping schedule"
        )
    )
    
    try:
        # Try to update existing schedule
        handle = client.get_schedule_handle(SCRAPE_SCHEDULE_ID)
        await handle.update(
            lambda _: schedule
        )
    except Exception:
        # Schedule doesn't exist, create new one
        await client.create_schedule(
            SCRAPE_SCHEDULE_ID,
            schedule
        )
    
    return True


async def delete_scrape_schedule() -> bool:
    """
    Delete the scrape schedule.
    
    Returns:
        True if successful
    """
    client = await get_temporal_client()
    
    try:
        handle = client.get_schedule_handle(SCRAPE_SCHEDULE_ID)
        await handle.delete()
        return True
    except Exception:
        return False


async def pause_scrape_schedule(paused: bool = True) -> bool:
    """
    Pause or unpause the scrape schedule.
    
    Args:
        paused: True to pause, False to unpause
        
    Returns:
        True if successful
    """
    client = await get_temporal_client()
    
    try:
        handle = client.get_schedule_handle(SCRAPE_SCHEDULE_ID)
        if paused:
            await handle.pause()
        else:
            await handle.unpause()
        return True
    except Exception:
        return False
