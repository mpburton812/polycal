"use client";

import { Box, Typography } from "@mui/material";

export interface SleepingMapEdge {
  userLowId: string;
  userHighId: string;
  lowName: string;
  highName: string;
}

interface SleepingMapViewProps {
  edges: SleepingMapEdge[];
}

/**
 * Simple partnership graph for the People & Places MAP tab (PC-73).
 */
export function SleepingMapView({ edges }: SleepingMapViewProps) {
  if (edges.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        No accepted sleeping partnerships to display.
      </Typography>
    );
  }

  const nodes = new Map<string, string>();
  for (const edge of edges) {
    nodes.set(edge.userLowId, edge.lowName);
    nodes.set(edge.userHighId, edge.highName);
  }

  const nodeList = [...nodes.entries()];
  const size = 320;
  const center = size / 2;
  const radius = size * 0.36;

  const positions = new Map<string, { x: number; y: number }>();
  nodeList.forEach(([id], index) => {
    const angle = (index / nodeList.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(id, {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    });
  });

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
      <Box
        component="svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Sleeping partnership map"
        sx={{ width: "100%", maxWidth: 480, height: "auto" }}
      >
        {edges.map((edge) => {
          const from = positions.get(edge.userLowId);
          const to = positions.get(edge.userHighId);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.userLowId}-${edge.userHighId}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#1565c0"
              strokeWidth={2}
              opacity={0.55}
            />
          );
        })}
        {nodeList.map(([id, name]) => {
          const pos = positions.get(id);
          if (!pos) return null;
          return (
            <g key={id}>
              <circle cx={pos.x} cy={pos.y} r={22} fill="#e3f2fd" stroke="#1565c0" strokeWidth={2} />
              <text
                x={pos.x}
                y={pos.y + 36}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
              >
                {name.length > 14 ? `${name.slice(0, 12)}…` : name}
              </text>
            </g>
          );
        })}
      </Box>
    </Box>
  );
}
