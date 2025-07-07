// Ranger.tsx
import React, { useState, useEffect, useCallback, JSX } from "react";

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

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const cIdx = cols.length - 1;
      switch (e.key) {
        case "ArrowUp":
        case "k":
          setIdx(cIdx, curCol.idx - 1);
          break;
        case "ArrowDown":
        case "j":
          setIdx(cIdx, curCol.idx + 1);
          break;
        case "ArrowLeft":
        case "h":
          if (cols.length > 1) setCols((xs) => xs.slice(0, -1));
          break;
        case "l":
        case "ArrowRight":
        case "Enter":
          curItem
            .subitems()
            .then((sub) => sub.length && setCols((xs) => [...xs, { items: sub, idx: 0 }]));
          break;
      }
    },
    [cols, curCol, curItem]
  );

  // keep focus for key events
  useEffect(() => {
    const n = document.getElementById("ranger-root");
    n?.focus();
  }, [cols]);

  return (
    <div>
      <div
        id="ranger-root"
        tabIndex={0}
        onKeyDown={onKey}
        style={{ display: "flex", outline: "none", height: "100%" }}
      >
        {cols.slice(-3).map((col, i) => (
          <div key={i} style={{ width: 300, maxHeight: 800, overflow: "scroll", borderRight: "1px solid #ccc", padding: 4 }}>
            {col.items.map((it, j) => (
              <div
                key={j}
                style={{
                  background: col.idx === j ? "#0070f3" : undefined,
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
      <div style={{ flex: 1, padding: 8 }}>{curItem?.display()}</div>
      </div>
    </div>
  );
}
