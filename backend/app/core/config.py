import os
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Teakees Real Estate CRM"
    ENVIRONMENT: str = "development"
    # SECRET_KEY must be provided via environment in production; no safe default.
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DATABASE_URL: str = "sqlite:///./teakees_crm.db"

    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    PUBLIC_UPLOAD_DIR: str = "./uploads/public"
    PRIVATE_UPLOAD_DIR: str = "./uploads/private"
    # Base upload directory used for static file serving (public files). Private files are stored separately.
    UPLOAD_DIR: str = "./uploads"

    MAIL_USERNAME: str = "admin@testate.in"
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "admin@testate.in"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_FROM_NAME: str = "Teakees CRM"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = False
    FRONTEND_URL: str = "http://localhost:3000"

    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["*"]

    @property
    def is_production(self) -> bool:
        return (self.ENVIRONMENT or "").lower() == "production"

    from pydantic import model_validator

    @model_validator(mode="after")
    def validate_production_secret(self) -> "Settings":
        env = (self.ENVIRONMENT or "").lower()
        if env == "production":
            if not self.SECRET_KEY or not self.SECRET_KEY.strip():
                raise ValueError("FATAL SECURITY CONFIGURATION: SECRET_KEY must be set in production environment.")
            if len(self.SECRET_KEY) < 32:
                raise ValueError("FATAL SECURITY CONFIGURATION: SECRET_KEY must be at least 32 characters long in production.")
            weak_keywords = ["replace", "secret-key-2026", "secret", "password", "changeme", "admin123"]
            if any(weak in self.SECRET_KEY.lower() for weak in weak_keywords):
                raise ValueError(
                    "FATAL SECURITY CONFIGURATION: In production mode, a cryptographically random SECRET_KEY must be provided in the environment. Weak or development fallback secrets are strictly prohibited."
                )
        elif not self.SECRET_KEY and env in ("development", "testing"):
            # Safe predictable key for development / testing when env var omitted
            self.SECRET_KEY = "dev-secret-key-for-local-development-testing-purposes-min32chars"
        return self

    model_config = SettingsConfigDict(
        env_file=(
            ".env",
            "backend/.env",
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", ".env"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        ),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()

