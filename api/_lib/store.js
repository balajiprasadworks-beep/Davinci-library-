/* ============================================================
   ORDER STORE

   Backed by Upstash Redis over its REST API — no SDK, no
   connection pooling, which is what you want in a serverless
   function that may be cold-started for a single request.

   If the environment variables are absent the store reports
   itself unconfigured rather than throwing. The site is designed
   to keep working without a backend at all, so nothing here may
   turn a missing setting into a broken checkout.

   Set in the Vercel dashboard (Settings -> Environment Variables):
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN
   ============================================================ */

const KEY = "davinci:orders";

/* Read the environment on every call rather than capturing it at import.
   A module-level const is evaluated once per cold start, which makes the
   module impossible to exercise in tests and couples correctness to the
   order in which the runtime happens to populate process.env. */
const config = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const isConfigured = () => {
  const { url, token } = config();
  return Boolean(url && token);
};

async function redis(command) {
  const { url, token } = config();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`Redis ${command[0]} failed: ${res.status} ${await res.text()}`);
  }
  const { result, error } = await res.json();
  if (error) throw new Error(`Redis ${command[0]}: ${error}`);
  return result;
}

/** Orders live in one hash keyed by reference, so updates are a single write. */
export async function save(order) {
  await redis(["HSET", KEY, order.ref, JSON.stringify(order)]);
  return order;
}

export async function get(ref) {
  const raw = await redis(["HGET", KEY, ref]);
  return raw ? JSON.parse(raw) : null;
}

/** Newest first. Volume here is one seller's order book, not a feed. */
export async function list() {
  const flat = (await redis(["HGETALL", KEY])) ?? [];
  const orders = [];
  for (let i = 1; i < flat.length; i += 2) {
    try {
      orders.push(JSON.parse(flat[i]));
    } catch {
      // A single corrupt row must not hide every other order.
    }
  }
  return orders.sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
}

/**
 * Write-then-read a throwaway key to prove the credentials really work.
 * Deliberately NOT the orders hash: a probe must never appear in the
 * order book or move the counts. Expires by itself after a minute.
 */
export async function probe() {
  const key = "davinci:health";
  const token = `${Date.now()}-${Math.random()}`;
  await redis(["SET", key, token, "EX", 60]);
  return (await redis(["GET", key])) === token;
}
