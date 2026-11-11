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
    // a flat settings object with "psk" instead of "password"). We map psk
    // -> password so it flows through the same internal node shape.
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
