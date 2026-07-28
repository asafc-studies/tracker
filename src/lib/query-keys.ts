export const queryKeys = {
  profile: ["profile"] as const,
  macros: (date: string) => ["macros", date] as const,
  lifts: (date: string) => ["lifts", date] as const,
  history: (tab: string, range: string) => ["history", tab, range] as const,
  menuDaily: (date: string) => ["menu", "daily", date] as const,
  menuTemplates: ["menu", "templates"] as const,
} as const;
