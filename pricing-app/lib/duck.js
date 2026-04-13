/* duck API client - service account auth */

const DUCK_URL = "https://duck.plott.co.kr";
const KC_URL  = "https://auth.plott.co.kr";
const KC_REALM = "plott";
const SA_CLIENT_ID = "plott-sandbox-service-account";
const SA_CLIENT_SECRET = "ShscGDeRHvrHz9mt3fxe4m5a7U0KQ0Lo";

let cached = null;

async function getToken(forceRefresh) {
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 30000) {
    return cached.token;
  }
  cached = null;
  const res = await fetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SA_CLIENT_ID,
      client_secret: SA_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`keycloak token error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

async function queryWithToken(sql, token) {
  const res = await fetch(`${DUCK_URL}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ sql }),
  });
  return res;
}

export async function duckQuery(sql) {
  let token = await getToken(false);
  let res = await queryWithToken(sql, token);

  // 401 -> refresh token and retry once
  if (res.status === 401) {
    token = await getToken(true);
    res = await queryWithToken(sql, token);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`duck query error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.rows ?? data.result ?? data ?? [];
}
