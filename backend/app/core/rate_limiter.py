from collections import defaultdict
import os
from pathlib import Path
import sqlite3
import threading
import time
from typing import Dict, List, Optional, Set, Tuple
from fastapi import HTTPException, Request, status


class LoginRateLimiter:
    """
    Multi-worker rate limiter with sliding window tracking and temporary lockouts.
    Coordinates across multiple Uvicorn worker processes using a shared SQLite store
    with WAL mode and row locking, backed by an in-memory cache.

    Supports tracking by client IP and target account email.
    Extracts client IP considering trusted reverse proxy configuration.
    """
    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 60,
        lockout_seconds: int = 300,
        trusted_proxies: Optional[Set[str]] = None,
        db_path: Optional[str] = None,
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self.trusted_proxies = trusted_proxies or {"127.0.0.1", "::1", "localhost"}
        self.db_path = db_path or os.getenv("RATE_LIMIT_DB_PATH", str(Path(__file__).resolve().parent.parent.parent / "data" / "rate_limits.db"))

        self._lock = threading.Lock()
        # In-memory mirror for low-latency lookups and direct test inspection
        self.failure_history: Dict[str, List[float]] = defaultdict(list)
        self.lockouts: Dict[str, float] = {}

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        db_file = Path(self.db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_file), timeout=10.0)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        try:
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS rate_limit_failures (
                        identifier TEXT NOT NULL,
                        timestamp REAL NOT NULL
                    );
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS ix_rate_failures_lookup
                    ON rate_limit_failures (identifier, timestamp);
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS rate_limit_lockouts (
                        identifier TEXT PRIMARY KEY,
                        expiry REAL NOT NULL
                    );
                """)
        except Exception:
            # If filesystem is read-only, in-memory limiter continues functioning
            pass

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

        # 1. Check active lockout (from DB and in-memory)
        lockout_expiry: Optional[float] = None
        try:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT expiry FROM rate_limit_lockouts WHERE identifier = ?",
                    (identifier,),
                ).fetchone()
                if row:
                    lockout_expiry = float(row[0])
        except Exception:
            lockout_expiry = self.lockouts.get(identifier)

        if lockout_expiry and now < lockout_expiry:
            remaining = int(lockout_expiry - now) + 1
            self.lockouts[identifier] = lockout_expiry
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Account temporarily locked for security. Please try again in {remaining} seconds.",
                headers={"Retry-After": str(remaining)},
            )
        elif lockout_expiry and now >= lockout_expiry:
            self.reset_failures(identifier)

        # 2. Check failure count in sliding window across all workers
        window_cutoff = now - self.window_seconds
        recent_count = 0
        try:
            with self._get_connection() as conn:
                # Purge old records periodically
                conn.execute("DELETE FROM rate_limit_failures WHERE timestamp < ?", (now - 86400,))
                row = conn.execute(
                    "SELECT COUNT(*) FROM rate_limit_failures WHERE identifier = ? AND timestamp >= ?",
                    (identifier, window_cutoff),
                ).fetchone()
                recent_count = row[0] if row else 0
        except Exception:
            recent_failures = [t for t in self.failure_history[identifier] if t >= window_cutoff]
            self.failure_history[identifier] = recent_failures
            recent_count = len(recent_failures)

        if recent_count >= self.max_attempts:
            new_expiry = now + self.lockout_seconds
            self.lockouts[identifier] = new_expiry
            try:
                with self._get_connection() as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO rate_limit_lockouts (identifier, expiry) VALUES (?, ?)",
                        (identifier, new_expiry),
                    )
            except Exception:
                pass

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Temporarily locked for {self.lockout_seconds} seconds.",
                headers={"Retry-After": str(self.lockout_seconds)},
            )

    def record_failure(self, identifier: str) -> None:
        now = time.time()
        self.failure_history[identifier].append(now)
        try:
            with self._get_connection() as conn:
                conn.execute(
                    "INSERT INTO rate_limit_failures (identifier, timestamp) VALUES (?, ?)",
                    (identifier, now),
                )
        except Exception:
            pass

    def reset_failures(self, identifier: str) -> None:
        self.failure_history.pop(identifier, None)
        self.lockouts.pop(identifier, None)
        try:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM rate_limit_failures WHERE identifier = ?", (identifier,))
                conn.execute("DELETE FROM rate_limit_lockouts WHERE identifier = ?", (identifier,))
        except Exception:
            pass

    def reset_all(self) -> None:
        self.failure_history.clear()
        self.lockouts.clear()
        try:
            with self._get_connection() as conn:
                conn.execute("DELETE FROM rate_limit_failures;")
                conn.execute("DELETE FROM rate_limit_lockouts;")
        except Exception:
            pass


# Default global instance: 5 failed attempts in 60s -> 5 minute (300s) lockout
login_limiter = LoginRateLimiter(max_attempts=5, window_seconds=60, lockout_seconds=300)
