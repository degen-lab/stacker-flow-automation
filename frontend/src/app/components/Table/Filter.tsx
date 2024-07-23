import React from "react";
import { FilterProps, RowData } from "@/types/tableTypes";

export const Filter: React.FC<FilterProps<RowData>> = ({ column }) => {
  if (!("filterType" in column.columnDef)) {
    return null;
  }

  const columnFilterValue = column.getFilterValue();

  const handleInputChange = (value: string, index: number) => {
    if (column.columnDef.filterType === "number") {
      const numValue = value === "" ? undefined : Number(value);
      column.setFilterValue(
        (
          old: [number | undefined, number | undefined] = [undefined, undefined]
        ) => {
          const newValue = [...old];
          newValue[index] = numValue;

          // Ensure min is always less than or equal to max
          if (newValue[0] !== undefined && newValue[1] !== undefined) {
            if (index === 0 && newValue[0] > newValue[1]) {
              // If setting min and it's greater than max, swap values
              [newValue[0], newValue[1]] = [newValue[1], newValue[0]];
            } else if (index === 1 && newValue[1] < newValue[0]) {
              // If setting max and it's less than min, swap values
              [newValue[0], newValue[1]] = [newValue[1], newValue[0]];
            }
          }

          return newValue;
        }
      );
    } else {
      column.setFilterValue(value);
    }
  };

  const renderInput = (placeholder: string, index: number) => (
    <input
      type={column.columnDef.filterType === "number" ? "number" : "text"}
      value={
        Array.isArray(columnFilterValue)
          ? columnFilterValue[index] ?? ""
          : columnFilterValue ?? ""
      }
      onChange={(e) => handleInputChange(e.target.value, index)}
      placeholder={placeholder}
      className="w-24 border shadow rounded"
    />
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
      role="button"
      tabIndex={0}
      className="mt-2"
    >
      {column.columnDef.filterType === "number" ? (
        <div className="flex space-x-2">
          {renderInput("Min", 0)}
          {renderInput("Max", 1)}
        </div>
      ) : (
        renderInput("Search...", 0)
      )}
    </div>
  );
};
