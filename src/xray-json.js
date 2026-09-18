import { splitOnce } from "./uri-helpers.js";

function extractTransportFields(streamSettings) {
  const ss = streamSettings || {};
  const network = ss.network || "tcp";
  let path = "",
    host = "",
    serviceName = "";

  if (network === "ws" && ss.wsSettings) {
    path = ss.wsSettings.path || "";
    host =
      (ss.wsSettings.headers && ss.wsSettings.headers.Host) ||
      ss.wsSettings.host ||
      "";
  } else if (network === "grpc" && ss.grpcSettings) {
    serviceName = ss.grpcSettings.serviceName || "";
  } else if (
    (network === "xhttp" || network === "splithttp") &&
    ss.xhttpSettings
  ) {
    path = ss.xhttpSettings.path || "";
    host = ss.xhttpSettings.host || "";
  } else if (
    network === "tcp" &&
    ss.tcpSettings &&
    ss.tcpSettings.header &&
    ss.tcpSettings.header.type === "http"
  ) {
    const req = ss.tcpSettings.header.request;
    if (req) {
      path = (req.path && req.path[0]) || "";
      host = (req.headers && req.headers.Host && req.headers.Host[0]) || "";
    }
  }

  const security = ss.security || "";
  let sni = "",
    fp = "",
    pbk = "",
    sid = "",
    alpn = "";
  if (security === "tls" && ss.tlsSettings) {
    sni = ss.tlsSettings.serverName || "";
    fp = ss.tlsSettings.fingerprint || "";
    alpn = Array.isArray(ss.tlsSettings.alpn)
      ? ss.tlsSettings.alpn.join(",")
      : ss.tlsSettings.alpn || "";
  } else if (security === "reality" && ss.realitySettings) {
    sni = ss.realitySettings.serverName || "";
    fp = ss.realitySettings.fingerprint || "";
    pbk = ss.realitySettings.publicKey || ss.realitySettings.password || "";
    sid = ss.realitySettings.shortId || "";
  }

  return {
    network,
    path,
    host,
    serviceName,
    security,
    sni,
    fp,
    pbk,
    sid,
    alpn,
  };
}

function buildStreamSettings(node) {
  const streamSettings = { network: node.network || "tcp" };

  if (node.network === "ws") {
    streamSettings.wsSettings = {
      path: node.path || "/",
      headers: node.host_header ? { Host: node.host_header } : {},
    };
  } else if (node.network === "grpc") {
    streamSettings.grpcSettings = { serviceName: node.serviceName || "" };
  } else if (node.network === "xhttp") {
    streamSettings.xhttpSettings = {
      path: node.path || "/",
      host: node.host_header || "",
    };
  }

  if (node.security === "tls") {
    streamSettings.security = "tls";
    streamSettings.tlsSettings = {
      serverName: node.sni || "",
      ...(node.fp ? { fingerprint: node.fp } : {}),
      ...(node.alpn ? { alpn: node.alpn.split(",") } : {}),
    };
  } else if (node.security === "reality") {
    streamSettings.security = "reality";
    streamSettings.realitySettings = {
      serverName: node.sni || "",
      fingerprint: node.fp || "",
      publicKey: node.pbk || "",
      shortId: node.sid || "",
    };
  }

  return streamSettings;
}

// Parses one Xray/V2Ray outbound object into the internal node shape.
// Returns null for protocols/shapes it doesn't recognize (mirrors
// parseNodeUri's behavior for unsupported protocols).
function parseXrayOutbound(outbound) {
  if (!outbound || typeof outbound !== "object") return null;
  const protocol = outbound.protocol;
  const settings = outbound.settings || {};
  const transport = extractTransportFields(outbound.streamSettings);

  try {
    if (protocol === "vless" || protocol === "vmess") {
      // Xray accepts both the verbose vnext[] form and (for single-server
      // cases) a simplified flat form; support both.
      const server = (settings.vnext && settings.vnext[0]) || settings;
      const user = (server.users && server.users[0]) || server;
      if (!server.address || !server.port || !user) return null;

      if (protocol === "vless") {
        if (!user.id) return null;
        return {
          protocol: "vless",
          address: server.address,
          port: Number(server.port),
          id: user.id,
          security: transport.security,
          sni: transport.sni,
          network: transport.network,
          path: transport.path,
          host_header: transport.host,
          serviceName: transport.serviceName,
          flow: user.flow || "",
          alpn: transport.alpn,
          fp: transport.fp,
          pbk: transport.pbk,
          sid: transport.sid,
          remark: outbound.tag || "",
        };
      }

      // vmess
      if (!user.id) return null;
      return {
        protocol: "vmess",
        address: server.address,
        port: Number(server.port),
        id: user.id,
        alterId: Number(user.alterId || 0),
        network: transport.network,
        type: "none",
        host: transport.host,
        path: transport.path,
        tls: transport.security === "tls" ? "tls" : "",
        sni: transport.sni,
        remark: outbound.tag || "",
      };
    }

    if (protocol === "trojan") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port || !server.password) return null;
      return {
        protocol: "trojan",
        address: server.address,
        port: Number(server.port),
        id: server.password,
        security: transport.security || "tls",
        sni: transport.sni,
        network: transport.network,
        path: transport.path,
        host_header: transport.host,
        serviceName: transport.serviceName,
        flow: "",
        alpn: transport.alpn,
        fp: transport.fp,
        pbk: transport.pbk,
        sid: transport.sid,
        remark: outbound.tag || "",
      };
    }

    if (protocol === "shadowsocks") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port || !server.password || !server.method)
        return null;
      return {
        protocol: "shadowsocks",
        address: server.address,
        port: Number(server.port),
        method: server.method,
        password: server.password,
        plugin: server.plugin || "",
        remark: outbound.tag || "",
      };
    }

    // V2Fly's separate "shadowsocks2022" protocol name (Xray-core folds 2022
    // ciphers into the unified "shadowsocks" protocol above and is already
    // handled by that branch — this covers the distinct V2Fly-flavored shape:
    // a flat settings object with "psk" instead of "password", plus an
    // optional "ipsk" array for SIP023 multi-user identity PSKs). We map psk
    // -> password so it flows through the same internal node shape and can
    // be re-exported as a normal ss:// SIP002 link; ipsk is preserved on the
    // node (comma-joined) since there's no standardized way to encode a
    // multi-identity PSK chain in a share link — it round-trips through JSON
    // export but is dropped on URI export.
    if (protocol === "shadowsocks2022") {
      if (
        !settings.address ||
        !settings.port ||
        !settings.psk ||
        !settings.method
      )
        return null;
      return {
        protocol: "shadowsocks",
        address: settings.address,
        port: Number(settings.port),
        method: settings.method,
        password: settings.psk,
        plugin: "",
        ipsk: Array.isArray(settings.ipsk) ? settings.ipsk.join(",") : "",
        xrayVariant: "shadowsocks2022",
        remark: outbound.tag || "",
      };
    }

    // Xray-core's native "wireguard" outbound (distinct shape from the URI
    // link above: settings holds the local interface config directly, with
    // one peer in settings.peers[0] — Xray-core doesn't support multiple
    // peers per outbound, so only the first is used).
    if (protocol === "wireguard") {
      const peer = (settings.peers && settings.peers[0]) || {};
      if (!peer.endpoint || !settings.secretKey || !peer.publicKey) return null;
      const [address, portStr] = splitOnce(peer.endpoint, ":");
      if (!address || !portStr) return null;
      return {
        protocol: "wireguard",
        address,
        port: Number(portStr),
        privateKey: settings.secretKey,
        publicKey: peer.publicKey,
        presharedKey: peer.preSharedKey || "",
        localAddress: Array.isArray(settings.address)
          ? settings.address.join(",")
          : settings.address || "",
        mtu: settings.mtu ? String(settings.mtu) : "",
        reserved: Array.isArray(settings.reserved)
          ? settings.reserved.join(",")
          : "",
        allowedIPs: Array.isArray(peer.allowedIPs)
          ? peer.allowedIPs.join(",")
          : "",
        remark: outbound.tag || "",
      };
    }

    if (protocol === "socks") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port) return null;
      const user = (server.users && server.users[0]) || {};
      return {
        protocol: "socks",
        address: server.address,
        port: Number(server.port),
        username: user.user || "",
        password: user.pass || "",
        remark: outbound.tag || "",
      };
    }

    // Xray-core's native "http" outbound — identical settings shape to
    // "socks" above (servers[0].{address,port,users[0].{user,pass}}).
    // JSON-only, deliberately: unlike socks/wireguard/etc., there's no safe
    // node-link scheme to add for this one — "http://" and "https://" are
    // already committed elsewhere in this file to mean "fetch this as a
    // subscription URL" (see classifySourceString/fetchSubscriptionNodes),
    // checked before any node-scheme detection. Registering "http://" as a
    // proxy-link prefix here would silently break every existing HTTP/HTTPS
    // subscription import instead of adding a feature.
    if (protocol === "http") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port) return null;
      const user = (server.users && server.users[0]) || {};
      return {
        protocol: "http",
        address: server.address,
        port: Number(server.port),
        username: user.user || "",
        password: user.pass || "",
        remark: outbound.tag || "",
      };
    }

    return null; // protocol not yet supported for JSON import (Step 5 territory)
  } catch {
    return null;
  }
}

// Generates a full Xray outbound object from the internal node shape —
// the inverse of parseXrayOutbound. Throws on unsupported protocols to
// match generateNodeUri's behavior.
export function generateXrayOutbound(node) {
  const tag = node.remark || undefined;

  if (node.protocol === "vless") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "vless",
      settings: {
        vnext: [
          {
            address: node.address,
            port: node.port,
            users: [
              {
                id: node.id,
                encryption: "none",
                ...(node.flow ? { flow: node.flow } : {}),
              },
            ],
          },
        ],
      },
      streamSettings: buildStreamSettings(node),
    };
  }

  if (node.protocol === "vmess") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "vmess",
      settings: {
        vnext: [
          {
            address: node.address,
            port: node.port,
            users: [
              { id: node.id, alterId: node.alterId || 0, security: "auto" },
            ],
          },
        ],
      },
      streamSettings: buildStreamSettings({
        ...node,
        security: node.tls === "tls" ? "tls" : "",
        host_header: node.host,
      }),
    };
  }

  if (node.protocol === "trojan") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "trojan",
      settings: {
        servers: [
          { address: node.address, port: node.port, password: node.id },
        ],
      },
      streamSettings: buildStreamSettings({
        ...node,
        security: node.security || "tls",
      }),
    };
  }

  if (node.protocol === "shadowsocks") {
    if (node.xrayVariant === "shadowsocks2022") {
      return {
        ...(tag ? { tag } : {}),
        protocol: "shadowsocks2022",
        settings: {
          address: node.address,
          port: node.port,
          method: node.method,
          psk: node.password,
          ...(node.ipsk ? { ipsk: node.ipsk.split(",") } : {}),
        },
      };
    }
    return {
      ...(tag ? { tag } : {}),
      protocol: "shadowsocks",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            method: node.method,
            password: node.password,
          },
        ],
      },
    };
  }

  if (node.protocol === "wireguard") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "wireguard",
      settings: {
        secretKey: node.privateKey,
        address: node.localAddress ? node.localAddress.split(",") : [],
        peers: [
          {
            publicKey: node.publicKey,
            endpoint: `${node.address}:${node.port}`,
            ...(node.presharedKey ? { preSharedKey: node.presharedKey } : {}),
            allowedIPs: node.allowedIPs
              ? node.allowedIPs.split(",")
              : ["0.0.0.0/0"],
          },
        ],
        ...(node.mtu ? { mtu: Number(node.mtu) } : {}),
        ...(node.reserved
          ? { reserved: node.reserved.split(",").map(Number) }
          : {}),
      },
    };
  }

  if (node.protocol === "socks") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "socks",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            ...(node.username
              ? { users: [{ user: node.username, pass: node.password || "" }] }
              : {}),
          },
        ],
      },
    };
  }

  if (node.protocol === "http") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "http",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            ...(node.username
              ? { users: [{ user: node.username, pass: node.password || "" }] }
              : {}),
          },
        ],
      },
    };
  }

  throw new Error("unsupported_protocol_for_generation");
}

// Pulls the proxy outbounds out of one Xray/V2Ray-shaped object: either a
// full config (with an "outbounds" array) or a single bare outbound object.
// `configRemark` is a full config's own "remarks"/"ps" field — e.g. BPB
// Panel labels each exported config "VLESS - Domain : 443" while its single
// outbound just gets a generic tag like "proxy". The human-meaningful
// config-level label is what a client would actually display, so it takes
// priority over a generic per-outbound tag; a config with several proxy
// outbounds (a "URL test" / best-ping style config bundling multiple
// servers) still gets each outbound's own distinguishing tag appended so
// entries from that config don't all collapse to one identical name.
const GENERIC_TAG_RE = /^(proxy|out|outbound)(-\d+)?$/i;
function extractOutboundsFromConfig(data, configRemark) {
  const outbounds = Array.isArray(data.outbounds)
    ? data.outbounds
    : data.protocol
      ? [data]
      : [];

  const proxyOutbounds = outbounds.filter(
    (ob) => !["freedom", "blackhole", "dns", "loopback"].includes(ob.protocol),
  );
  const multiple = proxyOutbounds.length > 1;

  return proxyOutbounds.map((ob) => {
    if (!configRemark) return ob;
    const tagIsGeneric = !ob.tag || GENERIC_TAG_RE.test(ob.tag);
    if (!tagIsGeneric) return ob; // outbound already has a meaningful tag of its own
    const label =
      multiple && ob.tag ? `${configRemark} (${ob.tag})` : configRemark;
    return { ...ob, tag: label };
  });
}

// Accepts any of:
//   - a single bare outbound object: { protocol, settings, ... }
//   - a full Xray config.json:       { outbounds: [...], ... }
//   - an array of either of the above (e.g. BPB Panel's multi-config export,
//     where each array entry is a complete client config with its own
//     "remarks" label and a single proxy outbound)
// and returns an array of parsed nodes, skipping entries it can't parse
// rather than failing the whole import.
export function parseXrayJsonSource(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { nodes: [], errors: ["invalid_json"] };
  }

  let proxyOutbounds = [];
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      proxyOutbounds.push(
        ...extractOutboundsFromConfig(entry, entry.remarks || entry.ps),
      );
    }
  } else {
    proxyOutbounds = extractOutboundsFromConfig(data, data.remarks || data.ps);
  }

  const nodes = [];
  const errors = [];
  for (const ob of proxyOutbounds) {
    const parsed = parseXrayOutbound(ob);
    if (parsed) nodes.push(parsed);
    else errors.push(`unparsed_outbound:${ob.protocol || "unknown"}`);
  }
  return { nodes, errors };
}
