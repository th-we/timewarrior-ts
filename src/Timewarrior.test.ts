import Timewarrior from "./Timewarrior";
import os from "os";
import fs from "fs";
import path from "path";

let timewarrior = new Timewarrior();

/**
 * Some dates in ascending order that we can use for ranges
 */
const dates = [
  new Date("2000-01-01T00:00:00Z"),
  new Date("2000-01-02T00:00:00Z"),
  new Date("2000-01-03T00:00:00Z"),
  new Date("2000-01-04T00:00:00Z"),
  new Date("2000-01-05T00:00:00Z"),
  new Date("2000-01-06T00:00:00Z"),
  new Date("2000-01-07T00:00:00Z"),
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

  timewarrior.track(dates[0], dates[1], taglist).annotation = annot;
  const interval = timewarrior.getTracked(1).continue();
  expect(interval.tags).toEqual(taglist);
  expect(interval.annotation).toEqual(annot);
  expect(interval.end).toBe(undefined);
});

test("delete", () => {
  const interval = timewarrior.track(dates[0], dates[1]);
  const start = interval.start;
  expect(timewarrior.export([start]).length).toBe(1);
  interval.delete();
  expect(timewarrior.export([start]).length).toBe(0);
});

test("export", () => {
  const range = [dates[0], dates[1]] as [Date, Date];
  timewarrior.track(dates[0], dates[1]);
  expect(timewarrior.export([dates[0]]).length).toBe(1);
  expect(timewarrior.export(range).length).toBe(1);
  timewarrior.start();
  expect(timewarrior.export([dates[0]]).length).toBe(2);
  expect(timewarrior.export([dates[1]]).length).toBe(1);
  expect(timewarrior.export(range).length).toBe(1);
});


test("join", () => {
  const interval1 = timewarrior.track(dates[4], dates[5]);
  const interval2 = timewarrior.track(dates[2], dates[3], ["tag2", "tag3"]);
  const interval3 = timewarrior.track(dates[0], dates[1], ["tag1", "tag2"]);

  expect(() => {
    interval1.join(interval3.id);
  }).toThrow();

  const interval12 = interval3.join(interval2);
  expect(new Set(interval12.tags)).toEqual(new Set(["tag1", "tag2", "tag3"]));
  expect(interval12.start).toEqual(dates[0]);
  expect(interval12.end).toEqual(dates[3]);

  const interval13 = interval1.join(2);
  expect(new Set(interval13.tags)).toEqual(new Set(["tag1", "tag2", "tag3"]));
});
