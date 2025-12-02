from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "pending"
    SCRAPED = "scraped"
    CONVERTED = "converted"
    SENT = "sent"


class CallStatus(str, Enum):
    RECEIVED = "received"
    CONVERTED = "converted"
    SENT = "sent"


class CallState(str, Enum):
    RINGING = "ringing"
    ANSWERED = "answered"
    ENDED = "ended"
