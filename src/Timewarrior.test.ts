import Timewarrior from "./Timewarrior";
import os from "os";
import fs from "fs";
import path from "path";

let timewarrior = new Timewarrior();

beforeEach(() => {
  const timewarriordb = fs.mkdtempSync(
    path.join(os.tmpdir(), "timewarrior-test-")
  );
  timewarrior = new Timewarrior({ timewarriordb });
});

test("Timewarrior constructor", () => {
  expect(timewarrior.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test("continue", async () => {
  const tags = ["tag1", "tag2"];
  const annot = "my annotation";
  timewarrior.start(tags, annot);
  await timewarrior.stop();
  const interval = timewarrior.getTracked(1).continue();
  expect(interval?.tags).toEqual(tags);
  expect(interval?.annotation).toEqual(annot);
});
