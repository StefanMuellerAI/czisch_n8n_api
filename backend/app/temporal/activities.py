"""
Temporal Activities for scraping, XML conversion and SFTP upload workflows.
"""

from dataclasses import dataclass
from temporalio import activity
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models import Order, OrderExport
from app.temporal.converter import convert_sap_to_taifun

settings = get_settings()


@dataclass
class ConversionInput:
    """Input for XML conversion activity."""
    export_id: int


@dataclass
class ConversionResult:
    """Result of XML conversion activity."""
    success: bool
    taifun_export_id: int | None = None
    error: str | None = None


@dataclass
class OrderToProcess:
    """Order information for processing workflow."""
    belnr: str
    external_order_id: str
    detail_url: str
    is_new: bool


@dataclass
class ScrapeOrderListResult:
    """Result of scraping order list."""
    orders: list[OrderToProcess]
    total_found: int
    new_count: int
    skipped_count: int


@dataclass
class ScrapeOrderXmlResult:
    """Result of scraping XML for a single order."""
    success: bool
    belnr: str
    external_order_id: str
    xml_content: str | None = None
    error: str | None = None


@dataclass
class SaveHapoduXmlResult:
    """Result of saving Hapodu XML."""
    success: bool
    order_db_id: int | None = None
    export_id: int | None = None
    error: str | None = None


def get_db_session():
    """Create a database session for activities."""
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    return Session()


@activity.defn
async def get_hapodu_xml(export_id: int) -> dict:
    """
    Load Hapodu XML from database.
    
    Args:
        export_id: ID of the OrderExport to load
        
    Returns:
        Dict with export data
    """
    activity.logger.info(f"Loading Hapodu XML for export_id={export_id}")
    
    db = get_db_session()
    try:
        export = db.query(OrderExport).filter(
            OrderExport.id == export_id,
            OrderExport.export_type == "hapodu"
        ).first()
        
        if not export:
            raise ValueError(f"Export with id {export_id} not found or not a hapodu export")
        
        return {
            "id": export.id,
            "order_id": export.order_id,
            "belnr": export.belnr,
            "external_order_id": export.external_order_id,
            "xml_content": export.xml_content
        }
    finally:
        db.close()


@activity.defn
async def convert_to_taifun(xml_content: str) -> str:
    """
    Convert SAP/Hapodu XML to Taifun format.
    
    Args:
        xml_content: The Hapodu XML content
        
    Returns:
        Taifun XML content
    """
    activity.logger.info("Converting XML to Taifun format")
    
    taifun_xml = convert_sap_to_taifun(xml_content)
    
    if taifun_xml.startswith("Error"):
        raise ValueError(taifun_xml)
    
    return taifun_xml


@activity.defn
async def save_taifun_xml(
    order_id: int,
    belnr: str,
    external_order_id: str,
    taifun_xml: str
) -> int:
    """
    Save Taifun XML to database.
    
    Args:
        order_id: The order ID (FK)
        belnr: Belegnummer
        external_order_id: External order ID
        taifun_xml: The converted Taifun XML
        
    Returns:
        ID of the created export
    """
    activity.logger.info(f"Saving Taifun XML for order_id={order_id}")
    
    db = get_db_session()
    try:
        # Check if Taifun export already exists
        existing = db.query(OrderExport).filter(
            OrderExport.order_id == order_id,
            OrderExport.export_type == "taifun"
        ).first()
        
        if existing:
            # Update existing
            existing.xml_content = taifun_xml
            db.commit()
            return existing.id
        
        # Create new export
        new_export = OrderExport(
            order_id=order_id,
            belnr=belnr,
            external_order_id=external_order_id,
            xml_content=taifun_xml,
            export_type="taifun"
        )
        db.add(new_export)
        db.commit()
        db.refresh(new_export)
        
        return new_export.id
    finally:
        db.close()


@activity.defn
async def update_order_status(order_id: int, status: str) -> bool:
    """
    Update order status after conversion.
    
    Args:
        order_id: The order ID
        status: New status
        
    Returns:
        Success boolean
    """
    from app.models import Order
    
    activity.logger.info(f"Updating order {order_id} status to {status}")
    
    db = get_db_session()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
            order.status = status
            db.commit()
            return True
        return False
    finally:
        db.close()


@dataclass
class UploadInput:
    """Input for SFTP upload activity."""
    order_id: int
    belnr: str
    external_order_id: str
    xml_content: str


@dataclass
class UploadResult:
    """Result of SFTP upload activity."""
    success: bool
    remote_path: str | None = None
    error: str | None = None


@activity.defn
async def get_taifun_xml(order_db_id: int) -> dict | None:
    """
    Load Taifun XML from database for a specific order.
    
    Args:
        order_db_id: The order's database ID
        
    Returns:
        Dict with export data or None
    """
    activity.logger.info(f"Loading Taifun XML for order_db_id={order_db_id}")
    
    db = get_db_session()
    try:
        export = db.query(OrderExport).filter(
            OrderExport.order_id == order_db_id,
            OrderExport.export_type == "taifun"
        ).first()
        
        if not export:
            return None
        
        return {
            "id": export.id,
            "order_id": export.order_id,
            "belnr": export.belnr,
            "external_order_id": export.external_order_id,
            "xml_content": export.xml_content
        }
    finally:
        db.close()


@activity.defn
async def upload_to_sftp(
    order_id: str,
    belnr: str,
    xml_content: str
) -> UploadResult:
    """
    Upload Taifun XML to SFTP server.
    Skips upload if file already exists on remote server.
    
    Args:
        order_id: The order ID (for filename)
        belnr: Belegnummer (for filename)
        xml_content: The Taifun XML content
        
    Returns:
        UploadResult with success status
    """
    from app.temporal.sftp import SFTPUploader, SFTPUploadError
    
    activity.logger.info(f"Uploading Taifun XML for order_id={order_id}, belnr={belnr}")
    
    filename = f"order_{order_id}_{belnr}.xml"
    
    try:
        with SFTPUploader() as sftp:
            # Check if file already exists
            if sftp.file_exists(filename):
                remote_path = f"{sftp.remote_path}/{filename}"
                activity.logger.info(f"File already exists on remote: {remote_path}, skipping upload")
                return UploadResult(success=True, remote_path=remote_path)
            
            remote_path = sftp.upload_xml(filename, xml_content)
            
        activity.logger.info(f"Successfully uploaded to {remote_path}")
        return UploadResult(success=True, remote_path=remote_path)
        
    except SFTPUploadError as e:
        activity.logger.error(f"SFTP upload failed: {e}")
        return UploadResult(success=False, error=str(e))
    except Exception as e:
        activity.logger.error(f"Unexpected error during upload: {e}")
        return UploadResult(success=False, error=str(e))


# ==================== SCRAPING ACTIVITIES ====================

@activity.defn
async def scrape_order_list(order_list_url: str | None = None) -> ScrapeOrderListResult:
    """
    Scrape order list from Hapodu website and return new orders to process.
    
    Args:
        order_list_url: Optional custom URL to the order list page
        
    Returns:
        ScrapeOrderListResult with list of orders
    """
    from app.scraper import HapoduScraper
    
    activity.logger.info("Scraping order list from Hapodu...")
    
    db = get_db_session()
    try:
        # Get existing order_ids from database
        existing_orders = db.query(Order.order_id).all()
        existing_order_ids = {o.order_id for o in existing_orders}
        
        # Scrape order list
        async with HapoduScraper() as scraper:
            await scraper.login()
            orders = await scraper.get_order_list(order_list_url)
        
        orders_to_process = []
        new_count = 0
        skipped_count = 0
        
        for order in orders:
            is_new = order.external_order_id not in existing_order_ids
            
            if is_new:
                new_count += 1
            else:
                skipped_count += 1
            
            orders_to_process.append(OrderToProcess(
                belnr=order.belnr,
                external_order_id=order.external_order_id,
                detail_url=order.detail_url,
                is_new=is_new
            ))
        
        activity.logger.info(f"Found {len(orders)} orders: {new_count} new, {skipped_count} existing")
        
        return ScrapeOrderListResult(
            orders=orders_to_process,
            total_found=len(orders),
            new_count=new_count,
            skipped_count=skipped_count
        )
    finally:
        db.close()


@activity.defn
async def scrape_order_xml(
    belnr: str,
    external_order_id: str,
    detail_url: str
) -> ScrapeOrderXmlResult:
    """
    Scrape XML for a single order from Hapodu website.
    
    Args:
        belnr: Belegnummer
        external_order_id: External order ID
        detail_url: URL to the order detail page
        
    Returns:
        ScrapeOrderXmlResult with XML content
    """
    from app.scraper import HapoduScraper, OrderInfo
    
    activity.logger.info(f"Scraping XML for order belnr={belnr}, external_order_id={external_order_id}")
    
    try:
        async with HapoduScraper() as scraper:
            await scraper.login()
            
            order_info = OrderInfo(belnr, external_order_id, detail_url)
            xml_content = await scraper.export_order_xml(order_info)
            
            if xml_content:
                activity.logger.info(f"Successfully scraped XML for order {external_order_id}")
                return ScrapeOrderXmlResult(
                    success=True,
                    belnr=belnr,
                    external_order_id=external_order_id,
                    xml_content=xml_content
                )
            else:
                activity.logger.warning(f"No XML content found for order {external_order_id}")
                return ScrapeOrderXmlResult(
                    success=False,
                    belnr=belnr,
                    external_order_id=external_order_id,
                    error="No XML export available for this order"
                )
    except Exception as e:
        activity.logger.error(f"Failed to scrape XML for order {external_order_id}: {e}")
        return ScrapeOrderXmlResult(
            success=False,
            belnr=belnr,
            external_order_id=external_order_id,
            error=str(e)
        )


@activity.defn
async def save_hapodu_xml(
    belnr: str,
    external_order_id: str,
    xml_content: str
) -> SaveHapoduXmlResult:
    """
    Create Order and save Hapodu XML to database.
    
    Args:
        belnr: Belegnummer
        external_order_id: External order ID (used as order_id)
        xml_content: The Hapodu XML content
        
    Returns:
        SaveHapoduXmlResult with order and export IDs
    """
    activity.logger.info(f"Saving Hapodu XML for order {external_order_id}")
    
    db = get_db_session()
    try:
        # Check if order already exists
        existing_order = db.query(Order).filter(Order.order_id == external_order_id).first()
        
        if existing_order:
            # Order exists - check if hapodu export exists
            existing_export = db.query(OrderExport).filter(
                OrderExport.order_id == existing_order.id,
                OrderExport.export_type == "hapodu"
            ).first()
            
            if existing_export:
                # Update existing export
                existing_export.xml_content = xml_content
                db.commit()
                return SaveHapoduXmlResult(
                    success=True,
                    order_db_id=existing_order.id,
                    export_id=existing_export.id
                )
            else:
                # Create new export for existing order
                new_export = OrderExport(
                    order_id=existing_order.id,
                    belnr=belnr,
                    external_order_id=external_order_id,
                    xml_content=xml_content,
                    export_type="hapodu"
                )
                db.add(new_export)
                db.commit()
                db.refresh(new_export)
                return SaveHapoduXmlResult(
                    success=True,
                    order_db_id=existing_order.id,
                    export_id=new_export.id
                )
        
        # Create new order
        new_order = Order(
            order_id=external_order_id,
            status="scraped"
        )
        db.add(new_order)
        db.flush()
        
        # Create hapodu export
        new_export = OrderExport(
            order_id=new_order.id,
            belnr=belnr,
            external_order_id=external_order_id,
            xml_content=xml_content,
            export_type="hapodu"
        )
        db.add(new_export)
        db.commit()
        db.refresh(new_export)
        
        activity.logger.info(f"Saved order with db_id={new_order.id}, export_id={new_export.id}")
        
        return SaveHapoduXmlResult(
            success=True,
            order_db_id=new_order.id,
            export_id=new_export.id
        )
    except Exception as e:
        db.rollback()
        activity.logger.error(f"Failed to save Hapodu XML: {e}")
        return SaveHapoduXmlResult(
            success=False,
            error=str(e)
        )
    finally:
        db.close()


# ==================== CALL ACTIVITIES ====================

@dataclass
class ConvertCallResult:
    """Result of call JSON to XML conversion."""
    success: bool
    xml_content: str | None = None
    error: str | None = None


def generate_taifun_matchcode(name: str) -> str:
    """
    Generate a Taifun-compliant matchcode from a name.
    Rule: Uppercase letters, no special characters, max 15 characters.
    """
    if not name:
        return "UNBEKANNT"
    
    # Keep only alphanumeric characters, convert to uppercase
    clean_name = "".join(c for c in name if c.isalnum()).upper()
    
    # Fallback if name only contained special characters
    if not clean_name:
        return "NEUKUNDE"
    
    return clean_name[:15]


@activity.defn
async def convert_call_json_to_xml(json_content: str) -> ConvertCallResult:
    """
    Convert AGFEO call JSON to Taifun KdList XML (customer master data).
    
    Creates a Taifun-compatible customer XML that can be imported.
    
    Args:
        json_content: The JSON content to convert
        
    Returns:
        ConvertCallResult with XML content
    """
    import json
    import xml.etree.ElementTree as ET
    
    activity.logger.info("Converting call JSON to Taifun KdList XML")
    
    try:
        data = json.loads(json_content) if isinstance(json_content, str) else json_content
        
        # Extract data from JSON
        caller_phone = data.get("from", "")
        caller_name = data.get("caller_name", "Unbekannter Anrufer")
        
        # Generate matchcode (required field in Taifun!)
        match_code = generate_taifun_matchcode(caller_name)
        
        # Build XML structure - KdList (customer list), not AhList
        root = ET.Element("KdList")
        root.set("xmlns", "urn:taifun-software.de:schema:TAIFUN")
        
        # Element is Kd (customer)
        kd = ET.SubElement(root, "Kd")
        
        def add_element(tag: str, val: str):
            elem = ET.SubElement(kd, tag)
            elem.text = str(val)
        
        # --- IDENTIFICATION ---
        # KdNr = 0 signals Taifun: "Assign the next free number"
        add_element("KdNr", "0")
        add_element("Match", match_code)
        
        # --- ADDRESS DATA ---
        add_element("Name1", caller_name)
        add_element("Anrede", "Firma/Damen u. Herren")
        add_element("Land", "DE")
        
        # --- COMMUNICATION ---
        add_element("Telefon", caller_phone)
        
        # --- STATUS / CONTROL ---
        add_element("KdUse", "true")      # Customer is active
        add_element("Brutto", "false")    # false = Net (business), true = Gross (private)
        add_element("Sperre", "false")    # No delivery block
        add_element("Waehrung", "0")      # 0 = Base currency (EUR)
        
        # Generate XML with declaration
        xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode')
        
        activity.logger.info(f"Successfully converted JSON to Taifun KdList XML, matchcode={match_code}")
        return ConvertCallResult(success=True, xml_content=xml_content)
        
    except Exception as e:
        activity.logger.error(f"Failed to convert JSON to Taifun XML: {e}")
        return ConvertCallResult(success=False, error=str(e))


@activity.defn
async def save_call_taifun_xml(call_db_id: int, xml_content: str) -> int:
    """
    Save Taifun XML export for a call.
    
    Args:
        call_db_id: The call's database ID
        xml_content: The converted XML content
        
    Returns:
        ID of the created export
    """
    from app.models import Call, CallExport
    
    activity.logger.info(f"Saving Taifun XML for call_db_id={call_db_id}")
    
    db = get_db_session()
    try:
        # Check if Taifun export already exists
        existing = db.query(CallExport).filter(
            CallExport.call_id == call_db_id,
            CallExport.export_type == "taifun"
        ).first()
        
        if existing:
            # Update existing
            existing.content = xml_content
            db.commit()
            return existing.id
        
        # Create new export
        new_export = CallExport(
            call_id=call_db_id,
            content=xml_content,
            export_type="taifun"
        )
        db.add(new_export)
        db.commit()
        db.refresh(new_export)
        
        return new_export.id
    finally:
        db.close()


@activity.defn
async def update_call_status(call_db_id: int, status: str) -> bool:
    """
    Update call status.
    
    Args:
        call_db_id: The call's database ID
        status: New status
        
    Returns:
        Success boolean
    """
    from app.models import Call
    
    activity.logger.info(f"Updating call {call_db_id} status to {status}")
    
    db = get_db_session()
    try:
        call = db.query(Call).filter(Call.id == call_db_id).first()
        if call:
            call.status = status
            db.commit()
            return True
        return False
    finally:
        db.close()


@activity.defn
async def get_call_json(call_db_id: int) -> dict | None:
    """
    Load call JSON from database.
    
    Args:
        call_db_id: The call's database ID
        
    Returns:
        Dict with call data or None
    """
    from app.models import Call, CallExport
    
    activity.logger.info(f"Loading call JSON for call_db_id={call_db_id}")
    
    db = get_db_session()
    try:
        export = db.query(CallExport).filter(
            CallExport.call_id == call_db_id,
            CallExport.export_type == "agfeo"
        ).first()
        
        if not export:
            return None
        
        call = db.query(Call).filter(Call.id == call_db_id).first()
        
        return {
            "call_db_id": call_db_id,
            "call_id": call.call_id if call else None,
            "json_content": export.content
        }
    finally:
        db.close()


@activity.defn
async def upload_call_to_sftp(call_id: str, xml_content: str) -> UploadResult:
    """
    Upload Call Taifun XML to SFTP server.
    
    Args:
        call_id: The call ID (for filename)
        xml_content: The Taifun XML content
        
    Returns:
        UploadResult with success status
    """
    from app.temporal.sftp import SFTPUploader, SFTPUploadError
    
    activity.logger.info(f"Uploading Call Taifun XML for call_id={call_id}")
    
    filename = f"call_{call_id}.xml"
    
    try:
        with SFTPUploader() as sftp:
            # Check if file already exists
            if sftp.file_exists(filename):
                remote_path = f"{sftp.remote_path}/{filename}"
                activity.logger.info(f"File already exists on remote: {remote_path}, skipping upload")
                return UploadResult(success=True, remote_path=remote_path)
            
            remote_path = sftp.upload_xml(filename, xml_content)
            
        activity.logger.info(f"Successfully uploaded to {remote_path}")
        return UploadResult(success=True, remote_path=remote_path)
        
    except SFTPUploadError as e:
        activity.logger.error(f"SFTP upload failed: {e}")
        return UploadResult(success=False, error=str(e))
    except Exception as e:
        activity.logger.error(f"Unexpected error during upload: {e}")
        return UploadResult(success=False, error=str(e))

