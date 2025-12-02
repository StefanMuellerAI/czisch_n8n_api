"""
SFTP Upload functionality for Taifun XMLs.
"""

import logging
import paramiko
from io import StringIO

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SFTPUploadError(Exception):
    """Custom exception for SFTP upload errors."""
    pass


class SFTPUploader:
    """SFTP client for uploading Taifun XMLs to remote server."""
    
    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        remote_path: str | None = None
    ):
        self.host = host or settings.sftp_host
        self.port = port or settings.sftp_port
        self.username = username or settings.sftp_username
        self.password = password or settings.sftp_password
        self.remote_path = remote_path or settings.sftp_remote_path
        
        self._transport: paramiko.Transport | None = None
        self._sftp: paramiko.SFTPClient | None = None
        
        if not all([self.host, self.username, self.password]):
            raise SFTPUploadError(
                "SFTP credentials not configured. "
                "Please set SFTP_HOST, SFTP_USERNAME, and SFTP_PASSWORD."
            )
    
    def connect(self):
        """Establish SFTP connection."""
        try:
            logger.info(f"Connecting to SFTP server {self.host}:{self.port}")
            
            self._transport = paramiko.Transport((self.host, self.port))
            self._transport.connect(
                username=self.username,
                password=self.password
            )
            self._sftp = paramiko.SFTPClient.from_transport(self._transport)
            
            logger.info("SFTP connection established")
            
        except paramiko.AuthenticationException as e:
            raise SFTPUploadError(f"SFTP authentication failed: {e}")
        except paramiko.SSHException as e:
            raise SFTPUploadError(f"SFTP connection error: {e}")
        except Exception as e:
            raise SFTPUploadError(f"Failed to connect to SFTP server: {e}")
    
    def disconnect(self):
        """Close SFTP connection."""
        if self._sftp:
            self._sftp.close()
            self._sftp = None
        if self._transport:
            self._transport.close()
            self._transport = None
        logger.info("SFTP connection closed")
    
    def __enter__(self):
        """Context manager entry."""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.disconnect()
    
    def _ensure_remote_directory(self):
        """Ensure remote directory exists."""
        if not self._sftp:
            raise SFTPUploadError("Not connected to SFTP server")
        
        try:
            self._sftp.stat(self.remote_path)
        except FileNotFoundError:
            # Try to create the directory
            logger.info(f"Creating remote directory: {self.remote_path}")
            self._sftp.mkdir(self.remote_path)
    
    def upload_xml(self, filename: str, xml_content: str) -> str:
        """
        Upload XML content to remote server.
        
        Args:
            filename: Name of the file (e.g., "301065_8440000658.xml")
            xml_content: The XML content to upload
            
        Returns:
            Full remote path of uploaded file
        """
        if not self._sftp:
            raise SFTPUploadError("Not connected to SFTP server")
        
        self._ensure_remote_directory()
        
        remote_filepath = f"{self.remote_path}/{filename}"
        
        try:
            logger.info(f"Uploading {filename} to {remote_filepath}")
            
            # Convert string to bytes for upload
            xml_bytes = xml_content.encode('utf-8')
            
            # Create a file-like object from the bytes
            from io import BytesIO
            file_obj = BytesIO(xml_bytes)
            
            # Upload the file
            self._sftp.putfo(file_obj, remote_filepath)
            
            logger.info(f"Successfully uploaded {filename}")
            return remote_filepath
            
        except Exception as e:
            raise SFTPUploadError(f"Failed to upload {filename}: {e}")
    
    def file_exists(self, filename: str) -> bool:
        """Check if a file already exists on the remote server."""
        if not self._sftp:
            raise SFTPUploadError("Not connected to SFTP server")
        
        remote_filepath = f"{self.remote_path}/{filename}"
        
        try:
            self._sftp.stat(remote_filepath)
            return True
        except FileNotFoundError:
            return False


def upload_taifun_xml(
    order_id: str,
    belnr: str,
    xml_content: str
) -> str:
    """
    Convenience function to upload a Taifun XML.
    
    Args:
        order_id: The order ID
        belnr: The Bestellnummer
        xml_content: The Taifun XML content
        
    Returns:
        Remote filepath of uploaded file
    """
    filename = f"{order_id}_{belnr}.xml"
    
    with SFTPUploader() as sftp:
        return sftp.upload_xml(filename, xml_content)

