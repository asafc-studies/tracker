import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const profiles = sqliteTable("profiles", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  weightKg: real("weightKg"),
  heightCm: real("heightCm"),
  age: integer("age"),
  sex: text("sex", { enum: ["male", "female"] }),
  activityLevel: text("activityLevel", {
    enum: [
      "sedentary",
      "light",
      "moderate",
      "active",
      "very_active",
    ],
  }).default("moderate"),
  deficitKcal: integer("deficitKcal").default(400),
  proteinPerKg: real("proteinPerKg").default(2.2),
  bodyFatPercent: real("bodyFatPercent"),
  countryCode: text("countryCode").default("il"),
  calorieTargetOverride: integer("calorieTargetOverride"),
  proteinTargetOverride: integer("proteinTargetOverride"),
  /** Free-text goal used by AI coaching (e.g. lose fat, recomp, gain muscle). */
  goalTarget: text("goalTarget"),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const weightLogs = sqliteTable("weight_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  weightKg: real("weightKg").notNull(),
  note: text("note"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Sleep that ended on `date` (morning-of / until date). One row per user/day. */
export const sleepLogs = sqliteTable("sleep_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  /** Bedtime as HH:MM (may be previous calendar evening). */
  fromTime: text("fromTime"),
  /** Wake time as HH:MM on `date`. */
  untilTime: text("untilTime"),
  /** Derived duration; kept for charts/tips. */
  hours: real("hours").notNull(),
  quality: integer("quality").notNull().default(3),
  note: text("note"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const savedFoods = sqliteTable("saved_foods", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  source: text("source", {
    enum: ["reference", "off", "custom", "history"],
  })
    .notNull()
    .default("custom"),
  externalId: text("externalId"),
  servingLabel: text("servingLabel"),
  servingGrams: real("servingGrams"),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const foodLogs = sqliteTable("food_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  savedFoodId: text("savedFoodId").references(() => savedFoods.id, {
    onDelete: "set null",
  }),
  quantity: real("quantity").default(1),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const menuTemplates = sqliteTable("menu_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const menuTemplateItems = sqliteTable("menu_template_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  templateId: text("templateId")
    .notNull()
    .references(() => menuTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  savedFoodId: text("savedFoodId").references(() => savedFoods.id, {
    onDelete: "set null",
  }),
  quantity: real("quantity").notNull().default(1),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  mealSlot: text("mealSlot", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).default("snack"),
  sortOrder: integer("sortOrder").notNull().default(0),
});

/** AI / manual recipes with ingredients + steps (JSON) and per-serving macros. */
export const recipes = sqliteTable("recipes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  servings: real("servings").notNull().default(1),
  /** Size of one serving; macros are for this amount. */
  servingAmount: real("servingAmount").notNull().default(100),
  servingUnit: text("servingUnit", { enum: ["g", "ml"] })
    .notNull()
    .default("g"),
  mealSlot: text("mealSlot", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).default("snack"),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  /** JSON: [{ name, amount }] */
  ingredientsJson: text("ingredientsJson").notNull().default("[]"),
  /** JSON: [{ text }] */
  stepsJson: text("stepsJson").notNull().default("[]"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Saved AI workout tips (question + answer) for the Tips panel history. */
export const workoutTips = sqliteTable("workout_tips", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Calendar day the tip was asked (YYYY-MM-DD). */
  date: text("date").notNull(),
  /** User prompt; empty when they asked with no focus note. */
  prompt: text("prompt").notNull().default(""),
  /** Short list label (prompt or truncated summary). */
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  keepDoingJson: text("keepDoingJson").notNull().default("[]"),
  improveJson: text("improveJson").notNull().default("[]"),
  watchOutJson: text("watchOutJson").notNull().default("[]"),
  model: text("model").notNull().default(""),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const dailyMenuItems = sqliteTable("daily_menu_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  savedFoodId: text("savedFoodId").references(() => savedFoods.id, {
    onDelete: "set null",
  }),
  quantity: real("quantity").notNull().default(1),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  mealSlot: text("mealSlot", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).default("snack"),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  foodLogId: text("foodLogId").references(() => foodLogs.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Persistent daily meal plan. The Daily Menu UI edits this list.
 * Per-day checkmarks live in daily_menu_checks (reset each day by absence).
 */
export const standingMenuItems = sqliteTable("standing_menu_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  savedFoodId: text("savedFoodId").references(() => savedFoods.id, {
    onDelete: "set null",
  }),
  quantity: real("quantity").notNull().default(1),
  proteinG: real("proteinG").notNull().default(0),
  carbsG: real("carbsG").notNull().default(0),
  fatG: real("fatG").notNull().default(0),
  calories: real("calories").notNull().default(0),
  mealSlot: text("mealSlot", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).default("snack"),
  sortOrder: integer("sortOrder").notNull().default(0),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Day-specific checklist overlay on the standing menu. */
export const dailyMenuChecks = sqliteTable("daily_menu_checks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  standingItemId: text("standingItemId")
    .notNull()
    .references(() => standingMenuItems.id, { onDelete: "cascade" }),
  foodLogId: text("foodLogId").references(() => foodLogs.id, {
    onDelete: "set null",
  }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  name: text("name"),
  notes: text("notes"),
  /** Wall-clock start of an in-progress or completed timed session. */
  startedAt: integer("startedAt", { mode: "timestamp_ms" }),
  /** When set, session is stopped; duration is derived (or manually overridden). */
  endedAt: integer("endedAt", { mode: "timestamp_ms" }),
  /** Session length — from stop timer or manual edit; used for EEE. */
  durationMinutes: real("durationMinutes"),
  /** Distance for cardio/run sessions (km); improves EEE MET via pace. */
  distanceKm: real("distanceKm"),
  /** Cached EEE kcal when duration is set; insight only, not subtracted from targets. */
  caloriesBurned: real("caloriesBurned"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const liftSets = sqliteTable("lift_sets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text("sessionId")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  lift: text("lift").notNull(),
  category: text("category", {
    enum: ["gym", "home_gym", "outdoor"],
  }),
  setNumber: integer("setNumber").notNull(),
  reps: integer("reps").notNull(),
  weightKg: real("weightKg").notNull(),
});

/** Named pre-planned workout menus (switch between them in Planner). */
export const workoutPlans = sqliteTable("workout_plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const workoutPlanItems = sqliteTable("workout_plan_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("planId")
    .notNull()
    .references(() => workoutPlans.id, { onDelete: "cascade" }),
  lift: text("lift").notNull(),
  category: text("category", {
    enum: ["gym", "home_gym", "outdoor"],
  }),
  setsCount: integer("setsCount").notNull().default(3),
  reps: integer("reps").notNull().default(8),
  weightKg: real("weightKg").notNull().default(0),
  sortOrder: integer("sortOrder").notNull().default(0),
  notes: text("notes"),
});

/**
 * Checks are scoped to an in-progress workout session (not calendar day).
 * Cleared when the session is stopped.
 */
export const workoutPlanChecks = sqliteTable("workout_plan_checks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("sessionId")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  planItemId: text("planItemId")
    .notNull()
    .references(() => workoutPlanItems.id, { onDelete: "cascade" }),
  /** JSON array of lift_set ids created by this check. */
  setIds: text("setIds").notNull().default("[]"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  accounts: many(accounts),
  sessions: many(sessions),
  weightLogs: many(weightLogs),
  sleepLogs: many(sleepLogs),
  foodLogs: many(foodLogs),
  savedFoods: many(savedFoods),
  menuTemplates: many(menuTemplates),
  recipes: many(recipes),
  workoutTips: many(workoutTips),
  dailyMenuItems: many(dailyMenuItems),
  standingMenuItems: many(standingMenuItems),
  dailyMenuChecks: many(dailyMenuChecks),
  workoutSessions: many(workoutSessions),
  workoutPlans: many(workoutPlans),
  workoutPlanChecks: many(workoutPlanChecks),
}));

export const standingMenuItemsRelations = relations(
  standingMenuItems,
  ({ many }) => ({
    checks: many(dailyMenuChecks),
  }),
);

export const dailyMenuChecksRelations = relations(
  dailyMenuChecks,
  ({ one }) => ({
    standingItem: one(standingMenuItems, {
      fields: [dailyMenuChecks.standingItemId],
      references: [standingMenuItems.id],
    }),
  }),
);

export const menuTemplatesRelations = relations(menuTemplates, ({ many }) => ({
  items: many(menuTemplateItems),
}));

export const menuTemplateItemsRelations = relations(
  menuTemplateItems,
  ({ one }) => ({
    template: one(menuTemplates, {
      fields: [menuTemplateItems.templateId],
      references: [menuTemplates.id],
    }),
  }),
);

export const recipesRelations = relations(recipes, ({ one }) => ({
  user: one(users, {
    fields: [recipes.userId],
    references: [users.id],
  }),
}));

export const workoutTipsRelations = relations(workoutTips, ({ one }) => ({
  user: one(users, {
    fields: [workoutTips.userId],
    references: [users.id],
  }),
}));

export const workoutSessionsRelations = relations(
  workoutSessions,
  ({ many }) => ({
    sets: many(liftSets),
    planChecks: many(workoutPlanChecks),
  }),
);

export const liftSetsRelations = relations(liftSets, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [liftSets.sessionId],
    references: [workoutSessions.id],
  }),
}));

export const workoutPlansRelations = relations(workoutPlans, ({ many }) => ({
  items: many(workoutPlanItems),
}));

export const workoutPlanItemsRelations = relations(
  workoutPlanItems,
  ({ one, many }) => ({
    plan: one(workoutPlans, {
      fields: [workoutPlanItems.planId],
      references: [workoutPlans.id],
    }),
    checks: many(workoutPlanChecks),
  }),
);

export const workoutPlanChecksRelations = relations(
  workoutPlanChecks,
  ({ one }) => ({
    planItem: one(workoutPlanItems, {
      fields: [workoutPlanChecks.planItemId],
      references: [workoutPlanItems.id],
    }),
    session: one(workoutSessions, {
      fields: [workoutPlanChecks.sessionId],
      references: [workoutSessions.id],
    }),
  }),
);
