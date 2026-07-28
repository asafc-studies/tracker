export const NAV_ITEMS = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/nutrition", label: "Nutrition", icon: "nutrition" },
  { href: "/exercises", label: "Exercises", icon: "lifts" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/calculator", label: "Profile", icon: "profile" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
