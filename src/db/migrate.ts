import type { Client } from "@libsql/client";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT UNIQUE,
    emailVerified INTEGER,
    image TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, providerAccountId)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    sessionToken TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (identifier, token)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    userId TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weightKg REAL,
    heightCm REAL,
    age INTEGER,
    sex TEXT,
    activityLevel TEXT DEFAULT 'moderate',
    deficitKcal INTEGER DEFAULT 400,
    proteinPerKg REAL DEFAULT 2.0,
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS weight_logs (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    weightKg REAL NOT NULL,
    note TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    proteinG REAL NOT NULL DEFAULT 0,
    carbsG REAL NOT NULL DEFAULT 0,
    fatG REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    notes TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS lift_sets (
    id TEXT PRIMARY KEY NOT NULL,
    sessionId TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    lift TEXT NOT NULL,
    setNumber INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weightKg REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS weight_logs_user_date ON weight_logs(userId, date)`,
  `CREATE INDEX IF NOT EXISTS food_logs_user_date ON food_logs(userId, date)`,
  `CREATE INDEX IF NOT EXISTS workout_sessions_user_date ON workout_sessions(userId, date)`,
];

const INCREMENTAL = [
  `ALTER TABLE profiles ADD COLUMN countryCode TEXT DEFAULT 'il'`,
  `ALTER TABLE profiles ADD COLUMN calorieTargetOverride INTEGER`,
  `ALTER TABLE profiles ADD COLUMN proteinTargetOverride INTEGER`,
  `CREATE TABLE IF NOT EXISTS saved_foods (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    brand TEXT,
    barcode TEXT,
    source TEXT NOT NULL DEFAULT 'custom',
    externalId TEXT,
    servingLabel TEXT,
    servingGrams REAL,
    proteinG REAL NOT NULL DEFAULT 0,
    carbsG REAL NOT NULL DEFAULT 0,
    fatG REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `ALTER TABLE food_logs ADD COLUMN brand TEXT`,
  `ALTER TABLE food_logs ADD COLUMN savedFoodId TEXT REFERENCES saved_foods(id) ON DELETE SET NULL`,
  `ALTER TABLE food_logs ADD COLUMN quantity REAL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS menu_templates (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    notes TEXT,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS menu_template_items (
    id TEXT PRIMARY KEY NOT NULL,
    templateId TEXT NOT NULL REFERENCES menu_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    brand TEXT,
    savedFoodId TEXT REFERENCES saved_foods(id) ON DELETE SET NULL,
    quantity REAL NOT NULL DEFAULT 1,
    proteinG REAL NOT NULL DEFAULT 0,
    carbsG REAL NOT NULL DEFAULT 0,
    fatG REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    mealSlot TEXT DEFAULT 'snack',
    sortOrder INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS daily_menu_items (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    savedFoodId TEXT REFERENCES saved_foods(id) ON DELETE SET NULL,
    quantity REAL NOT NULL DEFAULT 1,
    proteinG REAL NOT NULL DEFAULT 0,
    carbsG REAL NOT NULL DEFAULT 0,
    fatG REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    mealSlot TEXT DEFAULT 'snack',
    checked INTEGER NOT NULL DEFAULT 0,
    foodLogId TEXT REFERENCES food_logs(id) ON DELETE SET NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS saved_foods_user ON saved_foods(userId)`,
  `CREATE INDEX IF NOT EXISTS saved_foods_barcode ON saved_foods(barcode)`,
  `ALTER TABLE lift_sets ADD COLUMN category TEXT`,
  `ALTER TABLE profiles ADD COLUMN bodyFatPercent REAL`,
  `ALTER TABLE workout_sessions ADD COLUMN name TEXT`,
  `ALTER TABLE workout_sessions ADD COLUMN durationMinutes REAL`,
  `ALTER TABLE workout_sessions ADD COLUMN caloriesBurned REAL`,
  `ALTER TABLE workout_sessions ADD COLUMN startedAt INTEGER`,
  `ALTER TABLE workout_sessions ADD COLUMN endedAt INTEGER`,
  `ALTER TABLE profiles ADD COLUMN goalTarget TEXT`,
  `ALTER TABLE workout_sessions ADD COLUMN distanceKm REAL`,
  `CREATE TABLE IF NOT EXISTS standing_menu_items (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    brand TEXT,
    savedFoodId TEXT REFERENCES saved_foods(id) ON DELETE SET NULL,
    quantity REAL NOT NULL DEFAULT 1,
    proteinG REAL NOT NULL DEFAULT 0,
    carbsG REAL NOT NULL DEFAULT 0,
    fatG REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    mealSlot TEXT DEFAULT 'snack',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS standing_menu_user ON standing_menu_items(userId)`,
  `CREATE TABLE IF NOT EXISTS daily_menu_checks (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    standingItemId TEXT NOT NULL REFERENCES standing_menu_items(id) ON DELETE CASCADE,
    foodLogId TEXT REFERENCES food_logs(id) ON DELETE SET NULL,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS daily_menu_checks_user_date ON daily_menu_checks(userId, date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS daily_menu_checks_unique ON daily_menu_checks(userId, date, standingItemId)`,
  `CREATE TABLE IF NOT EXISTS workout_plans (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS workout_plans_user ON workout_plans(userId)`,
  `CREATE TABLE IF NOT EXISTS workout_plan_items (
    id TEXT PRIMARY KEY NOT NULL,
    planId TEXT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    lift TEXT NOT NULL,
    category TEXT,
    setsCount INTEGER NOT NULL DEFAULT 3,
    reps INTEGER NOT NULL DEFAULT 8,
    weightKg REAL NOT NULL DEFAULT 0,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS workout_plan_items_plan ON workout_plan_items(planId)`,
  `CREATE TABLE IF NOT EXISTS workout_plan_checks (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sessionId TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    planItemId TEXT NOT NULL REFERENCES workout_plan_items(id) ON DELETE CASCADE,
    setIds TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS workout_plan_checks_session ON workout_plan_checks(sessionId)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS workout_plan_checks_unique ON workout_plan_checks(sessionId, planItemId)`,
];

export async function ensureMigrated(client: Client) {
  for (const sql of STATEMENTS) {
    await client.execute(sql);
  }
  for (const sql of INCREMENTAL) {
    try {
      await client.execute(sql);
    } catch {
      // Column/table may already exist from a prior migration run.
    }
  }
}
