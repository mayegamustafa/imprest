PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ── Organization identity ─────────────────────────────────────────────────────
-- Renamed from "school_config" but kept the table name for backward-compat.
-- organization_type drives default period naming and labels in the UI.
CREATE TABLE IF NOT EXISTS school_config (
  id                INTEGER PRIMARY KEY CHECK(id = 1),
  name              TEXT    NOT NULL DEFAULT 'My Organization',
  location          TEXT    NOT NULL DEFAULT '',
  organization_type TEXT    NOT NULL DEFAULT 'school'
                            CHECK(organization_type IN ('school','business','organization','other')),
  logo_path         TEXT,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Signatories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signatories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- ── Expenditure categories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- ── Periods (academic terms / months / quarters / custom) ───────────────────
-- "term_number" is kept as the column name for backward-compat but represents
-- a generic period sequence number (1-3 for terms, 1-12 for months, 1-4 for
-- quarters, or anything for custom). period_type drives how it's labelled.
CREATE TABLE IF NOT EXISTS terms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  term_number INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  period_type TEXT    NOT NULL DEFAULT 'term'
                      CHECK(period_type IN ('term','month','quarter','custom')),
  custom_name TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(term_number, year, period_type)
);

-- ── Imprest cycles (sub-periods within a term) ────────────────────────────────
CREATE TABLE IF NOT EXISTS imprest_cycles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id          INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  cycle_number     INTEGER NOT NULL,
  name             TEXT,
  opening_balance  REAL    NOT NULL DEFAULT 0,
  amount_received  REAL    NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(term_id, cycle_number)
);

-- ── Expenditure entries (vouchers) ────────────────────────────────────────────
-- balance_back: amount returned unspent from this voucher (e.g. cashier got
-- 100,000 advance, only spent 70,000, returned 30,000). Net spent = amount -
-- balance_back. The category split represents the NET allocation per category;
-- the abstract therefore shows true category spend.
CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id       INTEGER NOT NULL REFERENCES imprest_cycles(id) ON DELETE CASCADE,
  voucher_number INTEGER NOT NULL,
  date           TEXT    NOT NULL,
  payee          TEXT    NOT NULL,
  purpose        TEXT    NOT NULL,
  amount         REAL    NOT NULL CHECK(amount > 0),
  balance_back   REAL    NOT NULL DEFAULT 0 CHECK(balance_back >= 0),
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, voucher_number)
);

-- ── Category splits per entry (for abstract) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS entry_category_splits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  amount      REAL    NOT NULL CHECK(amount >= 0),
  UNIQUE(entry_id, category_id)
);

-- ── Users (authentication & authorization) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,
  full_name            TEXT,
  role                 TEXT    NOT NULL DEFAULT 'accountant'
                                CHECK(role IN ('admin','accountant','viewer')),
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at        DATETIME
);

-- ── Audit log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT    NOT NULL,
  record_id  INTEGER NOT NULL,
  action     TEXT    NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),
  user_id    INTEGER REFERENCES users(id),
  old_values TEXT,
  new_values TEXT,
  timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Budgets (v2) ──────────────────────────────────────────────────────────────
-- Term-level allocation per category. One row per (term, category).
CREATE TABLE IF NOT EXISTS budgets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id          INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  allocated_amount REAL    NOT NULL DEFAULT 0 CHECK(allocated_amount >= 0),
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(term_id, category_id)
);

-- Optional per-cycle override. If a row exists here it takes precedence over
-- the term-level budget for that (cycle, category) pair.
CREATE TABLE IF NOT EXISTS budget_overrides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id         INTEGER NOT NULL REFERENCES imprest_cycles(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  allocated_amount REAL    NOT NULL DEFAULT 0 CHECK(allocated_amount >= 0),
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, category_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique_voucher ON entries(cycle_id, voucher_number);
CREATE INDEX IF NOT EXISTS idx_entries_cycle    ON entries(cycle_id);
CREATE INDEX IF NOT EXISTS idx_budgets_term     ON budgets(term_id);
CREATE INDEX IF NOT EXISTS idx_budget_ov_cycle  ON budget_overrides(cycle_id);
CREATE INDEX IF NOT EXISTS idx_entries_date     ON entries(date);
CREATE INDEX IF NOT EXISTS idx_splits_entry     ON entry_category_splits(entry_id);
CREATE INDEX IF NOT EXISTS idx_splits_category  ON entry_category_splits(category_id);
CREATE INDEX IF NOT EXISTS idx_cycles_term      ON imprest_cycles(term_id);
CREATE INDEX IF NOT EXISTS idx_audit_table      ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_log(timestamp);

-- ── Views (v2) ────────────────────────────────────────────────────────────────
-- Per-cycle totals: gross spent, brought back, net spent.
DROP VIEW IF EXISTS v_cycle_totals;
CREATE VIEW v_cycle_totals AS
SELECT
  ic.id                              AS cycle_id,
  ic.term_id,
  ic.cycle_number,
  ic.opening_balance,
  ic.amount_received,
  COALESCE(SUM(e.amount), 0)         AS gross_spent,
  COALESCE(SUM(e.balance_back), 0)   AS brought_back,
  COALESCE(SUM(e.amount), 0)
    - COALESCE(SUM(e.balance_back), 0) AS net_spent
FROM imprest_cycles ic
LEFT JOIN entries e ON e.cycle_id = ic.id
GROUP BY ic.id;

-- Per-cycle, per-category net spending — the heart of the consolidated
-- abstract. CROSS JOIN ensures zero rows show up for categories with no
-- spending in a cycle (so the matrix stays rectangular).
DROP VIEW IF EXISTS v_category_spending_by_cycle;
CREATE VIEW v_category_spending_by_cycle AS
SELECT
  ic.term_id,
  ic.id                       AS cycle_id,
  ic.cycle_number,
  c.id                        AS category_id,
  c.name                      AS category_name,
  c.sort_order                AS category_sort_order,
  COALESCE(SUM(s.amount), 0)  AS spent
FROM imprest_cycles ic
CROSS JOIN categories c
LEFT JOIN entries e ON e.cycle_id = ic.id
LEFT JOIN entry_category_splits s
  ON s.entry_id = e.id AND s.category_id = c.id
WHERE c.is_active = 1
GROUP BY ic.id, c.id;

-- Term-level budget status (allocated / spent / remaining)
DROP VIEW IF EXISTS v_budget_status;
CREATE VIEW v_budget_status AS
SELECT
  b.id                AS budget_id,
  b.term_id,
  b.category_id,
  c.name              AS category_name,
  c.sort_order        AS category_sort_order,
  b.allocated_amount,
  COALESCE((
    SELECT SUM(s.amount)
    FROM entry_category_splits s
    JOIN entries e ON e.id = s.entry_id
    JOIN imprest_cycles ic ON ic.id = e.cycle_id
    WHERE ic.term_id = b.term_id AND s.category_id = b.category_id
  ), 0) AS spent
FROM budgets b
JOIN categories c ON c.id = b.category_id;

