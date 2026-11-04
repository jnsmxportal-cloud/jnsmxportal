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

  return json({ error: `Unknown action: ${action}` }, 400);
});
