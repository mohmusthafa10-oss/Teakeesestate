import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Set

class TokenBlacklist:
    """
    In-memory and persistent token registry tracking:
    1. Revoked refresh tokens (upon logout or rotation).
    2. Token family IDs (for detecting token theft and reuse).
    3. Revocation of entire token families when an already-used refresh token is reused.
    """
    def __init__(self):
        # jti -> revocation timestamp
        self.revoked_tokens: Dict[str, float] = {}
        # family_id -> set of jtis
        self.families: Dict[str, Set[str]] = {}
        # revoked families
        self.compromised_families: Set[str] = set()

    def register_token(self, jti: str, family_id: str) -> None:
        if family_id not in self.families:
            self.families[family_id] = set()
        self.families[family_id].add(jti)

    def is_token_revoked(self, jti: str, family_id: Optional[str] = None) -> bool:
        if jti in self.revoked_tokens:
            return True
        if family_id and family_id in self.compromised_families:
            return True
        return False

    def revoke_token(self, jti: str) -> None:
        self.revoked_tokens[jti] = datetime.now(timezone.utc).timestamp()

    def revoke_family(self, family_id: str) -> None:
        """Invalidate all tokens in this family because token reuse was detected."""
        self.compromised_families.add(family_id)
        if family_id in self.families:
            now = datetime.now(timezone.utc).timestamp()
            for jti in self.families[family_id]:
                self.revoked_tokens[jti] = now

token_registry = TokenBlacklist()
