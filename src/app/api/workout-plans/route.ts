import { jsonError, jsonOk, requireUser } from "@/lib/api";
import {
  addPlanItem,
  createWorkoutPlan,
  deleteWorkoutPlan,
  listWorkoutPlans,
  removePlanItem,
  renameWorkoutPlan,
  reorderPlanItems,
  togglePlanCheck,
  updatePlanItem,
} from "@/lib/workout-plans";

/**
 * GET /api/workout-plans — list plans + items + check state for active session
 * POST actions: create_plan | rename_plan | delete_plan | add_item | update_item |
 *   remove_item | reorder | check
 */
export async function GET() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const data = await listWorkoutPlans(authz.userId);
    return jsonOk(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load plans";
    return jsonError(message, 500);
  }
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create_plan") {
      const plan = await createWorkoutPlan(
        authz.userId,
        String(body.name || ""),
      );
      return jsonOk({ plan });
    }

    if (action === "rename_plan") {
      const plan = await renameWorkoutPlan(
        authz.userId,
        String(body.planId || ""),
        String(body.name || ""),
      );
      if (!plan) return jsonError("Not found", 404);
      return jsonOk({ plan });
    }

    if (action === "delete_plan") {
      const ok = await deleteWorkoutPlan(
        authz.userId,
        String(body.planId || ""),
      );
      if (!ok) return jsonError("Not found", 404);
      return jsonOk({ ok: true });
    }

    if (action === "add_item") {
      const item = await addPlanItem(authz.userId, String(body.planId || ""), {
        lift: String(body.lift || ""),
        setsCount: body.setsCount,
        reps: body.reps,
        weightKg: body.weightKg,
      });
      if (!item) return jsonError("Not found", 404);
      return jsonOk({ item });
    }

    if (action === "update_item") {
      const row = await updatePlanItem(
        authz.userId,
        String(body.itemId || ""),
        {
          setsCount: body.setsCount,
          reps: body.reps,
          weightKg: body.weightKg,
          notes: body.notes,
        },
      );
      if (!row) return jsonError("Not found", 404);
      return jsonOk({ item: row });
    }

    if (action === "remove_item") {
      const ok = await removePlanItem(
        authz.userId,
        String(body.itemId || ""),
      );
      if (!ok) return jsonError("Not found", 404);
      return jsonOk({ ok: true });
    }

    if (action === "reorder") {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.map(String)
        : [];
      const ok = await reorderPlanItems(
        authz.userId,
        String(body.planId || ""),
        orderedIds,
      );
      if (!ok) return jsonError("Could not reorder");
      return jsonOk({ ok: true });
    }

    if (action === "check") {
      const result = await togglePlanCheck(
        authz.userId,
        String(body.itemId || ""),
      );
      return jsonOk(result);
    }

    return jsonError("Unknown action");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan update failed";
    const status = message.includes("Start a workout") ? 400 : 400;
    return jsonError(message, status);
  }
}
