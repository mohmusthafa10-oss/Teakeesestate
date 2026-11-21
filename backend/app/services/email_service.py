import logging
from email.message import EmailMessage
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_password_reset(email: str, raw_token: str) -> None:
    """Send a password-reset email containing a one-time link.

    The link points to the front-end URL specified by settings.FRONTEND_URL.
    raw_token is the unhashed token that is stored (hashed) in the DB.
    """
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend.rstrip('/')}/reset-password?token={raw_token}"
    
    msg = EmailMessage()
    msg["Subject"] = "Teakees CRM – Password Reset"
    msg["From"] = f"{getattr(settings, 'MAIL_FROM_NAME', 'Teakees CRM')} <{settings.MAIL_FROM}>"
    msg["To"] = email
    msg.set_content(
        "You requested a password reset. Click the link below (valid for 15 minutes):\n"
        f"{reset_link}\n\n"
        "If you did not request this, you can safely ignore this email."
    )

    # In non-production or if SMTP password is not configured, log and return safely
    if settings.ENVIRONMENT != "production" or not settings.MAIL_PASSWORD:
        logger.info(f"Password reset link for {email}: {reset_link}")
        return

    try:
        import aiosmtplib
        await aiosmtplib.send(
            msg,
            hostname=settings.MAIL_SERVER,
            port=settings.MAIL_PORT,
            username=settings.MAIL_USERNAME,
            password=settings.MAIL_PASSWORD,
            start_tls=settings.MAIL_STARTTLS,
        )
        logger.info(f"Password reset email sent to {email}")
    except Exception as exc:
        logger.error(f"Failed to send password reset email to {email}: {exc}")
