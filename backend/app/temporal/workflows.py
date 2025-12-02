"""
Temporal Workflows for scraping, XML conversion and SFTP upload.
"""

from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        # Scraping activities
        scrape_order_list,
        scrape_order_xml,
        save_hapodu_xml,
        ScrapeOrderListResult,
        ScrapeOrderXmlResult,
        SaveHapoduXmlResult,
        OrderToProcess,
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
        upload_call_to_sftp,
        ConvertCallResult,
        UploadResult
    )


@workflow.defn
class ConvertXmlWorkflow:
    """
    Workflow to convert Hapodu XML to Taifun format.
    
    Steps:
    1. Load Hapodu XML from database
    2. Convert to Taifun format
    3. Save Taifun XML to database
    4. Upload to SFTP server
    5. Update order status to "sent"
    """
    
    @workflow.run
    async def run(self, export_id: int) -> dict:
        """
        Execute the XML conversion workflow.
        
        Args:
            export_id: ID of the Hapodu export to convert
            
        Returns:
            Result dict with success status and taifun_export_id
        """
        workflow.logger.info(f"Starting XML conversion for export_id={export_id}")
        
        try:
            # Step 1: Load Hapodu XML
            export_data = await workflow.execute_activity(
                get_hapodu_xml,
                export_id,
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            # Step 2: Convert to Taifun
            taifun_xml = await workflow.execute_activity(
                convert_to_taifun,
                export_data["xml_content"],
                start_to_close_timeout=timedelta(seconds=60)
            )
            
            # Step 3: Save Taifun XML
            taifun_export_id = await workflow.execute_activity(
                save_taifun_xml,
                args=[
                    export_data["order_id"],
                    export_data["belnr"],
                    export_data["external_order_id"],
                    taifun_xml
                ],
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            # Step 4: Update order status to converted
            await workflow.execute_activity(
                update_order_status,
                args=[export_data["order_id"], "converted"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            
            # Step 5: Upload to SFTP
            upload_result = await workflow.execute_activity(
                upload_to_sftp,
                args=[
                    export_data["external_order_id"],
                    export_data["belnr"],
                    taifun_xml
                ],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=5),
                    backoff_coefficient=2.0
                )
            )
            
            if upload_result.success:
                # Step 6: Update order status to sent
                await workflow.execute_activity(
                    update_order_status,
                    args=[export_data["order_id"], "sent"],
                    start_to_close_timeout=timedelta(seconds=10)
                )
                
                workflow.logger.info(f"Upload complete. Remote path: {upload_result.remote_path}")
                
                return {
                    "success": True,
                    "hapodu_export_id": export_id,
                    "taifun_export_id": taifun_export_id,
                    "remote_path": upload_result.remote_path,
                    "status": "sent"
                }
            else:
                workflow.logger.warning(f"Upload failed: {upload_result.error}")
                return {
                    "success": True,
                    "hapodu_export_id": export_id,
                    "taifun_export_id": taifun_export_id,
                    "upload_error": upload_result.error,
                    "status": "converted"
                }
            
        except Exception as e:
            workflow.logger.error(f"Conversion failed: {str(e)}")
            return {
                "success": False,
                "hapodu_export_id": export_id,
                "error": str(e)
            }


@workflow.defn
class UploadXmlWorkflow:
    """
    Workflow to upload already converted Taifun XMLs to SFTP.
    
    Used for manual upload of orders that are "converted" but not yet "sent".
    """
    
    @workflow.run
    async def run(self, order_db_id: int) -> dict:
        """
        Execute the SFTP upload workflow for an already converted order.
        
        Args:
            order_db_id: Database ID of the order
            
        Returns:
            Result dict with success status
        """
        workflow.logger.info(f"Starting SFTP upload for order_db_id={order_db_id}")
        
        try:
            # Step 1: Load Taifun XML
            export_data = await workflow.execute_activity(
                get_taifun_xml,
                order_db_id,
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            if not export_data:
                return {
                    "success": False,
                    "order_id": order_db_id,
                    "error": "No Taifun XML found for this order"
                }
            
            # Step 2: Upload to SFTP
            upload_result = await workflow.execute_activity(
                upload_to_sftp,
                args=[
                    export_data["external_order_id"],
                    export_data["belnr"],
                    export_data["xml_content"]
                ],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=5),
                    backoff_coefficient=2.0
                )
            )
            
            if upload_result.success:
                # Step 3: Update order status to sent
                await workflow.execute_activity(
                    update_order_status,
                    args=[order_db_id, "sent"],
                    start_to_close_timeout=timedelta(seconds=10)
                )
                
                workflow.logger.info(f"Upload complete. Remote path: {upload_result.remote_path}")
                
                return {
                    "success": True,
                    "order_id": order_db_id,
                    "remote_path": upload_result.remote_path,
                    "status": "sent"
                }
            else:
                workflow.logger.error(f"Upload failed: {upload_result.error}")
                return {
                    "success": False,
                    "order_id": order_db_id,
                    "error": upload_result.error
                }
            
        except Exception as e:
            workflow.logger.error(f"Upload workflow failed: {str(e)}")
            return {
                "success": False,
                "order_id": order_db_id,
                "error": str(e)
            }


# ==================== END-TO-END WORKFLOW ====================

@workflow.defn
class ProcessOrderWorkflow:
    """
    Complete end-to-end workflow for a single order: scrape → convert → upload.
    
    This workflow handles the entire lifecycle of an order:
    1. Scrape XML from Hapodu website
    2. Save Hapodu XML to database
    3. Convert to Taifun format
    4. Save Taifun XML to database
    5. Upload to SFTP server
    6. Update order status to "sent"
    """
    
    @workflow.run
    async def run(
        self,
        belnr: str,
        external_order_id: str,
        detail_url: str
    ) -> dict:
        """
        Execute the complete order processing workflow.
        
        Args:
            belnr: Belegnummer
            external_order_id: External order ID
            detail_url: URL to the order detail page
            
        Returns:
            Result dict with success status and details
        """
        workflow.logger.info(f"Starting ProcessOrderWorkflow for order {external_order_id}")
        
        try:
            # Step 1: Scrape XML from website
            workflow.logger.info("Step 1: Scraping XML from Hapodu...")
            scrape_result: ScrapeOrderXmlResult = await workflow.execute_activity(
                scrape_order_xml,
                args=[belnr, external_order_id, detail_url],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0
                )
            )
            
            if not scrape_result.success or not scrape_result.xml_content:
                workflow.logger.error(f"Failed to scrape XML: {scrape_result.error}")
                return {
                    "success": False,
                    "external_order_id": external_order_id,
                    "belnr": belnr,
                    "step": "scrape",
                    "error": scrape_result.error or "No XML content"
                }
            
            # Step 2: Save Hapodu XML to database
            workflow.logger.info("Step 2: Saving Hapodu XML to database...")
            save_result: SaveHapoduXmlResult = await workflow.execute_activity(
                save_hapodu_xml,
                args=[belnr, external_order_id, scrape_result.xml_content],
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            if not save_result.success:
                workflow.logger.error(f"Failed to save Hapodu XML: {save_result.error}")
                return {
                    "success": False,
                    "external_order_id": external_order_id,
                    "belnr": belnr,
                    "step": "save_hapodu",
                    "error": save_result.error
                }
            
            order_db_id = save_result.order_db_id
            hapodu_export_id = save_result.export_id
            
            # Step 3: Convert to Taifun format
            workflow.logger.info("Step 3: Converting to Taifun format...")
            taifun_xml = await workflow.execute_activity(
                convert_to_taifun,
                scrape_result.xml_content,
                start_to_close_timeout=timedelta(seconds=60)
            )
            
            # Step 4: Save Taifun XML to database
            workflow.logger.info("Step 4: Saving Taifun XML to database...")
            taifun_export_id = await workflow.execute_activity(
                save_taifun_xml,
                args=[order_db_id, belnr, external_order_id, taifun_xml],
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            # Step 5: Update order status to converted
            await workflow.execute_activity(
                update_order_status,
                args=[order_db_id, "converted"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            
            # Step 6: Upload to SFTP
            workflow.logger.info("Step 5: Uploading to SFTP...")
            upload_result = await workflow.execute_activity(
                upload_to_sftp,
                args=[external_order_id, belnr, taifun_xml],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=5),
                    backoff_coefficient=2.0
                )
            )
            
            if upload_result.success:
                # Step 7: Update order status to sent
                await workflow.execute_activity(
                    update_order_status,
                    args=[order_db_id, "sent"],
                    start_to_close_timeout=timedelta(seconds=10)
                )
                
                workflow.logger.info(f"Order {external_order_id} fully processed and sent!")
                
                return {
                    "success": True,
                    "external_order_id": external_order_id,
                    "belnr": belnr,
                    "order_db_id": order_db_id,
                    "hapodu_export_id": hapodu_export_id,
                    "taifun_export_id": taifun_export_id,
                    "remote_path": upload_result.remote_path,
                    "status": "sent"
                }
            else:
                workflow.logger.warning(f"Upload failed: {upload_result.error}")
                return {
                    "success": True,  # Partial success
                    "external_order_id": external_order_id,
                    "belnr": belnr,
                    "order_db_id": order_db_id,
                    "hapodu_export_id": hapodu_export_id,
                    "taifun_export_id": taifun_export_id,
                    "upload_error": upload_result.error,
                    "status": "converted"
                }
                
        except Exception as e:
            workflow.logger.error(f"ProcessOrderWorkflow failed: {str(e)}")
            return {
                "success": False,
                "external_order_id": external_order_id,
                "belnr": belnr,
                "error": str(e)
            }


@workflow.defn
class ScrapeAndProcessOrdersWorkflow:
    """
    Orchestrator workflow that scrapes the order list and processes all new orders.
    
    Steps:
    1. Scrape order list from Hapodu website
    2. Filter for new orders (not yet in database)
    3. Start a child ProcessOrderWorkflow for each new order
    4. Collect and return results
    """
    
    @workflow.run
    async def run(self, order_list_url: str | None = None) -> dict:
        """
        Execute the scrape and process orchestration workflow.
        
        Args:
            order_list_url: Optional custom URL to the order list page
            
        Returns:
            Result dict with processing summary
        """
        workflow.logger.info("Starting ScrapeAndProcessOrdersWorkflow...")
        
        try:
            # Step 1: Scrape order list
            workflow.logger.info("Step 1: Scraping order list...")
            list_result: ScrapeOrderListResult = await workflow.execute_activity(
                scrape_order_list,
                order_list_url,
                start_to_close_timeout=timedelta(seconds=180),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0
                )
            )
            
            workflow.logger.info(
                f"Found {list_result.total_found} orders: "
                f"{list_result.new_count} new, {list_result.skipped_count} existing"
            )
            
            # Filter for new orders only
            new_orders = [o for o in list_result.orders if o.is_new]
            
            if not new_orders:
                workflow.logger.info("No new orders to process")
                return {
                    "success": True,
                    "total_found": list_result.total_found,
                    "new_orders": 0,
                    "skipped_orders": list_result.skipped_count,
                    "processed": [],
                    "failed": []
                }
            
            # Step 2: Process each new order via child workflow
            workflow.logger.info(f"Step 2: Processing {len(new_orders)} new orders...")
            
            processed = []
            failed = []
            
            for order in new_orders:
                workflow.logger.info(f"Starting child workflow for order {order.external_order_id}")
                
                try:
                    result = await workflow.execute_child_workflow(
                        ProcessOrderWorkflow.run,
                        args=[order.belnr, order.external_order_id, order.detail_url],
                        id=f"process-order-{order.external_order_id}",
                    )
                    
                    if result.get("success"):
                        processed.append({
                            "external_order_id": order.external_order_id,
                            "belnr": order.belnr,
                            "status": result.get("status"),
                            "remote_path": result.get("remote_path")
                        })
                    else:
                        failed.append({
                            "external_order_id": order.external_order_id,
                            "belnr": order.belnr,
                            "error": result.get("error"),
                            "step": result.get("step")
                        })
                        
                except Exception as e:
                    workflow.logger.error(f"Child workflow failed for {order.external_order_id}: {e}")
                    failed.append({
                        "external_order_id": order.external_order_id,
                        "belnr": order.belnr,
                        "error": str(e)
                    })
            
            workflow.logger.info(
                f"Completed: {len(processed)} processed, {len(failed)} failed"
            )
            
            return {
                "success": True,
                "total_found": list_result.total_found,
                "new_orders": list_result.new_count,
                "skipped_orders": list_result.skipped_count,
                "processed_count": len(processed),
                "failed_count": len(failed),
                "processed": processed,
                "failed": failed
            }
            
        except Exception as e:
            workflow.logger.error(f"ScrapeAndProcessOrdersWorkflow failed: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }


# ==================== CALL WORKFLOWS ====================

@workflow.defn
class ProcessCallWorkflow:
    """
    Workflow to process an incoming call event.
    
    Steps:
    1. Load call JSON from database
    2. Convert JSON to XML (Taifun format)
    3. Save Taifun XML to database
    4. Update call status to "converted"
    5. Upload XML to SFTP server
    6. Update call status to "sent"
    """
    
    @workflow.run
    async def run(self, call_db_id: int) -> dict:
        """
        Execute the call processing workflow.
        
        Args:
            call_db_id: Database ID of the call to process
            
        Returns:
            Result dict with success status
        """
        workflow.logger.info(f"Starting ProcessCallWorkflow for call_db_id={call_db_id}")
        
        try:
            # Step 1: Load call JSON
            workflow.logger.info("Step 1: Loading call JSON...")
            call_data = await workflow.execute_activity(
                get_call_json,
                call_db_id,
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            if not call_data:
                return {
                    "success": False,
                    "call_db_id": call_db_id,
                    "error": "Call JSON not found"
                }
            
            call_id = call_data.get("call_id")
            
            # Step 2: Convert JSON to XML
            workflow.logger.info("Step 2: Converting JSON to XML...")
            convert_result: ConvertCallResult = await workflow.execute_activity(
                convert_call_json_to_xml,
                call_data["json_content"],
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            if not convert_result.success:
                return {
                    "success": False,
                    "call_db_id": call_db_id,
                    "error": convert_result.error
                }
            
            # Step 3: Save Taifun XML
            workflow.logger.info("Step 3: Saving Taifun XML...")
            taifun_export_id = await workflow.execute_activity(
                save_call_taifun_xml,
                args=[call_db_id, convert_result.xml_content],
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            # Step 4: Update call status to converted
            workflow.logger.info("Step 4: Updating call status to converted...")
            await workflow.execute_activity(
                update_call_status,
                args=[call_db_id, "converted"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            
            # Step 5: Upload to SFTP
            workflow.logger.info("Step 5: Uploading to SFTP...")
            upload_result: UploadResult = await workflow.execute_activity(
                upload_call_to_sftp,
                args=[call_id, convert_result.xml_content],
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=5),
                    backoff_coefficient=2.0
                )
            )
            
            if not upload_result.success:
                workflow.logger.error(f"SFTP upload failed: {upload_result.error}")
                return {
                    "success": False,
                    "call_db_id": call_db_id,
                    "call_id": call_id,
                    "taifun_export_id": taifun_export_id,
                    "status": "converted",
                    "error": f"Upload failed: {upload_result.error}"
                }
            
            # Step 6: Update call status to sent
            workflow.logger.info("Step 6: Updating call status to sent...")
            await workflow.execute_activity(
                update_call_status,
                args=[call_db_id, "sent"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            
            workflow.logger.info(f"Call {call_db_id} successfully processed and uploaded")
            
            return {
                "success": True,
                "call_db_id": call_db_id,
                "call_id": call_id,
                "taifun_export_id": taifun_export_id,
                "remote_path": upload_result.remote_path,
                "status": "sent"
            }
            
        except Exception as e:
            workflow.logger.error(f"ProcessCallWorkflow failed: {str(e)}")
            return {
                "success": False,
                "call_db_id": call_db_id,
                "error": str(e)
            }
