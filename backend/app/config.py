from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    database_url: str = "postgresql://czisch:czisch_secret@localhost:5432/czisch_db"
    
    # API Security
    api_key: str = "your-secret-api-key"
    
    # App Info
    app_name: str = "Czisch N8N API"
    app_version: str = "1.0.0"
    
    # Hapodu Scraping Credentials
    hapodu_username: Optional[str] = None
    hapodu_password: Optional[str] = None
    hapodu_base_url: str = "https://hapodu.duisburg.de/risource"
    
    # Temporal Configuration
    temporal_host: str = "localhost:7233"
    
    # SFTP Configuration
    sftp_host: Optional[str] = None
    sftp_port: int = 22
    sftp_username: Optional[str] = None
    sftp_password: Optional[str] = None
    sftp_remote_path: str = "/import/orders"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
