// Devices end to end against the real database: a device that connects records at once into the inbox (no
// pairing, no course to pick), its captions follow the language it asks for, a press ends and saves the
// recording, and the app puts it into a course. REST routes, the /ws/device protocol from a fake device, mock STT.
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
  if (recordings.length) await db.delete(schema.lectures).where(inArray(schema.lectures.id, recordings));   // the ones left in the shared inbox
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
    hello: async (wake?: string) => { await opened; ws.send(JSON.stringify({ type: "hello", deviceId: id, fw: "test", ...(wake ? { wake } : {}) })); },
    press: () => ws.send(JSON.stringify({ type: "button", button: "boot" })),
    lang: (lang: string) => ws.send(JSON.stringify({ type: "lang", lang })),
    /** Loud audio, sent at once: the mock STT replays one sentence of its fixture per 4 s of it. */
    audio: (seconds: number) => {
      const pcm = Buffer.alloc(3200);
      for (let i = 0; i < 1600; i++) pcm.writeInt16LE(i % 40 < 20 ? 9000 : -9000, i * 2);
      for (let i = 0; i < seconds * 10; i++) ws.send(pcm);
    },
    close: () => ws.close(),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const same = (a: Uint8Array | null, b: Uint8Array) => !!a && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const recordings: string[] = [];   // every lecture a fake device started, for cleanup
let deviceId = "";
const listed = async (user: string, id: string) => (await call(user, "GET", "/api/devices")).data.find((d: { id: string }) => d.id === id);
const inInbox = async (id: string) => (await call(userA, "GET", "/api/inbox")).data.find((l: { id: string }) => l.id === id);
let device: ReturnType<typeof fakeDevice>;
let first = "";

test("a device that connects records at once into the inbox and is listed for every caller", { skip }, async () => {
  device = fakeDevice(KEY1);
  await device.hello();
  const rec = await device.until(s => s.state === "recording" && !!s.sessionId, "recording straight after hello");
  first = rec.sessionId!;
  recordings.push(first);
  assert.equal(rec.classCode, undefined, "no course is involved");
  const mine = ((await call(userA, "GET", "/api/devices")).data as { id: string; name: string }[]).find(d => d.name === `devtest-${KEY1.slice(-6)}`)!;
  deviceId = mine.id;
  const theirs = await listed(userB, deviceId);
  assert.deepEqual({ state: theirs.state, activeClass: theirs.activeClass, lectureId: theirs.lectureId }, { state: "recording", activeClass: null, lectureId: first });
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, first));
  assert.equal(row!.deviceId, deviceId);
  assert.equal(row!.source, "device");
  assert.equal((await inInbox(first)).status, "live");
  const classes = (await call(userA, "GET", "/api/classes")).data as { code: string }[];
  assert.ok(!classes.some(c => c.code === "INBOX"), "the inbox is not listed as a course");
  assert.equal((await call(userA, "POST", "/api/devices/pair", { pairCode: "ABC123" })).status, 404, "the pair route is gone");
});

test("a language message shows the language name, then captions carry on in it", { skip }, async () => {
  device.lang("vi");
  await device.until((_, f) => same(f, m.oled.renderLanguage("vi")), "the Vietnamese banner");
  await device.until((s, f) => s.state === "recording" && !same(f, m.oled.renderLanguage("vi")), "captions again", 4000);
  device.lang("xx");   // unknown: ignored
  device.audio(9);
  for (let i = 0; i < 60 && !(await inInbox(first))?.preview; i++) await sleep(150);
  assert.ok((await inInbox(first)).preview.length > 10, "the mock transcript reached the recording");
});

test("a press ends the recording: the device shows Saved and the transcript waits in the inbox", { skip }, async () => {
  await sleep(1100);   // button debounce
  device.press();
  await device.until((s, f) => s.state === "idle" && !!f, "idle after the stop");
  for (let i = 0; i < 40 && (await inInbox(first))?.status !== "ended"; i++) await sleep(100);   // the database follows the device
  const saved = await inInbox(first);
  assert.equal(saved.status, "ended");
  assert.ok(saved.durationS > 0 && saved.preview.length > 10);
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, first));
  assert.equal(row!.status, "ended", "no study bundle until it is in a course");
  assert.equal((await listed(userA, deviceId)).state, "idle");
});

test("the app puts a saved recording into a course, once", { skip }, async () => {
  const r = await call(userB, "POST", `/api/lectures/${first}/assign`, { classId: cls.c1.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.classId, cls.c1.id);
  assert.equal(r.data.title, "Lecture 1");
  assert.ok(["processing", "ready", "ended"].includes(r.data.status));
  assert.equal(await inInbox(first), undefined);
  const c1 = await call(userA, "GET", `/api/classes/${cls.c1.id}`);
  assert.ok(c1.data.lectures.some((l: { id: string }) => l.id === first));
  assert.equal((await call(userA, "POST", `/api/lectures/${first}/assign`, { classId: cls.c2.id })).status, 409, "already in a course");
  assert.equal((await call(userA, "POST", `/api/lectures/${first}/assign`, { classId: crypto.randomUUID() })).status, 404);
});

test("a recording can be put into a course while it runs; the device then belongs to that course", { skip }, async () => {
  await sleep(1100);
  device.press();   // start again without reconnecting
  const rec = await device.until(s => s.state === "recording" && !!s.sessionId && s.sessionId !== first, "a second recording");
  recordings.push(rec.sessionId!);
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c2.id })).status, 200);
  await device.until(s => s.state === "recording" && s.classCode === cls.c2.code, "recording into c2");
  assert.equal((await listed(userB, deviceId)).activeClass.id, cls.c2.id);
  const d = await call(userA, "GET", `/api/classes/${cls.c2.id}`);
  assert.equal(d.data.lectures.find((l: { status: string }) => l.status === "live")?.id, rec.sessionId);
  assert.equal(d.data.device.state, "recording");
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c3.id })).status, 409, "it is recording another course");
  assert.equal((await call(userA, "POST", `/api/classes/${cls.c3.id}/sessions/start`, {})).status, 409, "the only online device is busy");
  assert.equal((await call(userA, "POST", `/api/lectures/${rec.sessionId}/stop`)).status, 200);
  const idle = await device.until(s => s.state === "idle", "idle after the stop");
  assert.equal(idle.classCode, undefined);
});

test("a web start takes over what a device is recording into the inbox; nothing said and no course leaves nothing behind", { skip }, async () => {
  const d2 = fakeDevice(KEY2);
  await d2.hello();
  const rec = await d2.until(s => s.state === "recording" && !!s.sessionId, "recording");
  recordings.push(rec.sessionId!);
  const r = await call(userA, "POST", `/api/classes/${cls.c3.id}/sessions/start`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.id, rec.sessionId, "the device's recording became the course's lecture");
  await d2.until(s => s.classCode === cls.c3.code, "recording into c3");
  assert.equal((await call(userA, "POST", `/api/lectures/${rec.sessionId}/stop`)).status, 200);
  await d2.until(s => s.state === "idle", "idle");

  await sleep(1100);
  d2.press();
  const empty = await d2.until(s => s.state === "recording" && !!s.sessionId && s.sessionId !== rec.sessionId, "an inbox recording");
  await sleep(1100);
  d2.press();
  await d2.until(s => s.state === "idle", "idle");
  for (let i = 0; i < 40 && (await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, empty.sessionId!))).length; i++) await sleep(100);
  assert.equal(await inInbox(empty.sessionId!), undefined, "an empty recording is dropped");
  d2.close();
});

test("a device that goes offline is no longer listed; with none online a web start records from the browser", { skip }, async () => {
  device.close();
  for (let i = 0; i < 40 && await listed(userA, deviceId); i++) await sleep(100);
  assert.equal(await listed(userA, deviceId), undefined, "an offline device is not listed");
  assert.equal((await call(userA, "POST", `/api/devices/${deviceId}/active-class`, { classId: cls.c1.id })).status, 404);
  const ids = ((await call(userA, "GET", "/api/devices")).data as { name: string }[]).filter(d => d.name?.startsWith("devtest-"));
  for (let i = 0; i < 40 && ids.length && (await call(userA, "GET", "/api/devices")).data.some((d: { name: string }) => d.name?.startsWith("devtest-")); i++) await sleep(100);
  const r = await call(userA, "POST", `/api/classes/${cls.c1.id}/sessions/start`, { title: "No device" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, r.data.id));
  assert.equal(row!.deviceId, null);
  assert.equal(row!.source, "browser");
  assert.equal((await call(userA, "POST", `/api/lectures/${r.data.id}/stop`)).status, 200);
});

test("a device that was only powered up waits; a shake starts it, and a shake while recording does not stop it", { skip }, async () => {
  const id = `devtest-shake-${run}`;
  const d = fakeDevice(KEY2, id);
  await d.hello("power");
  await d.until((st, f) => st.state === "idle" && same(f, m.oled.renderStandby()), "waiting for a shake");
  assert.equal(await m.dev.triggerUsbSlap("no-such-device"), false);
  assert.equal(await m.dev.triggerUsbSlap(id), true);
  const rec = await d.until(st => st.state === "recording" && !!st.sessionId, "recording after the shake");
  recordings.push(rec.sessionId!);
  await sleep(1100);
  assert.equal(await m.dev.triggerUsbSlap(id), true);
  await sleep(300);
  assert.deepEqual({ state: d.last()!.state, sessionId: d.last()!.sessionId }, { state: "recording", sessionId: rec.sessionId }, "still the same recording");
  // Reset in the middle of the recording: it comes back powered up, and the recording it left is ended, not kept live.
  d.close();
  const again = fakeDevice(KEY2, id);
  await again.hello("power");
  await again.until(st => st.state === "idle", "idle after the reset");
  for (let i = 0; i < 40; i++) {
    const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, rec.sessionId!));
    if (!row || row.status !== "live") break;
    await sleep(100);
  }
  const [row] = await m.db.db.select().from(m.db.schema.lectures).where(m.dz.eq(m.db.schema.lectures.id, rec.sessionId!));
  assert.ok(!row || row.status !== "live", "the recording it left is closed");

  // A link that drops and comes back: recording carries on in the same lecture; waiting stays waiting.
  again.close();
  const back = fakeDevice(KEY2, id);
  await back.hello("reconnect");
  await back.until(st => st.state === "idle", "still waiting after a reconnect");
  assert.equal(await m.dev.triggerUsbSlap(id), true);
  const second = await back.until(st => st.state === "recording" && !!st.sessionId, "recording");
  recordings.push(second.sessionId!);
  back.close();
  const resumed = fakeDevice(KEY2, id);
  await resumed.hello("reconnect");
  const cont = await resumed.until(st => st.state === "recording", "recording again after the drop");
  assert.equal(cont.sessionId, second.sessionId);
  await sleep(1100);
  resumed.press();
  await resumed.until(st => st.state === "idle", "idle after the stop");
  resumed.close();
});
