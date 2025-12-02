from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.enums import OrderStatus, CallStatus, CallState


class OrderBase(BaseModel):
    """Base schema for Order."""
    order_id: str = Field(..., min_length=1, max_length=255, description="Unique order identifier")
    status: OrderStatus = Field(default=OrderStatus.PENDING, description="Order status")


class OrderCreate(OrderBase):
    """Schema for creating an order."""
    pass


class OrderUpdate(BaseModel):
    """Schema for updating an order."""
    order_id: Optional[str] = Field(None, min_length=1, max_length=255, description="Unique order identifier")
    status: Optional[OrderStatus] = Field(None, description="Order status")


class OrderExportResponse(BaseModel):
    """Schema for order export response."""
    id: int
    order_id: int
    belnr: str
    external_order_id: str
    xml_content: str
    export_type: str = "hapodu"  # "hapodu" or "taifun"
    created_at: datetime
    
    class Config:
        from_attributes = True


class OrderResponse(OrderBase):
    """Schema for order response."""
    id: int
    created_at: datetime
    updated_at: datetime
    exports: list[OrderExportResponse] = []
    
    class Config:
        from_attributes = True


class OrderResponseSimple(OrderBase):
    """Schema for order response without exports."""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class OrderWithBelnr(OrderBase):
    """Schema for order response with belnr from exports."""
    id: int
    belnr: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderListResponse(BaseModel):
    """Schema for list of orders response."""
    orders: list[OrderWithBelnr]
    total: int


class HealthResponse(BaseModel):
    """Schema for health check response."""
    status: str
    version: str
    database: str
    temporal: str
    sftp: str


class MessageResponse(BaseModel):
    """Schema for simple message response."""
    message: str


# Scraping Schemas
class ScrapeRequest(BaseModel):
    """Schema for scrape request."""
    order_list_url: str = Field(
        default="https://hapodu.duisburg.de/risource/do/order/list/editable?initSearch=true&reset=false",
        description="URL to the order list page"
    )


class ScrapedOrderInfo(BaseModel):
    """Schema for a single scraped order."""
    belnr: str
    external_order_id: str
    order_id: str
    is_new: bool


class ScrapeResponse(BaseModel):
    """Schema for scrape endpoint response."""
    status: str
    new_orders: int
    skipped_orders: int
    failed_exports: int
    orders: list[ScrapedOrderInfo]


class ScrapeErrorResponse(BaseModel):
    """Schema for scrape error response."""
    status: str
    error: str
    details: Optional[str] = None


# Schedule Schemas
class ScheduleCreate(BaseModel):
    """Schema for creating a scrape schedule."""
    hour: int = Field(..., ge=0, le=23, description="Hour of the day (0-23)")
    minute: int = Field(default=0, ge=0, le=59, description="Minute of the hour (0-59)")


class ScheduleResponse(BaseModel):
    """Schema for scrape schedule response."""
    id: int
    hour: int
    minute: int
    enabled: bool
    created_at: datetime
    time_display: str = ""  # Formatted time string like "06:00"
    
    class Config:
        from_attributes = True
    
    def __init__(self, **data):
        super().__init__(**data)
        self.time_display = f"{self.hour:02d}:{self.minute:02d}"


class ScheduleListResponse(BaseModel):
    """Schema for list of schedules response."""
    schedules: list[ScheduleResponse]
    total: int
    schedule_active: bool  # Whether Temporal schedule is active


# AGFEO Call Schemas
class CallEventCreate(BaseModel):
    """Schema for incoming AGFEO call event."""
    state: CallState = Field(..., description="Call state: ringing, answered, ended")
    from_number: str = Field(..., alias="from", description="Caller phone number")
    to_number: str = Field(..., alias="to", description="Called phone number")
    extension: Optional[str] = Field(None, description="Extension number")
    caller_name: Optional[str] = Field(None, description="Caller name if available")
    timestamp: datetime = Field(..., description="Call timestamp")
    
    class Config:
        populate_by_name = True


class CallExportResponse(BaseModel):
    """Schema for call export response."""
    id: int
    call_id: int
    content: str
    export_type: str  # "agfeo" (JSON) or "taifun" (XML)
    created_at: datetime
    
    class Config:
        from_attributes = True


class CallResponse(BaseModel):
    """Schema for call response."""
    id: int
    call_id: str
    state: CallState
    from_number: str
    to_number: str
    extension: Optional[str]
    caller_name: Optional[str]
    call_timestamp: datetime
    status: CallStatus
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CallWithExports(CallResponse):
    """Schema for call response with exports."""
    exports: list[CallExportResponse] = []


class CallListResponse(BaseModel):
    """Schema for list of calls response."""
    calls: list[CallResponse]
    total: int


# Scrape Config Schemas
class ScrapeConfigResponse(BaseModel):
    """Schema for scrape config response."""
    custom_order_list_url: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ScrapeConfigUpdate(BaseModel):
    """Schema for updating scrape config."""
    custom_order_list_url: Optional[str] = Field(
        None,
        max_length=1024,
        description="Custom URL for order list scraping (null = use default)"
    )
