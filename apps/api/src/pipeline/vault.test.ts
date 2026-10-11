// Obsidian vault export: note files with [[links]], safe names, the index; and the store-only zip writer.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Concept } from "@slap/contracts";
import { buildVault, lectureNoteName, noteName } from "./vault.ts";
import { crc32, zipStore } from "./zip.ts";

const concept = (id: string, name: string, extra: Partial<Concept> = {}): Concept => ({
  id, classId: "c", slug: id, name, definition: `${name} defined.`, emphasis: 0.5, examFlag: false, mentionCount: 1, source: "lecture", mastery: null, ...extra,
});

test("noteName strips path and wikilink characters", () => {
  assert.equal(noteName('Bayes: "rule" [v2] / #1 | x?'), "Bayes rule v2 1 x");
  assert.equal(noteName("   "), "Untitled");
  assert.equal(lectureNoteName({ date: "2026-10-08", title: "Lecture 2: GLMs" }), "2026-10-08 Lecture 2 GLMs");
});

test("buildVault: concept notes link related concepts and lectures, lecture notes list their concepts, index lists all", () => {
  const files = buildVault({
    className: "CS229 Machine Learning", classCode: "CS229", exportedAt: new Date("2026-10-10T12:00:00Z"),
    concepts: [
      concept("gd", "Gradient descent", { examFlag: true, examQuote: "This will be on the exam.", emphasis: 0.9, mastery: 0.4 }),
      concept("lr", "Learning rate"),
      concept("lr2", "Learning/rate"),   // sanitises to the same name: gets a suffix
    ],
    links: [{ from: "gd", to: "lr", relation: "uses" }, { from: "gd", to: "nope", relation: "x" }],
    mentions: [{ conceptId: "gd", lectureId: "l1", start: 61, excerpt: "gradient descent takes a step" }],
    lectures: [{ id: "l1", title: "Lecture 1: Intro", date: "2026-10-01", summary: "Steps.", sections: [{ title: "Setup", start: 0, end: 60, summary: "The rule.", conceptSlugs: ["gd"] }], announcements: [{ kind: "deadline", text: "PS1 Friday", when: "2026-10-17" }] }],
  });
  const byPath = new Map(files.map(f => [f.path, f.data]));
  assert.deepEqual([...byPath.keys()].sort(), ["CS229 Machine Learning.md", "Concepts/Gradient descent.md", "Concepts/Learning rate 2.md", "Concepts/Learning rate.md", "Lectures/2026-10-01 Lecture 1 Intro.md"]);

  const gd = byPath.get("Concepts/Gradient descent.md")!;
  assert.match(gd, /^---\nslug: gd\n/);
  assert.match(gd, /exam: true\nmastery: 0.40\n/);
  assert.match(gd, /# Gradient descent\n\nGradient descent defined\./);
  assert.match(gd, /## The lecturer said\n\n> This will be on the exam\./);
  assert.match(gd, /## Related\n\n- \[\[Learning rate\]\]\n/);
  assert.doesNotMatch(gd, /nope/, "links to unknown concepts are dropped");
  assert.match(gd, /## Where it came up\n\n- \[\[2026-10-01 Lecture 1 Intro\]\] at 1:01: …gradient descent takes a step…/);

  const lr = byPath.get("Concepts/Learning rate.md")!;
  assert.match(lr, /## Related\n\n- \[\[Gradient descent\]\]/, "links are symmetric");
  assert.doesNotMatch(lr, /## Where it came up/);

  const lec = byPath.get("Lectures/2026-10-01 Lecture 1 Intro.md")!;
  assert.match(lec, /# Lecture 1: Intro\n\nSteps\.\n\n## Outline\n\n### 0:00 Setup\n\nThe rule\./);
  assert.match(lec, /## Announcements\n\n- \*\*deadline\*\* \(2026-10-17\): PS1 Friday/);
  assert.match(lec, /## Concepts\n\n- \[\[Gradient descent\]\] \(exam\)/);

  const index = byPath.get("CS229 Machine Learning.md")!;
  assert.match(index, /Exported from Slap \(CS229\) on 2026-10-10\. 3 concepts, 1 lectures\./);
  assert.match(index, /## Lectures\n\n- \[\[2026-10-01 Lecture 1 Intro\]\]/);
  assert.match(index, /## Concepts by emphasis\n\n- \[\[Gradient descent\]\] \(exam\)\n- \[\[Learning rate\]\]\n- \[\[Learning rate 2\]\]/);
});

test("zipStore: valid store-only archive (signatures, CRCs, central directory, EOCD)", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926, "CRC-32 check value");
  const zip = zipStore([{ path: "a.md", data: "hello" }, { path: "Concepts/ü.md", data: Buffer.from([1, 2, 3]) }], new Date(2026, 9, 10, 12, 0, 0));
  assert.equal(zip.readUInt32LE(0), 0x04034b50, "local header");
  assert.equal(zip.readUInt16LE(8), 0, "method store");
  assert.equal(zip.readUInt32LE(14), crc32(Buffer.from("hello")));
  assert.equal(zip.readUInt32LE(18), 5);
  assert.equal(zip.subarray(30, 34).toString(), "a.md");
  assert.equal(zip.subarray(34, 39).toString(), "hello");
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50, "end of central directory");
  assert.equal(zip.readUInt16LE(eocd + 10), 2, "two entries");
  const cdOffset = zip.readUInt32LE(eocd + 16);
  assert.equal(zip.readUInt32LE(cdOffset), 0x02014b50, "central directory");
  assert.equal(zip.readUInt32LE(cdOffset + 42), 0, "first local header offset");
  const second = zip.readUInt32LE(cdOffset + 46 + 4 + 42);
  assert.equal(zip.readUInt32LE(second), 0x04034b50);
  assert.equal(zip.subarray(second + 30, second + 30 + Buffer.byteLength("Concepts/ü.md")).toString(), "Concepts/ü.md");
});
