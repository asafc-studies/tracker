"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "#6b7280", fontSize: 11 };
const grid = { stroke: "#2a2a2a" };

export function NutritionChart({
  data,
  proteinTarget,
}: {
  data: Array<{ date: string; proteinG: number; calories: number }>;
  proteinTarget?: number | null;
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-10 text-center">
        No nutrition logs in this range.
      </p>
    );
  }

  const withTarget = data.map((d) => ({
    ...d,
    proteinTarget: proteinTarget ?? undefined,
  }));

  return (
    <div className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={withTarget}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" {...grid} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(v) => v.slice(5)} />
          <YAxis yAxisId="p" tick={axis} width={36} />
          <YAxis yAxisId="c" orientation="right" tick={axis} width={40} />
          <Tooltip
            cursor={{ stroke: "rgba(125, 211, 192, 0.35)", strokeWidth: 1 }}
            contentStyle={{
              background: "#171717",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
            }}
          />
          <Legend />
          <Line
            yAxisId="p"
            type="monotone"
            dataKey="proteinG"
            stroke="#7dd3c0"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            name="Protein (g)"
          />
          {proteinTarget ? (
            <Line
              yAxisId="p"
              type="monotone"
              dataKey="proteinTarget"
              stroke="#4b5563"
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              name="Protein goal"
            />
          ) : null}
          <Line
            yAxisId="c"
            type="monotone"
            dataKey="calories"
            stroke="#a3a3a3"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            name="Calories"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
