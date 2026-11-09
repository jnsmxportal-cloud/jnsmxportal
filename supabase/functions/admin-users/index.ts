// Owner-only user administration (create / update team members). Deployed to Supabase as
// `admin-users`; the service role bypasses RLS, so every request is checked for the owner role.
//
// Roles & rights (SCRUM-9): callers pass `role_id` (a row of public.roles); the member's base
// `role` — what the database policies check — is derived from that row server-side. A bare
// `role` without `role_id` is still accepted for backwards compatibility.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- authenticate caller and require the owner role ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: authErr } = await service.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: callerProfile } = await service
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", userData.user.id)
    .single();
  if (!callerProfile || callerProfile.role !== "owner") {
    return json({ error: "Owner role required" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action as string;

  /** role_id → { role (base), role_id }; falls back to a bare base role */
  async function resolveRole(
    role_id: unknown,
    role: unknown,
  ): Promise<{ role: string | null; role_id: string | null; error?: string }> {
    if (typeof role_id === "string" && role_id) {
      const { data } = await service
        .from("roles")
        .select("id, org_id, base_role")
        .eq("id", role_id)
        .maybeSingle();
      if (!data || data.org_id !== callerProfile!.org_id) return { role: null, role_id: null, error: "Unknown role" };
      return { role: data.base_role as string, role_id: data.id as string };
    }
    return { role: typeof role === "string" && role ? role : null, role_id: null };
  }

  if (action === "create_user") {
    const { email, password, full_name, store_ids, avatar_color } = body as {
      email: string; password: string; full_name: string;
      store_ids?: string[]; avatar_color?: string;
    };
    const resolved = await resolveRole(body.role_id, body.role);
    if (resolved.error) return json({ error: resolved.error }, 400);
    if (!email || !password || !full_name || !resolved.role) {
      return json({ error: "email, password, full_name and a role are required" }, 400);
    }
    const role = resolved.role;
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) return json({ error: error.message }, 400);
    const uid = created.user.id;
    const { error: pErr } = await service.from("profiles").insert({
      id: uid,
      org_id: callerProfile.org_id,
      full_name,
      role,
      role_id: resolved.role_id,
      avatar_color: avatar_color ?? "#FF5A2D",
    });
    if (pErr) return json({ error: pErr.message }, 400);
    if (store_ids?.length) {
      await service.from("user_store_roles").insert(
        store_ids.map((sid) => ({ user_id: uid, store_id: sid, role })),
      );
    }
    await service.from("audit_log").insert({
      org_id: callerProfile.org_id,
      actor: callerProfile.id,
      action: "user.created",
      entity: "profile",
      entity_id: uid,
      detail: { email, role, role_id: resolved.role_id },
    });
    return json({ ok: true, user_id: uid });
  }

  if (action === "update_user") {
    const { user_id, full_name, store_ids } = body as {
      user_id: string; full_name?: string; store_ids?: string[];
    };
    if (!user_id) return json({ error: "user_id is required" }, 400);
    const resolved = await resolveRole(body.role_id, body.role);
    if (resolved.error) return json({ error: resolved.error }, 400);
    const patch: Record<string, unknown> = {};
    if (resolved.role) patch.role = resolved.role;
    if (resolved.role_id) patch.role_id = resolved.role_id;
    if (full_name) patch.full_name = full_name;
    if (Object.keys(patch).length) {
      const { error } = await service.from("profiles").update(patch).eq("id", user_id);
      if (error) return json({ error: error.message }, 400);
    }
    if (store_ids) {
      await service.from("user_store_roles").delete().eq("user_id", user_id);
      if (store_ids.length) {
        const { data: prof } = await service.from("profiles").select("role").eq("id", user_id).single();
        await service.from("user_store_roles").insert(
          store_ids.map((sid) => ({ user_id, store_id: sid, role: resolved.role ?? prof?.role ?? "staff" })),
        );
      }
    }
    await service.from("audit_log").insert({
      org_id: callerProfile.org_id,
      actor: callerProfile.id,
      action: "user.updated",
      entity: "profile",
      entity_id: user_id,
      detail: { role: resolved.role, role_id: resolved.role_id, store_ids },
    });
    return json({ ok: true });
  }

  // ---- remove a member: delete outright when they have no history, otherwise deactivate ----
  if (action === "remove_user") {
    const { user_id } = body as { user_id: string };
    if (!user_id) return json({ error: "user_id is required" }, 400);
    if (user_id === callerProfile.id) return json({ error: "You can't remove your own account" }, 400);
    const { data: target } = await service
      .from("profiles")
      .select("id, org_id, full_name, role, deactivated_at")
      .eq("id", user_id)
      .maybeSingle();
    if (!target || target.org_id !== callerProfile.org_id) {
      return json({ error: "User not found in your organisation" }, 404);
    }
    if (target.role === "owner") {
      const { count } = await service
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", callerProfile.org_id)
        .eq("role", "owner")
        .is("deactivated_at", null)
        .neq("id", user_id);
      if (!count) return json({ error: "This is the only Owner — make someone else Owner first" }, 400);
    }
    const { data: authUser } = await service.auth.admin.getUserById(user_id);
    const email = authUser?.user?.email ?? null;

    // access goes first, whatever happens next
    const { count: unassigned } = await service
      .from("task_instances")
      .update({ assigned_to: null }, { count: "exact" })
      .eq("assigned_to", user_id)
      .in("status", ["scheduled", "assigned", "in_progress", "rejected"]);
    await service.from("kiosk_codes").delete().eq("user_id", user_id);
    await service.from("user_store_roles").delete().eq("user_id", user_id);
    await service.from("push_subscriptions").delete().eq("user_id", user_id);
    await service.from("shifts").delete().eq("user_id", user_id).gte("starts_at", new Date().toISOString());

    // anything that still points at them is history worth keeping
    const refs: [string, string][] = [
      ["task_instances", "assigned_to"], ["task_instances", "submitted_by"], ["task_instances", "reviewed_by"],
      ["checklist_items", "checked_by"], ["evidence", "uploader"], ["approvals", "reviewer"],
      ["deliveries", "submitted_by"], ["deliveries", "reviewed_by"], ["deliveries", "approved_by"],
      ["invoices", "uploaded_by"], ["escalations", "resolved_by"], ["messages", "from_user"],
      ["messages", "to_user"], ["task_templates", "created_by"], ["shifts", "created_by"],
      ["audit_log", "actor"],
    ];
    let history = 0;
    for (const [table, col] of refs) {
      const { count, error } = await service
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(col, user_id);
      if (error) return json({ error: `${table}: ${error.message}` }, 400);
      history += count ?? 0;
    }

    const audit = (act: string, detail: Record<string, unknown>) =>
      service.from("audit_log").insert({
        org_id: callerProfile.org_id,
        actor: callerProfile.id,
        action: act,
        entity: "profile",
        entity_id: user_id,
        detail: { name: target.full_name, email, unassigned_tasks: unassigned ?? 0, ...detail },
      });

    if (history === 0) {
      // auth.users → profiles cascade takes notifications, shifts, roster rows with it
      const { error } = await service.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      await audit("user.deleted", {});
      return json({ ok: true, mode: "deleted" });
    }

    const { error: banErr } = await service.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
    if (banErr) return json({ error: banErr.message }, 400);
    const { error: pErr } = await service
      .from("profiles")
      .update({ deactivated_at: new Date().toISOString(), is_online: false })
      .eq("id", user_id);
    if (pErr) return json({ error: pErr.message }, 400);
    await audit("user.deactivated", { history_rows: history });
    return json({ ok: true, mode: "deactivated", unassigned_tasks: unassigned ?? 0 });
  }

  // ---- bring a removed member back (stores and PIN are set again from Edit / Change) ----
  if (action === "restore_user") {
    const { user_id } = body as { user_id: string };
    if (!user_id) return json({ error: "user_id is required" }, 400);
    const { data: target } = await service
      .from("profiles")
      .select("id, org_id")
      .eq("id", user_id)
      .maybeSingle();
    if (!target || target.org_id !== callerProfile.org_id) {
      return json({ error: "User not found in your organisation" }, 404);
    }
    const { error: banErr } = await service.auth.admin.updateUserById(user_id, { ban_duration: "none" });
    if (banErr) return json({ error: banErr.message }, 400);
    const { error } = await service.from("profiles").update({ deactivated_at: null }).eq("id", user_id);
    if (error) return json({ error: error.message }, 400);
    await service.from("audit_log").insert({
      org_id: callerProfile.org_id,
      actor: callerProfile.id,
      action: "user.restored",
      entity: "profile",
      entity_id: user_id,
      detail: {},
    });
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
