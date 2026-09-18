export function splitOnce(str, sep) {
  const idx = str.indexOf(sep);
  if (idx === -1) return [str, ""];
  return [str.slice(0, idx), str.slice(idx + 1)];
}

// Robust base64 decode: tolerates URL-safe alphabet, stray whitespace/newlines,
// and missing padding (all common in hand-copied or third-party generated links).
export function robustAtob(str) {
  let s = str.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}
