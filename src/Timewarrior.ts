import { spawnSync, SpawnSyncReturns } from "child_process";
import { Interval, JsonInterval, normalizeDatestring } from "./Interval";

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
    this.version = this.spawn("--version").stdout.trim();
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
    if (!Number.isInteger(id) || id < 1) {
      throw new Error("Expected positive integer as ID, but got " + id);
    }
    const result = this.spawn("get", [`dom.tracked.${id}.json`]);
    return new Interval(JSON.parse(result.stdout), this);
  }

  /**
   * @returns The active Interval, or `undefined`, if there is no active interval.
   */
  activeInterval() {
    const result = this.spawn("get", ["dom.active"]);
    switch (result.stdout.trim()) {
      case "0":
        return undefined;
      case "1":
        return this.getTracked(1);
      default:
        throw new Error(
          `Expected '0' or '1' as result of 'get' query 'dom.active', but got '${result.stdout}'`
        );
    }
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
   * tracks were removed. If there was nothing to stop, an empty object is
   * returned.
   */
  async stop(tags?: string[]) {
    const stopped = this.activeInterval();
    if (!stopped) {
      return {};
    }

    const millisSinceStart = new Date().getTime() - stopped.start.getTime();
    // `timew stop` will terminate with an error code if there isn't at least
    // one second between the start and the end of the to be stopped interval.
    // This means we might have to wait.
    const millisToWait = Math.max(1000 - millisSinceStart, 0);
    await new Promise((resolve) => setTimeout(resolve, millisToWait));

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
    const range = [normalizeDatestring(start), "to", normalizeDatestring(end)];
    tags ||= [];
    const hints = adjust ? [":adjust"] : [];
    this.spawn("track", [...range, ...tags, ...hints]);
    return new Interval(this.exportInterval([start, end]), this);
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
      args.push(normalizeDatestring(range[0]));
      if (range[1]) {
        args.push("to");
        args.push(normalizeDatestring(range[1]));
      }
    }

    const stdout = this.spawn("export", [...args, ...(tags || [])]).stdout;
    return JSON.parse(stdout) as JsonInterval[];
  }

  /**
   * `export()` variant that will return a single Interval or throw an error if
   * there is not precisely one Interval in the given range.
   */
  exportInterval(range: [Date] | [Date, Date?], tags?: []) {
    const intervals = this.export(range, tags);
    if (intervals.length !== 1) {
      // Should be unreachable
      const start = normalizeDatestring(range[0]);
      const end = range[1] ? normalizeDatestring(range[1]) : "now";
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
