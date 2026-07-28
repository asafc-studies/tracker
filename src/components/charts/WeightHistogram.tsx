"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "#6b7280", fontSize: 11 };
const grid = { stroke: "#2a2a2a" };

type Row = { date: string; weightKg: number };

export function WeightHistogram({
  data,
  highlightDate,
}: {
  data: Row[];
  highlightDate?: string;
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-8 text-center">
        No weight entries yet.
      </p>
    );
  }

  const min = Math.min(...data.map((d) => d.weightKg));
  const max = Math.max(...data.map((d) => d.weightKg));

  return (
    <div className="h-52 w-full md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} {...grid} />
          <XAxis
            dataKey="date"
            tick={axis}
            tickFormatter={(v) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={axis}
            domain={[min - 1, max + 1]}
            width={36}
            tickFormatter={(v) => String(v)}
          />
          <Tooltip
            contentStyle={{
              background: "#171717",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
            }}
            formatter={(value) => [`${value} kg`, "Weight"]}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="weightKg" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((entry) => (
              <Cell
                key={entry.date}
                fill={
                  highlightDate && entry.date === highlightDate
                    ? "#7dd3c0"
                    : "rgba(125, 211, 192, 0.45)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
