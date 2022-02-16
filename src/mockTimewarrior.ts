import { SpawnSyncReturns } from "child_process";
import Timewarrior, {
  Interval,
  JsonInterval,
  TimewarriorOptions,
} from "./Timewarrior";

import structuredClone from "@ungap/structured-clone";

type SparseSpawnReturns = {
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

/**
 * Used to map timewarrior arguments to timewarrior command line output as
 * tuples. The first tuple element are the arguments to the timewarrior command
 * (or if there is only one argument, the argument can be passed as string). The
 * second element is the command line output. If only the stdout output is
 * defined, a string can be used, otherwise a an object with the optional
 * entries `stdout`, `stderr` and status.
 */
type MockSpawns = [args: string[], result: SparseSpawnReturns | string][];

function spawnReturns(
  sparseReturns: SparseSpawnReturns
): SpawnSyncReturns<string> {
  const signal = null;
  const stdout = sparseReturns.stdout || "";
  const stderr = sparseReturns.stderr || "";

  return {
    pid: -1,
    output: [signal, stdout, stderr],
    stdout,
    stderr,
    status: sparseReturns.status || 0,
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
 * Quotes arguments and joins them into a single string
 */
function formatArgs(args: string[]) {
  return args.map((arg) => "'" + arg.replace(/'/g, "'\\''") + "'").join(" ");
}

/**
 * @returns A Timewarrior instance with a mocked `spawn()` method.
 */
export default function mockTimewarrior(mockSpawns: MockSpawns) {
  // We mock the constructor's initial version call, unless it's explicitly
  // defined in mockSpawns
  const initialArgs = mockSpawns[0]?.[0];
  if (!initialArgs || initialArgs.length !== 1 || initialArgs[0] !== "--help") {
    mockSpawns.unshift([["--help"], defaultVersion]);
  }

  class MockedTimewarrior extends Timewarrior {
    mockGetInterval = false;
    mockSpawns = mockSpawns;
  }

  // As .spawn() is private, we has to silence TypeScript by using "as any"
  (MockedTimewarrior.prototype as any).spawn = function (
    args: string[]
  ): SpawnSyncReturns<string> {
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
          ? spawnReturns({ stdout: JSON.stringify(intervalToJson(interval)) })
          : spawnReturns({
              stdout: "",
              stderr: `DOM reference '${arg1}' is not valid.\n`,
              status: 255,
            });
      }
      // We have a different "get command" where we don't support bypassing the
      // db, so continue with table based mocking.
    }

    const [expectedArgs, result] = mockSpawns.shift() || [];
    if (!expectedArgs || !result) {
      throw new Error("Mock spawn queue is empty");
    }

    if (formatArgs(args) !== formatArgs(expectedArgs)) {
      throw new Error(
        `Expected args:\n\n  ${formatArgs(
          expectedArgs
        )}\n\nbut found:\n\  ${formatArgs(args)}`
      );
    }

    return spawnReturns(
      typeof result === "string" ? { stdout: result } : result
    );
  };

  return new MockedTimewarrior();
}
