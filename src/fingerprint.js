import { splitOnce, robustAtob } from "./backend/protocols/uri-helpers.js";

// ---------------------------------------------------------------------
// FINGERPRINTING — used to dedup nodes across merged sources
// ---------------------------------------------------------------------

// Query params that actually change the transport/identity of a node and so
// must be part of the dedup fingerprint. Two nodes with the same host/uuid
// but different values here (e.g. different SNI, different path, different
// security mode) are different nodes, not duplicates.
const FINGERPRINT_QUERY_KEYS = [
  "security",
  "sni",
  "type",
  "path",
  "host",
  "serviceName",
  "flow",
  "alpn",
  "fp",
  "pbk",
  "sid",
  "headerType",
  "mode",
];

function normalizeQueryForFingerprint(searchStr) {
  if (!searchStr) return "";
  const params = new URLSearchParams(searchStr);
  const pairs = [];
  for (const key of FINGERPRINT_QUERY_KEYS) {
    const val = params.get(key);
    if (val) pairs.push(`${key}=${decodeURIComponent(val).toLowerCase()}`);
  }
  pairs.sort();
  return pairs.join("&");
}

// Normalizes Shadowsocks userinfo to method:password regardless of whether
// the link encoded it as SIP002 (method:password base64'd before '@') or
// left it as plain method:password before '@'.
function normalizeSsUserinfo(creds) {
  if (creds.includes(":")) return creds; // already plain method:password
  try {
    const decoded = robustAtob(creds);
    if (decoded.includes(":")) return decoded;
  } catch {
    // fall through
  }
  return creds;
}

export function fingerprintNode(uri) {
  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      // Include network/tls-relevant fields so distinct transport configs
      // pointing at the same host/id aren't collapsed into one node.
      const net = (payload.net || "").toLowerCase();
      const tls = (payload.tls || "").toLowerCase();
      const path = payload.path || "";
      const sni = payload.sni || payload.host || "";
      return `vmess:${payload.add}:${payload.port}:${payload.id}:${net}:${tls}:${path}:${sni}`;
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const withoutProto = uri.split("://")[1];
      const beforeHash = withoutProto.split("#")[0];
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before fingerprinting.
      const hostPort = hostPortRaw.split("/")[0];
      const protocol = uri.startsWith("vless://") ? "vless" : "trojan";
      const queryFp = normalizeQueryForFingerprint(search);
      return `${protocol}:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length).split("#")[0];
      if (withoutProto.includes("@")) {
        const [creds, rest] = splitOnce(withoutProto, "@");
        const [hostPortRaw, search] = splitOnce(rest, "?");
        const hostPort = hostPortRaw.split("/")[0];
        const normalizedCreds = normalizeSsUserinfo(creds);
        const queryFp = normalizeQueryForFingerprint(search);
        return `ss:${hostPort}:${normalizedCreds}:${queryFp}`;
      }
      // Legacy fully-base64 form: ss://BASE64(method:password@host:port)
      const decoded = robustAtob(withoutProto);
      return `ss:${decoded}`;
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      return `ssr:${decoded.split("/")[0]}`;
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1].split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0]; // drop a bare "/" before the query
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const queryFp = normalizeQueryForFingerprint(search);
      return `hy2:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("tuic://")) {
      const withoutProto = uri.slice("tuic://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const queryFp = normalizeQueryForFingerprint(search);
      return `tuic:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("hysteria://")) {
      // Hysteria v1 has no userinfo in the authority — auth is a query
      // param ("auth=...") rather than "auth@host" — so the fingerprint
      // is just host:port plus the normalized query (auth included).
      const withoutProto = uri.slice("hysteria://".length).split("#")[0];
      const [hostPort, search] = splitOnce(withoutProto, "?");
      const queryFp = normalizeQueryForFingerprint(search);
      return `hysteria:${hostPort}:${queryFp}`;
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const hostPort = splitOnce(beforeQuery, "@")[1] || beforeQuery;
      const pubkey = new URLSearchParams(search).get("publickey") || "";
      return `wireguard:${hostPort}:${pubkey}`;
    }
    if (uri.startsWith("socks://")) {
      const withoutProto = uri.slice("socks://".length).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [credsRaw, hostPort] = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")
        : ["", beforeQuery];
      const creds = credsRaw ? normalizeSsUserinfo(credsRaw) : "";
      return `socks:${hostPort}:${creds}`;
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      const scheme = uri.startsWith("naive+https://") ? "https" : "quic";
      const withoutProto = uri.slice(uri.indexOf("://") + 3).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [credsRaw, hostPort] = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")
        : ["", beforeQuery];
      const creds = credsRaw ? decodeURIComponent(credsRaw) : "";
      return `naive:${scheme}:${hostPort}:${creds}`;
    }
    return `raw:${uri}`;
  } catch {
    return `raw:${uri}`;
  }
}
