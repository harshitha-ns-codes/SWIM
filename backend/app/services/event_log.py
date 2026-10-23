from __future__ import annotations

import sqlite3
from pathlib import Path

from app.models.domain import ProtocolEvent

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "swim_events.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS protocol_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            sim_time REAL NOT NULL,
            event_type TEXT NOT NULL,
            source_node TEXT,
            target_node TEXT,
            outcome TEXT,
            detail TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.commit()
    return connection


def log_event(session_id: str, event: ProtocolEvent) -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO protocol_events (
                session_id, event_id, sim_time, event_type, source_node, target_node, outcome, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                event.event_id,
                event.sim_time,
                event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
                event.source_node,
                event.target_node,
                event.outcome,
                event.detail,
            ),
        )
        connection.commit()
    finally:
        connection.close()
