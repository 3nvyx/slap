// Online devices and their active class, end to end against the real database: REST routes (no sign-in and no
// pairing; an online device is listed for every caller), the /ws/device protocol from a fake device, and session
// start/stop with the mock STT.
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
const KEY1 = `devtest-key1-${run}`, KEY2 = `devtest-key2-${run}`;
const userA = `devtest-a-${run}`, userB = `devtest-b-${run}`;

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
    LLM_BACKEND: "mock", FISH_DIARIZE: "0", DEVICE_KEYS: [KEY1, KEY2].join(","), PUBLIC_URL: "http://slap.test",
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
  await db.delete(schema.devices).where(inArray(schema.devices.deviceKey, [KEY1, KEY2]));
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
function fakeDevice(key: string, id = `devtest-${key.slice(-6)}`) {
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
    hello: async () => { await opened; ws.send(JSON.stringify({ type: "hello", deviceId: id, fw: "test" })); },
    press: () => ws.send(JSON.stringify({ type: "button", button: "slap" })),
    close: () => ws.close(),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const same = (a: Uint8Array | null, b: Uint8Array) => !!a && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
let deviceId = "";
const listed = async (user: string, id: string) => (await call(user, "GET", "/api/devices")).data.find((d: { id: string }) => d.id === id);
let device: ReturnType<typeof fakeDevice>;

test("a device that connects is listed for every caller at once, with no active class", { skip }, async () => {
  device = fakeDevice(KEY1);
  await device.hello();
  const st = await device.until((s, f) => s.state === "idle" && same(f, m.oled.renderPickCourse()), "idle 'pick a course' screen");
  assert.equal(st.classCode, undefined);
  assert.equal(st.message, m.oled.PICK_COURSE);

  const name = `devtest-${KEY1.slice(-6)}`;
  const all = (await call(userA, "GET", "/api/devices")).data as { id: string; name: string }[];
  const mine = all.find(d => d.name === name);
  assert.ok(mine, "the device is listed without any pairing step");
  deviceId = mine.id;
  assert.deepEqual(mine, { id: deviceId, name, activeClass: null, state: "idle" });
  assert.deepEqual(await listed(userB, deviceId), mine, "devices are shared: another caller sees the same device");
  assert.equal((await call(userA, "POST", "/api/devices/pair", { pairCode: "ABC123" })).status, 404, "the pair route is gone");
});

test("a device start with no active class is ignored", { skip }, async () => {
  const before = device.states.length;
  device.press();
  await sleep(1500);
  assert.ok(device.states.slice(before).every(s => s.state === "idle"), JSON.stringify(device.states.slice(before)));
  for (const c of [cls.c1, cls.c2]) {
    const d = await call(userA, "GET", `/api/classes/${c.id}`);
    assert.ok(!d.data.lectures.some((l: { status: string }) => l.status === "live"), "no lecture was started");
    assert.equal(d.data.device, null, "no device points at this class yet");
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
  assert.deepEqual(d.data.device, { id: deviceId, name: `devtest-${KEY1.slice(-6)}`, state: "idle" });
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

test("a device that goes offline is no longer listed; it comes back with its active class", { skip }, async () => {
  device.close();
  for (let i = 0; i < 40 && await listed(userA, deviceId); i++) await sleep(100);
  assert.equal(await listed(userA, deviceId), undefined, "an offline device is not listed");
  assert.equal((await call(userA, "GET", `/api/classes/${cls.c2.id}`)).data.device, null);
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c1.id })).status, 404, "nor switchable");

  device = fakeDevice(KEY1, `devtest-other-${run}`);
  await device.hello();
  await device.until(s => s.state === "idle" && s.classCode === cls.c2.code, "idle in c2 again");
  const back = await listed(userB, deviceId);
  assert.equal(back.activeClass.id, cls.c2.id);
  assert.equal(back.name, `devtest-other-${run}`, "listed under the id it announced this time");
  device.close();
});

test("a web start with every online device recording elsewhere is refused; with none online it starts for the browser", { skip }, async () => {
  const d2 = fakeDevice(KEY2);
  await d2.hello();
  await d2.until(s => s.state === "idle", "idle");
  const id2 = ((await call(userA, "GET", "/api/devices")).data as { id: string; name: string }[]).find(d => d.name === `devtest-${KEY2.slice(-6)}`)!.id;
  assert.equal((await call(userB, "POST", `/api/devices/${id2}/active-class`, { classId: cls.c3.id })).status, 200);
  await d2.until(s => s.state === "idle" && s.classCode === cls.c3.code, "idle with c3");
  d2.press();
  const rec = await d2.until(s => s.state === "recording" && !!s.sessionId, "recording c3");
  assert.equal((await call(userA, "POST", `/api/classes/${cls.c1.id}/sessions/start`, {})).status, 409, "the only online device is busy");
  assert.equal((await call(userA, "POST", `/api/lectures/${rec.sessionId}/stop`)).status, 200);
  await d2.until(s => s.state === "idle", "idle after stop");
  d2.close();
  for (let i = 0; i < 40 && await listed(userA, id2); i++) await sleep(100);

  const r = await call(userA, "POST", `/api/classes/${cls.c1.id}/sessions/start`, { title: "No device" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, r.data.id));
  assert.equal(row!.deviceId, null);
  assert.equal(row!.source, "browser");
  assert.equal((await call(userA, "POST", `/api/lectures/${r.data.id}/stop`)).status, 200);
});
