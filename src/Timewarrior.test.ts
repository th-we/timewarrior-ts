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

// Not implemented: test("config", () => {});

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

test("split", () => {
  const tags = new Set(["foo"]);
  const interval = timewarrior.track(dates[0], dates[1], tags);
  const oldDuration = interval.duration;
  const annotation = "my annotation";
  interval.annotation = annotation;
  const [interval1, interval2] = interval.split();
  expect(interval1.start.getTime()).toBe(dates[0].getTime());
  expect(interval2.end!.getTime()).toBe(dates[1].getTime());
  expect(interval1.duration * 2).toBe(oldDuration);
  expect(interval2.duration * 2).toBe(oldDuration);
  expect(interval1.annotation).toBe(annotation);
  expect(interval2.annotation).toBe(annotation);
  expect(interval1.tags).toEqual(tags);
});

test("duration", async function () {
  // Younger interval
  const interval1 = timewarrior.track(dates[4], dates[5]);
  // Older interval
  const interval2 = timewarrior.track(dates[2], dates[3], ["tag2", "tag3"]);

  const tooLongDuration =
    (interval1.start.getTime() - interval2.start.getTime()) / 1000 + 1;
  expect(() => (interval2.duration = tooLongDuration)).toThrow();

  const newDuration = interval2.duration + 1;
  interval2.duration += 1;
  expect(interval2.duration).toEqual(newDuration);

  timewarrior.start();
  const activeInterval = timewarrior.activeInterval()!;
  // Changing duration of active interval must fail
  expect(() => (activeInterval.duration += 1)).toThrow();

  await timewarrior.asyncStop();
  // Just to be sure:
  expect(timewarrior.activeInterval()).toBe(undefined);

  const lastInterval = timewarrior.getTracked(1);
  const oldEnd = lastInterval.end!;
  lastInterval.duration += 1;
  expect(lastInterval.end!.getTime()).toBeGreaterThan(oldEnd.getTime());
});

test("tags", () => {
  timewarrior.start();
  timewarrior.activeInterval()!.tag("foo");
  expect(timewarrior.activeInterval()!.tags).toEqual(new Set(["foo"]));
  timewarrior.activeInterval()!.tag(["bar", "baz", "boz"]);
  expect(timewarrior.activeInterval()!.tags).toEqual(new Set(["foo", "bar", "baz", "boz"]));
  timewarrior.activeInterval()!.untag("foo");
  expect(timewarrior.activeInterval()!.tags).toEqual(new Set(["bar", "baz", "boz"]));
  timewarrior.activeInterval()!.untag(["bar", "baz"]);
  expect(timewarrior.activeInterval()!.tags).toEqual(new Set(["boz"]));
});

test("modfiy", () => {
  timewarrior.track(dates[0], dates[1]);

  const newStart = dates[0].getTime() - 1000;
  timewarrior.getTracked(1).start = newStart;
  // start time is modified
  expect(timewarrior.getTracked(1).start.getTime()).toBe(newStart);
  // end time is untouched
  expect(timewarrior.getTracked(1).end!.getTime()).toBe(dates[1].getTime());

  const newEnd = dates[1].getTime() + 1000;
  timewarrior.getTracked(1).end = newEnd;
  // end time is modified
  expect(timewarrior.getTracked(1).end!.getTime()).toBe(newEnd);
  // start time is untouched
  expect(timewarrior.getTracked(1).start.getTime()).toBe(newStart);
});

test("move", () => {
  timewarrior.track(dates[0], dates[1]);
  const diff = 10000;
  const newStart = dates[0].getTime() + diff;
  const newEnd = dates[1].getTime() + diff;
  timewarrior.getTracked(1).move(newStart);
  expect(timewarrior.getTracked(1).start.getTime()).toBe(newStart);
  expect(timewarrior.getTracked(1).end!.getTime()).toBe(newEnd);
});
