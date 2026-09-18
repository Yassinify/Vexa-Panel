import { splitOnce, robustAtob } from "./uri-helpers.js";
import { validateNodeUri } from "./uri-validate.js";

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

export function parseNodeUri(uri) {
  const check = validateNodeUri(uri);
  if (!check.valid) return null;

  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      return {
        protocol: "vmess",
        address: payload.add,
        port: Number(payload.port),
        id: payload.id,
        alterId: Number(payload.aid || 0),
        network: payload.net || "tcp",
        type: payload.type || "none",
        host: payload.host || "",
        path: payload.path || "",
        tls: payload.tls || "",
        sni: payload.sni || "",
        remark: payload.ps || "",
      };
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const protocol = uri.startsWith("vless://") ? "vless" : "trojan";
      const withoutProto = uri.split("://")[1];
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before splitting port.
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const params = new URLSearchParams(search);
      return {
        protocol,
        address: host,
        port: Number(port),
        id: creds,
        security: params.get("security") || "",
        sni: params.get("sni") || "",
        network: params.get("type") || "tcp",
        path: params.get("path") ? decodeURIComponent(params.get("path")) : "",
        host_header: params.get("host") || "",
        serviceName: params.get("serviceName") || "",
        flow: params.get("flow") || "",
        alpn: params.get("alpn") || "",
        fp: params.get("fp") || "",
        pbk: params.get("pbk") || "",
        sid: params.get("sid") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      if (beforeHash.includes("@")) {
        const [creds, rest] = splitOnce(beforeHash, "@");
        const [hostPortRaw, search] = splitOnce(rest, "?");
        const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
        const normalized = normalizeSsUserinfo(creds);
        const [method, password] = splitOnce(normalized, ":");
        return {
          protocol: "shadowsocks",
          address: host,
          port: Number(port),
          method,
          password,
          plugin: new URLSearchParams(search).get("plugin") || "",
          remark: hash ? decodeURIComponent(hash) : "",
        };
      }
      const decoded = robustAtob(beforeHash);
      const [methodPass, hostPort] = splitOnce(decoded, "@");
      const [method, password] = splitOnce(methodPass, ":");
      const [host, port] = splitOnce(hostPort, ":");
      return {
        protocol: "shadowsocks",
        address: host,
        port: Number(port),
        method,
        password,
        plugin: "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1];
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [beforeQueryRaw, search] = splitOnce(beforeHash, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0]; // drop a bare "/" before the query
      const [auth, hostPort] = splitOnce(beforeQuery, "@");
      // Hysteria2 supports port-hopping ("host:1000-2000" or "host:1000,2000,3000");
      // keep the full port field intact and only split out the host for storage,
      // re-joining on generate rather than assuming a single numeric port.
      const firstColon = hostPort.indexOf(":");
      const host = firstColon === -1 ? hostPort : hostPort.slice(0, firstColon);
      const portField = firstColon === -1 ? "" : hostPort.slice(firstColon + 1);
      const params = new URLSearchParams(search);
      return {
        protocol: "hysteria2",
        address: host,
        portField,
        port: Number(portField.split(/[-,]/)[0]) || 0,
        auth: decodeURIComponent(auth || ""),
        sni: params.get("sni") || params.get("peer") || "",
        insecure: params.get("insecure") === "1",
        obfs: params.get("obfs") || "",
        obfsPassword: params.get("obfs-password") || "",
        pinSHA256: params.get("pinSHA256") || "",
        alpn: params.get("alpn") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("tuic://")) {
      const withoutProto = uri.slice("tuic://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const [uuid, password] = splitOnce(decodeURIComponent(creds), ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "tuic",
        address: host,
        port: Number(port),
        uuid,
        password: password || "",
        congestionControl: params.get("congestion_control") || "bbr",
        udpRelayMode: params.get("udp_relay_mode") || "native",
        sni: params.get("sni") || "",
        alpn: params.get("alpn") || "",
        allowInsecure: params.get("allow_insecure") === "1",
        disableSni: params.get("disable_sni") === "1",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("hysteria://")) {
      const withoutProto = uri.slice("hysteria://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [hostPortRaw, search] = splitOnce(beforeHash, "?");
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "hysteria",
        address: host,
        port: Number(port),
        auth: params.get("auth") || "",
        sni: params.get("peer") || params.get("sni") || "",
        insecure: params.get("insecure") === "1",
        upmbps: params.get("upmbps") || "",
        downmbps: params.get("downmbps") || "",
        obfs: params.get("obfs") || "",
        obfsParam: params.get("obfsParam") || "",
        alpn: params.get("alpn") || "",
        transportProtocol: params.get("protocol") || "udp",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [privKey, rest] = splitOnce(beforeHash, "@");
      const [hostPort, search] = splitOnce(rest, "?");
      const [host, port] = splitOnce(hostPort, ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "wireguard",
        address: host,
        port: Number(port),
        privateKey: decodeURIComponent(privKey || ""),
        publicKey: params.get("publickey") || "",
        presharedKey: params.get("presharedkey") || "",
        localAddress: params.get("address") || "",
        mtu: params.get("mtu") || "",
        reserved: params.get("reserved") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("socks://")) {
      const withoutProto = uri.slice("socks://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const beforeQuery = splitOnce(beforeHash, "?")[0];
      let username = "",
        password = "",
        hostPort;
      if (beforeQuery.includes("@")) {
        const [credsRaw, rest] = splitOnce(beforeQuery, "@");
        const creds = normalizeSsUserinfo(credsRaw);
        [username, password] = splitOnce(creds, ":");
        hostPort = rest;
      } else {
        hostPort = beforeQuery;
      }
      const [host, port] = splitOnce(hostPort.split("/")[0], ":");
      return {
        protocol: "socks",
        address: host,
        port: Number(port),
        username,
        password,
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      const scheme = uri.startsWith("naive+https://") ? "https" : "quic";
      const withoutProto = uri.slice(uri.indexOf("://") + 3);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [beforeQuery, query] = splitOnce(beforeHash, "?");
      let username = "",
        password = "",
        hostPort;
      if (beforeQuery.includes("@")) {
        const [credsRaw, rest] = splitOnce(beforeQuery, "@");
        const creds = decodeURIComponent(credsRaw);
        [username, password] = splitOnce(creds, ":");
        hostPort = rest;
      } else {
        hostPort = beforeQuery;
      }
      const [host, port] = splitOnce(hostPort.split("/")[0], ":");
      const params = new URLSearchParams(query);
      return {
        protocol: "naiveproxy",
        transport: scheme, // "https" or "quic" — which naive+ variant this is
        address: host,
        port: Number(port),
        username,
        password,
        padding: params.get("padding") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      const [mainPart, queryPart] = splitOnce(decoded, "/?");
      const segments = mainPart.split(":");
      if (segments.length < 6) return null;
      const [host, port, protocol, method, obfs, passwordB64] = segments;
      const params = new URLSearchParams(queryPart || "");
      return {
        protocol: "shadowsocksr",
        address: host,
        port: Number(port),
        ssrProtocol: protocol,
        method,
        obfs,
        password: robustAtob(passwordB64),
        obfsParam: params.get("obfsparam")
          ? robustAtob(params.get("obfsparam"))
          : "",
        protoParam: params.get("protoparam")
          ? robustAtob(params.get("protoparam"))
          : "",
        remark: params.get("remarks") ? robustAtob(params.get("remarks")) : "",
      };
    }
    return null; // SSR/etc: not yet supported for structured parse
  } catch {
    return null;
  }
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export function generateNodeUri(node) {
  const remarkSuffix = node.remark ? "#" + encodeURIComponent(node.remark) : "";

  if (node.protocol === "vmess") {
    const payload = {
      v: "2",
      ps: node.remark || "",
      add: node.address,
      port: String(node.port),
      id: node.id,
      aid: String(node.alterId || 0),
      net: node.network || "tcp",
      type: node.type || "none",
      host: node.host || "",
      path: node.path || "",
      tls: node.tls || "",
      sni: node.sni || "",
    };
    return "vmess://" + utf8ToBase64(JSON.stringify(payload));
  }

  if (node.protocol === "vless" || node.protocol === "trojan") {
    const params = new URLSearchParams();
    if (node.security) params.set("security", node.security);
    if (node.sni) params.set("sni", node.sni);
    if (node.network && node.network !== "tcp")
      params.set("type", node.network);
    if (node.path) params.set("path", node.path);
    if (node.host_header) params.set("host", node.host_header);
    if (node.serviceName) params.set("serviceName", node.serviceName);
    if (node.flow) params.set("flow", node.flow);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.fp) params.set("fp", node.fp);
    if (node.pbk) params.set("pbk", node.pbk);
    if (node.sid) params.set("sid", node.sid);
    const qs = params.toString();
    return `${node.protocol}://${node.id}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "shadowsocks") {
    // SIP022 (AEAD-2022 ciphers) requires plain "method:password" userinfo —
    // the spec explicitly forbids Base64URL-encoding it, unlike legacy/AEAD
    // Shadowsocks where Base64 is the conventional SIP002 form.
    const is2022 = (node.method || "").startsWith("2022-");
    const userinfo = is2022
      ? `${node.method}:${node.password}`
      : utf8ToBase64(`${node.method}:${node.password}`).replace(/=+$/, "");
    const pluginQs = node.plugin
      ? `?plugin=${encodeURIComponent(node.plugin)}`
      : "";
    return `ss://${userinfo}@${node.address}:${node.port}${pluginQs}${remarkSuffix}`;
  }

  if (node.protocol === "hysteria2") {
    const params = new URLSearchParams();
    if (node.sni) params.set("sni", node.sni);
    if (node.insecure) params.set("insecure", "1");
    if (node.obfs) params.set("obfs", node.obfs);
    if (node.obfsPassword) params.set("obfs-password", node.obfsPassword);
    if (node.pinSHA256) params.set("pinSHA256", node.pinSHA256);
    if (node.alpn) params.set("alpn", node.alpn);
    const qs = params.toString();
    const portField = node.portField || String(node.port);
    return `hysteria2://${encodeURIComponent(node.auth || "")}@${node.address}:${portField}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "tuic") {
    const params = new URLSearchParams();
    if (node.congestionControl && node.congestionControl !== "bbr")
      params.set("congestion_control", node.congestionControl);
    if (node.udpRelayMode && node.udpRelayMode !== "native")
      params.set("udp_relay_mode", node.udpRelayMode);
    if (node.sni) params.set("sni", node.sni);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.allowInsecure) params.set("allow_insecure", "1");
    if (node.disableSni) params.set("disable_sni", "1");
    const qs = params.toString();
    const creds = `${node.uuid}:${node.password || ""}`;
    return `tuic://${encodeURIComponent(creds)}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "hysteria") {
    const params = new URLSearchParams();
    if (node.auth) params.set("auth", node.auth);
    if (node.sni) params.set("peer", node.sni);
    if (node.insecure) params.set("insecure", "1");
    if (node.upmbps) params.set("upmbps", node.upmbps);
    if (node.downmbps) params.set("downmbps", node.downmbps);
    if (node.obfs) params.set("obfs", node.obfs);
    if (node.obfsParam) params.set("obfsParam", node.obfsParam);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.transportProtocol && node.transportProtocol !== "udp")
      params.set("protocol", node.transportProtocol);
    const qs = params.toString();
    return `hysteria://${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "wireguard") {
    const params = new URLSearchParams();
    if (node.publicKey) params.set("publickey", node.publicKey);
    if (node.presharedKey) params.set("presharedkey", node.presharedKey);
    if (node.localAddress) params.set("address", node.localAddress);
    if (node.mtu) params.set("mtu", node.mtu);
    if (node.reserved) params.set("reserved", node.reserved);
    const qs = params.toString();
    return `wireguard://${encodeURIComponent(node.privateKey || "")}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "socks") {
    const auth = node.username
      ? `${utf8ToBase64(`${node.username}:${node.password || ""}`).replace(/=+$/, "")}@`
      : "";
    return `socks://${auth}${node.address}:${node.port}${remarkSuffix}`;
  }

  if (node.protocol === "naiveproxy") {
    // NaiveProxy has no official URI spec (klzgrad/naiveproxy#86 was never
    // adopted upstream) — this follows the de facto convention used by
    // NaiveSharp/Qv2ray-plugin-NaiveProxy: plain (non-base64) user:pass
    // userinfo, percent-encoded like vless/trojan rather than base64 like
    // socks. "quic" is naive's alternate QUIC transport variant.
    const scheme = node.transport === "quic" ? "naive+quic" : "naive+https";
    const auth = node.username
      ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || "")}@`
      : "";
    const params = new URLSearchParams();
    if (node.padding) params.set("padding", node.padding);
    const qs = params.toString();
    return `${scheme}://${auth}${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  throw new Error("unsupported_protocol_for_generation");
}
