import mockTimewarrior from "./mockTimewarrior";

test("Timewarrior constructor", () => {
  const version = "1.2.3";
  const timewarrior = mockTimewarrior([["--version", version]]);
  expect(timewarrior.version).toBe(version);
});
