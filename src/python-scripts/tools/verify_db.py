import sqlite3
import sys

DB_PATH = r"C:\Users\taci.ugraskan\source\repos\SWATPlus\swatplus_ug-1\data\Osu_1hru\project.db"

try:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in cur.fetchall()]
    print(f'Found {len(tables)} tables in {DB_PATH}')
    for t in tables:
        try:
            c = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            print(f'{t}: {c}')
        except Exception as e:
            print(f'{t}: ERROR {e}')
    conn.close()
except Exception as e:
    print('ERROR connecting to DB:', e)
    sys.exit(1)
