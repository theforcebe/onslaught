import { expect, it } from "vitest";
import { instantsForMinute, zonedMinute } from "../src/lib/raid-time";

it.each([
  ["2027-01-15T19:30", "America/Los_Angeles", "2027-01-16T03:30:00.000Z"],
  ["2027-07-15T19:30", "America/Los_Angeles", "2027-07-16T02:30:00.000Z"],
  ["2027-01-15T00:00", "America/New_York", "2027-01-15T05:00:00.000Z"],
  ["2027-05-02T23:30", "Asia/Kathmandu", "2027-05-02T17:45:00.000Z"],
  ["2027-04-01T01:30", "Pacific/Kiritimati", "2027-03-31T11:30:00.000Z"],
])(
  "round trips %s in %s regardless of the device time zone",
  (wall, zone, utc) => {
    expect(instantsForMinute(wall, zone)).toEqual([utc]);
    expect(zonedMinute(utc, zone)).toBe(wall);
  },
);
it("distinguishes skipped, repeated, and invalid wall-clock minutes", () => {
  expect(instantsForMinute("2027-03-14T02:15", "America/Los_Angeles")).toEqual(
    [],
  );
  expect(instantsForMinute("2026-02-30T12:00", "UTC")).toEqual([]);
  expect(instantsForMinute("2027-11-07T01:30", "America/Los_Angeles")).toEqual([
    "2027-11-07T08:30:00.000Z",
    "2027-11-07T09:30:00.000Z",
  ]);
  expect(instantsForMinute("2027-04-04T01:45", "Australia/Lord_Howe")).toEqual([
    "2027-04-03T14:45:00.000Z",
    "2027-04-03T15:15:00.000Z",
  ]);
});
