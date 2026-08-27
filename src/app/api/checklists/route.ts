import { jsonError, jsonOk, requireUser } from "@/lib/api";
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  getChecklistHistory,
  getChecklistsForDate,
  renameList,
  setItemChecked,
  updateItem,
} from "@/lib/checklists";
import { isISODate } from "@/lib/security";
import { todayISODate } from "@/lib/tdee";

function clientTimeZone(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s || "UTC";
}

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISODate();
  if (!isISODate(date)) return jsonError("Invalid date");
  const timeZone = clientTimeZone(searchParams.get("tz"));

  try {
    if (searchParams.get("history") === "1") {
      return jsonOk(await getChecklistHistory(authz.userId, date));
    }
    return jsonOk(await getChecklistsForDate(authz.userId, date, timeZone));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON");
  }

  const action = String(body.action || "");

  try {
    switch (action) {
      case "create_list":
        return jsonOk(
          { list: await createList(authz.userId, String(body.name ?? "")) },
          { status: 201 },
        );
      case "rename_list":
        return jsonOk({
          list: await renameList(
            authz.userId,
            String(body.listId ?? ""),
            String(body.name ?? ""),
          ),
        });
      case "delete_list":
        return jsonOk(
          await deleteList(authz.userId, String(body.listId ?? "")),
        );
      case "add_item":
        return jsonOk(
          {
            item: await addItem(
              authz.userId,
              String(body.listId ?? ""),
              String(body.title ?? ""),
              {
                dueTime: body.dueTime,
                remindFreq: body.remindFreq,
                remindWeekday: body.remindWeekday,
                timeZone: body.timeZone,
              },
            ),
          },
          { status: 201 },
        );
      case "update_item":
        return jsonOk({
          item: await updateItem(authz.userId, String(body.itemId ?? ""), {
            title: body.title != null ? String(body.title) : undefined,
            dueTime: body.dueTime,
            remindFreq: body.remindFreq,
            remindWeekday: body.remindWeekday,
          }),
        });
      case "delete_item":
        return jsonOk(
          await deleteItem(authz.userId, String(body.itemId ?? "")),
        );
      case "set_checked": {
        const date = String(body.date || todayISODate());
        if (!isISODate(date)) return jsonError("Invalid date");
        return jsonOk(
          await setItemChecked(authz.userId, {
            itemId: String(body.itemId ?? ""),
            date,
            checked: Boolean(body.checked),
            checkedAt:
              body.checkedAt != null ? String(body.checkedAt) : null,
          }),
        );
      }
      default:
        return jsonError("Unknown action");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg === "Not found" ? 404 : 400;
    return jsonError(msg, status);
  }
}
