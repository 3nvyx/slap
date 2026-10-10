// Device pairing and active class, end to end against the real database: REST routes (no sign-in; devices are
// shared by every caller), the /ws/device protocol from a fake device, and session start/stop with the mock STT.
// Seeds throwaway classes and device rows and deletes them afterwards; skipped without DATABASE_URL.
// The database is shared, so other devices and classes exist: assertions look only at this run's rows.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { ServerToDevice } from "@slap/contracts";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

const run = Date.now().toString(36).toUpperCase();
const KEY1 = `devtest-key1-${run}`, KEY2 = `devtest-key2-${run}`, KEY3 = `devtest-key3-${run}`;
const userA = `devtest-a-${run}`, userB = `devtest-b-${run}`;
const pairCode = (n: number) => `T${run.slice(-4)}${n}`.slice(0, 6).toUpperCase();

let wsServer: http.Server, wsPort = 0;
let m: {
  app: typeof import("../server.ts")["app"]; db: typeof import("../db/index.ts"); dz: typeof import("drizzle-orm");
  oled: typeof import("../oled.ts"); dev: typeof import("../ws/device.ts"); WS: typeof import("ws").default;
};
const cls: Record<"c1" | "c2" | "c3", { id: string; code: string }> = { c1: { id: "", code: "" }, c2: { id: "", code: "" }, c3: { id: "", code: "" } };

before(async () => {
  if (!hasDb) return;
  Object.assign(process.env, {
    STT_BACKEND: "mock", TRANSLATE_BACKEND: "mock",
    LLM_BACKEND: "mock", FISH_DIARIZE: "0", DEVICE_KEYS: [KEY1, KEY2, KEY3].join(","), PUBLIC_URL: "http://slap.test",
  });

  const [server, db, dz, oled, dev, ws] = await Promise.all([
    import("../server.ts"), import("../db/index.ts"), import("drizzle-orm"), import("../oled.ts"), import("../ws/device.ts"), import("ws"),
  ]);
  m = { app: server.app, db, dz, oled, dev, WS: ws.default };
  wsServer = http.createServer();
  wsServer.on("upgrade", (req, sock, head) => { m.dev.handleDeviceUpgrade(req, sock, head).catch(() => sock.destroy()); });
  await new Promise<void>(r => wsServer.listen(0, "127.0.0.1", r));
  wsPort = (wsServer.address() as AddressInfo).port;

  const { schema } = db;
  const seed = async (key: keyof typeof cls, owner: string) => {
    const code = `DT${key.toUpperCase()}${run}`.slice(0, 16);
    const [c] = await db.db.insert(schema.classes).values({ name: `Device test ${key} (throwaway)`, code, ownerUserId: owner }).returning();
    cls[key] = { id: c!.id, code };
  };
  await seed("c1", userA);
  await seed("c2", userA);
  await seed("c3", userB);
});

after(async () => {
  if (!hasDb || !m) return;
  const { db, schema } = m.db;
  const { inArray } = m.dz;
  await db.delete(schema.devices).where(inArray(schema.devices.deviceKey, [KEY1, KEY2, KEY3]));
  const ids = Object.values(cls).map(c => c.id).filter(Boolean);
  if (ids.length) await db.delete(schema.classes).where(inArray(schema.classes.id, ids));
  wsServer?.close();
});

async function call<T = any>(user: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await m.app.request(path, {
    method, headers: { "x-slap-user": user, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: (await res.json()) as T };
}

/** A fake device on the real protocol: records every state message and the latest OLED frame. */
function fakeDevice(key: string, code: string) {
  const ws = new m.WS(`ws://127.0.0.1:${wsPort}/ws/device?key=${encodeURIComponent(key)}`);
  const states: Extract<ServerToDevice, { type: "state" }>[] = [];
  let frame: Buffer | null = null;
  let waiters: Array<() => void> = [];
  ws.on("message", (data, isBinary) => {
    if (isBinary) frame = data as Buffer;
    else {
      const msg = JSON.parse(data.toString()) as ServerToDevice;
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", t: msg.t }));
      else states.push(msg);
    }
    const w = waiters; waiters = []; w.forEach(f => f());
  });
  const last = () => states.at(-1);
  const until = async (pred: (s: Extract<ServerToDevice, { type: "state" }>, f: Buffer | null) => boolean, what: string, ms = 8000) => {
    const end = Date.now() + ms;
    while (!(last() && pred(last()!, frame))) {
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}; last state ${JSON.stringify(last())}`);
      await new Promise<void>(r => { waiters.push(r); setTimeout(r, 200); });
    }
    return last()!;
  };
  const opened = new Promise<void>((res, rej) => { ws.on("open", () => res()); ws.on("error", rej); });
  return {
    states, last, until, get frame() { return frame; },
    hello: async () => { await opened; ws.send(JSON.stringify({ type: "hello", deviceId: `devtest-${key.slice(-6)}`, fw: "test", pairCode: code })); },
    press: () => ws.send(JSON.stringify({ type: "button", button: "slap" })),
    close: () => ws.close(),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const same = (a: Uint8Array | null, b: Uint8Array) => !!a && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
let deviceId = "";
const listed = async (user: string, id: string) => (await call(user, "GET", "/api/devices")).data.find((d: { id: string }) => d.id === id);
let device: ReturnType<typeof fakeDevice>;

test("pairing: every caller then sees the device; with several classes and no classId it has no active class", { skip }, async () => {
  device = fakeDevice(KEY1, pairCode(1));
  await device.hello();
  await device.until(s => s.state === "unpaired" && s.message === `pair code ${pairCode(1)}`, "unpaired with its code");

  const r = await call(userA, "POST", "/api/devices/pair", { pairCode: pairCode(1).toLowerCase() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ownerUserId, userA);
  assert.equal(r.data.activeClassId, null, "more than one class exists: nothing picked");
  assert.equal(r.data.connected, true);
  deviceId = r.data.deviceId;

  const st = await device.until((s, f) => s.state === "idle" && same(f, m.oled.renderPickCourse()), "idle 'pick a course' screen");
  assert.equal(st.classCode, undefined);
  assert.equal(st.message, m.oled.PICK_COURSE);

  const mine = await listed(userA, deviceId);
  assert.equal(mine.activeClass, null);
  assert.equal(mine.connected, true);
  assert.equal(mine.state, "idle");
  assert.deepEqual(await listed(userB, deviceId), mine, "devices are shared: another caller sees the same device");
  assert.equal((await call(userA, "POST", "/api/devices/pair", { pairCode: pairCode(1) })).status, 404, "the code is used up");
});

test("a device start with no active class is ignored", { skip }, async () => {
  const before = device.states.length;
  device.press();
  await sleep(1500);
  assert.ok(device.states.slice(before).every(s => s.state === "idle"), JSON.stringify(device.states.slice(before)));
  for (const c of [cls.c1, cls.c2]) {
    const d = await call(userA, "GET", `/api/classes/${c.id}`);
    assert.ok(!d.data.lectures.some((l: { status: string }) => l.status === "live"), "no lecture was started");
    assert.equal(d.data.device.paired, false, "no device points at this class yet");
  }
});

test("switching the active class: any caller, existing class only; the device re-renders its idle screen at once", { skip }, async () => {
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: crypto.randomUUID() })).status, 404, "no such class");
  assert.equal((await call(userA, "POST", `/api/devices/${crypto.randomUUID()}/active-class`, { classId: cls.c1.id })).status, 404, "no such device");

  const r = await call(userB, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c1.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.activeClass, { id: cls.c1.id, name: "Device test c1 (throwaway)", code: cls.c1.code });
  const idle = m.oled.renderIdle(cls.c1.code, m.dev.joinUrl(cls.c1.code), true);
  await device.until((s, f) => s.state === "idle" && s.classCode === cls.c1.code && same(f, idle), "idle with c1's code");

  const d = await call(userA, "GET", `/api/classes/${cls.c1.id}`);
  assert.equal(d.data.device.paired, true);
  assert.equal(d.data.device.state, "idle");
  assert.equal(d.data.device.name, `devtest-${KEY1.slice(-6)}`);
});

test("a device start records into the active class; switching while recording is refused", { skip }, async () => {
  await sleep(1100);   // button debounce
  device.press();
  const rec = await device.until(s => s.state === "recording" && !!s.sessionId, "recording");
  const d = await call(userA, "GET", `/api/classes/${cls.c1.id}`);
  const live = d.data.lectures.find((l: { status: string }) => l.status === "live");
  assert.equal(live?.id, rec.sessionId);
  assert.equal(d.data.device.state, "recording");
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, rec.sessionId!));
  assert.equal(row!.deviceId, deviceId);
  assert.equal(row!.source, "device");

  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c2.id })).status, 409);
  assert.equal((await call(userA, "DELETE", `/api/devices/${deviceId}`)).status, 409);

  await sleep(1100);
  device.press();
  await device.until(s => s.state === "idle" && s.classCode === cls.c1.code, "idle after stop");
});

test("a web start for another class switches the connected idle device there and records", { skip }, async () => {
  const r = await call(userA, "POST", `/api/classes/${cls.c2.id}/sessions/start`, { title: "Web start" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.classId, cls.c2.id);
  const st = await device.until(s => s.state === "recording" && s.sessionId === r.data.id, "recording the web-started lecture");
  assert.equal(st.classCode, cls.c2.code);
  const mine = await listed(userA, deviceId);
  assert.equal(mine.activeClass.id, cls.c2.id);
  assert.equal(mine.state, "recording");

  const stop = await call(userA, "POST", `/api/lectures/${r.data.id}/stop`);
  assert.equal(stop.status, 200);
  await device.until(s => s.state === "idle" && s.classCode === cls.c2.code, "idle in c2");
});

test("unpairing shows a pair code again", { skip }, async () => {
  const r = await call(userB, "DELETE", `/api/devices/${deviceId}`);
  assert.equal(r.status, 200);
  await device.until((s, f) => s.state === "unpaired" && s.message === `pair code ${pairCode(1)}` && same(f, m.oled.renderUnpaired(pairCode(1))), "unpaired screen");
  assert.equal(await listed(userA, deviceId), undefined, "an unpaired device is not listed");
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c1.id })).status, 404, "nor switchable");
  device.close();
});

test("pairing with a classId sets the active class", { skip }, async () => {
  const d2 = fakeDevice(KEY2, pairCode(2));
  await d2.hello();
  await d2.until(s => s.state === "unpaired", "unpaired");
  assert.equal((await call(userB, "POST", "/api/devices/pair", { pairCode: pairCode(2), classId: crypto.randomUUID() })).status, 404, "no such class");
  const r = await call(userB, "POST", "/api/devices/pair", { pairCode: pairCode(2), classId: cls.c3.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.activeClassId, cls.c3.id);
  await d2.until(s => s.state === "idle" && s.classCode === cls.c3.code, "idle with c3");
  d2.close();
});

test("a device row with an active class but no owner counts as paired", { skip }, async () => {
  const { db, schema } = m.db;
  const [row] = await db.insert(schema.devices).values({ deviceKey: KEY3, name: "legacy", classId: cls.c1.id }).returning();
  assert.equal((await listed(userB, row!.id)).activeClass.code, cls.c1.code);

  const d3 = fakeDevice(KEY3, pairCode(3));
  await d3.hello();
  await d3.until(s => s.state === "idle" && s.classCode === cls.c1.code, "idle with c1 (no pairing needed)");
  const [after] = await db.select().from(schema.devices).where(m.dz.eq(schema.devices.id, row!.id));
  assert.equal(after!.ownerUserId, userA, "owner recorded on hello");
  assert.equal(after!.pairCode, null);
  d3.close();
});
