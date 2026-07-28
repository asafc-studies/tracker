"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const axis = { stroke: "#6b7280", fontSize: 11 };
const grid = { stroke: "#2a2a2a" };

export function WeightChart({
  data,
}: {
  data: Array<{ date: string; weightKg: number }>;
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-10 text-center">
        No weight entries yet.
      </p>
    );
  }

  return (
    <div className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" {...grid} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(v) => v.slice(5)} />
          <YAxis
            tick={axis}
            domain={["dataMin - 1", "dataMax + 1"]}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#171717",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="#7dd3c0"
            strokeWidth={2}
            dot={false}
            name="Weight (kg)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
