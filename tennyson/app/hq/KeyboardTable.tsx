import * as c from "tennyson/lib/core/common";
import * as rc from "tennyson/lib/web/react-common";

import {
  flexRender,
  type Table,
} from "@tanstack/react-table";

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

/* td:focus, */
td.selected
{
  background: red;
}

thead th:not(:first-child),
td {
	text-align: end;
}

th,
td {
	border: 1px solid;
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
        `;

export function KeyboardTable<Dims extends string>(props: {
  table: Table<Record<Dims, string | number>>;
  cursor: {
    rowIdx: number;
    colIdx: number;
  };
  goAbs: (rIdx: number, cIdx: number) => void;
}) {
  const { table, cursor, goAbs } = props;

  const rows = table.getRowModel().rows;
  const renderRange = (() => {
    const pageSize = 11;
    if (cursor.rowIdx < pageSize / 2) return { min: 0, max: pageSize };
    else if (cursor.rowIdx > rows.length - pageSize / 2)
      return { min: rows.length - pageSize, max: rows.length };
    return {
      min: Math.max(cursor.rowIdx - 5, 0),
      max: Math.min(cursor.rowIdx + 5 + 1, table.getRowModel().rows.length),
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
              {hg.headers.map((header) => (
                <th key={header.id}>
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
              <tr key={row.id}>
                {row.getVisibleCells().map((cell, cId) => (
                  <td
                    key={cell.id}
                    className={
                      rId === cursor.rowIdx && cId === cursor.colIdx
                        ? "selected"
                        : ""
                    }
                    onClick={() => goAbs(rId, cId)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
