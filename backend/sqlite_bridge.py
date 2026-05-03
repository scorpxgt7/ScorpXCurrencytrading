import json
import sqlite3
import sys
from pathlib import Path


def connect(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_trades (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            direction TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL NOT NULL,
            risk_amount REAL NOT NULL DEFAULT 0,
            reward_amount REAL NOT NULL DEFAULT 0,
            profit REAL NOT NULL DEFAULT 0,
            confidence REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'closed',
            source TEXT NOT NULL DEFAULT 'manual',
            strategy_name TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_events (
            id TEXT PRIMARY KEY,
            stage TEXT NOT NULL,
            event_type TEXT NOT NULL,
            symbol TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT '',
            symbol TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'paper',
            source TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def row_to_trade(row):
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        payload = {}
    payload.update(
        {
            "id": row["id"],
            "symbol": row["symbol"],
            "direction": row["direction"],
            "entryPrice": row["entry_price"],
            "exitPrice": row["exit_price"],
            "riskAmount": row["risk_amount"],
            "rewardAmount": row["reward_amount"],
            "profit": row["profit"],
            "profitLoss": row["profit"],
            "confidence": row["confidence"],
            "status": row["status"],
            "source": row["source"],
            "strategyName": row["strategy_name"],
            "timestamp": row["timestamp"],
        }
    )
    return payload


def list_trades(conn):
    rows = conn.execute(
        "SELECT * FROM journal_trades ORDER BY timestamp DESC, rowid DESC"
    ).fetchall()
    return {"trades": [row_to_trade(row) for row in rows]}


def upsert_trade(conn, trade):
    trade_id = str(trade.get("id") or trade.get("timestamp") or "")
    if not trade_id:
        raise ValueError("trade id is required")
    payload = json.dumps(trade, separators=(",", ":"))
    conn.execute(
        """
        INSERT INTO journal_trades (
            id, symbol, direction, entry_price, exit_price, risk_amount,
            reward_amount, profit, confidence, status, source, strategy_name,
            timestamp, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            symbol = excluded.symbol,
            direction = excluded.direction,
            entry_price = excluded.entry_price,
            exit_price = excluded.exit_price,
            risk_amount = excluded.risk_amount,
            reward_amount = excluded.reward_amount,
            profit = excluded.profit,
            confidence = excluded.confidence,
            status = excluded.status,
            source = excluded.source,
            strategy_name = excluded.strategy_name,
            timestamp = excluded.timestamp,
            payload_json = excluded.payload_json
        """,
        (
            trade_id,
            trade.get("symbol", "UNKNOWN"),
            trade.get("direction", "NA"),
            float(trade.get("entryPrice") or 0),
            float(trade.get("exitPrice") or 0),
            float(trade.get("riskAmount") or 0),
            float(trade.get("rewardAmount") or 0),
            float(trade.get("profit", trade.get("profitLoss", 0)) or 0),
            float(trade.get("confidence") or 0),
            trade.get("status", "closed"),
            trade.get("source", "manual"),
            trade.get("strategyName", ""),
            trade.get("timestamp", ""),
            payload,
        ),
    )
    conn.commit()
    return {"ok": True, "trade": trade}


def clear_trades(conn):
    conn.execute("DELETE FROM journal_trades")
    conn.commit()
    return {"ok": True}


def row_to_event(row):
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        payload = {}
    payload.update(
        {
            "id": row["id"],
            "stage": row["stage"],
            "eventType": row["event_type"],
            "symbol": row["symbol"],
            "status": row["status"],
            "message": row["message"],
            "timestamp": row["timestamp"],
        }
    )
    return payload


def list_agent_events(conn, limit=50):
    normalized_limit = max(1, min(int(limit or 50), 200))
    rows = conn.execute(
        "SELECT * FROM agent_events ORDER BY timestamp DESC, rowid DESC LIMIT ?",
        (normalized_limit,),
    ).fetchall()
    return {"events": [row_to_event(row) for row in rows]}


def append_agent_event(conn, event):
    event_id = str(event.get("id") or event.get("timestamp") or "")
    if not event_id:
        raise ValueError("event id is required")
    payload = json.dumps(event, separators=(",", ":"))
    conn.execute(
        """
        INSERT INTO agent_events (
            id, stage, event_type, symbol, status, message, timestamp, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            stage = excluded.stage,
            event_type = excluded.event_type,
            symbol = excluded.symbol,
            status = excluded.status,
            message = excluded.message,
            timestamp = excluded.timestamp,
            payload_json = excluded.payload_json
        """,
        (
            event_id,
            event.get("stage", "system"),
            event.get("eventType", "info"),
            event.get("symbol", ""),
            event.get("status", ""),
            event.get("message", ""),
            event.get("timestamp", ""),
            payload,
        ),
    )
    conn.commit()
    return {"ok": True, "event": event}


def clear_agent_events(conn):
    conn.execute("DELETE FROM agent_events")
    conn.commit()
    return {"ok": True}


def row_to_pipeline_run(row):
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        payload = {}
    payload.update(
        {
            "id": row["id"],
            "status": row["status"],
            "symbol": row["symbol"],
            "mode": row["mode"],
            "source": row["source"],
            "message": row["message"],
            "timestamp": row["timestamp"],
        }
    )
    return payload


def list_pipeline_runs(conn, limit=25):
    normalized_limit = max(1, min(int(limit or 25), 100))
    rows = conn.execute(
        "SELECT * FROM pipeline_runs ORDER BY timestamp DESC, rowid DESC LIMIT ?",
        (normalized_limit,),
    ).fetchall()
    return {"runs": [row_to_pipeline_run(row) for row in rows]}


def get_pipeline_run(conn, run_id):
    row = conn.execute(
        "SELECT * FROM pipeline_runs WHERE id = ? LIMIT 1",
        (str(run_id),),
    ).fetchone()
    if row is None:
        return {"run": None}
    return {"run": row_to_pipeline_run(row)}


def upsert_pipeline_run(conn, run):
    run_id = str(run.get("id") or run.get("timestamp") or "")
    if not run_id:
        raise ValueError("pipeline run id is required")
    payload = json.dumps(run, separators=(",", ":"))
    conn.execute(
        """
        INSERT INTO pipeline_runs (
            id, status, symbol, mode, source, message, timestamp, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            symbol = excluded.symbol,
            mode = excluded.mode,
            source = excluded.source,
            message = excluded.message,
            timestamp = excluded.timestamp,
            payload_json = excluded.payload_json
        """,
        (
            run_id,
            run.get("status", ""),
            run.get("symbol", ""),
            run.get("mode", "paper"),
            run.get("source", ""),
            run.get("message", ""),
            run.get("timestamp", ""),
            payload,
        ),
    )
    conn.commit()
    return {"ok": True, "run": run}


def clear_pipeline_runs(conn):
    conn.execute("DELETE FROM pipeline_runs")
    conn.commit()
    return {"ok": True}


def main():
    request = json.load(sys.stdin)
    conn = connect(request["dbPath"])
    action = request.get("action")
    if action == "list_trades":
        result = list_trades(conn)
    elif action == "upsert_trade":
        result = upsert_trade(conn, request["trade"])
    elif action == "clear_trades":
        result = clear_trades(conn)
    elif action == "list_agent_events":
        result = list_agent_events(conn, request.get("limit", 50))
    elif action == "append_agent_event":
        result = append_agent_event(conn, request["event"])
    elif action == "clear_agent_events":
        result = clear_agent_events(conn)
    elif action == "list_pipeline_runs":
        result = list_pipeline_runs(conn, request.get("limit", 25))
    elif action == "get_pipeline_run":
        result = get_pipeline_run(conn, request["id"])
    elif action == "upsert_pipeline_run":
        result = upsert_pipeline_run(conn, request["run"])
    elif action == "clear_pipeline_runs":
        result = clear_pipeline_runs(conn)
    else:
        raise ValueError(f"unknown action: {action}")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
