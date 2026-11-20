import time
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple
from fastapi import HTTPException, Request, status

class LoginRateLimiter:
    """
    In-memory rate limiter with sliding window tracking and temporary lockouts.
    Supports both client IP and target account email tracking.
    Extracts client IP considering trusted reverse proxy configuration.
    """
    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 60,
        lockout_seconds: int = 300,
        trusted_proxies: Optional[Set[str]] = None,
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self.trusted_proxies = trusted_proxies or {"127.0.0.1", "::1", "localhost"}
        # key -> list of failure timestamps
        self.failure_history: Dict[str, List[float]] = defaultdict(list)
        # key -> lockout expiration timestamp
        self.lockouts: Dict[str, float] = {}

    def get_client_ip(self, request: Request) -> str:
        direct_ip = request.client.host if (request.client and request.client.host) else "127.0.0.1"

        # Only trust forwarded headers if request came directly from a verified trusted proxy
        if direct_ip in self.trusted_proxies or direct_ip.startswith("10.") or direct_ip.startswith("172.16.") or direct_ip.startswith("192.168."):
            forwarded_for = request.headers.get("X-Forwarded-For")
            if forwarded_for:
                return forwarded_for.split(",")[0].strip()
            real_ip = request.headers.get("X-Real-IP")
            if real_ip:
                return real_ip.strip()

        return direct_ip

    def check_rate_limit(self, identifier: str) -> None:
        now = time.time()

        # 1. Check active lockout
        lockout_expiry = self.lockouts.get(identifier)
        if lockout_expiry and now < lockout_expiry:
            remaining = int(lockout_expiry - now) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Account temporarily locked for security. Please try again in {remaining} seconds.",
                headers={"Retry-After": str(remaining)},
            )
        elif lockout_expiry and now >= lockout_expiry:
            del self.lockouts[identifier]
            self.failure_history[identifier] = []

        # 2. Check failure count in sliding window
        recent_failures = [
            t for t in self.failure_history[identifier]
            if now - t < self.window_seconds
        ]
        self.failure_history[identifier] = recent_failures

        if len(recent_failures) >= self.max_attempts:
            # Trigger temporary lockout
            self.lockouts[identifier] = now + self.lockout_seconds
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Temporarily locked for {self.lockout_seconds} seconds.",
                headers={"Retry-After": str(self.lockout_seconds)},
            )

    def record_failure(self, identifier: str) -> None:
        now = time.time()
        self.failure_history[identifier].append(now)

    def reset_failures(self, identifier: str) -> None:
        self.failure_history.pop(identifier, None)
        self.lockouts.pop(identifier, None)

# Default global instance: 5 failed attempts in 60s -> 5 minute (300s) lockout
login_limiter = LoginRateLimiter(max_attempts=5, window_seconds=60, lockout_seconds=300)
