import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://example.com";
const CACHE_VERSION = "mp-test";
const PRECACHE = ["/assets/index-abc.js", "/assets/History-def.js"];

const template = readFileSync(path.resolve(import.meta.dirname, "sw-template.js"), "utf8")
  .replace("__CACHE_VERSION__", CACHE_VERSION)
  .replace("__PRECACHE__", JSON.stringify(PRECACHE));

type Listener = (event: TestEvent) => void;

interface TestEvent {
  request?: { url: string; method: string; mode: string };
  waits: Promise<unknown>[];
  responded: Promise<Response> | null;
  waitUntil(promise: Promise<unknown>): void;
  respondWith(promise: Promise<Response>): void;
}

interface CacheStore {
  entries: Map<string, Response>;
  addAll: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

interface Harness {
  listeners: Map<string, Listener>;
  stores: Map<string, CacheStore>;
  deleted: string[];
  fetch: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  caches: {
    open(name: string): Promise<CacheStore>;
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
    match(request: unknown): Promise<Response | undefined>;
  };
}

function pathOf(request: unknown): string {
  if (typeof request === "string") {
    return new URL(request, ORIGIN).pathname;
  }
  if (request && typeof request === "object" && "url" in request) {
    return new URL(String((request as { url: string }).url), ORIGIN).pathname;
  }
  return String(request);
}

function createStore(initial: Record<string, string> = {}): CacheStore {
  const entries = new Map(
    Object.entries(initial).map(([key, body]) => [key, new Response(body)] as const),
  );
  return {
    entries,
    addAll: vi.fn(async (requests: string[]) => {
      for (const request of requests) {
        entries.set(pathOf(request), new Response(`precached:${pathOf(request)}`));
      }
    }),
    match: vi.fn(async (request: unknown) => entries.get(pathOf(request))?.clone()),
    put: vi.fn(async (request: unknown, response: Response) => {
      entries.set(pathOf(request), response);
    }),
  };
}

function lifecycleEvent(): TestEvent {
  return {
    waits: [],
    responded: null,
    waitUntil(promise) {
      this.waits.push(promise);
    },
    respondWith(promise) {
      this.responded = promise;
    },
  };
}

function fetchEvent(
  request: { url: string; method?: string; mode?: string } = {
    url: `${ORIGIN}/api/tracks`,
  },
): TestEvent {
  return {
    request: {
      url: request.url,
      method: request.method ?? "GET",
      mode: request.mode ?? "cors",
    },
    waits: [],
    responded: null,
    waitUntil(promise) {
      this.waits.push(promise);
    },
    respondWith(promise) {
      this.responded = promise;
    },
  };
}

async function settle(event: TestEvent): Promise<Response | undefined> {
  const response = event.responded ? await event.responded : undefined;
  await Promise.all(event.waits);
  return response;
}

function createHarness(
  initialCaches: Record<string, Record<string, string>> = {},
  fetchImpl: (request: unknown) => Promise<Response> = async () => new Response("network"),
): Harness {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, CacheStore>();
  for (const [name, entries] of Object.entries(initialCaches)) {
    stores.set(name, createStore(entries));
  }

  const deleted: string[] = [];
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn(async () => undefined);
  const self = {
    location: { origin: ORIGIN },
    clients: { claim },
    skipWaiting,
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, listener);
    },
  };

  const open = async (name: string): Promise<CacheStore> => {
    let store = stores.get(name);
    if (!store) {
      store = createStore();
      stores.set(name, store);
    }
    return store;
  };

  const caches = {
    open: vi.fn(open),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);
      return stores.delete(name);
    }),
    match: vi.fn(async (request: unknown) => {
      const key = pathOf(request);
      for (const store of stores.values()) {
        const found = store.entries.get(key);
        if (found) {
          return found.clone();
        }
      }
      return undefined;
    }),
  };

  const fetchMock = vi.fn(fetchImpl);
  const context = vm.createContext({ self, caches, fetch: fetchMock, Response, URL });
  new vm.Script(template).runInContext(context);

  const harness: Harness = {
    listeners,
    stores,
    deleted,
    fetch: fetchMock,
    claim,
    skipWaiting,
    caches,
  };
  return harness;
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness(
    {
      [CACHE_VERSION]: {
        "/index.html": "cached-shell",
        "/assets/index-abc.js": "cached-asset",
      },
      "mp-old": { "/assets/old.js": "old-chunk" },
      legacy: { "/legacy.js": "legacy" },
    },
    async (request) => new Response(`network:${pathOf(request)}`),
  );
});

describe("service worker template", () => {
  it("precaches the shell and hashed assets without skipping waiting", async () => {
    const event = lifecycleEvent();
    harness.listeners.get("install")?.(event);
    await Promise.all(event.waits);

    const store = harness.stores.get(CACHE_VERSION);
    expect(store?.addAll).toHaveBeenCalledWith(
      expect.arrayContaining(["/", "/index.html", "/manifest.webmanifest", ...PRECACHE]),
    );
    expect(harness.skipWaiting).not.toHaveBeenCalled();
  });

  it("keeps older mp-* caches for open tabs and deletes legacy caches", async () => {
    const event = lifecycleEvent();
    harness.listeners.get("activate")?.(event);
    await Promise.all(event.waits);

    expect(harness.deleted).toEqual(["legacy"]);
    expect(harness.stores.has("mp-old")).toBe(true);
    expect(harness.claim).toHaveBeenCalled();
  });

  it("serves a cached catalogue when the network-first request fails", async () => {
    const online = fetchEvent({ url: `${ORIGIN}/api/tracks` });
    harness.listeners.get("fetch")?.(online);
    const fresh = await settle(online);
    expect(await fresh?.text()).toBe("network:/api/tracks");
    expect(
      await harness.stores.get(CACHE_VERSION)?.entries.get("/api/tracks")?.clone().text(),
    ).toBe("network:/api/tracks");

    harness.fetch.mockRejectedValue(new Error("offline"));
    const offline = fetchEvent({ url: `${ORIGIN}/api/tracks` });
    harness.listeners.get("fetch")?.(offline);
    expect(await (await settle(offline))?.text()).toBe("network:/api/tracks");
  });

  it("returns a network error instead of a fake catalogue when nothing is cached", async () => {
    harness.fetch.mockRejectedValue(new Error("offline"));
    const event = fetchEvent({ url: `${ORIGIN}/charts/missing.json` });
    harness.listeners.get("fetch")?.(event);
    const response = await settle(event);
    expect(response?.type).toBe("error");
  });

  it("falls back to the shell for offline navigation", async () => {
    harness.fetch.mockRejectedValue(new Error("offline"));
    const event = fetchEvent({ url: `${ORIGIN}/#/history`, mode: "navigate" });
    harness.listeners.get("fetch")?.(event);
    expect(await (await settle(event))?.text()).toBe("cached-shell");
  });

  it("serves hashed assets cache-first and fills the cache on a miss", async () => {
    const hit = fetchEvent({ url: `${ORIGIN}/assets/index-abc.js` });
    harness.listeners.get("fetch")?.(hit);
    expect(await (await settle(hit))?.text()).toBe("cached-asset");
    expect(harness.fetch).not.toHaveBeenCalled();

    const miss = fetchEvent({ url: `${ORIGIN}/assets/History-def.js` });
    harness.listeners.get("fetch")?.(miss);
    expect(await (await settle(miss))?.text()).toBe("network:/assets/History-def.js");
    expect(
      await harness.stores
        .get(CACHE_VERSION)
        ?.entries.get("/assets/History-def.js")
        ?.clone()
        .text(),
    ).toBe("network:/assets/History-def.js");
  });

  it("leaves unrelated API and non-GET requests to the network", async () => {
    const api = fetchEvent({ url: `${ORIGIN}/api/private` });
    harness.listeners.get("fetch")?.(api);
    expect(api.responded).toBeNull();

    const post = fetchEvent({ url: `${ORIGIN}/api/tracks`, method: "POST" });
    harness.listeners.get("fetch")?.(post);
    expect(post.responded).toBeNull();
  });
});
