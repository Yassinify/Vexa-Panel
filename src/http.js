export function withCors(request, response, env) {
  const origin = request.headers.get("Origin");
  const selfOrigin = new URL(request.url).origin;
  const headers = new Headers(response.headers);

  // Only echo back the Worker's own origin (the panel serves its own UI),
  // never a wildcard, per the security requirement.
  if (origin && origin === selfOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------
// RESPONSE HELPERS
// ---------------------------------------------------------------------
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function svgResponse(svg) {
  return new Response(svg, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}

export async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
