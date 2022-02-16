import { SpawnSyncReturns } from "child_process";
import Timewarrior, {
  Interval,
  JsonInterval,
  TimewarriorOptions,
} from "./Timewarrior";

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

function spawnReturn(
  stdout: string,
  stderr?: string,
  status?: number
): SpawnSyncReturns<string> {
  const signal = null;
  stderr ||= "";
  status ||= 0;

  return {
    pid: -1,
    output: [signal, stdout, stderr],
    stdout,
    stderr,
    status,
    signal,
  };
}

function intervalToJson(interval: Interval): JsonInterval {
  const jsonInterval = {
    id: interval.id,
    start: "",
    end: "",
  } as JsonInterval;
  if (interval.tags) {
    jsonInterval["tags"] = [...interval.tags];
  }
  if (interval.annotation) {
    jsonInterval.annotation = interval.annotation;
  }
  return jsonInterval;
}

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

  class MockedTimewarrior extends Timewarrior {
    mockGetInterval = false;
    commandMap = commandMap;
  }

  // As .spawn() is private, we has to silence TypeScript by using "as any"
  (MockedTimewarrior.prototype as any).spawn = function (args: string[]) {
    const [command, arg1] = args;
    // Silence TypeScript for accessing the private `intervals` property
    const intervals = (this as any).intervals as Interval[];

    if (command === "get" && !this.mockGetInterval) {
      // Just return the result using the intervals that are already in memory
      // without hitting the mocked db
      let [, id] =
        arg1.match(/dom\.tracked\.(\d+)\.json/) ||
        // `active` is basically an alias for `tracked.1`, right?
        (arg1.match(/dom\.active.\json/) && [undefined, "1"]) ||
        [];
      if (id) {
        const interval = intervals[parseInt(id)] as Interval | undefined;
        return interval
          ? spawnReturn(JSON.stringify(intervalToJson(interval)))
          : spawnReturn("", `DOM reference '${arg1}' is not valid.\n`, 255);
      }
      // We have a different "get command" where we don't support bypassing the
      // db, so continue with table based mocking.
    }

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
