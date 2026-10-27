/**
 * Lets the mobile app's setup screen confirm that an address is a Kasvo server before it
 * navigates there. Public and cross-origin on purpose: it reveals nothing but the app name.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET", "Cache-Control": "no-store" };

export function GET(): Response {
  return Response.json({ app: "kasvo", ok: true }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
