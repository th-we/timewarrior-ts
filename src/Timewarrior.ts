import { spawnSync, SpawnSyncReturns } from "child_process";
import { Interval, JsonInterval } from "./Interval";

export type TimewarriorOptions = {
  /**
   * Define the location of the Timewarrior database. Same functionality as the
   * TIMEWARRIORDB environment variable. Only needed if a non-standard location
   * used.
   */
  timewarriordb?: string;
  /**
   * Defaults to `"timew"`. Can be an absolute path as well.
   */
  command?: string;
};

type Command =
  | "--version"
  | "--help"
  | "annotate"
  | "cancel"
  | "config"
  | "continue"
  | "day"
  | "delete"
  | "diagnostics"
  | "export"
  | "extensions"
  | "get"
  | "help"
  | "join"
  | "lengthen"
  | "modify"
  | "month"
  | "move"
  | "report"
  | "resize"
  | "shorten"
  | "show"
  | "split"
  | "start"
  | "stop"
  | "summary"
  | "tag"
  | "tags"
  | "track"
  | "undo"
  | "untag"
  | "week";

export class ErrorCode extends Error {
  result: SpawnSyncReturns<string>;

  constructor(result: SpawnSyncReturns<string>) {
    super();
    this.message = result.stderr;
    this.result = result;
  }
}

/**
 * @returns `true` if the number is a non-negative integer and therefore
 * suitable as ID. It is not checked whether an Interval with that ID exists.
 */
function assertId(id: number) {
  return Number.isInteger(id) && id > 0;
}

export default class Timewarrior {
  public readonly version: string;
  private readonly TIMEWARRIOR: string;
  /**
   * Value for TIMEWARRIORDB environment variable
   */
  private readonly timewarriordb: string;

  constructor(options?: TimewarriorOptions) {
    this.TIMEWARRIOR = options?.command || "timew";
    this.timewarriordb = options?.timewarriordb || "";
    this.version = this.spawn("--version").stdout;
  }

  // TODO: Find a way of making this private, still allowing Interval to access
  // spawn()
  /**
   * Runs a timewarrior command and returns the result.
   *
   * This method is "low level" and should not be used outside this module.
   *
   * @throws Error if timewarrior was interrupted by a signal.
   * @throws ErrorCode if timewarrior returned with an error code.
   */
  spawn(command: Command, args?: string[]): { stdout: string; stderr: string } {
    args ||= [];
    const result = spawnSync(this.TIMEWARRIOR, [command, ...args], {
      encoding: "utf-8",
      env: this.timewarriordb
        ? { TIMEWARRIORDB: this.timewarriordb }
        : undefined,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status === null) {
      throw new Error("Terminated by signal " + result.signal);
    }
    if (result.status > 0) {
      throw new ErrorCode(result);
    }

    return { stdout: result.stdout, stderr: result.stderr };
  }

  /**
   * Returns an Interval that is verified to be consistent with the timewarrior
   * database.
   */
  // TODO: Find a way of making this private, still allowing Interval to access
  // getInterval()
  getTracked(id: number) {
    const result = this.spawn("get", [`dom.tracked.${assertId(id)}.json`]);
    return JSON.parse(result.stdout) as Interval;
  }

  activeInterval() {
    const result = this.spawn("get", ["dom.active.json"]);
    return result.stdout
      ? new Interval(JSON.parse(result.stdout), this)
      : undefined;
  }

  /**
   * @returns `true` if there was an active Interval that was cancelled
   */
  cancel(): boolean {
    const activeInterval = this.activeInterval();
    if (!activeInterval) {
      return false;
    }
    activeInterval.delete();
    return true;
  }

  /**
   * Starts a new Interval
   */
  start(tags?: string[], annotation?: string) {
    this.spawn("start", tags);
    const activeInterval = this.activeInterval();
    if (!activeInterval) {
      // Should be unreachable
      throw new Error("Could not start a new Interval");
    }
    if (annotation) {
      activeInterval.annotation = annotation;
    }

    return activeInterval;
  }

  /**
   * @returns The stopped Interval, and if tags were supplied and only tracking
   * of those tags was stopped, also the freshly started Interval where the
   * tracks were removed.
   * @throws ErrorCode when there is no active Interval
   */
  stop(tags?: string[]) {
    const stopped = this.activeInterval();
    this.spawn("stop", tags);
    const started = this.activeInterval();

    return {
      started,
      stopped:
        started && stopped && started.equals(stopped) ? started : stopped,
    };
  }

  /**
   * Adds a new Interval to the database.
   *
   * @param adjust If `true` will adjust Intervals that overlap and delete
   * intervals that are enclosed by the added Interval.
   * @returns The new Interval
   * @throws ErrorCode in case of conflicting Intervals when `adjust` is not true.
   */
  track(start: Date, end: Date, tags?: string[], adjust?: boolean) {
    const range = [start.toISOString(), "to", end.toISOString()];
    tags ||= [];
    const hints = adjust ? [":adjust"] : [];
    this.spawn("track", [...range, ...tags, ...hints]);
    return this.exportInterval([start, end]);
  }

  undo() {
    this.spawn("undo");
  }

  /**
   * Fetches an array of Intervals matching the range and tags
   */
  export(range?: [Date] | [Date, Date?], tags?: []) {
    const args = [];
    if (range) {
      args.push(range[0].toISOString());
      if (range[1]) {
        args.push("to");
        args.push(range[1].toISOString());
      }
    }

    return JSON.parse(
      this.spawn("export", [...args, ...(tags || [])]).stdout
    ) as JsonInterval[];
  }

  /**
   * `export()` variant that will return a single Interval or throw an error if
   * there is not precisely one Interval in the given range.
   */
  exportInterval(range: [Date] | [Date, Date?], tags?: []) {
    const intervals = this.export(range, tags);
    if (intervals.length !== 1) {
      // Should be unreachable
      const start = range[0].toISOString();
      const end = range[1]?.toISOString() || "now";
      throw new Error(
        `Expected single interval in range ${start} to ${end}, but found ${intervals.length}`
      );
    }
    return intervals[0];
  }

  // Unimplemented:
  // config() {}
  // day() {}
  // diagnostics() {}
  // extensions() {}
  // help() {}
  // month() {}
  // report() {}
  // show() {}
  // summary() {}
  // week() {}
}
