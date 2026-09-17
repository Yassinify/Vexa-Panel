// =====================================================================
// VEXA — VALIDATION: shape-check a raw node URI before it's accepted onto
// a user, so malformed entries don't silently reach exported
// subscriptions and break end-client parsers.
// =====================================================================

import { splitOnce, robustAtob } from "./uri-helpers.js";

export function validateNodeUri(uri) {
  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      if (!payload.add || !payload.port || !payload.id) {
        return { valid: false, reason: "vmess_missing_fields" };
      }
      return { valid: true };
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const withoutProto = uri.split("://")[1];
      if (!withoutProto || !withoutProto.includes("@")) {
        return { valid: false, reason: "missing_userinfo" };
      }
      const [creds, rest] = splitOnce(withoutProto.split("#")[0], "@");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before splitting port.
      const hostPortRaw = splitOnce(rest, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      if (!creds || !host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length).split("#")[0];
      if (withoutProto.includes("@")) {
        const [creds, rest] = splitOnce(withoutProto, "@");
        const hostPortRaw2 = splitOnce(rest, "?")[0];
        const [host, port] = splitOnce(hostPortRaw2.split("/")[0], ":");
        if (!creds || !host || !port || isNaN(Number(port))) {
          return { valid: false, reason: "malformed_host_port" };
        }
        return { valid: true };
      }
      const decoded = robustAtob(withoutProto);
      if (!decoded.includes("@") || !decoded.includes(":")) {
        return { valid: false, reason: "malformed_legacy_ss" };
      }
      return { valid: true };
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      const parts = decoded.split("/")[0].split(":");
      if (parts.length < 6) return { valid: false, reason: "malformed_ssr" };
      return { valid: true };
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1].split("#")[0];
      // A bare "/" (or a path) is commonly present before the query string
      // (e.g. "host:443/?sni=..."), since the URI authority component ends
      // at the first "/". Strip it before splitting out the port.
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const [host, portField] = splitOnce(hostPort, ":");
      // Hysteria2 supports "port hopping": a port range ("1000-2000") or a
      // comma-separated list ("1000,2000,3000") instead of a single port.
      const portOk = portField && /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(portField);
      if (!creds || !host || !portOk) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("tuic://")) {
      // tuic://uuid:password@host:port?params — same authority shape as
      // vless/trojan (userinfo before "@", host:port after), just with a
      // colon-joined uuid:password pair instead of a single credential.
      const withoutProto = uri.slice("tuic://".length).split("#")[0];
      if (!withoutProto.includes("@")) {
        return { valid: false, reason: "missing_userinfo" };
      }
      const [creds, rest] = splitOnce(withoutProto, "@");
      const hostPortRaw = splitOnce(rest, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      let decodedCreds = "";
      try {
        decodedCreds = decodeURIComponent(creds || "");
      } catch {
        decodedCreds = creds || "";
      }
      if (
        !decodedCreds ||
        !decodedCreds.includes(":") ||
        !host ||
        !port ||
        isNaN(Number(port))
      ) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("hysteria://")) {
      const withoutProto = uri.slice("hysteria://".length).split("#")[0];
      const hostPortRaw = splitOnce(withoutProto, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const [privKey, hostPort] = splitOnce(beforeQuery, "@");
      const [host, port] = splitOnce(hostPort, ":");
      const params = new URLSearchParams(search);
      if (
        !privKey ||
        !host ||
        !port ||
        isNaN(Number(port)) ||
        !params.get("publickey")
      ) {
        return { valid: false, reason: "malformed_wireguard_link" };
      }
      return { valid: true };
    }
    if (uri.startsWith("socks://")) {
      // socks://[base64(user:pass)@]host:port#remark — auth is optional
      // (many public/self-hosted SOCKS5 proxies are open, no userinfo at all).
      const withoutProto = uri.slice("socks://".length).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const hostPortRaw = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")[1]
        : beforeQuery;
      const [host, port] = splitOnce(hostPortRaw, ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      // naive+https://[user:pass@]host:port[?padding=...][#remark] — auth is
      // optional at the URI-shape level (a Caddy forwardproxy server could be
      // configured without basic_auth), matching this file's socks:// stance.
      const withoutProto = uri.slice(uri.indexOf("://") + 3).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const hostPortRaw = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")[1]
        : beforeQuery;
      const [host, port] = splitOnce(hostPortRaw, ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    // Unknown scheme handled elsewhere by classifySourceString; if it got
    // this far it's a raw:// fallback we don't validate structurally.
    return { valid: true };
  } catch {
    return { valid: false, reason: "parse_error" };
  }
}
