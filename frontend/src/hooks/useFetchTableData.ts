import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { RowData } from "@/types/tableTypes";

const fetchTableData = async (
  url: string
): Promise<Record<string, RowData[]>> => {
  const response = await axios.get(url, {
    headers: { "Content-Type": "application/json" },
  });

  const transformedData: Record<string, RowData[]> = {};
  for (const key in response.data) {
    if (Array.isArray(response.data[key])) {
      transformedData[key] = response.data[key].map((row: RowData) => ({
        ...row,
        amountStx: row.amountUstx / 10 ** 6,
      }));
    } else {
      transformedData[key] = response.data[key];
    }
  }

  return transformedData;
};

export const useFetchTableDataWithQuery = (url: string, interval: number) => {
  return useQuery<Record<string, RowData[]>, Error>({
    queryKey: ["tableData", url],
    queryFn: () => fetchTableData(url),
    refetchInterval: interval,
    refetchIntervalInBackground: true,
  });
};
