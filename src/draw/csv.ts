/**
 * Reading and writing a list of names as CSV.
 *
 * A teacher should not retype the same class every week, so Quick Draw
 * takes a file and gives one back. Nothing is uploaded: the file is read
 * in the browser, and the names land in the paste box where they can be
 * corrected before anything is drawn.
 *
 * Kept free of React and of the draw itself so it can be tested on its
 * own, like the rest of src/draw.
 */

/** Cells of one row, handling quoted fields, doubled quotes, and CRLF. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n rather than ending a second row.
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

/** Column headings a gradebook export is likely to start with. */
const HEADINGS =
  /^(name|names|student|students|student name|full name|first name|participant|participants)$/i;

/**
 * The names in a CSV or plain text file, in file order.
 *
 * The first column wins, because an export from a gradebook carries ID
 * and email columns that are nobody's name. A row of one cell is taken
 * whole, so a plain list in a .txt file works too.
 */
export function parseCsvNames(text: string): string[] {
  const rows = parseRows(text.replace(/^﻿/, ""));
  const names: string[] = [];

  for (const [index, row] of rows.entries()) {
    const first = (row[0] ?? "").trim().replace(/\s+/g, " ");

    if (!first) {
      continue;
    }

    // Only the very first row can be a heading.
    if (index === 0 && HEADINGS.test(first)) {
      continue;
    }

    names.push(first);
  }

  return names;
}

/** One name per line, under a Name heading, quoted where it has to be. */
export function toCsvNames(names: string[]): string {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  return ["Name", ...names.map(cell)].join("\n");
}

/** Name suffixes that follow a comma but are not a surname. */
const SUFFIXES = /^(jr|sr|ii|iii|iv|v|phd|md|dds|esq)\.?$/i;

/**
 * "Lovelace, Ada" -> "Ada Lovelace".
 *
 * The paste box treats a comma as a separator between people, so a
 * surname-first cell from a gradebook would otherwise be drawn as two
 * students. Flipping it here keeps that out of the draw, and the result
 * is sitting in the box where it can be corrected.
 */
export function flipSurnameFirst(name: string): string {
  const parts = name.split(",");

  if (parts.length !== 2) {
    return name;
  }

  const [surname, rest] = parts.map((part) => part.trim());

  if (!surname || !rest || SUFFIXES.test(rest)) {
    return name;
  }

  return `${rest} ${surname}`;
}

/**
 * The names from a file, ready to drop into the paste box: no commas
 * left inside a single person's name.
 */
export function csvNamesForEditing(text: string): string[] {
  return parseCsvNames(text).map(flipSurnameFirst);
}
