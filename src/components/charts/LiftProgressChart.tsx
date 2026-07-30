"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "#6b7280", fontSize: 11 };
const grid = { stroke: "#2a2a2a" };

export function LiftProgressChart({
  data,
}: {
  data: Array<{
    date: string;
    bestWeight: number;
    volume: number;
  }>;
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-10 text-center">
        No lift data for this selection.
      </p>
    );
  }

  return (
    <div className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" {...grid} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(v) => v.slice(5)} />
          <YAxis tick={axis} width={40} />
          <Tooltip
            cursor={{ stroke: "rgba(125, 211, 192, 0.35)", strokeWidth: 1 }}
            contentStyle={{
              background: "#171717",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="bestWeight"
            stroke="#7dd3c0"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={false}
            name="Best set (kg)"
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="#737373"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            name="Volume"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
