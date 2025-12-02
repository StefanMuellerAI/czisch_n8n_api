from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.auth import verify_api_key
from app.enums import OrderStatus
from app.models import Order, OrderExport
from app.schemas import (
    OrderCreate,
    OrderUpdate,
    OrderResponse,
    OrderListResponse,
    OrderWithBelnr,
    MessageResponse
)

router = APIRouter()
MAX_PAGE_SIZE = 100


@router.post(
    "/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_api_key)]
)
async def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db)
) -> OrderResponse:
    """
    Create a new order.
    
    Requires API key authentication via X-API-Key header.
    """
    db_order = Order(
        order_id=order_data.order_id,
        status=order_data.status
    )
    
    try:
        db.add(db_order)
        db.commit()
        db.refresh(db_order)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order with order_id '{order_data.order_id}' already exists."
        )
    
    return db_order


@router.get(
    "/orders",
    response_model=OrderListResponse,
    dependencies=[Depends(verify_api_key)]
)
async def list_orders(
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 10,
    db: Session = Depends(get_db)
) -> OrderListResponse:
    """
    Get all orders with pagination, sorted by creation date (newest first).
    
    Requires API key authentication via X-API-Key header.
    """
    orders = db.query(Order).order_by(Order.created_at.desc()).offset(skip).limit(limit).all()
    total = db.query(Order).count()
    
    # Build response with belnr from first hapodu export
    orders_with_belnr = []
    for order in orders:
        # Get belnr from first hapodu export if exists
        hapodu_export = db.query(OrderExport).filter(
            OrderExport.order_id == order.id,
            OrderExport.export_type == "hapodu"
        ).first()
        
        orders_with_belnr.append(OrderWithBelnr(
            id=order.id,
            order_id=order.order_id,
            status=order.status,
            belnr=hapodu_export.belnr if hapodu_export else None,
            created_at=order.created_at,
            updated_at=order.updated_at
        ))
    
    return OrderListResponse(orders=orders_with_belnr, total=total)


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    dependencies=[Depends(verify_api_key)]
)
async def get_order(
    order_id: int,
    db: Session = Depends(get_db)
) -> OrderResponse:
    """
    Get a single order by its database ID.
    
    Requires API key authentication via X-API-Key header.
    """
    db_order = db.query(Order).filter(Order.id == order_id).first()
    
    if db_order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found."
        )
    
    return db_order


@router.put(
    "/orders/{order_id}",
    response_model=OrderResponse,
    dependencies=[Depends(verify_api_key)]
)
async def update_order(
    order_id: int,
    order_data: OrderUpdate,
    db: Session = Depends(get_db)
) -> OrderResponse:
    """
    Update an existing order by its database ID.
    
    Requires API key authentication via X-API-Key header.
    """
    db_order = db.query(Order).filter(Order.id == order_id).first()
    
    if db_order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found."
        )
    
    # Update only provided fields
    update_data = order_data.model_dump(exclude_unset=True)
    
    if "order_id" in update_data:
        # Check for duplicate order_id
        existing = db.query(Order).filter(
            Order.order_id == update_data["order_id"],
            Order.id != order_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Order with order_id '{update_data['order_id']}' already exists."
            )
    
    for field, value in update_data.items():
        setattr(db_order, field, value)
    
    db.commit()
    db.refresh(db_order)
    
    return db_order


@router.delete(
    "/orders/{order_id}",
    response_model=MessageResponse,
    dependencies=[Depends(verify_api_key)]
)
async def delete_order(
    order_id: int,
    db: Session = Depends(get_db)
) -> MessageResponse:
    """
    Delete an order by its database ID.
    
    Requires API key authentication via X-API-Key header.
    """
    db_order = db.query(Order).filter(Order.id == order_id).first()
    
    if db_order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found."
        )
    
    db.delete(db_order)
    db.commit()
    
    return MessageResponse(message=f"Order with id {order_id} has been deleted.")



