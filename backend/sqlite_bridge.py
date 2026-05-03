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
    else:
        raise ValueError(f"unknown action: {action}")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
