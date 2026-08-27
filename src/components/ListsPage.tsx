"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReminderEnableBanner } from "@/components/ReminderEnableBanner";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch } from "@/lib/api-fetch";
import type {
  ChecklistHistoryEntry,
  ChecklistListView,
} from "@/lib/checklists";
import { queryKeys } from "@/lib/query-keys";
import {
  isoToLocalHHMM,
  localDateTimeToISO,
} from "@/lib/local-time";
import type { RemindFreq } from "@/lib/security";
import { todayISODate } from "@/lib/tdee";

function clientTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

type ListsPayload = {
  date: string;
  lists: ChecklistListView[];
};

type HistoryPayload = {
  date: string;
  entries: ChecklistHistoryEntry[];
};

type Panel = "lists" | "history";

type ItemDraft = {
  title: string;
  dueTime: string;
  remindFreq: RemindFreq;
  remindWeekday: string;
};

const EMPTY_DRAFT: ItemDraft = {
  title: "",
  dueTime: "",
  remindFreq: "off",
  remindWeekday: "1",
};

const WEEKDAYS = [
  { v: "0", label: "Sun" },
  { v: "1", label: "Mon" },
  { v: "2", label: "Tue" },
  { v: "3", label: "Wed" },
  { v: "4", label: "Thu" },
  { v: "5", label: "Fri" },
  { v: "6", label: "Sat" },
] as const;

function remindLabel(freq: RemindFreq, weekday: number | null, time: string | null) {
  if (freq === "off" || !time) return null;
  if (freq === "daily") return `Daily ${time}`;
  if (freq === "weekdays") return `Weekdays ${time}`;
  if (freq === "weekly") {
    const day = WEEKDAYS.find((d) => d.v === String(weekday ?? ""))?.label ?? "?";
    return `${day}s ${time}`;
  }
  return null;
}

function clampDate(d: string): string {
  const today = todayISODate();
  return d > today ? today : d;
}

const field =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] min-h-[44px]";

const selectClass =
  "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm min-h-[40px]";

function RemindFields({
  dueTime,
  remindFreq,
  remindWeekday,
  onChange,
}: {
  dueTime: string;
  remindFreq: RemindFreq;
  remindWeekday: string;
  onChange: (patch: Partial<ItemDraft>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-xs text-[var(--muted)] flex items-center gap-2">
        Time
        <input
          type="time"
          className={selectClass}
          value={dueTime}
          onChange={(e) => {
            const next = e.target.value;
            onChange({
              dueTime: next,
              // Setting a time implies you want a reminder.
              ...(remindFreq === "off" && next ? { remindFreq: "daily" } : {}),
            });
          }}
        />
      </label>
      <label className="text-xs text-[var(--muted)] flex items-center gap-2">
        Remind
        <select
          className={selectClass}
          value={remindFreq}
          onChange={(e) =>
            onChange({ remindFreq: e.target.value as RemindFreq })
          }
        >
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {remindFreq === "weekly" ? (
        <label className="text-xs text-[var(--muted)] flex items-center gap-2">
          Day
          <select
            className={selectClass}
            value={remindWeekday}
            onChange={(e) => onChange({ remindWeekday: e.target.value })}
          >
            {WEEKDAYS.map((d) => (
              <option key={d.v} value={d.v}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function ListsPage() {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const [date, setDate] = useState(today);
  const [panel, setPanel] = useState<Panel>("lists");
  const [newListName, setNewListName] = useState("");
  const [addingList, setAddingList] = useState(false);
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const listsQuery = useQuery({
    queryKey: queryKeys.checklists(date),
    queryFn: () =>
      apiFetch<ListsPayload>(
        `/api/checklists?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(clientTz())}`,
      ),
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.checklistHistory(date),
    queryFn: () =>
      apiFetch<HistoryPayload>(
        `/api/checklists?history=1&date=${encodeURIComponent(date)}`,
      ),
    enabled: panel === "history",
  });

  const lists = listsQuery.data?.lists ?? [];
  const history = historyQuery.data?.entries ?? [];

  const progress = useMemo(() => {
    const items = lists.flatMap((l) => l.items);
    const done = items.filter((i) => i.checked).length;
    return { done, total: items.length };
  }, [lists]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["checklists"] }),
      queryClient.invalidateQueries({ queryKey: ["checklist-history"] }),
    ]);
  }

  async function post(action: string, body: Record<string, unknown> = {}) {
    setError("");
    setBusy(action);
    try {
      await apiFetch("/api/checklists", {
        method: "POST",
        body: JSON.stringify({ ...body, action, timeZone: clientTz() }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function changeDate(next: string) {
    setDate(clampDate(next));
  }

  function draftFor(listId: string): ItemDraft {
    return itemDrafts[listId] ?? EMPTY_DRAFT;
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    await post("create_list", { name });
    setNewListName("");
    setAddingList(false);
  }

  async function addItemToList(listId: string) {
    const draft = draftFor(listId);
    if (!draft.title.trim()) return;
    await post("add_item", {
      listId,
      title: draft.title.trim(),
      dueTime: draft.dueTime || null,
      remindFreq: draft.remindFreq,
      remindWeekday:
        draft.remindFreq === "weekly" ? Number(draft.remindWeekday) : null,
    });
    setItemDrafts((prev) => ({ ...prev, [listId]: EMPTY_DRAFT }));
  }

  async function toggleCheck(itemId: string, checked: boolean) {
    await post("set_checked", {
      itemId,
      date,
      checked,
      // Absolute instant from the browser — never HH:MM (server TZ ≠ user TZ).
      checkedAt: checked ? new Date().toISOString() : null,
    });
  }

  async function updateCheckTime(itemId: string, hhmm: string) {
    if (!hhmm) return;
    await post("set_checked", {
      itemId,
      date,
      checked: true,
      checkedAt: localDateTimeToISO(date, hhmm),
    });
  }

  return (
    <AppShell title="Lists">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)] shrink-0">Date</span>
            <input
              type="date"
              className={`${field} max-w-[11rem]`}
              value={date}
              max={today}
              onChange={(e) => changeDate(e.target.value)}
            />
          </label>
          {date !== today ? (
            <button
              type="button"
              onClick={() => changeDate(today)}
              className="text-xs text-[var(--accent)] hover:underline min-h-[44px]"
            >
              Today
            </button>
          ) : null}
          {progress.total > 0 ? (
            <p className="text-xs text-[var(--muted)] ml-auto">
              {progress.done}/{progress.total} checked
              {date !== today ? " · past day" : ""}
            </p>
          ) : null}
        </div>

        <nav
          className="flex gap-0.5 border-b border-[var(--border)]"
          aria-label="Lists sections"
        >
          {(
            [
              { id: "lists", label: "Checklists" },
              { id: "history", label: "Day history" },
            ] as const
          ).map((tab) => {
            const active = panel === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPanel(tab.id)}
                className={`px-4 py-2.5 text-sm border-b-2 -mb-px min-h-[44px] ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : null}

        {panel === "lists" ? (
          <div className="space-y-4">
            <ReminderEnableBanner />
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Lists and items stay every day. Checks reset each morning. Set a
              time + reminder (daily / weekdays / weekly) to get notified —
              opening the app also catches anything you already missed today.
            </p>

            {listsQuery.isLoading && !listsQuery.data ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : null}

            {lists.length === 0 && !listsQuery.isLoading ? (
              <p className="text-sm text-[var(--muted)]">
                No lists yet — create one below (morning routine, supplements,
                chores…).
              </p>
            ) : null}

            {lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                date={date}
                busy={busy}
                draft={draftFor(list.id)}
                onDraftChange={(next) =>
                  setItemDrafts((prev) => ({
                    ...prev,
                    [list.id]: { ...draftFor(list.id), ...next },
                  }))
                }
                onAddItem={() => void addItemToList(list.id)}
                onRename={(name) =>
                  void post("rename_list", { listId: list.id, name })
                }
                onDeleteList={() =>
                  void post("delete_list", { listId: list.id })
                }
                onDeleteItem={(itemId) => void post("delete_item", { itemId })}
                onToggle={(itemId, checked) =>
                  void toggleCheck(itemId, checked)
                }
                onTimeChange={(itemId, hhmm) =>
                  void updateCheckTime(itemId, hhmm)
                }
                onUpdateItem={(itemId, patch) =>
                  void post("update_item", { itemId, ...patch })
                }
              />
            ))}

            {addingList ? (
              <form
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createList();
                }}
              >
                <input
                  className={field}
                  placeholder="List name"
                  value={newListName}
                  autoFocus
                  onChange={(e) => setNewListName(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newListName.trim() || busy === "create_list"}
                    className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
                  >
                    Create list
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingList(false);
                      setNewListName("");
                    }}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingList(true)}
                className="w-full rounded-md border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] min-h-[44px]"
              >
                + New list
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              Everything checked on {date}, with the time you marked it.
            </p>
            {historyQuery.isLoading && !historyQuery.data ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : null}
            {history.length === 0 && !historyQuery.isLoading ? (
              <p className="text-sm text-[var(--muted)]">
                Nothing checked this day yet.
              </p>
            ) : null}
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.checkId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 flex flex-wrap items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{entry.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {entry.listName}
                      {entry.dueTime ? ` · due ${entry.dueTime}` : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>Checked</span>
                    <input
                      type="time"
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--foreground)] min-h-[40px]"
                      value={isoToLocalHHMM(entry.checkedAt)}
                      onChange={(e) =>
                        void updateCheckTime(entry.itemId, e.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void toggleCheck(entry.itemId, false)}
                    className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[40px] px-2"
                  >
                    Uncheck
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ListCard({
  list,
  date,
  busy,
  draft,
  onDraftChange,
  onAddItem,
  onRename,
  onDeleteList,
  onDeleteItem,
  onToggle,
  onTimeChange,
  onUpdateItem,
}: {
  list: ChecklistListView;
  date: string;
  busy: string | null;
  draft: ItemDraft;
  onDraftChange: (next: Partial<ItemDraft>) => void;
  onAddItem: () => void;
  onRename: (name: string) => void;
  onDeleteList: () => void;
  onDeleteItem: (itemId: string) => void;
  onToggle: (itemId: string, checked: boolean) => void;
  onTimeChange: (itemId: string, hhmm: string) => void;
  onUpdateItem: (
    itemId: string,
    patch: {
      title: string;
      dueTime: string | null;
      remindFreq: RemindFreq;
      remindWeekday: number | null;
    },
  ) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [addingItem, setAddingItem] = useState(false);

  const done = list.items.filter((i) => i.checked).length;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <header className="flex items-start gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/40">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const next = nameDraft.trim();
                if (next && next !== list.name) onRename(next);
                setEditingName(false);
              }}
            >
              <input
                className={field}
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button
                type="submit"
                className="shrink-0 text-xs text-[var(--accent)] min-h-[44px] px-2"
              >
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="text-left"
              onClick={() => {
                setNameDraft(list.name);
                setEditingName(true);
              }}
            >
              <h2 className="font-medium text-[var(--foreground)]">
                {list.name}
              </h2>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                {done}/{list.items.length} · tap name to rename
              </p>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete list “${list.name}” and its items?`)) {
              onDeleteList();
            }
          }}
          className="text-xs text-[var(--muted)] hover:text-red-400 min-h-[44px] px-2 shrink-0"
          disabled={busy === "delete_list"}
        >
          Delete
        </button>
      </header>

      <ul className="divide-y divide-[var(--border)]">
        {list.items.map((item) => {
          const editing = editingItemId === item.id;
          const label = remindLabel(
            item.remindFreq,
            item.remindWeekday,
            item.dueTime,
          );
          return (
            <li key={item.id} className="px-4 py-3">
              {editing ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onUpdateItem(item.id, {
                      title: editDraft.title.trim(),
                      dueTime: editDraft.dueTime || null,
                      remindFreq: editDraft.remindFreq,
                      remindWeekday:
                        editDraft.remindFreq === "weekly"
                          ? Number(editDraft.remindWeekday)
                          : null,
                    });
                    setEditingItemId(null);
                  }}
                >
                  <input
                    className={field}
                    value={editDraft.title}
                    autoFocus
                    onChange={(e) =>
                      setEditDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder="Title"
                  />
                  <RemindFields
                    dueTime={editDraft.dueTime}
                    remindFreq={editDraft.remindFreq}
                    remindWeekday={editDraft.remindWeekday}
                    onChange={(patch) =>
                      setEditDraft((d) => ({ ...d, ...patch }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="text-xs text-[var(--accent)] min-h-[40px] px-2"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItemId(null)}
                      className="text-xs text-[var(--muted)] min-h-[40px] px-2"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 h-4 w-4 accent-[var(--accent)]"
                    checked={item.checked}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                    aria-label={`Check ${item.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        item.checked
                          ? "line-through text-[var(--muted)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {item.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {label ? (
                        <span className="text-[11px] text-[var(--accent)]">
                          {label}
                        </span>
                      ) : item.dueTime ? (
                        <span className="text-[11px] text-[var(--muted)]">
                          Due {item.dueTime}
                        </span>
                      ) : null}
                      {item.checked ? (
                        <label className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
                          Checked
                          <input
                            type="time"
                            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-xs text-[var(--foreground)]"
                            value={isoToLocalHHMM(item.checkedAt)}
                            onChange={(e) =>
                              onTimeChange(item.id, e.target.value)
                            }
                          />
                        </label>
                      ) : date !== todayISODate() ? (
                        <span className="text-[11px] text-[var(--muted)]">
                          Tap to retro-check
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px] px-1"
                      onClick={() => {
                        setEditingItemId(item.id);
                        setEditDraft({
                          title: item.title,
                          dueTime: item.dueTime ?? "",
                          remindFreq: item.remindFreq ?? "off",
                          remindWeekday: String(item.remindWeekday ?? 1),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--muted)] hover:text-red-400 min-h-[36px] px-1"
                      onClick={() => {
                        if (confirm("Remove this item from the list?")) {
                          onDeleteItem(item.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {addingItem ? (
        <form
          className="px-4 py-3 border-t border-[var(--border)] space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAddItem();
            setAddingItem(false);
          }}
        >
          <input
            className={field}
            placeholder="Item title"
            value={draft.title}
            autoFocus
            onChange={(e) => onDraftChange({ title: e.target.value })}
          />
          <RemindFields
            dueTime={draft.dueTime}
            remindFreq={draft.remindFreq}
            remindWeekday={draft.remindWeekday}
            onChange={onDraftChange}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setAddingItem(false);
                onDraftChange(EMPTY_DRAFT);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!draft.title.trim()}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-[var(--accent)] min-h-[40px] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setAddingItem(true)}
            className="w-full rounded-md px-2 py-2 text-sm text-[var(--muted)] hover:text-[var(--accent)] min-h-[44px]"
          >
            + Add item
          </button>
        </div>
      )}
    </section>
  );
}

