import { spawnSync } from "child_process";

export type TimewarriorOptions = {
  /**
   * Define the location of the Timewarrior database. Same functionality as the
   * TIMEWARRIORDB environment variable. If not set, the default
   */
  timewarriordb?: string;
  /**
   *
   */
  command?: string;
};

export type Interval = {
  id: number;
  start: Date;
  end: Date;
  tags: Set<string>;
  annotation: string;
};

export type JsonInterval = {
  id: number;
  start: string;
  end: string;
  tags?: string[];
  annotation?: string;
};

function intervalsAreEqual(a: Interval, b: Interval) {
  return (
    a.id === b.id &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.annotation === b.annotation &&
    a.tags.size == b.tags.size &&
    [...a.tags].reduce((equal, a) => equal && b.tags.has(a), true)
  );
}

export class OutOfSyncError extends Error {}

export default class Timewarrior {
  public readonly version: string;
  private readonly TIMEWARRIOR: string;
  private readonly timewarriordb: string;
  private readonly intervals: Interval[] = [];

  constructor(options?: TimewarriorOptions) {
    this.TIMEWARRIOR = options?.command || "timewarrior";
    this.timewarriordb = options?.timewarriordb || "";
    this.version = this.spawn(["--version"]).stdout;
  }

  private spawn(args: string[]) {
    const result = spawnSync(this.TIMEWARRIOR, args, {
      encoding: "utf-8",
      env: this.timewarriordb
        ? { TIMEWARRIORDB: this.timewarriordb }
        : undefined,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
    if (result.status) {
      // Timewarrior returned an error code or was terminated by a signal
      throw new Error(result.stderr);
    }

    return result;
  }

  private getInterval(intervalRef: Interval | number) {
    const [id, interval] =
      typeof intervalRef === "number"
        ? [intervalRef, this.intervals[intervalRef]]
        : [intervalRef.id, intervalRef];

    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Unsupported id ${id}. Id must be a positive integer.`);
    }

    // We have to check if we're still in synch with the db. The db might have
    // been written to from outside this library.
    const result = this.spawn(["get", `dom.tracked.${id}.json`]);
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    let intervalFromDb;
    try {
      // TODO: Check if JSON is as expected
      intervalFromDb = JSON.parse(result.stdout) as Interval;
    } catch (e) {
      throw new Error(
        `Could not parse timew output for id ${id} to JSON:\n\n${result.stdout}\n\n${e}`
      );
    }

    if (!interval) {
      this.intervals[id] = intervalFromDb;
      return intervalFromDb;
    }
    if (!intervalsAreEqual(interval, intervalFromDb)) {
      throw new OutOfSyncError();
    }

    return interval;
  }

  // TODO: timew annotate accepts multiple ids
  annotate(intervalRef: Interval | number, annotation: string) {
    const interval = this.getInterval(intervalRef);
    interval.annotation = annotation;
    // TODO: Create spawn() variant that returns true/fals or throws an error?
    this.spawn(["annotate", `@${interval.id}`, annotation]).status === 0;
  }

  /**
   * @returns `true` if there was an active task that was cancelled
   */
  cancel(): boolean {
    const result = this.spawn(["cancel"]).stdout;
    // TODO: Create a pull request to return different exit codes so that we
    // don't have to rely on the message to stdout? We might have localized
    // outputs.
    switch (result) {
      case "Canceled active time tracking.":
        true;
      case "There is no active time tracking.":
        return false;
      default:
        throw new Error("cancel() returned unexpected result: " + result);
    }
  }

  config() {}
  continue() {}
  day() {}
  delete() {}
  diagnostics() {}
  export() {}
  extensions() {}
  get() {}
  help() {}
  join() {}
  lengthen() {}
  modify() {}
  month() {}
  move() {}
  report() {}
  resize() {}
  shorten() {}
  show() {}
  split() {}
  start() {}
  stop() {}
  summary() {}
  tag() {}
  tags() {}
  track() {}
  undo() {}
  untag() {}
  week() {}
}
