// Fast DNS lookup (side-effect on import).
//
// Some Windows machines carry dead placeholder IPv6 DNS servers
// (fec0:0:0:ffff::1/2/3). Node's fetch uses getaddrinfo (dns.lookup), which
// then hangs ~20s per lookup waiting on those servers and blows past undici's
// 10s connect timeout, so every outbound fetch (OpenRouter, Sarvam, Meta) fails
// with UND_ERR_CONNECT_TIMEOUT. The fast c-ares resolver (dns.resolve4) is
// instant, so we route lookups through it and fall back to the OS resolver for
// names c-ares can't handle (localhost, IPv6-only hosts).
//
// Uses require() so we mutate the real dns module (the ESM namespace exposes
// lookup as a read-only getter, which cannot be reassigned).

/* eslint-disable @typescript-eslint/no-explicit-any */
import dns = require("dns");

const osLookup: any = dns.lookup;

(dns as any).lookup = function fastLookup(hostname: string, options: any, callback: any) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const opts = options || {};
  // Anything c-ares A-records can't answer (localhost, explicit IPv6) → OS resolver.
  if (opts.family === 6 || typeof hostname !== "string") {
    return osLookup(hostname, options, callback);
  }
  dns.resolve4(hostname, (err: unknown, addrs: string[]) => {
    if (!err && addrs && addrs.length > 0) {
      if (opts.all) return callback(null, addrs.map((address) => ({ address, family: 4 })));
      return callback(null, addrs[0], 4);
    }
    return osLookup(hostname, options, callback);
  });
};
