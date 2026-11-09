// Staff sign-in PINs (the 6-digit "staff code" on the login keypad). Deployed to Supabase as
// `kiosk-admin`; kiosk_codes is service-role only, so every request is checked here.
//
// Owner actions:  list · set (random, or a chosen `code`) · clear
// Self-service:   mine (do I have a PIN?) · set_own (choose my own PIN; needs the current one
//                 when a PIN already exists). Wrong current PINs and taken PINs count as failed
//                 attempts (5 per 15 min per user) so the endpoint can't be used to probe codes.
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

function randomCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** Keep in step with src/lib/pin.ts */
function pinProblem(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return "The PIN must be exactly 6 digits";
  if (/^(\d)\1{5}$/.test(code)) return "Too easy to guess — don't use the same digit six times";
  const d = [...code].map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) {
    return "Too easy to guess — don't use a run like 123456";
  }
  if (/^(\d\d)\1\1$/.test(code) || /^(\d{3})\1$/.test(code)) {
    return "Too easy to guess — don't repeat a pattern like 121212";
  }
  return null;
}

const isDuplicate = (msg: string) => /duplicate|unique/i.test(msg);
const MAX_SELF_FAILS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- authenticate caller ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: authErr } = await service.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: caller } = await service
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", userData.user.id)
    .single();
  if (!caller) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = body.action as string;

  const audit = (act: string, userId: string, detail: Record<string, unknown> = {}) =>
    service.from("audit_log").insert({
      org_id: caller.org_id,
      actor: caller.id,
      action: act,
      entity: "profile",
      entity_id: userId,
      detail,
    });

  // ================= self-service =================
  if (action === "mine") {
    const { data } = await service
      .from("kiosk_codes")
      .select("updated_at")
      .eq("user_id", caller.id)
      .maybeSingle();
    return json({ has_code: !!data, updated_at: data?.updated_at ?? null });
  }

  if (action === "set_own") {
    const failKey = `pin-change:${caller.id}`;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await service
      .from("kiosk_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", failKey)
      .eq("success", false)
      .gte("attempted_at", since);
    if ((count ?? 0) >= MAX_SELF_FAILS) {
      return json({ error: "Too many tries — wait 15 minutes or ask your manager to reset your PIN" }, 429);
    }
    const fail = async (error: string, status = 400) => {
      await service.from("kiosk_attempts").insert({ ip: failKey, success: false });
      return json({ error }, status);
    };

    const code = String(body.code ?? "").trim();
    const problem = pinProblem(code);
    if (problem) return json({ error: problem }, 400);

    const { data: existing } = await service
      .from("kiosk_codes")
      .select("code")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (existing) {
      const current = String(body.current ?? "").trim();
      if (current !== existing.code) return fail("Your current PIN is not right");
      if (code === existing.code) return json({ error: "That is already your PIN" }, 400);
    }

    const { error } = await service.from("kiosk_codes").upsert({
      user_id: caller.id,
      org_id: caller.org_id,
      code,
      updated_at: new Date().toISOString(),
      updated_by: caller.id,
    });
    if (error) {
      if (isDuplicate(error.message)) return fail("That PIN isn't available — choose a different one", 409);
      return json({ error: error.message }, 400);
    }
    await audit("kiosk_code.self_set", caller.id);
    return json({ ok: true });
  }

  // ================= owner only =================
  if (caller.role !== "owner") return json({ error: "Owner role required" }, 403);

  if (action === "list") {
    const { data, error } = await service
      .from("kiosk_codes")
      .select("user_id, code, updated_at")
      .eq("org_id", caller.org_id);
    if (error) return json({ error: error.message }, 400);
    return json({ codes: data });
  }

  if (action === "set") {
    const { user_id } = body as { user_id: string };
    if (!user_id) return json({ error: "user_id is required" }, 400);
    const { data: target } = await service
      .from("profiles")
      .select("id, org_id")
      .eq("id", user_id)
      .single();
    if (!target || target.org_id !== caller.org_id) {
      return json({ error: "User not found in your organisation" }, 404);
    }
    const chosen = body.code == null || body.code === "" ? null : String(body.code).trim();
    if (chosen) {
      const problem = pinProblem(chosen);
      if (problem) return json({ error: problem }, 400);
    }
    // a chosen PIN is tried once; a random one retries on the rare collision
    for (let i = 0; i < (chosen ? 1 : 8); i++) {
      const code = chosen ?? randomCode();
      if (!chosen && pinProblem(code)) continue;
      const { error } = await service.from("kiosk_codes").upsert({
        user_id,
        org_id: caller.org_id,
        code,
        updated_at: new Date().toISOString(),
        updated_by: caller.id,
      });
      if (!error) {
        await audit("kiosk_code.set", user_id, { chosen: !!chosen });
        return json({ ok: true, code });
      }
      if (!isDuplicate(error.message)) return json({ error: error.message }, 400);
      if (chosen) return json({ error: "That PIN is already used by someone else — choose another" }, 409);
    }
    return json({ error: "Could not generate a unique code, try again" }, 500);
  }

  if (action === "clear") {
    const { user_id } = body as { user_id: string };
    if (!user_id) return json({ error: "user_id is required" }, 400);
    const { error } = await service
      .from("kiosk_codes")
      .delete()
      .eq("user_id", user_id)
      .eq("org_id", caller.org_id);
    if (error) return json({ error: error.message }, 400);
    await audit("kiosk_code.cleared", user_id);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
