#!/usr/bin/env python3
"""
SQLite → PostgreSQL Data Migration Utility
==========================================
Teakees Real Estate CRM

Safely copies all data from the existing SQLite database into a live PostgreSQL instance.

Usage (run from the backend/ directory):
    python app/migrate_sqlite_to_pg.py \\
        --sqlite-url "sqlite:///./teakees_crm.db" \\
        --postgres-url "postgresql+psycopg2://user:pass@host:5432/dbname" \\
        [--dry-run] \\
        [--stop-on-error] \\
        [--report-file migration_report.txt]

Guarantees:
  - The original SQLite file is NEVER deleted or modified.
  - Each table is inserted in a transaction; on failure that table is skipped
    (or the whole migration is aborted if --stop-on-error is set).
  - IDs, passwords, timestamps, and financial values are copied verbatim.
  - FK constraints are temporarily deferred during the import.
  - Duplicate rows (already in PostgreSQL) are skipped (ON CONFLICT DO NOTHING).
  - A per-table summary and total row count is printed at the end.
"""

import argparse
import sys
import logging
from datetime import datetime
from typing import Dict, List, Tuple, Any

from sqlalchemy import create_engine, inspect, text, MetaData
from sqlalchemy.engine import Engine
from app.database.session import sanitize_db_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("migrate")


# Ordered table list respecting FK dependency order (parents before children)
TABLE_ORDER = [
    "users",
    "sequence_counters",
    "agency_settings",
    "sellers",
    "properties",
    "property_images",
    "property_documents",
    "price_histories",
    "seller_advances",
    "investors",
    "investments",
    "tenants",
    "rental_bookings",
    "leads",
    "property_matches",
    "follow_ups",
    "site_visits",
    "deals",
    "expenses",
    "activity_logs",
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Migrate data from SQLite to PostgreSQL for Teakees CRM"
    )
    p.add_argument(
        "--sqlite-url",
        required=True,
        help='SQLite source URL e.g. "sqlite:///./teakees_crm.db"',
    )
    p.add_argument(
        "--postgres-url",
        required=True,
        help='PostgreSQL target URL e.g. "postgresql+psycopg2://user:pass@host:5432/db"',
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print row counts only; do not insert anything into PostgreSQL",
    )
    p.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Abort the entire migration if any table fails",
    )
    p.add_argument(
        "--report-file",
        default=None,
        help="Optional path to write the migration report (default: stdout only)",
    )
    return p.parse_args()


def get_sqlite_tables(engine: Engine) -> List[str]:
    inspector = inspect(engine)
    return inspector.get_table_names()


def migrate_table(
    src_engine: Engine,
    dst_engine: Engine,
    table: str,
    dry_run: bool,
) -> Tuple[int, int, str]:
    """
    Copy rows from `table` in SQLite into PostgreSQL.

    Returns:
        (rows_read, rows_inserted, error_message_or_empty_string)
    """
    try:
        with src_engine.connect() as src_conn:
            result = src_conn.execute(text(f'SELECT * FROM "{table}"'))
            rows = result.mappings().all()

        rows_read = len(rows)

        if rows_read == 0:
            logger.info("  %-30s  0 rows — skipped (empty)", table)
            return 0, 0, ""

        if dry_run:
            logger.info("  %-30s  %d rows [DRY RUN — no insert]", table, rows_read)
            return rows_read, 0, ""

        columns = list(rows[0].keys())
        col_list = ", ".join(f'"{c}"' for c in columns)
        placeholders = ", ".join(f":{c}" for c in columns)

        # ON CONFLICT DO NOTHING — idempotent; already-migrated rows are skipped
        insert_sql = text(
            f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) '
            f"ON CONFLICT DO NOTHING"
        )

        inserted = 0
        with dst_engine.begin() as dst_conn:
            # Temporarily disable FK checks for the duration of this table's import
            # (PostgreSQL defers can be set at statement level)
            dst_conn.execute(text("SET CONSTRAINTS ALL DEFERRED"))

            batch_size = 500
            for i in range(0, rows_read, batch_size):
                batch = [dict(r) for r in rows[i : i + batch_size]]
                result = dst_conn.execute(insert_sql, batch)
                inserted += result.rowcount if result.rowcount >= 0 else len(batch)

        logger.info(
            "  %-30s  %d / %d rows inserted (skipped %d duplicates)",
            table,
            inserted,
            rows_read,
            rows_read - inserted,
        )
        return rows_read, inserted, ""

    except Exception as exc:
        msg = f"Error migrating table '{table}': {exc}"
        logger.error(msg)
        return 0, 0, msg


def main() -> None:
    args = parse_args()

    logger.info("=" * 60)
    logger.info("Teakees CRM — SQLite → PostgreSQL Migration")
    logger.info("=" * 60)
    logger.info("Source : %s", args.sqlite_url)
    logger.info("Target : %s", args.postgres_url.split("@")[-1])  # hide credentials
    logger.info("Dry Run: %s", args.dry_run)
    logger.info("=" * 60)

    # Connect
    try:
        src_engine = create_engine(args.sqlite_url, connect_args={"check_same_thread": False})
        with src_engine.connect() as c:
            c.execute(text("SELECT 1"))
        logger.info("SQLite connection: OK")
    except Exception as exc:
        logger.critical("Cannot open SQLite source: %s", exc)
        sys.exit(1)

    try:
        dst_engine = create_engine(sanitize_db_url(args.postgres_url), pool_pre_ping=True)
        with dst_engine.connect() as c:
            c.execute(text("SELECT 1"))
        logger.info("PostgreSQL connection: OK")
    except Exception as exc:
        logger.critical("Cannot connect to PostgreSQL: %s", exc)
        sys.exit(1)

    # Discover which tables actually exist in SQLite
    sqlite_tables = set(get_sqlite_tables(src_engine))

    report: Dict[str, Tuple[int, int, str]] = {}
    total_read = 0
    total_inserted = 0
    errors = 0

    for table in TABLE_ORDER:
        if table not in sqlite_tables:
            logger.warning("  %-30s  not found in SQLite — skipped", table)
            continue

        read, inserted, err = migrate_table(src_engine, dst_engine, table, args.dry_run)
        report[table] = (read, inserted, err)
        total_read += read
        total_inserted += inserted

        if err:
            errors += 1
            if args.stop_on_error:
                logger.critical("Aborting due to error (--stop-on-error is set).")
                break

    # Also migrate any tables not in TABLE_ORDER (future tables / custom additions)
    extras = sqlite_tables - set(TABLE_ORDER) - {"sqlite_sequence"}
    for table in sorted(extras):
        logger.info("  %-30s  (extra table — migrating last)", table)
        read, inserted, err = migrate_table(src_engine, dst_engine, table, args.dry_run)
        report[table] = (read, inserted, err)
        total_read += read
        total_inserted += inserted
        if err:
            errors += 1

    # Summary
    summary_lines = [
        "",
        "=" * 60,
        f"Migration {'DRY RUN ' if args.dry_run else ''}Summary — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 60,
        f"{'Table':<35} {'Read':>8} {'Inserted':>10} {'Status':>10}",
        "-" * 65,
    ]
    for tbl, (rd, ins, err) in report.items():
        status = "ERROR" if err else ("DRY RUN" if args.dry_run else "OK")
        summary_lines.append(f"{tbl:<35} {rd:>8} {ins:>10} {status:>10}")

    summary_lines += [
        "-" * 65,
        f"{'TOTAL':<35} {total_read:>8} {total_inserted:>10}",
        "",
        f"Tables processed : {len(report)}",
        f"Errors           : {errors}",
        f"{'DRY RUN — no data was written to PostgreSQL.' if args.dry_run else 'Migration complete.'}",
        "=" * 60,
    ]

    for line in summary_lines:
        logger.info(line)

    if args.report_file:
        with open(args.report_file, "w", encoding="utf-8") as f:
            f.write("\n".join(summary_lines))
        logger.info("Report written to: %s", args.report_file)

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
