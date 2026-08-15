import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { promisify } from "node:util";

import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import type { FetchLike } from "@modelcontextprotocol/client";

const lookupAsync = promisify(lookup);
const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

export class SafeFetchError extends Error {
  readonly code:
    | "invalid_url"
    | "redirect_refused"
    | "response_too_large"
    | "unsafe_address";

  constructor(code: SafeFetchError["code"]) {
    super("The remote MCP endpoint could not be accessed safely.");
    this.name = "SafeFetchError";
    this.code = code;
  }
}

function publicHttpsUrl(value: string, allowQuery: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SafeFetchError("invalid_url");
  }
  const hostnameForIp =
    url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    (!allowQuery && url.search !== "") ||
    url.hostname.length === 0 ||
    isIP(hostnameForIp) !== 0 ||
    url.toString().length > 2048
  ) {
    throw new SafeFetchError("invalid_url");
  }
  url.hostname = url.hostname.toLowerCase();
  return url;
}

export function canonicalizeRemoteMcpUrl(value: string): URL {
  return publicHttpsUrl(value, false);
}

export function isBlockedRemoteAddress(
  address: string,
  family: number,
): boolean {
  return family === 6
    ? blockedIpv6.check(address, "ipv6")
    : blockedIpv4.check(address, "ipv4");
}

export interface SafeFetchPolicy {
  fetch: FetchLike;
  close(): Promise<void>;
}

export function createSafeFetchPolicy(): SafeFetchPolicy {
  const dispatcher = new Agent({
    connect: {
      lookup(hostname, options, callback) {
        void lookupAsync(hostname, { all: true, verbatim: true })
          .then((addresses) => {
            if (
              addresses.length === 0 ||
              addresses.some((address) =>
                isBlockedRemoteAddress(address.address, address.family),
              )
            ) {
              callback(new SafeFetchError("unsafe_address"), "", 4);
              return;
            }
            const selected = addresses[0];
            if (selected === undefined) {
              callback(new SafeFetchError("unsafe_address"), "", 4);
              return;
            }
            if (options.all === true) {
              callback(null, addresses);
            } else {
              callback(null, selected.address, selected.family);
            }
          })
          .catch(() => {
            callback(new SafeFetchError("unsafe_address"), "", 4);
          });
      },
    },
  });

  const fetch: FetchLike = async (input, init) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : ((input as { url?: string }).url ?? String(input));
    // OAuth metadata and token endpoints may legitimately use query
    // parameters. The configured MCP endpoint itself is canonicalized more
    // strictly before a transport is created.
    const url = publicHttpsUrl(requestUrl, true);
    const response = await undiciFetch(url, {
      ...(init as object),
      dispatcher: dispatcher as Dispatcher,
      redirect: "manual",
    } as unknown as Parameters<typeof undiciFetch>[1]);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SafeFetchError("redirect_refused");
    }
    return response as unknown as Response;
  };

  return {
    close: () => dispatcher.close(),
    fetch,
  };
}
