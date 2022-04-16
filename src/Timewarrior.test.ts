import Timewarrior from "./Timewarrior";

test("Timewarrior constructor", () => {
  const timewarrior = new Timewarrior();
  expect(timewarrior.version).toMatch(/^\d+\.\d+\.\d+$/);
});
