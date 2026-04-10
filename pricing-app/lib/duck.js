/* duck API 클라이언트 (서비스 계정 인증) */

const DUCK_URL = process.env.DUCK_URL || "https://duck.plott.co.kr";
const KC_URL  = process.env.KEYCLOAK_URL || "https://auth.plott.co.kr";
const KC_REALM = process.env.KEYCLOAK_REALM || "plott";
const SA_CLIENT_ID = "plott-sandbox-service-account";
const SA_CLIENT_SECRET = process.env.DUCK_SA_SECRET || "ShscGDeRHvrHz9mt3fxe4m5a7U0KQ0Lo";

let cached = null;

async function getToken() {
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;
  const res = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SA_CLIENT_ID,
      client_secret: SA_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`SA token error ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

export async function duckQuery(sql) {
  const token = await getToken();
  const res = await fetch(`${DUCK_URL}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`duck error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.rows ?? data.result ?? data ?? [];
}
