"""Rate limiting middleware using slowapi."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create a limiter instance with default key function (client IP)
limiter = Limiter(key_func=get_remote_address)

# Default rate limits for different endpoint types
# These can be overridden per-route using @limiter.limit() decorator
DEFAULT_RATE_LIMIT = "100/minute"  # General endpoints
WRITE_RATE_LIMIT = "30/minute"  # Create/Update/Delete endpoints
