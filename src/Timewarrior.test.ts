import Timewarrior from "./Timewarrior";
import os from "os";
import fs from "fs";
import path from "path";

let timewarrior = new Timewarrior();

const dummyRange = [
  new Date("2002-02-02T02:02:02Z"),
  new Date("2002-02-02T02:02:20Z"),
];

beforeEach(() => {
  const timewarriordb = fs.mkdtempSync(
    path.join(os.tmpdir(), "timewarrior-test-")
  );
  timewarrior = new Timewarrior({ timewarriordb });
});

test("Timewarrior constructor", () => {
  expect(timewarrior.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test("cancel()", () => {
  const start = timewarrior.start().start;
  expect(timewarrior.activeInterval()).not.toBe(undefined);
  expect(timewarrior.export([start]).length).toBe(1);
  timewarrior.cancel();
  expect(timewarrior.activeInterval()).toBe(undefined);
  expect(timewarrior.export([start]).length).toBe(0);
});


test("track(), continue() and property interval", () => {
  const taglist = ["tag1", "tag2"];
  const annot = "my annotation";

  timewarrior.track(dummyRange[0], dummyRange[1], taglist).annotation = annot;
  const interval = timewarrior.getTracked(1).continue();
  expect(interval.tags).toEqual(taglist);
  expect(interval.annotation).toEqual(annot);
  expect(interval.end).toBe(undefined);
});

test("delete", () => {
  const interval = timewarrior.track(dummyRange[0], dummyRange[1]);
  const start = interval.start;
  expect(timewarrior.export([start]).length).toBe(1);
  interval.delete();
  expect(timewarrior.export([start]).length).toBe(0);
});
