// IndexNow key-file route — serves the plaintext key at https://blvdpark.com/<key>.txt,
// the location IndexNow verifies against (see backend/lib/indexnow.js and
// https://www.indexnow.org/documentation). Only the exact configured key matches;
// any other <something>.txt request 404s so this can't be used as a generic text-file host.
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const configuredKey = process.env.INDEXNOW_KEY;
  if (!configuredKey || params.key !== configuredKey) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(configuredKey, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
