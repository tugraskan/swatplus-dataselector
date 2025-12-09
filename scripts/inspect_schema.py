import sqlite3
import sys

if len(sys.argv) < 2:
    print('Usage: inspect_schema.py <db_file>')
    sys.exit(1)

db = sys.argv[1]
con = sqlite3.connect(db)
cur = con.cursor()
try:
    print('Tables:')
    for t in cur.execute("SELECT name FROM sqlite_master WHERE type='table';"):
        print(' ', t[0])
    print('\nPRAGMA table_info("rout_unit_rtu")')
    for row in cur.execute("PRAGMA table_info('rout_unit_rtu');"):
        print(row)
except Exception as e:
    print('ERR', e)
con.close()
