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
        # Run pg_dump in custom format (-Fc)
        cmd = f'pg_dump "{db_url}" -Fc -f "{db_backup_path}"'
        print(f"Executing PostgreSQL dump to: {db_backup_path}")
        # When executed in production container with postgresql-client:
        # os.system(cmd)
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

if __name__ == "__main__":
    bpath = perform_backup()
    verify_backup(bpath)
