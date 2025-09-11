// Ranger.tsx
import {
  Tuple,
  Either,
  Option,
  MutableHashMap,
  pipe,
  HashMap,
  Pretty,
  Schema,
  Ref,
  Data,
  Effect,
  Array,
  Cache,
  Duration,
  Cause,
} from "effect";
import type { JSX } from "react";
import React, {
  useRef,
  useState,
  useEffect,
  useContext,
  createContext,
  Fragment,
  useDeferredValue,
} from "react";
import * as rx from "rxjs";
import * as tpipe from "tennyson/lib/core/pipe";
import * as rc from "tennyson/lib/web/react-common";
import * as c from "tennyson/lib/core/common";
import { equals } from "effect/Equal";

export interface RangerItem {
  name: string;
  subitems?: () => Promise<RangerItem[]> | RangerItem[];
  display?: () => JSX.Element;
  view?: () => JSX.Element;
}

interface Column {
  items: RangerItem[];
  idx: number;
}

interface Controller {
  jumpTo: (a: string[]) => void;
  focus: (a: string[], b: string) => void;
  /* textInputPopup: () => any; */
  toggleMaximize: () => void;
  setMark: (a: c.AlphaNumeric.AlphaLower) => void;
  gotoMark: (a: c.AlphaNumeric.AlphaLower) => void;
}

const dummyController: Controller = (() => {
  const error = (..._args: any[]) => {
    c.log.error("Dummpy controller");
  };
  return {
    jumpTo: error,
    focus: error,
    toggleMaximize: error,
    setMark: error,
    gotoMark: error,
  };
})();

const RangerContext = createContext(dummyController);

namespace KeyStack {
  export function keystrokeToString(e: React.KeyboardEvent): string {
    let key = e.key;
    let prefix = "";

    if (e.ctrlKey) prefix += "C-";
    if (e.metaKey) prefix += "D-"; // Command key
    if (e.altKey) prefix += "M-"; // Alt/Meta key

    return prefix + key;
  }

  export function commandsOfStrokes<C extends { triggers: string[][] }>(
    commands: C[],
    e$: rx.Observable<React.KeyboardEvent>,
  ): rx.Observable<Either.Either<C, string[]>> {
    return e$.pipe(
      tpipe.scanMap((keystack: string[], e) => {
        keystack = keystack.concat(keystrokeToString(e));

        const exactMatch = commands.find((cmd) =>
          cmd.triggers.some(
            (trigger) => JSON.stringify(trigger) === JSON.stringify(keystack),
          ),
        );
        if (exactMatch) {
          e.preventDefault();
          return Tuple.make([], Option.some(Either.right(exactMatch)));
        }

        const allTriggers = commands.flatMap((cmd) => cmd.triggers);
        const isPrefix = allTriggers.some((trigger) =>
          trigger
            .slice(0, keystack.length)
            .every((key, i) => key === keystack[i]),
        );

        if (isPrefix) {
          e.preventDefault();
          return [keystack, Option.none()];
        } else return [[], Option.none()];
      }, [] as string[]),
    );
  }

  export function command(
    triggers: string | string[] | string[][],
    action: () => void,
  ) {
    function isNested(
      x: readonly string[] | readonly string[][],
    ): x is string[][] {
      return x.length > 0 && typeof x[0] !== "string";
    }
    if (typeof triggers === "string") return { triggers: [[triggers]], action };
    else if (isNested(triggers)) return { triggers, action };
    else return { triggers: [triggers], action };
  }
}

function RangerCol({
  path,
  items,
  maximized,
  selected,
  focus,
  preview: _,
}: {
  path: string[];
  items: Effect.Effect<Option.Option<readonly RangerItem[]>>;
  maximized: boolean;
  focus?: boolean;
  selected?: string;
  preview?: boolean;
}): JSX.Element {
  const cmd = KeyStack.command;
  const ref_ = useRef(null as HTMLDivElement | null);
  const controller = useContext(RangerContext);

  useEffect(() => {
    if (focus && ref_.current !== null) ref_.current.focus();
  }, [focus]);

  const items_ = rc
    .useEffectTS(items)
    .pipe(
      Option.map(Either.getRight),
      Option.flatten,
      Option.flatten,
      Option.getOrNull,
    );

  const idx =
    items_ === null || selected === undefined
      ? 0
      : (items_.findIndex((x) => x.name === selected) ?? 0);

  const setIdx = (n: number) => {
    if (items_ === null) return;
    const nextIdx = c.clamp(n, 0, items_.length - 1);
    controller.focus(path, items_[nextIdx].name);
  };

  if (
    focus === true &&
    items_ !== null &&
    items_.length > 0 &&
    selected === undefined
  )
    setIdx(0);

  const [key$] = useState(() => new rx.Subject<React.KeyboardEvent>());
  const onKey = (e: React.KeyboardEvent) => key$.next(e);

  useEffect(() => {
    const commands = (() => {
      const setMarks = c.AlphaNumeric.alphaLower.map((l) =>
        cmd(["m", l], () => controller.setMark(l)),
      );
      const gotoMarks = c.AlphaNumeric.alphaLower.map((l) =>
        cmd(["'", l], () => controller.gotoMark(l)),
      );
      const itemCommands =
        items_ === null || items_.length === 0
          ? []
          : [
              cmd([["ArrowUp"], ["k"]], () => setIdx(idx - 1)),
              cmd([["ArrowDown"], ["j"]], () => setIdx(idx + 1)),
              cmd("G", () => setIdx(items_.length - 1)),
              cmd([["ArrowRight"], ["l"], ["Enter"]], () => {
                const curItem = items_[idx];
                const path_ = path.concat(curItem.name);
                if (curItem.subitems === undefined) return;
                controller.jumpTo(path_);
              }),
            ];
      return [
        cmd([["ArrowLeft"], ["h"]], () =>
          controller.jumpTo(path.splice(0, Math.max(0, path.length - 1))),
        ),
        cmd(["g", "g"], () => setIdx(0)),
        cmd(["t", "m"], () => controller.toggleMaximize()),
        cmd("C-d", () => setIdx(idx + 15)),
        cmd("C-u", () => setIdx(idx - 15)),
      ].concat(setMarks, gotoMarks, itemCommands);
    })();

    const command$ = KeyStack.commandsOfStrokes(commands, key$).pipe(
      tpipe.rxfilterMap(Either.getRight),
    );
    const sub = command$.subscribe((command) => command.action());
    return () => sub.unsubscribe();
  }, [key$, idx, items_, maximized, controller]);

  return (
    <div
      onKeyDown={onKey}
      ref={ref_}
      tabIndex={0}
      style={{
        width: maximized ? "100%" : 300,
        overflow: "scroll",
        borderRight: "1px solid #ccc",
        padding: 4,
        height: "100%",
      }}
    >
      {items_ === null ? (
        <Fragment />
      ) : (
        items_.map((it, j) => (
          <div
            key={j}
            onClick={() => setIdx(j)}
            style={{
              background: idx === j ? "#0070f3" : undefined,
              height: 17,
              color: idx === j ? "white" : undefined,
              padding: "2px 4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {it.name}
          </div>
        ))
      )}
    </div>
  );
}

function RangerColOrPreview({
  item,
  items,
  preview,
  ...args
}: {
  path: string[];
  item: Effect.Effect<Option.Option<RangerItem>>;
  items: Effect.Effect<Option.Option<readonly RangerItem[]>>;
  maximized: boolean;
  focus?: boolean;
  selected?: string;
  preview?: boolean;
}): JSX.Element {
  const item_ = rc.useEffectTS(item);
  const empty = () => <RangerCol items={Effect.succeedNone} {...args} />;
  const col = () => <RangerCol items={items} {...args} />;
  if (!preview) return col();
  return Option.match(item_, {
    onNone: empty,
    onSome: (x) =>
      pipe(
        x,
        Either.getRight,
        Option.flatten,
        Option.flatMapNullable((x) => x.display),
        Option.map((x) => x()),
        Option.getOrElse(col),
      ),
  });
}

interface DriverOptions {
  maximized?: boolean;
  selected?: string;
  preview?: boolean;
  focus?: boolean;
}

export function RangerOfDriver({
  driver,
  initPath,
}: {
  driver: (path: string[], options?: DriverOptions) => JSX.Element;
  initPath: readonly string[];
}) {
  const [path, setPath] = useState(initPath);
  const [maximized, setMaximized] = useState(false);
  const marks = useRef(
    MutableHashMap.empty<c.AlphaNumeric.AlphaLower, string[]>(),
  );

  const allPaths = [[] as string[]].concat(
    path.map((_val, i) => path.slice(0, i + 1)),
  );
  const colPaths = maximized ? allPaths.slice(-1) : allPaths.slice(-3);

  const [focusedItems, setFocusedItems] = useState(
    HashMap.empty<string, string>(),
  );

  const focusPath = pipe(
    focusedItems,
    HashMap.get(JSON.stringify(path)),
    Option.map((x) => path.concat([x])),
  );
  const colPathsAndFocus = Option.match(focusPath, {
    onSome: (val) => colPaths.concat([val]),
    onNone: () => colPaths,
  });

  const updateFocus =
    (path: string[]) => (focusedItems: HashMap.HashMap<string, string>) =>
      c.range(path.length).reduce((accum, i) => {
        return HashMap.set(accum, JSON.stringify(path.slice(0, i)), path[i]);
      }, focusedItems);

  const focus = (path: string[], name: string) => {
    setPath(path);
    pipe(
      focusedItems,
      updateFocus(path),
      HashMap.set(JSON.stringify(path), name),
      setFocusedItems,
    );
  };

  function jumpTo(path: string[]) {
    setPath(path);
    pipe(focusedItems, updateFocus(path), setFocusedItems);
  }

  const controller: Controller = {
    jumpTo,
    focus,
    toggleMaximize: () => setMaximized(!maximized),
    setMark: (a: c.AlphaNumeric.AlphaLower) =>
      MutableHashMap.set(marks.current, a, path),
    gotoMark: (a: c.AlphaNumeric.AlphaLower) =>
      Option.match(MutableHashMap.get(marks.current, a), {
        onNone: () => {
          c.log.warn(`Mark ${a} not set`);
        },
        onSome: jumpTo,
      }),
  };

  return (
    <RangerContext value={controller}>
      <div style={{ height: "100%", display: "flex" }}>
        {colPathsAndFocus.map((path, i) => (
          <Fragment key={JSON.stringify(path)}>
            {driver(
              path,
              c.stripUndefined({
                maximized,
                preview: i === colPaths.length,
                focus: i === colPaths.length - 1,
                selected: pipe(
                  focusedItems,
                  HashMap.get(JSON.stringify(path)),
                  Option.getOrUndefined,
                ),
              }),
            )}
          </Fragment>
        ))}
      </div>
    </RangerContext>
  );
}

export function RangerOfItems({
  items,
  initPath,
}: {
  items: readonly RangerItem[];
  initPath: readonly string[];
}) {
  const cacheRef = useRef(
    null as null | Cache.Cache<
      readonly string[],
      Option.Option<readonly RangerItem[]>
    >,
  );

  const getItems = (path: readonly string[]) =>
    Effect.gen(function* () {
      const cache = cacheRef.current!;
      return yield* cache.get(Data.array(path));
    });

  const getItem = (path: readonly string[]) =>
    Effect.gen(function* () {
      if (path.length === 0) return Option.none();
      const siblings = yield* getItems(path.slice(0, -1));
      return siblings.pipe(
        Option.flatMap(
          Array.findFirst((x) => equals(Option.some(x.name), Array.last(path))),
        ),
      );
    });

  const lookup = (path: readonly string[]) =>
    Effect.gen(function* () {
      if (path.length === 0) return Option.some(items);
      const parent = yield* getItem(path);
      const getSubitems = Option.flatMapNullable(parent, (x) => x.subitems);
      const subitems: Option.Option<readonly RangerItem[]> =
        yield* Option.match(getSubitems, {
          onNone: () => Effect.succeedNone,
          onSome: (get) =>
            Effect.tryPromise({
              try: () => Promise.resolve(get()),
              catch: c.id,
            }).pipe(Effect.map(Data.array), Effect.option),
        });
      return subitems;
    });

  if (cacheRef.current === null) {
    cacheRef.current = Cache.make({
      capacity: Infinity,
      timeToLive: Duration.infinity,
      lookup,
    }).pipe(Effect.runSync);
  }

  function driver(path: string[], options?: DriverOptions) {
    const { maximized, selected, preview, focus } = {
      maximized: false,
      preview: false,
      ...options,
    };
    const item = getItem(path);
    const items = getItems(path);
    const props = c.stripUndefined({
      item,
      items,
      path,
      maximized,
      focus,
      selected,
      preview,
    });
    return <RangerColOrPreview {...props} />;
  }

  return <RangerOfDriver driver={driver} initPath={initPath} />;
}

export function Ranger({ items }: { items: RangerItem[] }) {
  const [cols, setCols] = useState<Column[]>([{ items, idx: 0 }]);

  const curCol = cols[cols.length - 1];

  const curItem = curCol.items[curCol.idx];
  const setIdx = (c: number, idx: number) =>
    setCols((xs) =>
      xs.map((x, i) =>
        i === c
          ? { ...x, idx: Math.max(0, Math.min(idx, x.items.length - 1)) }
          : x,
      ),
    );

  // Add search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [originalIdx, setOriginalIdx] = useState(0);

  // Add search functions
  const doSearch = (term: string) => {
    const results = curCol.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) =>
        item.name.toLowerCase().includes(term.toLowerCase()),
      )
      .map(({ idx }) => idx);
    setSearchResults(results);
    setSearchIndex(0);
    if (results.length > 0) {
      setIdx(cIdx, results[0]);
    } else {
      setIdx(cIdx, originalIdx);
    }
  };

  const nextMatch = () => {
    if (searchResults.length === 0) return;
    const newIdx = (searchIndex + 1) % searchResults.length;
    setSearchIndex(newIdx);
    setIdx(cIdx, searchResults[newIdx]);
  };

  const prevMatch = () => {
    if (searchResults.length === 0) return;
    const newIdx =
      (searchIndex - 1 + searchResults.length) % searchResults.length;
    setSearchIndex(newIdx);
    setIdx(cIdx, searchResults[newIdx]);
  };

  const cIdx = cols.length - 1;
  const cmd = KeyStack.command;

  let commands = (() => {
    if (searchMode)
      return [
        cmd("Escape", () => {
          setSearchMode(false);
          setIdx(cIdx, originalIdx);
        }),
        cmd("Enter", () => setSearchMode(false)),
        cmd("Backspace", () => {
          const newTerm = searchTerm.slice(0, -1);
          setSearchTerm(newTerm);
          doSearch(newTerm);
        }),
      ];
    /* if (modifiedKey.length === 1) {
     *   const newTerm = searchTerm + e.key;
     *   setSearchTerm(newTerm);
     *   doSearch(newTerm);
     *   return;
     * } */
    return [
      cmd([["ArrowUp"], ["k"]], () => setIdx(cIdx, curCol.idx - 1)),
      cmd([["ArrowDown"], ["j"]], () => setIdx(cIdx, curCol.idx + 1)),
      cmd(
        [["ArrowLeft"], ["h"]],
        () => cols.length > 1 && setCols((xs) => xs.slice(0, -1)),
      ),
      cmd([["ArrowRight"], ["l"], ["Enter"]], async () => {
        const subItemsPromise = curItem.subitems ? curItem.subitems() : [];
        const items = await subItemsPromise;
        return items.length && setCols((xs) => [...xs, { items, idx: 0 }]);
      }),
      cmd(["g", "g"], () => setIdx(cIdx, 0)),
      cmd("G", () => setIdx(cIdx, curCol.items.length - 1)),
      cmd("C-d", () => setIdx(cIdx, curCol.idx + 15)),
      cmd("C-u", () => setIdx(cIdx, curCol.idx - 15)),
      cmd("/", () => {
        setSearchMode(true);
        setSearchTerm("");
        setOriginalIdx(curCol.idx);
      }),
      cmd("n", () => nextMatch()),
      cmd("N", () => prevMatch()),
    ];
  })();

  const [key$] = useState(() => new rx.Subject<React.KeyboardEvent>());
  const onKey = (e: React.KeyboardEvent) => key$.next(e);

  useEffect(() => {
    const command$ = KeyStack.commandsOfStrokes(commands, key$)
      .pipe(
        tpipe.tapDebug({ name: "key$" }),
        tpipe.rxfilterMap(Either.getRight),
      )
      .pipe(tpipe.tapDebug({ name: "command$" }));
    const sub = command$.subscribe((command) => command.action());
    return () => sub.unsubscribe();
  }, [key$, cols, curCol, curItem, searchMode]);

  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  // keep focus for key events
  // Add useEffect for auto-scrolling
  useEffect(() => {
    document.getElementById("ranger-root")?.focus();
    const colIdx = cols.length - 1;
    const container = colRefs.current[Math.min(colIdx, 2)]; // last visible column
    if (!container) return;

    const itemHeight = 21; // approximate height
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;
    const selectedPos = curCol.idx * itemHeight;
    const visibleTop = scrollTop;
    const _visibleBottom = scrollTop + containerHeight;
    c.ignore(_visibleBottom);

    const p20 = visibleTop + containerHeight * 0.2;
    const p80 = visibleTop + containerHeight * 0.8;

    if (selectedPos < p20) {
      container.scrollTop = selectedPos - containerHeight * 0.2;
    } else if (selectedPos > p80) {
      container.scrollTop = selectedPos - containerHeight * 0.8;
    }
  }, [cols, curCol.idx]);

  return (
    <div style={{ height: "100%" }}>
      {searchMode && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            border: "2px solid #0070f3",
            borderRadius: "4px",
            padding: "8px",
            zIndex: 1000,
            minWidth: "300px",
          }}
        >
          <div>Search: {searchTerm}</div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {searchResults.length > 0
              ? `${searchIndex + 1} of ${searchResults.length}`
              : "No matches"}
          </div>
        </div>
      )}
      <div
        id="ranger-root"
        tabIndex={0}
        onKeyDown={onKey}
        style={{ display: "flex", outline: "none", height: "100%" }}
      >
        {cols.slice(-3).map((col, i) => (
          <div
            key={i}
            ref={(el) => {
              colRefs.current[i] = el;
            }}
            style={{
              width: 300,
              overflow: "scroll",
              borderRight: "1px solid #ccc",
              padding: 4,
            }}
          >
            {col.items.map((it, j) => (
              <div
                key={j}
                onClick={() => setIdx(Math.max(0, cols.length - 3) + i, j)}
                style={{
                  background: col.idx === j ? "#0070f3" : undefined,
                  height: 17,
                  color: col.idx === j ? "white" : undefined,
                  padding: "2px 4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {it.name}
              </div>
            ))}
          </div>
        ))}
        <div style={{ maxHeight: "100%", overflow: "scroll", flex: 1 }}>
          {(curItem?.display ?? (() => <div />))()}
        </div>
      </div>
    </div>
  );
}
