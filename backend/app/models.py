from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Order(Base):
    """Order database model."""
    
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(String(50), default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationship to exports
    exports = relationship("OrderExport", back_populates="order", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Order(id={self.id}, order_id='{self.order_id}', status='{self.status}')>"


class OrderExport(Base):
    """Order export database model for storing XML exports."""
    
    __tablename__ = "order_exports"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    belnr = Column(String(255), nullable=False, index=True)
    external_order_id = Column(String(255), nullable=False, index=True)
    xml_content = Column(Text, nullable=False)
    export_type = Column(String(50), default="hapodu", nullable=False, index=True)  # "hapodu" or "taifun"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationship to order
    order = relationship("Order", back_populates="exports")
    
    def __repr__(self):
        return f"<OrderExport(id={self.id}, belnr='{self.belnr}', type='{self.export_type}')>"


class ScrapeSchedule(Base):
    """Schedule for automatic scraping at specific times."""
    
    __tablename__ = "scrape_schedules"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    hour = Column(Integer, nullable=False)      # 0-23
    minute = Column(Integer, nullable=False)    # 0-59
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<ScrapeSchedule(id={self.id}, time='{self.hour:02d}:{self.minute:02d}', enabled={self.enabled})>"


class Call(Base):
    """Call database model for AGFEO phone events."""
    
    __tablename__ = "calls"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    call_id = Column(String(255), unique=True, nullable=False, index=True)  # Generated from timestamp + from_number
    state = Column(String(50), nullable=False)  # ringing, answered, ended
    from_number = Column(String(50), nullable=False)
    to_number = Column(String(50), nullable=False)
    extension = Column(String(10), nullable=True)
    caller_name = Column(String(255), nullable=True)
    call_timestamp = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), default="received", nullable=False)  # received, converted
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationship to exports
    exports = relationship("CallExport", back_populates="call", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Call(id={self.id}, call_id='{self.call_id}', state='{self.state}', status='{self.status}')>"


class CallExport(Base):
    """Call export database model for storing JSON and XML exports."""
    
    __tablename__ = "call_exports"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    call_id = Column(Integer, ForeignKey("calls.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)  # JSON or XML content
    export_type = Column(String(50), default="agfeo", nullable=False, index=True)  # "agfeo" (JSON) or "taifun" (XML)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationship to call
    call = relationship("Call", back_populates="exports")
    
    def __repr__(self):
        return f"<CallExport(id={self.id}, call_id={self.call_id}, type='{self.export_type}')>"
