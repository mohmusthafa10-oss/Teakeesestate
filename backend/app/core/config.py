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
    # SECRET_KEY must be provided via environment in production; no safe default.
    SECRET_KEY: str = ""

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

    @field_validator("SECRET_KEY")
    def validate_production_secret(cls, v: str, info) -> str:
        # In production, a secret key must be explicitly set and be strong.
        env = os.getenv("ENVIRONMENT", "").lower()
        if env == "production":
            if not v:
                raise ValueError("FATAL SECURITY CONFIGURATION: SECRET_KEY must be set in production environment.")
            if len(v) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters long in production.")
            if "replace" in v.lower() or "secret-key-2026" in v.lower():
                raise ValueError(
                    "FATAL SECURITY CONFIGURATION: In production mode, a cryptographically random SECRET_KEY must be provided in the environment. Development fallback secrets are strictly prohibited."
                )
        return v

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()

