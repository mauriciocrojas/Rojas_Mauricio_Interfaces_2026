// supabase/functions/enviar-notificacion-rol/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ==================
// Config desde ENV (mismo que notify_new_client)
// ==================
const serviceAccount = {
  client_email: Deno.env.get("FIREBASE_CLIENT_EMAIL"),
  private_key: (Deno.env.get("FIREBASE_PRIVATE_KEY") || "").replace(/\\n/g, "\n"),
  project_id: Deno.env.get("FIREBASE_PROJECT_ID"),
};

// Helper: convierte PEM PKCS#8 a ArrayBuffer DER
function pemToDer(pem: string) {
  const clean = String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Helper para firmar JWT en Deno con RS256
async function signJwt(payload: Record<string, any>, privateKeyPem: string) {
  const der = pemToDer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = { alg: "RS256", typ: "JWT" };

  const enc = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsigned = `${enc(header)}.${enc(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsigned}.${sigBase64}`;
}

// Obtener access token de Google (igual que en notify_new_client)
async function getAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const jwt = await signJwt(payload, serviceAccount.private_key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error("[enviar-notificacion-rol] No se pudo obtener access_token", data);
    throw new Error("No se pudo obtener access_token");
  }
  return data.access_token as string;
}

// ==================
// Supabase client
// ==================
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS para permitir llamada desde app web / HttpClient
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Normalizar rol (opcional, por si usás 'dueño' / 'dueno' mezclado)
function normalizeRole(role: string): string {
  return String(role ?? "")
    .toLowerCase()
    .replace(/due[\u00f1\uFFFD]o/g, "dueno") // dueÑo → dueno
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("[enviar-notificacion-rol] Body recibido:", body);

    const roleRaw = body?.role;
    const title = body?.title;
    const messageBody = body?.body;
    const data = body?.data || {};

    if (
      typeof roleRaw !== "string" ||
      typeof title !== "string" ||
      typeof messageBody !== "string" ||
      !roleRaw.trim() ||
      !title.trim() ||
      !messageBody.trim()
    ) {
      return new Response(
        JSON.stringify({
          error: "role, title y body son requeridos y deben ser string no vacíos",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const role = normalizeRole(roleRaw);

    // ==================
    // Obtener tokens de user_tokens por rol
    // ==================
    const tokensSet = new Set<string>();

    const { data: rows, error } = await supabase
      .from("user_tokens")
      .select("token, role");

    if (error) {
      console.error("[enviar-notificacion-rol] Error consultando tokens:", error);
      return new Response(
        JSON.stringify({ error: "Error consultando tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    for (const row of rows || []) {
      const dbRole = normalizeRole(row?.role);
      if (dbRole === role && row?.token) {
        tokensSet.add(row.token);
      }
    }

    const tokens = Array.from(tokensSet);

    if (!tokens.length) {
      console.log(`[enviar-notificacion-rol] No hay tokens para el rol ${roleRaw}`);
      return new Response(
        JSON.stringify({ ok: true, sent: 0, totalTokens: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ==================
    // Enviar notificaciones vía FCM HTTP v1
    // ==================
    const accessToken = await getAccessToken();
    const projectId = serviceAccount.project_id;

    let sent = 0;
    const results: any[] = [];

    for (const token of tokens) {
      const message = {
        message: {
          token,
          notification: {
            title,
            body: messageBody,
          },
          data,
        },
      };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        },
      );

      const result = await res.json().catch(() => ({}));
      console.log("[enviar-notificacion-rol] FCM result:", result);

      // 👇 ACÁ VA EL BLOQUE NUEVO
      if (!res.ok && result?.error?.details) {
        const isUnregistered = result.error.details.some(
          (d: any) =>
            d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
            d.errorCode === "UNREGISTERED",
        );

        if (isUnregistered) {
          console.log(
            "[enviar-notificacion-rol] Token UNREGISTERED, borrando de user_tokens",
          );
          await supabase
            .from("user_tokens")
            .delete()
            .eq("token", token);
        }
      }

      if (res.ok && result?.name) {
        sent++;
      }

      results.push({ ok: res.ok, result });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        totalTokens: tokens.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[enviar-notificacion-rol] Error general:", err);
    return new Response(
      JSON.stringify({ error: "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});