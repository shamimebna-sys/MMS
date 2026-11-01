"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TooltipPayload {
  value: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#E3EAF2] bg-white px-3 py-2 shadow-[0_8px_20px_rgb(38_54_74/0.1)]">
      <p className="text-[12px] font-semibold text-[#8291A5]">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#26364A]">
        {payload[0]?.value?.toLocaleString()}
      </p>
    </div>
  );
}

export function PipelineChart({ data }: { data: Array<{ name: string; count: number }> }) {
  return (
    <div className="h-[260px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="stageBarFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#55A9EF" />
              <stop offset="100%" stopColor="#398FD5" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E3EAF2" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-32}
            textAnchor="end"
            height={72}
            tick={{ fontSize: 11, fill: "#8291A5" }}
            axisLine={{ stroke: "#E3EAF2" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tick={{ fontSize: 11, fill: "#8291A5" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgb(85 169 239 / 0.08)" }}
          />
          <Bar dataKey="count" fill="url(#stageBarFill)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
