// =====================================================================
// VEXA — SING-BOX / CLASH OUTPUT — converts our parsed node objects (see
// parseNodeUri) into sing-box outbound objects / Clash proxy maps.
// Only the protocols listed below can be structurally converted; anything
// else (SSR, WireGuard, TUIC, naive+, plain socks, etc.) is skipped rather
// than guessed at, since a wrong config is worse than a missing node.
// =====================================================================

import { parseNodeUri, generateNodeUri } from "./uri-codec.js";

function uniqueName(base, used) {
  let name = base && base.trim() ? base.trim() : "node";
  let i = 2;
  while (used.has(name)) {
    name = `${base || "node"} (${i++})`;
  }
  used.add(name);
  return name;
}

function nodeToSingboxOutbound(node, tag) {
  const common = { tag, server: node.address, server_port: node.port };
  switch (node.protocol) {
    case "vmess":
      return {
        ...common,
        type: "vmess",
        uuid: node.id,
        alter_id: node.alterId || 0,
        security: "auto",
        tls:
          node.tls === "tls"
            ? {
                enabled: true,
                server_name: node.sni || node.host || node.address,
              }
            : undefined,
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host ? { Host: node.host } : undefined,
              }
            : undefined,
      };
    case "vless":
      return {
        ...common,
        type: "vless",
        uuid: node.id,
        flow: node.flow || undefined,
        tls:
          node.security === "tls" || node.security === "reality"
            ? {
                enabled: true,
                server_name: node.sni || node.address,
                reality:
                  node.security === "reality"
                    ? {
                        enabled: true,
                        public_key: node.pbk || "",
                        short_id: node.sid || "",
                      }
                    : undefined,
                utls: node.fp
                  ? { enabled: true, fingerprint: node.fp }
                  : undefined,
              }
            : undefined,
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
                service_name:
                  node.network === "grpc" ? node.serviceName || "" : undefined,
              }
            : undefined,
      };
    case "trojan":
      return {
        ...common,
        type: "trojan",
        password: node.id,
        tls: { enabled: true, server_name: node.sni || node.address },
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
                service_name:
                  node.network === "grpc" ? node.serviceName || "" : undefined,
              }
            : undefined,
      };
    case "shadowsocks":
      return {
        ...common,
        type: "shadowsocks",
        method: node.method,
        password: node.password,
      };
    case "hysteria2":
      return {
        ...common,
        type: "hysteria2",
        password: node.auth || "",
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.insecure,
        },
        obfs: node.obfs
          ? { type: node.obfs, password: node.obfsPassword || "" }
          : undefined,
      };
    case "hysteria":
      return {
        ...common,
        type: "hysteria",
        up_mbps: node.upmbps ? Number(node.upmbps) : undefined,
        down_mbps: node.downmbps ? Number(node.downmbps) : undefined,
        obfs: node.obfs || undefined,
        auth_str: node.auth || undefined,
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.insecure,
        },
      };
    case "tuic":
      return {
        ...common,
        type: "tuic",
        uuid: node.uuid,
        password: node.password || "",
        congestion_control: node.congestionControl || "bbr",
        udp_relay_mode: node.udpRelayMode || "native",
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.allowInsecure,
          disable_sni: !!node.disableSni,
        },
      };
    case "wireguard":
      return {
        ...common,
        type: "wireguard",
        local_address: node.localAddress
          ? node.localAddress
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        private_key: node.privateKey,
        peer_public_key: node.publicKey,
        pre_shared_key: node.presharedKey || undefined,
        mtu: node.mtu ? Number(node.mtu) : undefined,
      };
    default:
      return null;
  }
}

function nodeToClashProxy(node, name) {
  const common = { name, server: node.address, port: node.port };
  switch (node.protocol) {
    case "vmess":
      return {
        ...common,
        type: "vmess",
        uuid: node.id,
        alterId: node.alterId || 0,
        cipher: "auto",
        tls: node.tls === "tls",
        network: node.network || "tcp",
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host ? { Host: node.host } : undefined,
              }
            : undefined,
        servername: node.sni || undefined,
      };
    case "vless":
      return {
        ...common,
        type: "vless",
        uuid: node.id,
        flow: node.flow || undefined,
        tls: node.security === "tls" || node.security === "reality",
        network: node.network || "tcp",
        servername: node.sni || undefined,
        "client-fingerprint": node.fp || undefined,
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
              }
            : undefined,
        "grpc-opts":
          node.network === "grpc"
            ? { "grpc-service-name": node.serviceName || "" }
            : undefined,
        "reality-opts":
          node.security === "reality"
            ? { "public-key": node.pbk || "", "short-id": node.sid || "" }
            : undefined,
      };
    case "trojan":
      return {
        ...common,
        type: "trojan",
        password: node.id,
        sni: node.sni || undefined,
        network:
          node.network && node.network !== "tcp" ? node.network : undefined,
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
              }
            : undefined,
        "grpc-opts":
          node.network === "grpc"
            ? { "grpc-service-name": node.serviceName || "" }
            : undefined,
      };
    case "shadowsocks":
      return {
        ...common,
        type: "ss",
        cipher: node.method,
        password: node.password,
      };
    case "hysteria2":
      return {
        ...common,
        type: "hysteria2",
        password: node.auth || "",
        sni: node.sni || undefined,
        "skip-cert-verify": !!node.insecure,
        obfs: node.obfs || undefined,
        "obfs-password": node.obfsPassword || undefined,
      };
    case "hysteria":
      return {
        ...common,
        type: "hysteria",
        "auth-str": node.auth || undefined,
        up: node.upmbps || undefined,
        down: node.downmbps || undefined,
        obfs: node.obfs || undefined,
        sni: node.sni || undefined,
        "skip-cert-verify": !!node.insecure,
      };
    case "tuic":
      return {
        ...common,
        type: "tuic",
        uuid: node.uuid,
        password: node.password || "",
        "congestion-controller": node.congestionControl || "bbr",
        "udp-relay-mode": node.udpRelayMode || "native",
        sni: node.sni || undefined,
        "disable-sni": !!node.disableSni,
        "skip-cert-verify": !!node.allowInsecure,
      };
    case "wireguard":
      return {
        ...common,
        type: "wireguard",
        ip: node.localAddress
          ? node.localAddress.split(",")[0].split("/")[0].trim()
          : undefined,
        "private-key": node.privateKey,
        "public-key": node.publicKey,
        "preshared-key": node.presharedKey || undefined,
        mtu: node.mtu ? Number(node.mtu) : undefined,
      };
    case "shadowsocksr":
      return {
        ...common,
        type: "ssr",
        cipher: node.method,
        password: node.password,
        protocol: node.ssrProtocol,
        obfs: node.obfs,
        "protocol-param": node.protoParam || undefined,
        "obfs-param": node.obfsParam || undefined,
      };
    default:
      return null;
  }
}

// Drops any key whose value is undefined so the emitted JSON/YAML is clean
// instead of littered with "key: undefined".
function pruneUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(pruneUndefined);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out;
  }
  return obj;
}

function buildSingboxConfig(nodes, title) {
  const used = new Set();
  const outbounds = [];
  for (const uri of nodes) {
    const parsed = parseNodeUri(uri);
    if (!parsed) continue;
    const tag = uniqueName(
      parsed.remark || `${parsed.protocol}-${parsed.address}`,
      used,
    );
    const ob = nodeToSingboxOutbound(parsed, tag);
    if (ob) outbounds.push(pruneUndefined(ob));
  }
  const tags = outbounds.map((o) => o.tag);
  const config = {
    log: { level: "info" },
    outbounds: [
      {
        type: "selector",
        tag: title || "select",
        outbounds: ["auto", ...tags],
        default: "auto",
      },
      { type: "urltest", tag: "auto", outbounds: tags },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
    ],
    route: { rules: [], final: title || "select" },
  };
  return { json: JSON.stringify(config, null, 2), count: outbounds.length };
}

// Minimal hand-rolled YAML writer — sufficient for the flat proxy maps and
// small proxy-groups list this config needs, without pulling in a library.
function toYamlValue(v) {
  if (typeof v === "string") {
    return /^[A-Za-z0-9_.\-]+$/.test(v) && v !== "" ? v : JSON.stringify(v);
  }
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function proxyToYamlBlock(proxy) {
  const parts = Object.entries(proxy).map(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = Object.entries(v)
        .map(([ik, iv]) => `${ik}: ${toYamlValue(iv)}`)
        .join(", ");
      return `${k}: {${inner}}`;
    }
    return `${k}: ${toYamlValue(v)}`;
  });
  return `  { ${parts.join(", ")} }`;
}

function buildClashConfig(nodes, title) {
  const used = new Set();
  const proxies = [];
  for (const uri of nodes) {
    const parsed = parseNodeUri(uri);
    if (!parsed) continue;
    const name = uniqueName(
      parsed.remark || `${parsed.protocol}-${parsed.address}`,
      used,
    );
    const proxy = nodeToClashProxy(parsed, name);
    if (proxy) proxies.push(pruneUndefined(proxy));
  }
  const names = proxies.map((p) => p.name);
  const lines = [];
  lines.push("port: 7890");
  lines.push("socks-port: 7891");
  lines.push("allow-lan: true");
  lines.push("mode: rule");
  lines.push("log-level: info");
  lines.push("proxies:");
  for (const p of proxies) lines.push(`-${proxyToYamlBlock(p).slice(1)}`);
  lines.push("proxy-groups:");
  lines.push(`  - name: "${title || "PROXY"}"`);
  lines.push("    type: select");
  lines.push(
    `    proxies: [${["AUTO", ...names].map((n) => JSON.stringify(n)).join(", ")}]`,
  );
  lines.push('  - name: "AUTO"');
  lines.push("    type: url-test");
  lines.push(
    `    proxies: [${names.map((n) => JSON.stringify(n)).join(", ")}]`,
  );
  lines.push('    url: "http://www.gstatic.com/generate_204"');
  lines.push("    interval: 300");
  lines.push("rules:");
  lines.push(`  - MATCH,${title || "PROXY"}`);
  return { yaml: lines.join("\n"), count: proxies.length };
}

// Shared by both public sub routes (single-user and, previously, combined
// multi-profile): applies the optional canonical re-serialization, then
// wraps the node list into the same base64 response format subscription
// clients already expect.
function buildSubResponse(nodes, subtitle, url) {
  const wantsCanonical = url && url.searchParams.get("canonical") === "1";
  const outputNodes = wantsCanonical
    ? nodes.map((n) => {
        const parsed = parseNodeUri(n);
        if (!parsed) return n;
        try {
          return generateNodeUri(parsed);
        } catch {
          return n;
        }
      })
    : nodes;

  const payload = outputNodes.join("\n");
  const base64Payload = btoa(unescape(encodeURIComponent(payload)));
  const encodedTitle = btoa(unescape(encodeURIComponent(subtitle)));

  return new Response(base64Payload, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}"`,
      "Profile-Title": `base64:${encodedTitle}`,
      "Profile-Update-Interval": "24",
      "Subscription-Userinfo": "upload=0; download=0; total=0; expire=0",
    },
  });
}

// Sniffs the requesting client's User-Agent to pick an output format when
// the caller didn't explicitly ask for one via ?format=. Only maps the
// clients that have a distinctive, well-known UA string; anything else
// falls back to plain base64 (the format almost every subscription client
// understands), so an unrecognized UA never breaks.
function detectFormatFromUserAgent(request) {
  const ua = (request && request.headers.get("User-Agent")) || "";
  if (/clash|mihomo/i.test(ua)) return "clash";
  if (/sing-box|sfa|sfi|sfm|sfw/i.test(ua)) return "singbox";
  return null;
}

// Dispatches to base64 (default, unchanged behavior), sing-box, or Clash
// output. An explicit ?format= query param always wins; otherwise the
// format is auto-detected from the requesting client's User-Agent so one
// link can serve every client without the user picking a format by hand.
export function buildFormattedSubResponse(nodes, subtitle, url, request) {
  const format =
    (url && url.searchParams.get("format")) ||
    detectFormatFromUserAgent(request);

  if (format === "singbox") {
    const { json } = buildSingboxConfig(nodes, subtitle);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}.json"`,
        "Profile-Update-Interval": "24",
      },
    });
  }

  if (format === "clash") {
    const { yaml } = buildClashConfig(nodes, subtitle);
    return new Response(yaml, {
      status: 200,
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}.yaml"`,
        "Profile-Update-Interval": "24",
      },
    });
  }

  return buildSubResponse(nodes, subtitle, url);
}
