"use client";

import { Box, Typography } from "@mui/material";

import { avatarSrcForKey } from "@/lib/constants/avatars";

export interface SleepingMapEdge {
  userLowId: string;
  userHighId: string;
  lowName: string;
  highName: string;
  lowAvatarKey: string | null;
  highAvatarKey: string | null;
}

interface SleepingMapViewProps {
  edges: SleepingMapEdge[];
}

const NODE_RADIUS = 22;

/**
 * Renders one partnership node with a clipped avatar (or initial fallback).
 */
function MapNode({
  id,
  x,
  y,
  name,
  avatarKey,
}: {
  id: string;
  x: number;
  y: number;
  name: string;
  avatarKey: string | null;
}) {
  const clipId = `map-avatar-${id}`;
  const src = avatarSrcForKey(avatarKey);
  const label = name.length > 14 ? `${name.slice(0, 12)}…` : name;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={x} cy={y} r={NODE_RADIUS} />
        </clipPath>
      </defs>
      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS}
        fill="#e3f2fd"
        stroke="#1565c0"
        strokeWidth={2}
      />
      {src ? (
        <image
          href={src}
          x={x - NODE_RADIUS}
          y={y - NODE_RADIUS}
          width={NODE_RADIUS * 2}
          height={NODE_RADIUS * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fontSize={14}
          fontWeight={600}
          fill="#1565c0"
        >
          {name.charAt(0).toUpperCase()}
        </text>
      )}
      <text x={x} y={y + 36} textAnchor="middle" fontSize={11} fill="currentColor">
        {label}
      </text>
    </g>
  );
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

  const nodes = new Map<string, { name: string; avatarKey: string | null }>();
  for (const edge of edges) {
    nodes.set(edge.userLowId, { name: edge.lowName, avatarKey: edge.lowAvatarKey });
    nodes.set(edge.userHighId, { name: edge.highName, avatarKey: edge.highAvatarKey });
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
        {nodeList.map(([id, node]) => {
          const pos = positions.get(id);
          if (!pos) return null;
          return (
            <MapNode
              key={id}
              id={id}
              x={pos.x}
              y={pos.y}
              name={node.name}
              avatarKey={node.avatarKey}
            />
          );
        })}
      </Box>
    </Box>
  );
}
