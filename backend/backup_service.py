import os
import sys
import shutil
import tarfile
import datetime

BACKUP_DIR = os.getenv("BACKUP_DIR", "./backups")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "14"))

def perform_backup():
    """
    Automated backup script supporting PostgreSQL (via pg_dump)
    or SQLite fallback, alongside tar.gz archiving of uploaded documents and images.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    db_url = os.getenv("DATABASE_URL", "sqlite:///./teakees_crm.db")

    print(f"[{timestamp}] Starting automated backup...")

    # 1. Database backup
    if db_url.startswith("postgres"):
        db_backup_path = os.path.join(BACKUP_DIR, f"teakees_db_{timestamp}.dump")
        # Ensure pg_dump receives a standard postgresql:// URI without SQLAlchemy driver suffix (+psycopg2)
        pg_uri = db_url.replace("postgresql+psycopg2://", "postgresql://")
        print(f"Executing PostgreSQL dump to: {db_backup_path}")
        import subprocess
        try:
            res = subprocess.run(
                ["pg_dump", pg_uri, "-Fc", "-f", db_backup_path],
                capture_output=True,
                text=True,
                check=True
            )
            print(f"PostgreSQL database backed up to: {db_backup_path} ({os.path.getsize(db_backup_path)} bytes)")
        except FileNotFoundError:
            raise RuntimeError("pg_dump executable not found in PATH. Ensure postgresql-client is installed.")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"pg_dump failed with exit code {e.returncode}: {e.stderr}")
    else:
        # SQLite backup
        import sqlite3
        db_file = db_url.replace("sqlite:///", "")
        db_backup_path = os.path.join(BACKUP_DIR, f"teakees_db_{timestamp}.db")
        if os.path.exists(db_file):
            src = sqlite3.connect(db_file)
            dst = sqlite3.connect(db_backup_path)
            with dst:
                src.backup(dst)
            dst.close()
            src.close()
            print(f"SQLite database backed up to: {db_backup_path} ({os.path.getsize(db_backup_path)} bytes)")

    # 2. Uploaded files archive (images and documents)
    uploads_archive_path = os.path.join(BACKUP_DIR, f"teakees_uploads_{timestamp}.tar.gz")
    if os.path.exists(UPLOAD_DIR) and os.listdir(UPLOAD_DIR):
        with tarfile.open(uploads_archive_path, "w:gz") as tar:
            tar.add(UPLOAD_DIR, arcname=os.path.basename(UPLOAD_DIR))
        print(f"Uploads archived to: {uploads_archive_path} ({os.path.getsize(uploads_archive_path)} bytes)")
    else:
        print("Uploads directory empty or non-existent; archive skipped.")

    # 3. Retention policy cleanup
    cutoff = datetime.datetime.now() - datetime.timedelta(days=RETENTION_DAYS)
    for fname in os.listdir(BACKUP_DIR):
        fpath = os.path.join(BACKUP_DIR, fname)
        if os.path.isfile(fpath):
            mtime = datetime.datetime.fromtimestamp(os.path.getmtime(fpath))
            if mtime < cutoff:
                os.remove(fpath)
                print(f"Pruned stale backup older than {RETENTION_DAYS} days: {fname}")

    print("Backup completed successfully.")
    return db_backup_path

def verify_backup(backup_path: str):
    """Integrity check for backup file."""
    assert os.path.exists(backup_path), f"Backup file {backup_path} does not exist"
    size = os.path.getsize(backup_path)
    assert size > 0, "Backup file is empty"
    print(f"Backup verification PASSED: {backup_path} ({size} bytes, non-empty)")


def restore_backup_to_disposable(backup_path: str, target_db_url: str):
    """
    Restore a backup to a specified disposable database for verification.
    NEVER restores over the active production database.
    """
    assert os.path.exists(backup_path), f"Backup file {backup_path} not found"
    if target_db_url.startswith("postgres"):
        import subprocess
        pg_restore_uri = target_db_url.replace("postgresql+psycopg2://", "postgresql://")
        print(f"Restoring PostgreSQL dump {backup_path} to disposable DB: {pg_restore_uri}")
        res = subprocess.run(
            ["pg_restore", "-d", pg_restore_uri, "--clean", "--if-exists", backup_path],
            capture_output=True,
            text=True,
            check=True
        )
        print("PostgreSQL restore to disposable DB completed successfully.")
    else:
        import sqlite3
        dest_file = target_db_url.replace("sqlite:///", "")
        if os.path.exists(dest_file):
            os.remove(dest_file)
        src = sqlite3.connect(backup_path)
        dst = sqlite3.connect(dest_file)
        with dst:
            src.backup(dst)
        dst.close()
        src.close()
        print(f"SQLite restore to disposable DB completed successfully: {dest_file}")

if __name__ == "__main__":
    try:
        bpath = perform_backup()
        verify_backup(bpath)
        sys.exit(0)
    except Exception as e:
        print(f"FATAL: Backup execution failed: {e}", file=sys.stderr)
        sys.exit(1)
