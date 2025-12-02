"""
Temporal Worker for scraping, XML conversion and SFTP upload workflows.
"""

import asyncio
import logging
import sys

from temporalio.client import Client
from temporalio.worker import Worker

from app.config import get_settings
from app.temporal.workflows import (
    ConvertXmlWorkflow,
    UploadXmlWorkflow,
    ProcessOrderWorkflow,
    ScrapeAndProcessOrdersWorkflow,
    ProcessCallWorkflow
)
from app.temporal.activities import (
    # Scraping activities
    scrape_order_list,
    scrape_order_xml,
    save_hapodu_xml,
    # Conversion activities
    get_hapodu_xml,
    convert_to_taifun,
    save_taifun_xml,
    update_order_status,
    get_taifun_xml,
    upload_to_sftp,
    # Call activities
    convert_call_json_to_xml,
    save_call_taifun_xml,
    update_call_status,
    get_call_json,
    upload_call_to_sftp
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

settings = get_settings()
TEMPORAL_HOST = settings.temporal_host
TASK_QUEUE = "xml-conversion-queue"


async def run_worker():
    """Run the Temporal worker."""
    logger.info(f"Connecting to Temporal at {TEMPORAL_HOST}...")
    
    # Connect to Temporal
    client = await Client.connect(TEMPORAL_HOST)
    
    logger.info(f"Connected! Starting worker for task queue: {TASK_QUEUE}")
    
    # Create worker
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            ConvertXmlWorkflow,
            UploadXmlWorkflow,
            ProcessOrderWorkflow,
            ScrapeAndProcessOrdersWorkflow,
            ProcessCallWorkflow
        ],
        activities=[
            # Scraping activities
            scrape_order_list,
            scrape_order_xml,
            save_hapodu_xml,
            # Conversion activities
            get_hapodu_xml,
            convert_to_taifun,
            save_taifun_xml,
            update_order_status,
            get_taifun_xml,
            upload_to_sftp,
            # Call activities
            convert_call_json_to_xml,
            save_call_taifun_xml,
            update_call_status,
            get_call_json,
            upload_call_to_sftp
        ]
    )
    
    logger.info("Worker started. Waiting for tasks...")
    
    # Run worker
    await worker.run()


def main():
    """Entry point for the worker."""
    logger.info("Starting Temporal Worker...")
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
