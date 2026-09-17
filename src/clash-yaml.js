// =====================================================================
// VEXA — CLASH / MIHOMO / STASH YAML SUBSCRIPTION SUPPORT
// Many self-hosted and public subscription servers serve a Clash-format
// YAML config (a top-level "proxies:" list) instead of a URI list or Xray
// JSON. There's no YAML dependency available in a single-file Worker, so
// this is a minimal, dependency-free parser for exactly the subset real
// Clash/Mihomo proxy lists use: a block or flow sequence of maps, each with
// at most one level of nesting (ws-opts/reality-opts/grpc-opts/headers).
// It is NOT a general YAML parser and should not be used as one.
// =====================================================================

import { generateNodeUri } from "./uri-codec.js";

function stripYamlComment(line) {
  let inSingle = false,
    inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function unquoteYamlScalar(raw) {
  let s = raw.trim();
  if (s === "") return "";
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function parseYamlFlowMap(str) {
  const inner = str.trim().replace(/^\{/, "").replace(/\}$/, "");
  const obj = {};
  const parts = [];
  let buf = "",
    inS = false,
    inD = false;
  for (const ch of inner) {
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    if (ch === "," && !inS && !inD) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part
      .slice(0, idx)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    obj[key] = unquoteYamlScalar(part.slice(idx + 1));
  }
  return obj;
}

function parseYamlBlockMapLines(lines) {
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = trimmed
      .slice(0, colonIdx)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === "" || rest === "|" || rest === ">") {
      const nested = [];
      let j = i + 1;
      while (j < lines.length) {
        const l2 = lines[j];
        if (!l2.trim()) {
          j++;
          continue;
        }
        const indent2 = l2.length - l2.trimStart().length;
        if (indent2 <= indent) break;
        nested.push(l2);
        j++;
      }
      obj[key] = nested.length ? parseYamlBlockMapLines(nested) : "";
      i = j;
    } else if (rest.startsWith("{") && rest.endsWith("}")) {
      obj[key] = parseYamlFlowMap(rest);
      i++;
    } else {
      obj[key] = unquoteYamlScalar(rest);
      i++;
    }
  }
  return obj;
}

// Extracts the top-level "proxies:" block/flow sequence from raw YAML text
// and returns an array of plain JS proxy objects. Returns [] if no such key
// is found — callers treat that as "not a Clash-format subscription".
function parseClashProxiesYaml(yamlText) {
  const rawLines = yamlText.split(/\r?\n/).map(stripYamlComment);

  let start = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (
      /^proxies:\s*(\[\s*\])?\s*$/.test(rawLines[i]) &&
      !/^\s/.test(rawLines[i])
    ) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const blockLines = [];
  for (let i = start + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === "") {
      blockLines.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    blockLines.push(line);
  }

  let baseIndent = null;
  for (const l of blockLines) {
    if (!l.trim()) continue;
    baseIndent = l.length - l.trimStart().length;
    break;
  }
  if (baseIndent === null) return [];

  const items = [];
  let current = null;
  for (const line of blockLines) {
    if (!line.trim()) {
      if (current) current.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === baseIndent && line.trimStart().startsWith("-")) {
      if (current) items.push(current);
      current = [];
      const stripped = line.trimStart();
      const dashLen = stripped.match(/^-\s*/)[0].length;
      const firstContent = stripped.slice(dashLen);
      const dashIndent = baseIndent + dashLen;
      if (firstContent.trim() !== "") {
        current.push(" ".repeat(dashIndent) + firstContent);
      }
    } else if (current) {
      current.push(line);
    }
  }
  if (current) items.push(current);

  const proxies = [];
  for (const itemLines of items) {
    if (itemLines.length === 0) continue;
    const first = itemLines[0].trim();
    if (first.startsWith("{") && first.endsWith("}")) {
      proxies.push(parseYamlFlowMap(first));
    } else {
      proxies.push(parseYamlBlockMapLines(itemLines));
    }
  }
  return proxies;
}

// Converts one parsed Clash/Mihomo proxy object into the same internal node
// shape parseNodeUri/parseXrayOutbound produce, so it flows straight through
// the existing generateNodeUri. Returns null for proxy types not yet
// supported (e.g. clash-only types like socks5/http/snell — Step 5 territory
// for socks5/http; snell has no vexa-side URI format to export to).
function clashProxyToNode(p) {
  if (!p || typeof p !== "object" || !p.type || !p.server || !p.port)
    return null;

  const wsOpts = p["ws-opts"] || {};
  const grpcOpts = p["grpc-opts"] || {};
  const realityOpts = p["reality-opts"] || {};
  const network = p.network || (wsOpts.path || wsOpts.headers ? "ws" : "tcp");
  const wsHost =
    (wsOpts.headers && (wsOpts.headers.Host || wsOpts.headers.host)) || "";
  const isReality = Boolean(realityOpts["public-key"]);
  const isTls = Boolean(p.tls) || isReality;

  try {
    if (p.type === "vless") {
      if (!p.uuid) return null;
      return {
        protocol: "vless",
        address: p.server,
        port: Number(p.port),
        id: p.uuid,
        security: isReality ? "reality" : isTls ? "tls" : "",
        sni: p.servername || p.sni || "",
        network,
        path: wsOpts.path || "",
        host_header: wsHost,
        serviceName: grpcOpts["grpc-service-name"] || "",
        flow: p.flow || "",
        alpn: Array.isArray(p.alpn) ? p.alpn.join(",") : p.alpn || "",
        fp: p["client-fingerprint"] || "",
        pbk: realityOpts["public-key"] || "",
        sid: realityOpts["short-id"] || "",
        remark: p.name || "",
      };
    }

    if (p.type === "vmess") {
      if (!p.uuid) return null;
      return {
        protocol: "vmess",
        address: p.server,
        port: Number(p.port),
        id: p.uuid,
        alterId: Number(p.alterId || 0),
        network,
        type: "none",
        host: wsHost,
        path: wsOpts.path || "",
        tls: isTls ? "tls" : "",
        sni: p.servername || p.sni || "",
        remark: p.name || "",
      };
    }

    if (p.type === "trojan") {
      if (!p.password) return null;
      return {
        protocol: "trojan",
        address: p.server,
        port: Number(p.port),
        id: p.password,
        security: "tls",
        sni: p.sni || p.servername || "",
        network,
        path: wsOpts.path || "",
        host_header: wsHost,
        serviceName: grpcOpts["grpc-service-name"] || "",
        flow: "",
        alpn: Array.isArray(p.alpn) ? p.alpn.join(",") : p.alpn || "",
        fp: p["client-fingerprint"] || "",
        pbk: "",
        sid: "",
        remark: p.name || "",
      };
    }

    if (p.type === "ss") {
      if (!p.cipher || !p.password) return null;
      return {
        protocol: "shadowsocks",
        address: p.server,
        port: Number(p.port),
        method: p.cipher,
        password: String(p.password),
        plugin: p.plugin || "",
        remark: p.name || "",
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Parses a full Clash-format YAML subscription body into canonical node
// URIs, reusing generateNodeUri for the actual serialization. Returns []
// (not an error) when the text has no "proxies:" list, so callers can
// treat that as "not this format" and fall through to other parsers.
export function parseClashYamlSource(yamlText) {
  const proxies = parseClashProxiesYaml(yamlText);
  const uris = [];
  for (const p of proxies) {
    const node = clashProxyToNode(p);
    if (!node) continue;
    try {
      uris.push(generateNodeUri(node));
    } catch {
      /* unsupported combo, skip */
    }
  }
  return uris;
}
