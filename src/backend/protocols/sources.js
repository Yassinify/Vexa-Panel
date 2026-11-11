import { validateNodeUri } from "./uri-validate.js";
import { parseXrayJsonSource } from "./xray-json.js";
import { parseClashYamlSource } from "./clash-yaml.js";

// ---------------------------------------------------------------------
// SOURCE CLASSIFICATION
// ---------------------------------------------------------------------
function looksLikeXrayJson(str) {
  const looksObj = str.startsWith("{") && str.endsWith("}");
  const looksArr = str.startsWith("[") && str.endsWith("]");
  if (!looksObj && !looksArr) return false;
  try {
    const data = JSON.parse(str);
    if (looksArr) {
      return (
        Array.isArray(data) &&
        data.length > 0 &&
        data.some(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            (Array.isArray(entry.outbounds) || entry.protocol),
        )
      );
    }
    return Boolean(Array.isArray(data.outbounds) || data.protocol);
  } catch {
    return false;
  }
}

function classifySourceString(str) {
  const rawProtocols = [
    "vless://",
    "vmess://",
    "ss://",
    "trojan://",
    "ssr://",
    "hysteria2://",
    "hy2://",
    "tuic://",
    "hysteria://",
    "wireguard://",
    "socks://",
    "naive+https://",
    "naive+quic://",
  ];
  if (rawProtocols.some((p) => str.startsWith(p)))
    return { type: "raw", value: str };
  if (str.startsWith("http://") || str.startsWith("https://"))
    return { type: "subscription", url: str };
  if (looksLikeXrayJson(str)) return { type: "json", value: str };
  if (/^proxies:\s*(\[\s*\])?\s*$/m.test(str))
    return { type: "yaml", value: str };
  return null;
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return { sources: [], invalid: [] };
  const invalid = [];
  const valid = [];
  for (const s of sources) {
    const classified =
      typeof s === "string" ? classifySourceString(s.trim()) : s;
    if (
      !classified ||
      (classified.type === "subscription" ? !classified.url : !classified.value)
    ) {
      if (typeof s === "string" && s.trim())
        invalid.push({ value: s.trim(), reason: "unrecognized_format" });
      continue;
    }
    if (classified.type === "raw") {
      const check = validateNodeUri(classified.value);
      if (!check.valid) {
        invalid.push({ value: classified.value, reason: check.reason });
        continue;
      }
    }
    if (classified.type === "json") {
      const { nodes } = parseXrayJsonSource(classified.value);
      if (nodes.length === 0) {
        invalid.push({
          value: classified.value,
          reason: "no_parseable_outbounds",
        });
        continue;
      }
    }
    if (classified.type === "yaml") {
      const uris = parseClashYamlSource(classified.value);
      if (uris.length === 0) {
        invalid.push({
          value: classified.value,
          reason: "no_parseable_proxies",
        });
        continue;
      }
    }
    valid.push(classified);
  }
  return { sources: valid, invalid };
}

export { looksLikeXrayJson, classifySourceString, normalizeSources };
