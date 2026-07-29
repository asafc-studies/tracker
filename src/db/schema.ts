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

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  accounts: many(accounts),
  sessions: many(sessions),
  weightLogs: many(weightLogs),
  foodLogs: many(foodLogs),
  savedFoods: many(savedFoods),
  menuTemplates: many(menuTemplates),
  dailyMenuItems: many(dailyMenuItems),
  standingMenuItems: many(standingMenuItems),
  dailyMenuChecks: many(dailyMenuChecks),
  workoutSessions: many(workoutSessions),
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

export const workoutSessionsRelations = relations(
  workoutSessions,
  ({ many }) => ({
    sets: many(liftSets),
  }),
);

export const liftSetsRelations = relations(liftSets, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [liftSets.sessionId],
    references: [workoutSessions.id],
  }),
}));
