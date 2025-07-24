// Ranger.tsx
import type { JSX } from "react";
import React, { useRef, useState, useEffect, useCallback } from "react";

export interface RangerItem {
  name: string;
  subitems: () => Promise<RangerItem[]>;
  display: () => JSX.Element;
}

interface Column {
  items: RangerItem[];
  idx: number;   // selected row
}

export function Ranger({ items }: { items: RangerItem[] }) {
  const [cols, setCols] = useState<Column[]>([{ items, idx: 0 }]);
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


  let keystack: string[] = [];

  const cIdx = cols.length - 1;

  let commands = [
    {
      triggers: [["ArrowUp"], ["k"]],
      action: () => setIdx(cIdx, curCol.idx - 1)
    },
    {
      triggers: [["ArrowDown"], ["j"]],
      action: () => setIdx(cIdx, curCol.idx + 1)
    },
    {
      triggers: [["ArrowLeft"], ["h"]],
      action: () => cols.length > 1 && setCols((xs) => xs.slice(0, -1))
    },
    {
      triggers: [["ArrowRight"], ["l"], ["Enter"]],
      action: () => curItem
        .subitems()
        .then((sub) => sub.length && setCols((xs) => [...xs, { items: sub, idx: 0 }]))
    },
    {
      triggers: [["g", "g"]],
      action: () => setIdx(cIdx, 0)
    },
    {
      triggers: [["G"]],
      action: () => setIdx(cIdx, curCol.items.length - 1)
    },
    {
      triggers: [["C-d"]],
      action: () => setIdx(cIdx, curCol.idx + 15)
    },
    {
      triggers: [["C-u"]],
      action: () => setIdx(cIdx, curCol.idx - 15)
    },
    {
      triggers: [["/"]],
      action: () => {
        setSearchMode(true);
        setSearchTerm("");
        setOriginalIdx(curCol.idx);
      }
    },
    {
      triggers: [["n"]],
      action: () => nextMatch()
    },
    {
      triggers: [["N"]],
      action: () => prevMatch()
    },
  ];

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const modifiedKey = (() => {
        let key = e.key;
        let prefix = '';

        if (e.ctrlKey) prefix += 'C-';
        if (e.metaKey) prefix += 'D-';  // Command key
        if (e.altKey) prefix += 'M-';   // Alt/Meta key  

        return prefix + key;
      })();

      if (searchMode) {
        if (modifiedKey === "Escape") {
          setSearchMode(false);
          setIdx(cIdx, originalIdx);
          return;
        }
        if (modifiedKey === "Enter") {
          setSearchMode(false);
          return;
        }
        if (modifiedKey === "Backspace") {
          const newTerm = searchTerm.slice(0, -1);
          setSearchTerm(newTerm);
          doSearch(newTerm);
          return;
        }
        if (modifiedKey.length === 1) {
          const newTerm = searchTerm + e.key;
          setSearchTerm(newTerm);
          doSearch(newTerm);
          return;
        }
        return;
      }

      keystack.push(modifiedKey);

      const allTriggers = commands.flatMap(cmd => cmd.triggers);

      // Check for exact match
      const exactMatch = commands.find(cmd =>
        cmd.triggers.some(trigger =>
          JSON.stringify(trigger) === JSON.stringify(keystack)
        )
      );

      if (exactMatch) {
        exactMatch.action();
        e.preventDefault();
        keystack = [];
        return;
      }

      // Check if keystack is prefix of any trigger
      const isPrefix = allTriggers.some(trigger =>
        trigger.slice(0, keystack.length).every((key, i) => key === keystack[i])
      );

      if (!isPrefix) {
        keystack = [];
      }
    },
    [cols, curCol, curItem, searchMode]
  );

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
        <div style={{ maxHeight: "100%", overflow: "scroll", flex: 1 }}>{curItem?.display()}</div>
      </div>
    </div>
  );
}
