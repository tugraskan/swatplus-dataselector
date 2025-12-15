import sqlite3
DB_PATH = r"C:\Users\taci.ugraskan\source\repos\SWATPlus\swatplus_ug-1\data\Osu_1hru\project.db"
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
tables = [r[0] for r in cur.fetchall()]
empty = []
for t in tables:
    try:
        c = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        if c == 0:
            empty.append(t)
    except Exception:
        empty.append(f"{t} (ERROR)")
conn.close()
print(f'Total tables: {len(tables)}')
print(f'Empty tables: {len(empty)}')
for t in empty:
    print(t)
