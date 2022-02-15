import { SpawnSyncReturns } from "child_process";
import Timewarrior, { TimewarriorOptions } from "./Timewarrior";

import structuredClone from "@ungap/structured-clone";

type SparseSpawnSyncReturns = {
  stdout?: string;
  stderr?: string;
  status?: number;
};

const defaultSpawnReturns: SpawnSyncReturns<string> = {
  pid: -1,
  stdout: "",
  stderr: "",
  output: [],
  status: 0,
  signal: null,
};

const defaultVersion = "1.4.2";

function result(sparseResult: SparseSpawnSyncReturns | string) {
  if (typeof sparseResult === "string") {
    sparseResult = { stdout: sparseResult };
  }
  const result = Object.assign(
    structuredClone(defaultSpawnReturns),
    sparseResult
  );
  result.output = [result.signal, result.stdout, result.stderr];
  return result;
}

function hash(args: string[] | string) {
  return typeof args === "string" ? args : args.join("\n");
}

/**
 * Used to map timewarrior arguments to timewarrior command line output as
 * tuples. The first tuple element are the arguments to the timewarrior command
 * (or if there is only one argument, the argument can be passed as string). The
 * second element is the command line output. If only the stdout output is
 * defined, a string can be used, otherwise a an object with the optional
 * entries `stdout`, `stderr` and status.
 */
type SpawnMocks = [
  args: string[] | string,
  result: SparseSpawnSyncReturns | string
][];

/**
 * @returns A Timewarrior instance with a mocked `spawn()` method.
 */
export default function mockTimewarrior(spawnMocks: SpawnMocks) {
  const commandMap: { [argsHash: string]: SpawnSyncReturns<string> } = {
    // We use some defaults:
    "--version": result(defaultVersion),
  };
  for (const [args, mockResult] of spawnMocks) {
    commandMap[hash(args)] = result(mockResult);
  }

  class MockedTimewarrior extends Timewarrior {}
  (MockedTimewarrior.prototype as any).spawn = function (args: string[]) {
    const result = commandMap[hash(args)];
    if (!result) {
      throw new Error(
        "No mock result for the following command parameters found:\n\n" +
          JSON.stringify(args)
      );
    }
    return result;
  };

  return new MockedTimewarrior();
}
