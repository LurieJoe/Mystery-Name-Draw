import { useState } from "react";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { findAssignment, type DrawPerson } from "../draw/assignment";
import { csvNamesForEditing, toCsvNames } from "../draw/csv";
import { makeGroups, makeMutualPairs, parseNames } from "../draw/grouping";
import { downloadFile } from "../downloadFile";
import { navigate } from "../router";
import "./ContentPage.css";
import "./QuickDrawPage.css";

/**
 * Quick Draw asks what the draw is for before it asks for names. The
 * three mechanisms underneath (one-way assignment, mutual pairs, groups
 * of N) are the same three every time, but "who reviews whose work" and
 * "everyone draws a name" are the same mechanism described two very
 * different ways, and the wording of the result is most of the value.
 */
type Mechanism = "assign" | "pairs" | "groups";

type Purpose = {
  id: string;
  title: string;
  blurb: string;
  mechanism: Mechanism;
  /** Heading above the paste box. */
  namesHeading: string;
  placeholder: string;
  /** Reads a result row aloud: ("Ada", "Grace") -> "Ada gives to Grace". */
  line: (from: string, to: string) => string;
  /** Singular label for a pair or group, numbered in the results. */
  groupNoun: string;
  resultHeading: string;
};

const PURPOSES: Purpose[] = [
  {
    id: "exchange",
    title: "Everyone draws a name",
    blurb:
      "A gift exchange, a book swap, or a card exchange you are sorting out on the spot. Everyone gives to one person, and nobody draws themselves.",
    mechanism: "assign",
    namesHeading: "Who is taking part?",
    placeholder: "Ada\nGrace\nAlan\nKatherine",
    line: (from, to) => `${from} gives to ${to}`,
    groupNoun: "Group",
    resultHeading: "Who gives to whom",
  },
  {
    id: "review",
    title: "Hand each person someone else's work",
    blurb:
      "Peer review, grading swaps, or a second pair of eyes on an assignment. Each person gets exactly one other person's work, and never their own.",
    mechanism: "assign",
    namesHeading: "Whose work is in the pile?",
    placeholder: "Ada\nGrace\nAlan\nKatherine",
    line: (from, to) => `${from} reviews ${to}'s work`,
    groupNoun: "Group",
    resultHeading: "Who reviews whose work",
  },
  {
    id: "partners",
    title: "Partner people up",
    blurb:
      "Two at a time, both ways, for an assignment, a drill, or an interview exercise. An odd number leaves one group of three rather than someone on their own.",
    mechanism: "pairs",
    namesHeading: "Who needs a partner?",
    placeholder: "Ada\nGrace\nAlan\nKatherine",
    line: (from, to) => `${from} and ${to}`,
    groupNoun: "Pair",
    resultHeading: "The pairs",
  },
  {
    id: "groups",
    title: "Split into groups",
    blurb:
      "Group work, stations, or teams. Pick how many people you want in each group, and the sizes come out even.",
    mechanism: "groups",
    namesHeading: "Who is being grouped?",
    placeholder: "Ada\nGrace\nAlan\nKatherine",
    line: (from, to) => `${from} and ${to}`,
    groupNoun: "Group",
    resultHeading: "The groups",
  },
];

type Result =
  | { kind: "assign"; pairs: { from: string; to: string }[] }
  | { kind: "sets"; sets: DrawPerson[][] }
  | { kind: "error"; message: string };

export default function QuickDrawPage() {
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [names, setNames] = useState("");
  const [groupSize, setGroupSize] = useState(3);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");

  const people = parseNames(names);

  const draw = (chosen: Purpose) => {
    if (people.length < 2) {
      setResult({ kind: "error", message: "Add at least two names." });
      return;
    }

    if (chosen.mechanism === "assign") {
      const outcome = findAssignment(people, []);

      if (!outcome.ok) {
        setResult({
          kind: "error",
          message: "That could not be drawn. Try again.",
        });
        return;
      }

      const nameOf = (id: string) =>
        people.find((person) => person.id === id)?.name ?? id;

      setResult({
        kind: "assign",
        pairs: outcome.assignments.map((assignment) => ({
          from: nameOf(assignment.giverId),
          to: nameOf(assignment.receiverId),
        })),
      });
      return;
    }

    setResult({
      kind: "sets",
      sets:
        chosen.mechanism === "pairs"
          ? makeMutualPairs(people)
          : makeGroups(people, groupSize),
    });
  };

  const resultAsText = (chosen: Purpose, drawn: Result) => {
    if (drawn.kind === "assign") {
      return drawn.pairs
        .map((pair) => chosen.line(pair.from, pair.to))
        .join("\n");
    }

    if (drawn.kind === "sets") {
      return drawn.sets
        .map(
          (set, index) =>
            `${chosen.groupNoun} ${index + 1}: ${set
              .map((person) => person.name)
              .join(", ")}`
        )
        .join("\n");
    }

    return "";
  };

  const importNames = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const imported = csvNamesForEditing(await file.text());

    // Clearing the input means the same file can be picked twice, which
    // is what you want after editing it.
    event.target.value = "";

    if (imported.length === 0) {
      setNotice("There were no names in that file.");
      return;
    }

    setNames(imported.join("\n"));
    setResult(null);
    setNotice(
      `Loaded ${imported.length} ${
        imported.length === 1 ? "name" : "names"
      } from ${file.name}.`
    );
  };

  const exportNames = () => {
    downloadFile(
      "quick-draw-names.csv",
      toCsvNames(people.map((person) => person.name)),
      "text/csv"
    );
  };

  const clearNames = () => {
    setNames("");
    setResult(null);
    setNotice("");
  };

  const startOver = () => {
    setPurpose(null);
    setResult(null);
    setNotice("");
  };

  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page quick-draw">
        <h1>Quick Draw</h1>

        <p className="content-lede">
          For when you already have the names and need them matched now.
          No sign-ups, no invitations, and no waiting: say what the draw
          is for, paste a list, and draw.
        </p>

        {!purpose ? (
          <>
            <h2>What are you using this for?</h2>

            <div className="quick-purposes">
              {PURPOSES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="quick-purpose"
                  onClick={() => {
                    setPurpose(option);
                    setResult(null);
                  }}
                >
                  <strong>{option.title}</strong>
                  <span>{option.blurb}</span>
                </button>
              ))}
            </div>

            <p className="quick-aside">
              Planning something further out, where people need to be
              invited and told privately?{" "}
              <a href="#/create">Set up a gift exchange</a> instead.
            </p>
          </>
        ) : (
          <>
            <p className="quick-chosen">
              <strong>{purpose.title}</strong>
              <button
                type="button"
                className="quick-link-button"
                onClick={startOver}
              >
                Change
              </button>
            </p>

            <h2>{purpose.namesHeading}</h2>
            <p>One name per line, or separated by commas.</p>

            <label className="quick-field">
              <span className="quick-visually-hidden">
                {purpose.namesHeading}
              </span>
              <textarea
                rows={8}
                value={names}
                placeholder={purpose.placeholder}
                onChange={(event) => setNames(event.target.value)}
              />
            </label>

            <p className="quick-count">
              {people.length === 0
                ? "No names yet."
                : `${people.length} ${
                    people.length === 1 ? "name" : "names"
                  }.`}
            </p>

            <div className="quick-file-row">
              <label className="quick-file-button">
                Import a list
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={importNames}
                />
              </label>

              <button
                type="button"
                className="quick-secondary"
                onClick={exportNames}
                disabled={people.length === 0}
              >
                Save this list
              </button>

              <button
                type="button"
                className="quick-secondary"
                onClick={clearNames}
                disabled={names.trim() === ""}
              >
                Clear list
              </button>

              <span className="quick-file-hint">
                A .csv or .txt file, one name per line. Saving keeps the
                list on your own computer, so next week you can load it
                back rather than typing it again.
              </span>
            </div>

            {notice && <p className="quick-notice">{notice}</p>}

            {purpose.mechanism === "groups" && (
              <label className="quick-field quick-size">
                <span>How many people in each group?</span>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={groupSize}
                  onChange={(event) =>
                    setGroupSize(Number(event.target.value) || 2)
                  }
                />
              </label>
            )}

            <button
              type="button"
              className="quick-draw-cta"
              onClick={() => draw(purpose)}
            >
              Draw
            </button>

            {result && (
              <section className="quick-result" aria-live="polite">
                {result.kind === "error" ? (
                  <p className="quick-error">{result.message}</p>
                ) : (
                  <>
                    <h2>{purpose.resultHeading}</h2>

                    {result.kind === "assign" ? (
                      <ul className="quick-list">
                        {result.pairs.map((pair) => (
                          <li key={`${pair.from}-${pair.to}`}>
                            {purpose.line(pair.from, pair.to)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="quick-sets">
                        {result.sets.map((set, index) => (
                          <div key={index} className="quick-set">
                            <h3>
                              {purpose.groupNoun} {index + 1}
                            </h3>
                            <ul>
                              {set.map((person) => (
                                <li key={person.id}>{person.name}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="quick-actions">
                      <button
                        type="button"
                        className="quick-secondary"
                        onClick={() => draw(purpose)}
                      >
                        Draw again
                      </button>
                      <button
                        type="button"
                        className="quick-secondary"
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            resultAsText(purpose, result)
                          );
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="quick-secondary"
                        onClick={() => window.print()}
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        className="quick-secondary"
                        onClick={startOver}
                      >
                        Start over
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}

        <h2>What Quick Draw does not do</h2>
        <p>
          A Quick Draw happens here, in this browser. Nothing is sent
          anywhere, nothing is kept on our end, and the result is gone
          when you close the tab, so copy, print, or save the list
          before you go. A saved list is a file on your own computer,
          and it never leaves it.
        </p>
        <p>
          It also means <strong>you</strong> see the whole draw, which is
          the point when you are reading assignments out in a room. If
          the draw needs to stay a secret from the person running it,{" "}
          <a href="#/create">set up a gift exchange</a> instead: invited
          people get their own name privately, and even the organizer
          never sees who drew whom.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
