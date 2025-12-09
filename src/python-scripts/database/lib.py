import sqlite3
from typing import List, Any, Tuple
try:
    from peewee import ForeignKeyField
except Exception:
    ForeignKeyField = None

# Lightweight helpers to accept either sqlite3 connection/path or a peewee Database
def _resolve_db_conn(db):
    """Return a sqlite3.Connection for db which may be:
    - sqlite3.Connection
    - path string
    - peewee.Database (has attribute `database` which is a path)
    """
    if isinstance(db, sqlite3.Connection):
        return db

    # duck-type peewee Database: has attribute 'database' with path
    db_path = None
    try:
        db_path = getattr(db, 'database', None)
    except Exception:
        db_path = None

    if isinstance(db_path, str):
        return sqlite3.connect(db_path)

    if isinstance(db, str):
        return sqlite3.connect(db)

    raise TypeError('Unsupported db type for sqlite operations: %r' % type(db))


def open_db(name: str):
    conn = sqlite3.connect(name)
    conn.row_factory = sqlite3.Row
    return conn


def bulk_insert(db, table, data: List[dict]):
    """Insert list of dicts into a peewee table using executemany on sqlite3.
    `db` may be a peewee database or a filename; to keep this minimal we accept
    a filename string or a sqlite3.Connection object.
    """
    if not data:
        return

    # Resolve db to a sqlite3.Connection (may open a new connection)
    created_conn = False
    if isinstance(db, sqlite3.Connection):
        conn = db
    else:
        conn = _resolve_db_conn(db)
        created_conn = True
    cur = conn.cursor()
    # Determine target table name (support peewee Model classes)
    table_name = None
    try:
        if hasattr(table, '_meta'):
            table_name = getattr(table._meta, 'table_name', None) or getattr(table._meta, 'db_table', None)
    except Exception:
        table_name = None

    if not table_name:
        table_name = str(table)

    # If `table` is a peewee Model class, map model field names to actual DB column names
    cols = list(data[0].keys())
    cols_db = cols
    extra_keys = []
    ordered_field_names = None
    if hasattr(table, '_meta'):
        # Build ordered list of db column names based on model fields present in data
        cols_db = []
        model_field_names = [f.name for f in table._meta.sorted_fields]
        ordered_field_names = []
        for field in table._meta.sorted_fields:
            if field.name in cols:
                # Determine db column name; prefer explicit column_name/db_column if present
                db_col = None
                if hasattr(field, 'column_name') and getattr(field, 'column_name'):
                    db_col = getattr(field, 'column_name')
                elif hasattr(field, 'db_column') and getattr(field, 'db_column'):
                    db_col = getattr(field, 'db_column')
                elif ForeignKeyField is not None and isinstance(field, ForeignKeyField):
                    db_col = f"{field.name}_id"
                else:
                    db_col = field.name

                cols_db.append(db_col)
                ordered_field_names.append(field.name)

        # If some provided keys are not model fields, append them as-is
        extra_keys = [c for c in cols if c not in model_field_names]
        cols_db.extend(extra_keys)
        if extra_keys:
            if ordered_field_names is None:
                ordered_field_names = []
            ordered_field_names.extend(extra_keys)

    placeholders = ",".join(["?" for _ in cols_db])
    sql = f"INSERT OR REPLACE INTO {table_name} ({', '.join(cols_db)}) VALUES ({placeholders})"

    # Build values rows in same order as cols_db
    values = []
    # Prepare model field lookup for defaults if table is a peewee Model
    model_fields = {}
    if hasattr(table, '_meta'):
        for f in table._meta.sorted_fields:
            model_fields[f.name] = f

    for d in data:
        row_vals = []
        if hasattr(table, '_meta'):
            # Build values in the same order as cols_db using ordered_field_names
            if ordered_field_names is None:
                # fallback: use model field order intersected with provided keys
                ordered_field_names = [f.name for f in table._meta.sorted_fields if f.name in cols]
                ordered_field_names.extend([c for c in cols if c not in ordered_field_names])

            for fname in ordered_field_names:
                if fname in d and d.get(fname) is not None:
                    row_vals.append(d.get(fname))
                else:
                    # determine sensible default for this field name
                    default_val = None
                    fobj = model_fields.get(fname)
                    if fobj is not None:
                        fld_default = getattr(fobj, 'default', None)
                        if fld_default is not None:
                            try:
                                default_val = fld_default() if callable(fld_default) else fld_default
                            except Exception:
                                default_val = fld_default
                        else:
                            from peewee import IntegerField, DoubleField, BooleanField, CharField
                            if isinstance(fobj, IntegerField):
                                default_val = 0
                            elif isinstance(fobj, DoubleField):
                                default_val = 0.0
                            elif isinstance(fobj, BooleanField):
                                default_val = False
                            elif isinstance(fobj, CharField):
                                default_val = None
                            else:
                                default_val = None
                    else:
                        default_val = None

                    row_vals.append(default_val)
        else:
            row_vals = [d.get(c) for c in cols]

        values.append(tuple(row_vals))
    cur.executemany(sql, values)
    conn.commit()

    if created_conn:
        conn.commit()
        conn.close()
    else:
        conn.commit()


def copy_table(table: str, src: str, dest: str, include_id: bool = False, where_stmt: str = ''):
    src_conn = open_db(src)
    dest_conn = open_db(dest)

    q = f"SELECT * FROM {table} {where_stmt}"
    rows = src_conn.execute(q).fetchall()

    if not rows:
        src_conn.close()
        dest_conn.close()
        return

    # Determine columns to copy
    all_cols = rows[0].keys()
    if include_id:
        cols = all_cols
    else:
        cols = [c for c in all_cols if c != 'id']

    placeholders = ','.join(['?'] * len(cols))
    col_list = ','.join(cols)
    ins_sql = f"INSERT OR REPLACE INTO {table} ({col_list}) VALUES ({placeholders})"

    dest_cur = dest_conn.cursor()
    for r in rows:
        values = [r[c] for c in cols]
        dest_cur.execute(ins_sql, values)

    dest_conn.commit()
    src_conn.close()
    dest_conn.close()


def exists_table(db_conn: sqlite3.Connection, name: str) -> bool:
    query = "SELECT 1 FROM sqlite_master WHERE type='table' and name = ?"
    return db_conn.execute(query, (name,)).fetchone() is not None


def get_table_names(db_conn: sqlite3.Connection):
    query = "SELECT name FROM sqlite_master WHERE type='table'"
    return db_conn.execute(query).fetchall()


def get_column_names(db_conn: sqlite3.Connection, table: str):
    query = f"PRAGMA table_info('{table}');"
    return db_conn.execute(query).fetchall()


def delete_table(db: str, table: str):
    # Accept peewee Database or path or sqlite3.Connection
    if isinstance(db, sqlite3.Connection):
        conn = db
        close_after = False
    else:
        conn = _resolve_db_conn(db)
        close_after = True
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {table}")
    conn.commit()
    if close_after:
        conn.close()


def execute_non_query(db: str, sql: str):
    if isinstance(db, sqlite3.Connection):
        conn = db
        close_after = False
    else:
        conn = _resolve_db_conn(db)
        close_after = True

    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    if close_after:
        conn.close()
