// Ranger.tsx
import { Tuple, Either, Option, MutableHashMap } from "effect";
import type { JSX, ReactNode } from "react";
import React, { useRef, useState, useEffect, useContext, createContext, Fragment }
  from "react";
import * as rx from 'rxjs';
import * as pipe from 'tennyson/lib/core/pipe';
import * as rc from "tennyson/lib/web/react-common";
import * as c from 'tennyson/lib/core/common';

export interface RangerItem {
  name: string;
  subitems?: () => Promise<RangerItem[]>;
  display?: () => JSX.Element;
  view?: () => JSX.Element;
}

interface Column {
  items: RangerItem[];
  idx: number;
}

interface Controller {
  jumpTo: (a: string[]) => void;
  jumpToNew: (a: string[], b: JSX.Element) => void;
  /* textInputPopup: () => any; */
  toggleMaximize: () => void;
  setMark: (a: typeof c.AlphaNumeric.alphabetLowercase) => void;
}

const dummyController: Controller = (() => {
  const error = () => { c.log.error("Dummpy controller") }
  return {
    jumpTo: (_a: string[]) => error(),
    jumpToNew: (_a: string[], _b: JSX.Element) => error(),
    toggleMaximize: () => error(),
    setMark: (_a: typeof c.AlphaNumeric.alphabetLowercase) => error(),
  }
})();

const RangerContext = createContext(dummyController)

namespace KeyStack {
  export function keystrokeToString(e: React.KeyboardEvent): string {
    let key = e.key;
    let prefix = '';

    if (e.ctrlKey) prefix += 'C-';
    if (e.metaKey) prefix += 'D-'; // Command key
    if (e.altKey) prefix += 'M-'; // Alt/Meta key

    return prefix + key;
  }

  export function commandsOfStrokes<C extends { triggers: string[][] }>(
    commands: C[],
    e$: rx.Observable<React.KeyboardEvent>
  ): rx.Observable<Either.Either<C, string[]>> {
    return e$.pipe(
      pipe.scanMap((keystack: string[], e) => {
        keystack = keystack.concat(keystrokeToString(e))

        const exactMatch = commands.find(cmd =>
          cmd.triggers.some(trigger =>
            JSON.stringify(trigger) === JSON.stringify(keystack)));
        if (exactMatch) {
          e.preventDefault()
          return Tuple.make([], Option.some(Either.right(exactMatch)))
        }

        const allTriggers = commands.flatMap(cmd => cmd.triggers);
        const isPrefix = allTriggers.some(trigger =>
          trigger.slice(0, keystack.length)
            .every((key, i) => key === keystack[i])
        );

        if (isPrefix) {
          e.preventDefault()
          return [keystack, Option.none()]
        } else
          return [[], Option.none()]
      }, [] as string[])
    )
  }

  export function command(
    triggers: string | string[] | string[][], action: () => void
  ) {
    function isNested(x: string[] | string[][]): x is string[][] {
      return triggers.length > 0 && typeof triggers[0] !== 'string'
    }
    if (typeof triggers === 'string')
      return { triggers: [[triggers]], action }
    else if (isNested(triggers))
      return { triggers, action }
    else
      return { triggers: [triggers], action }
  }
}

function RangerCol(
  { path, items }: {
    path: string[],
    items: RangerItem[]
  }
): JSX.Element {
  const cmd = KeyStack.command;

  const controller = useContext(RangerContext)

  const [idx, setIdxInternal] = useState(0)
  const setIdx = (n: number) => {
    setIdxInternal(c.clamp(n, 0, items.length))
    controller.jumpTo(path)
  }
  const curItem = items[idx];

  let commands = (() => {
    return [
      cmd([["ArrowUp"], ["k"]], () => setIdx(idx - 1)),
      cmd([["ArrowDown"], ["j"]], () => setIdx(idx + 1)),
      cmd([["ArrowLeft"], ["h"]], () =>
        controller.jumpTo(path.splice(0, Math.max(0, path.length - 1)))),
      cmd([["ArrowRight"], ["l"], ["Enter"]], () => {
        const path_ = path.concat(curItem.name)
        if (curItem.subitems === undefined)
          return
        controller.jumpToNew(path_,
          <rc.PromiseResolver promise={curItem.subitems()}>
            {(items) =>
              <RangerCol path={path_} items={items} />
            }
          </rc.PromiseResolver>)
      }),
      cmd(["g", "g"], () => setIdx(0)),
      cmd("G", () => setIdx(items.length - 1)),
      cmd("C-d", () => setIdx(idx + 15)),
      cmd("C-u", () => setIdx(idx - 15)),
    ];
  })();

  const [key$] = useState(() => new rx.Subject<React.KeyboardEvent>());
  const onKey = (e: React.KeyboardEvent) => key$.next(e);

  useEffect(() => {
    const command$ = KeyStack.commandsOfStrokes(commands, key$).pipe(
      pipe.rxfilterMap(Either.getRight),
    )
    const sub = command$.subscribe(command => command.action())
    return () => sub.unsubscribe()
  }, [key$, idx])

  return (
    <div
      onKeyDown={onKey}
      tabIndex={0}
      style={{
        width: 300,
        overflow: "scroll",
        borderRight: "1px solid #ccc",
        padding: 4,
        height: "100%",
      }} >
      {items.map((it, j) => (
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
      ))}
    </div>
  )
}

export function Ranger2(
  { driver, initPath }
    : { driver: (path: string[]) => JSX.Element, initPath: string[] }
) {
  const [path, setPath] = useState(initPath)
  const [maximized, setMaximized] = useState(false)

  const [startIdx, endIdx] = [Math.max(0, path.length - 3), path.length]
  const colPaths_ = c.range(startIdx, endIdx).map(i => path.slice(0, i + 1))
  const colPaths = colPaths_.length <= 2
    ? [[] as string[]].concat(colPaths_)
    : colPaths_
  c.info(colPaths)

  const controller: Controller = {
    jumpTo: (a: string[]) => setPath(a),
    jumpToNew: (a: string[], b: JSX.Element) => { c.info(a); setPath(a) },
    toggleMaximize: () => setMaximized(!maximized),
    setMark: (a: typeof c.AlphaNumeric.alphabetLowercase) => {},
  }

  return (
    <RangerContext value={controller}>
      <div style={{ height: "100%", display: "flex" }}>
        {colPaths.map(path => (
          <Fragment key={JSON.stringify(path)}>
            {driver(path)}
          </Fragment>
        ))}
      </div>
    </RangerContext>
  )
}

export function Ranger3(
  { items, initPath }: { items: RangerItem[], initPath: string[] }
) {

  async function driverAsync(path: string[], props?: { maximized?: boolean }) {
    let items_ = items;
    for (const name of path) {
      const next = items_.find(x => x.name === name)
      c.info({ next, path, name })
      if (next === undefined || next.subitems === undefined)
        return <p>not found</p>
      items_ = await next.subitems()
    }
    return <RangerCol items={items_} path={path} />
  }

  const cache = useRef(MutableHashMap.empty<string, JSX.Element>())

  function driver(path: string[]) {
    const key = JSON.stringify(path)
    const mk = () => (
      <rc.PromiseResolver promise={driverAsync(path)}>
        {col => col}
      </rc.PromiseResolver>
    )
    return Option.match(MutableHashMap.get(cache.current, key), {
      onSome: x => x,
      onNone: () => {
        const res = mk()
        MutableHashMap.set(cache.current, key, res)
        return res
      },
    }
    )
  }

  return <Ranger2 driver={driver} initPath={initPath} />
}

export function Ranger({ items }: { items: RangerItem[] }) {
  const [cols, setCols] = useState<Column[]>([{ items, idx: 0 }]);

  const controller: Controller = {
    jumpTo: (a: string[]) => {},
    jumpToNew: (a: string[], b: JSX.Element) => {},
    toggleMaximize: () => {},
    setMark: (a: typeof c.AlphaNumeric.alphabetLowercase) => {},
  }

  const curCol = cols[cols.length - 1];

  const curItem = curCol.items[curCol.idx];
  const setIdx = (c: number, idx: number) =>
    setCols((xs) =>
      xs.map((x, i) => (i === c ? { ...x, idx: Math.max(0, Math.min(idx, x.items.length - 1)) } : x))
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
      .filter(({ item }) => item.name.toLowerCase().includes(term.toLowerCase()))
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
    const newIdx = (searchIndex - 1 + searchResults.length) % searchResults.length;
    setSearchIndex(newIdx);
    setIdx(cIdx, searchResults[newIdx]);
  };

  const cIdx = cols.length - 1;
  const cmd = KeyStack.command;

  let commands = (() => {
    if (searchMode)
      return [
        cmd("Escape",
          () => { setSearchMode(false); setIdx(cIdx, originalIdx) }),
        cmd("Enter", () => setSearchMode(false)),
        cmd("Backspace", () => {
          const newTerm = searchTerm.slice(0, -1);
          setSearchTerm(newTerm);
          doSearch(newTerm);
        })
      ]
    /* if (modifiedKey.length === 1) {
*   const newTerm = searchTerm + e.key;
*   setSearchTerm(newTerm);
*   doSearch(newTerm);
*   return;
* } */
    return [
      cmd([["ArrowUp"], ["k"]], () => setIdx(cIdx, curCol.idx - 1)),
      cmd([["ArrowDown"], ["j"]], () => setIdx(cIdx, curCol.idx + 1)),
      cmd([["ArrowLeft"], ["h"]],
        () => cols.length > 1 && setCols((xs) => xs.slice(0, -1))),
      cmd([["ArrowRight"], ["l"], ["Enter"]],
        async () => {
          const subItemsPromise = curItem.subitems ? curItem.subitems() : [];
          const items = await subItemsPromise;
          return items.length && setCols((xs) => [...xs, { items, idx: 0 }])
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
    const command$ = KeyStack.commandsOfStrokes(commands, key$).pipe(
      pipe.tapDebug({ name: "key$" }),
      pipe.rxfilterMap(Either.getRight)
    ).pipe(
      pipe.tapDebug({ name: "command$" }),
    )
    const sub = command$.subscribe(command => command.action())
    return () => sub.unsubscribe()
  }, [key$, cols, curCol, curItem, searchMode])

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
    const visibleBottom = scrollTop + containerHeight;

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
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "white",
          border: "2px solid #0070f3",
          borderRadius: "4px",
          padding: "8px",
          zIndex: 1000,
          minWidth: "300px"
        }}>
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
            ref={el => { colRefs.current[i] = el; }}
            style={{ width: 300, overflow: "scroll", borderRight: "1px solid #ccc", padding: 4 }}
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
