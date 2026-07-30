"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "#6b7280", fontSize: 11 };
const grid = { stroke: "#2a2a2a" };

export function EeeBurnChart({
  data,
}: {
  data: Array<{
    date: string;
    caloriesBurned: number;
    durationMinutes?: number;
  }>;
}) {
  const rows = data.filter((d) => d.caloriesBurned > 0);

  if (!rows.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-10 text-center">
        No workout burn logged yet. Add session duration on Exercises to track
        EEE.
      </p>
    );
  }

  return (
    <div className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
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
          <YAxis tick={axis} width={40} />
          <Tooltip
            cursor={{ fill: "rgba(125, 211, 192, 0.1)" }}
            contentStyle={{
              background: "#171717",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              color: "#e8e8e8",
            }}
            labelStyle={{ color: "#a3a3a3" }}
            itemStyle={{ color: "#e8e8e8" }}
            formatter={(value) => [`${value} kcal`, "EEE burn"]}
            labelFormatter={(label) => label}
          />
          <Bar
            dataKey="caloriesBurned"
            fill="rgba(125, 211, 192, 0.75)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            name="EEE (kcal)"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
