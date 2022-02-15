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

export default class Timewarrior {
  public readonly version: string;
  private readonly TIMEWARRIOR: string;
  private readonly timewarriordb: string;

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
}
