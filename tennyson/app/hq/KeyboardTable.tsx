import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import { flexRender, type Table } from "@tanstack/react-table";

const tablestyle = `
table {
	text-align: left;
	border-collapse: collapse;
}

th,
caption {
	text-align: start;
}

table th {
	color: blue;
}

table:focus-within th {
	color: red;
}


thead {
	border-block-end: 2px solid;
	{/* background: whitesmoke; */}
}

tfoot {
	border-block: 2px solid;
	{/* background: whitesmoke; */}
}

th,
td {
	border: 1px solid lightgrey;
	padding: 0.25rem 0.75rem;
}

td.selected
{
  background: red !important;
}

thead th:not(:first-child),
td {
	text-align: end;
}

th,
td {
	border: 1px solid;
  max-width: 50px;
  overflow: clip;
  white-space: nowrap;
}

tr.highlight.expand td {
  white-space: normal;
  word-wrap: anywhere;
  max-height: 100px;
}

table {
	--color: #d0d0f5;
}

thead,
tfoot {
	background: var(--color);
}

tbody tr:nth-child(even) {
	background: color-mix(in srgb, var(--color), transparent 60%);
}

tbody tr.highlight, th.highlight, td.highlight {
  background: pink;
}
        `;

export function KeyboardTable<Dims extends string>(props: {
  table: Table<Record<Dims, string | number>>;
  cursor: {
    rowIdx: number;
    colIdx: number;
  };
  wrapFocusedRow?: boolean;
  goAbs: (rIdx: number, cIdx: number) => void;
  format?: Partial<
    Record<
      Dims,
      (a: string | number) => { text?: string | number; background?: string }
    >
  >;
  pageSize?: number;
}) {
  const { table, cursor, goAbs } = props;

  const rows = table.getRowModel().rows;
  const renderRange = (() => {
    const pageSize = props.pageSize ?? 11;
    if (cursor.rowIdx < pageSize / 2) return { min: 0, max: pageSize };
    else if (cursor.rowIdx > rows.length - pageSize / 2)
      return { min: rows.length - pageSize, max: rows.length };

    const above = Math.ceil((pageSize - 1) / 2)
    const below = pageSize - 1 - above
    return {
      min: Math.max(cursor.rowIdx - above, 0),
      max: Math.min(cursor.rowIdx + below + 1, table.getRowModel().rows.length),
    };
  })();
  const rowsToRender = rows.slice(renderRange.min, renderRange.max);

  return (
    <>
      <style>{tablestyle}</style>
      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header, i) => (
                <th
                  key={header.id}
                  className={i === cursor.colIdx ? "highlight" : ""}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rowsToRender.map((row, i) => {
            const rId = i + renderRange.min;
            return (
              <tr
                key={row.id}
                className={[
                  rId === cursor.rowIdx ? "highlight" : "",
                  props.wrapFocusedRow ? "expand" : "",
                ].join(" ")}
              >
                {row.getVisibleCells().map((cell, cId) => {
                  {
                    /* const formatFn = (cell.column.columnDef.meta as any)?.format; */
                  }
                  const formatFn = props.format
                    ? props.format[cell.column.id as Dims]
                    : undefined;
                  const { text, background } = formatFn
                    ? formatFn(cell.getValue() as string | number)
                    : {};
                  return (
                    <td
                      key={cell.id}
                      className={
                        cId === cursor.colIdx
                          ? rId === cursor.rowIdx
                            ? "selected"
                            : "highlight"
                          : ""
                      }
                      style={{
                        background,
                      }}
                      onClick={() => goAbs(rId, cId)}
                    >
                      {text ??
                        flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
