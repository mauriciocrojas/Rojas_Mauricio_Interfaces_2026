// supabase/functions/notify_new_client/index.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ==================
// Config desde ENV
// ==================
const serviceAccount = {
  client_email: Deno.env.get("FIREBASE_CLIENT_EMAIL"),
  private_key: (Deno.env.get("FIREBASE_PRIVATE_KEY") || "").replace(/\\n/g, "\n"),
  project_id: Deno.env.get("FIREBASE_PROJECT_ID"),
};

// Helper: convierte PEM PKCS#8 a ArrayBuffer DER
function pemToDer(pem) {
  const clean = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Helper para firmar JWT en Deno con RS256
async function signJwt(payload, privateKeyPem) {
  const der = pemToDer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = { alg: 'RS256', typ: 'JWT' };

  const enc = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const unsigned = `${enc(header)}.${enc(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${unsigned}.${sigBase64}`;
}

// Obtener access token de Google
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
  if (!data.access_token) throw new Error("No se pudo obtener access_token");
  return data.access_token;
}

// ==================
// Servidor
// ==================
serve(async (req) => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405, headers });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const body = await req.json().catch(() => ({}));
    const newClientName = body?.newClientName;
    const rawRoles = Array.isArray(body?.roles) ? body.roles : [];
    const roles = rawRoles.length > 0 ? rawRoles : (newClientName ? ["dueno"] : []);
    const rawUserIds = Array.isArray(body?.userIds) ? body.userIds : [];
    const normalizedRoles = roles
      .map((r) =>
        String(r ?? '')
          .toLowerCase()
          .replace(/due[\u00f1\uFFFD]o/g, 'dueno')
          .trim()
      )
      .filter((r) => !!r);
    const normalizedUserIds = rawUserIds
      .map((id) => String(id ?? '').trim())
      .filter((id) => !!id);

    let title = body?.title;
    let messageBody = body?.body;
    const data = body?.data || {};

    // Backward-compat: si viene newClientName y no se especifica título/cuerpo
    if (newClientName && (!title || !messageBody)) {
      title = "Nuevo cliente registrado";
      messageBody = `Se registró ${newClientName}`;
    }

    if (!title || !messageBody) {
      return new Response("Payload inválido", { status: 400, headers });
    }

    if (!normalizedRoles.length && !normalizedUserIds.length) {
      return new Response("Sin destinatarios", { status: 400, headers });
    }

    const tokensSet = new Set();

    if (normalizedRoles.length > 0) {
      const { data: rows, error } = await supabase
        .from("user_tokens")
        .select("token")
        .in("role", normalizedRoles);
      if (error) {
        console.error("Error consultando tokens por rol:", error);
        return new Response("Error consultando tokens", { status: 500, headers });
      }
      for (const row of rows || []) {
        if (row?.token) tokensSet.add(row.token);
      }
    }

    if (normalizedUserIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("user_tokens")
        .select("token")
        .in("user_id", normalizedUserIds);
      if (error) {
        console.error("Error consultando tokens por usuario:", error);
        return new Response("Error consultando tokens", { status: 500, headers });
      }
      for (const row of rows || []) {
        if (row?.token) tokensSet.add(row.token);
      }
    }

    const tokens = Array.from(tokensSet);

    if (!tokens || tokens.length === 0) {
      return new Response("No hay tokens registrados", { status: 200, headers });
    }

    const accessToken = await getAccessToken();

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
        `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        },
      );

      const result = await res.json();
      console.log("FCM result:", result);
    }

    return new Response("Notificaciones enviadas", { status: 200, headers });
  } catch (err) {
    console.error("Error:", err);
    return new Response("Error interno", { status: 500, headers });
  }
});
