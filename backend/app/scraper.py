import asyncio
import re
from typing import Optional
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, Browser, Page, Download
from app.config import get_settings

settings = get_settings()


class ScrapingError(Exception):
    """Custom exception for scraping errors."""
    pass


class OrderInfo:
    """Data class for scraped order information."""
    def __init__(self, belnr: str, external_order_id: str, detail_url: str):
        self.belnr = belnr
        self.external_order_id = external_order_id
        self.detail_url = detail_url


class HapoduScraper:
    """Scraper for the Handwerkerportal Duisburg website."""
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        self.username = username or settings.hapodu_username
        self.password = password or settings.hapodu_password
        self.base_url = settings.hapodu_base_url
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        
        if not self.username or not self.password:
            raise ScrapingError("HAPODU_USERNAME and HAPODU_PASSWORD must be set")
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def start(self):
        """Start the browser."""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(
            accept_downloads=True,
            viewport={"width": 1280, "height": 800}
        )
        self.page = await self.context.new_page()
    
    async def close(self):
        """Close the browser."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def login(self) -> bool:
        """
        Login to the Hapodu website.
        
        Returns:
            True if login was successful
        """
        if not self.page:
            raise ScrapingError("Browser not started")
        
        # Navigate to login page
        await self.page.goto(f"{self.base_url}/")
        await self.page.wait_for_load_state("networkidle")
        
        # Fill login form
        username_input = self.page.locator('input[name="username"]')
        password_input = self.page.locator('input[name="password"]')
        
        if not await username_input.is_visible():
            raise ScrapingError("Login form not found - username input missing")
        
        await username_input.fill(self.username)
        await password_input.fill(self.password)
        
        # Click submit button
        submit_button = self.page.locator('input[type="submit"], button[type="submit"]')
        await submit_button.click()
        
        # Wait for navigation
        await self.page.wait_for_load_state("networkidle")
        
        # Check if login was successful (no login form visible anymore)
        is_logged_in = not await self.page.locator('input[name="username"]').is_visible()
        
        if not is_logged_in:
            raise ScrapingError("Login failed - possibly wrong credentials")
        
        return True
    
    async def get_order_list(self, order_list_url: str | None = None) -> list[OrderInfo]:
        """
        Navigate to order list and extract order information.
        
        Args:
            order_list_url: Optional custom URL to the order list page
        
        Returns:
            List of OrderInfo objects
        """
        if not self.page:
            raise ScrapingError("Browser not started")
        
        # Navigate to order list
        if not order_list_url:
            order_list_url = f"{self.base_url}/do/order/list/editable?initSearch=true&reset=false"
        await self.page.goto(order_list_url)
        await self.page.wait_for_load_state("networkidle")
        
        # Check for displaytable
        table = self.page.locator("table.displaytable")
        if not await table.is_visible():
            raise ScrapingError("No table with class 'displaytable' found")
        
        # Check for tbody
        tbody = table.locator("tbody")
        if not await tbody.is_visible():
            raise ScrapingError("No tbody found in displaytable")
        
        # Extract all order links from tbody
        order_links = await tbody.locator("a[href*='/order/read/pos']").all()
        
        orders = []
        seen_orders = set()
        
        for link in order_links:
            href = await link.get_attribute("href")
            if not href:
                continue
            
            # Parse URL to extract belnr and orderId
            parsed = urlparse(href)
            params = parse_qs(parsed.query)
            
            belnr = params.get("belnr", [None])[0]
            external_order_id = params.get("orderId", [None])[0]
            
            if belnr and external_order_id:
                # Avoid duplicates
                key = f"{belnr}_{external_order_id}"
                if key not in seen_orders:
                    seen_orders.add(key)
                    full_url = f"{self.base_url}/do/order/read/pos?belnr={belnr}&orderId={external_order_id}"
                    orders.append(OrderInfo(belnr, external_order_id, full_url))
        
        return orders
    
    async def export_order_xml(self, order: OrderInfo) -> Optional[str]:
        """
        Export XML for a specific order.
        
        Args:
            order: OrderInfo object with order details
            
        Returns:
            XML content as string, or None if export failed
        """
        if not self.page:
            raise ScrapingError("Browser not started")
        
        # Navigate to order detail page
        await self.page.goto(order.detail_url)
        await self.page.wait_for_load_state("networkidle")
        
        # Find and click export link
        export_link = self.page.locator("a[href*='/order/export']")
        if not await export_link.is_visible():
            return None
        
        # Get export URL
        export_href = await export_link.get_attribute("href")
        export_url = f"https://hapodu.duisburg.de{export_href}"
        
        # Open popup page for export
        popup_page = await self.context.new_page()
        await popup_page.goto(export_url)
        await popup_page.wait_for_load_state("networkidle")
        
        # Select XML radio button
        xml_radio = popup_page.locator('input[type="radio"][value="XML"], input[type="radio"]:has-text("XML")')
        
        # Try different selectors for XML option
        if await xml_radio.count() == 0:
            # Try by label
            xml_label = popup_page.locator('label:has-text("XML")')
            if await xml_label.count() > 0:
                await xml_label.click()
            else:
                # Try all radio buttons and find XML
                radios = await popup_page.locator('input[type="radio"]').all()
                for radio in radios:
                    radio_id = await radio.get_attribute("id")
                    if radio_id:
                        label = popup_page.locator(f'label[for="{radio_id}"]')
                        if await label.count() > 0:
                            label_text = await label.text_content()
                            if label_text and "XML" in label_text.upper():
                                await radio.click()
                                break
        else:
            await xml_radio.click()
        
        # Wait a moment for any JS to process
        await asyncio.sleep(0.5)
        
        # Click export button and wait for download
        export_button = popup_page.locator('a:has-text("Exportieren"), button:has-text("Exportieren"), input[value="Exportieren"]')
        
        if not await export_button.is_visible():
            # Try finding by image alt or other means
            export_button = popup_page.locator('a:has(img[src*="Export"]), a:has-text("Export")')
        
        if await export_button.count() == 0:
            await popup_page.close()
            return None
        
        # Start waiting for download before clicking
        async with popup_page.expect_download() as download_info:
            await export_button.click()
        
        download: Download = await download_info.value
        
        # Read the downloaded content
        path = await download.path()
        if path:
            with open(path, "r", encoding="utf-8") as f:
                xml_content = f.read()
        else:
            xml_content = None
        
        await popup_page.close()
        
        return xml_content
    
    async def scrape_all_orders(
        self, 
        existing_order_ids: set[str], 
        order_list_url: str | None = None
    ) -> tuple[list[dict], list[dict]]:
        """
        Scrape all orders and export XMLs for new orders.
        
        Args:
            existing_order_ids: Set of order_ids already in database
            order_list_url: Optional custom URL to the order list page
            
        Returns:
            Tuple of (new_orders, skipped_orders)
        """
        await self.login()
        orders = await self.get_order_list(order_list_url)
        
        new_orders = []
        skipped_orders = []
        
        for order in orders:
            order_id = order.external_order_id  # Use external_order_id as the unique order_id
            
            if order_id in existing_order_ids:
                skipped_orders.append({
                    "belnr": order.belnr,
                    "external_order_id": order.external_order_id,
                    "order_id": order_id,
                    "is_new": False
                })
                continue
            
            # Export XML for new order
            xml_content = await self.export_order_xml(order)
            
            new_orders.append({
                "belnr": order.belnr,
                "external_order_id": order.external_order_id,
                "order_id": order_id,
                "xml_content": xml_content,
                "is_new": True
            })
        
        return new_orders, skipped_orders


