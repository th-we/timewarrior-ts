import Timewarrior from "./Timewarrior";

export type JsonInterval = {
  id: number;
  start: string;
  end?: string;
  tags?: string[];
  annotation?: string;
};

export class SyncError extends Error {}

export class Interval {
  id: number;
  private _start: number;
  private _end?: number;
  private _tags: Set<string>;
  private _annotation: string;
  private timewarrior: Timewarrior;

  constructor(interval: JsonInterval, timewarrior: Timewarrior) {
    this.id = interval.id;
    this._start = parseDate(interval.start).valueOf();
    this._end = interval.end ? parseDate(interval.end).valueOf() : undefined;
    this._tags = new Set(interval.tags || []);
    this._annotation = interval.annotation || "";
    this.timewarrior = timewarrior;
  }

  /**
   * Serializes the object in the same fashion as the `export` command
   */
  toJson(): JsonInterval {
    const jsonInterval = {
      id: this.id,
      start: serializeDate(this.start),
    } as JsonInterval;
    if (this.end) {
      jsonInterval.end = serializeDate(this.end);
    }
    if (this._tags.size > 0) {
      jsonInterval.tags = [...this._tags];
    }
    if (this._annotation) {
      jsonInterval.annotation = this._annotation;
    }
    return jsonInterval;
  }

  /**
   * As changes to intervals can affect the numeric IDs of other intervals
   * though nothing else about them changes, this method allows to sync the ID
   * with the ID currently found in the db.
   *
   * @throws SyncError if any aspect other than the ID changed in the db or the
   * Interval is not found in the database any more.
   */
  sync() {
    const other = this.timewarrior.exportInterval([this.start, this.end]);

    if (!this.equals(other)) {
      throw new SyncError("Interval was modified in the databse");
    }

    this.id = other.id;
  }

  set start(date: string | Date | number) {
    this.modify("start", date);
  }

  get start(): Date {
    return new Date(this._start);
  }

  set end(date: string | Date | number | undefined) {
    if (date === undefined) {
      throw new Error(
        "Can not re-open an interval by settings end to `unedfined"
      );
    }
    this.modify("end", date);
  }

  get end(): Date | undefined {
    return this._end ? new Date(this._end) : undefined;
  }

  private modify(mode: "start" | "end", date: string | Date | number) {
    this.sync();
    date = epoch(date);
    this.timewarrior.spawn("modify", [mode, new Date(date).toISOString()]);
    this._end = date;
  }

  hasTag(tag: string) {
    return this._tags.has(tag);
  }

  tag(tags: string | string[] | Set<string>) {
    this.sync();
    if (typeof tags === "string") {
      tags = [tags];
    }
    this.timewarrior.spawn("tag", ["@" + this.id, ...tags]);
    this._tags = new Set([...this._tags, ...tags]);
  }

  untag(tags: string | string[] | Set<string>) {
    this.sync();
    if (typeof tags === "string") {
      tags = [tags];
    }
    this.timewarrior.spawn("untag", ["@" + this.id, ...tags]);
    tags.forEach((tag) => this._tags.delete(tag));
  }

  /**
   * Replaces tags with supplied tags
   */
  set tags(newTags: string[] | Set<string>) {
    this.sync();
    if (!setsAreEqual(newTags, this._tags)) {
      this.untag(this._tags);
      this.tag(newTags);
    }
  }

  get tags() {
    // Prevent this._tags from being manipulated by returning a copy
    return new Set(this._tags);
  }

  get annotation() {
    return this._annotation;
  }

  /**
   * Replaces annotation
   */
  set annotation(annot: string) {
    this.sync();
    this.timewarrior.spawn("annotate", ["@" + this.id, annot]);
    this._annotation = annot;
  }

  delete() {
    this.sync();
    this.timewarrior.spawn("delete", ["@" + this.id]);
  }

  equals(other: Interval | JsonInterval) {
    return (
      this.id === other.id &&
      datesAreEqual(this.start, other.start) &&
      datesAreEqual(this.end, other.end) &&
      this.annotation === other.annotation &&
      setsAreEqual(this.tags, other.tags || [])
    );
  }

  // TODO (possibly combine some/all of them in one method)
  // lengthen() {}
  // shorten() {}
  // resize() {}
  // move() {}

  // join() {}

  /**
   * Splits the interval in half
   * @returns The two resulting intervals in their order of occurrence
   */
  split() {
    this.sync();
    this.timewarrior.spawn("split", ["@" + this.id]);
    return [
      this.timewarrior.getTracked(this.id + 1),
      this.timewarrior.getTracked(this.id),
    ];
  }

  /**
   * Take the tags and annotation of this Interval and create a new interval,
   * either starting/ending at any supplied Dates, or starting right now.
   */
  continue(range?: [Date] | [Date, Date]) {
    this.sync();

    range ||= [new Date()];
    const args = [range[0].toISOString()];
    if (range[1]) {
      args.push("to");
      args.push(range[1].toISOString());
    }

    this.timewarrior.spawn("continue", args);
    return this.timewarrior.exportInterval(range);
  }
}

/**
 * Parses ISO date strings
 */
function parseDate(datestring: string) {
  const [, Y, M, D, h, m, s, millis, , Z, utcH, utcM] =
    datestring.match(
      /^(\d\d\d\d)-?(\d\d)-?(\d\d)T(\d\d):?(\d\d):?(\d\d)(.\d\d\d)?(Z|([+-])(\d\d):?(\d\d))$/
    ) || [];
  const date = new Date(
    `${Y}-${M}-${D}T${h}:${m}:${s}.${millis || ""}${Z || `${utcH}:${utcM}`}`
  );
  if (!date) {
    throw new Error("Could not parse date string: " + datestring);
  }
  return date;
}

/**
 * Serialize the date in the form that is used by timewarrior in the database
 * and the `export` command
 */
function serializeDate(date: Date) {
  return date.toISOString().replace(/[-:]/, "");
}

/**
 * @param date An ISO date string, Date object or Unix time as number
 * @returns Unix time since 1970/01/01
 */
function epoch(date: string | Date | number) {
  switch (typeof date) {
    case "string":
      return parseDate(date).valueOf();
    case "number":
      return date;
    default:
      return date.valueOf();
  }
}

export function setsAreEqual<T>(a: Set<T> | T[], b: Set<T> | T[]) {
  return new Set([...a, ...b]).size === new Set([...a]).size;
}

export function datesAreEqual(
  a: string | Date | undefined,
  b: string | Date | undefined
) {
  return !a || !b ? !a === !b : epoch(a) === epoch(b);
}
