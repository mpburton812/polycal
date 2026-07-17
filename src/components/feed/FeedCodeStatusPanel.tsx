"use client";

import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { CodeStatusPanel } from "@/components/layout/CodeStatusPanel";
import type { BuildInfo } from "@/lib/env";
import type { ChangelogEntry } from "@/lib/changelog/entries";
import { Box } from "@mui/material";

/**
 * Feed Code Status — shared panel inside a collapsible, minimized by default.
 */
export function FeedCodeStatusPanel({
  buildInfo,
  changelog,
  latestEntry,
}: {
  buildInfo: BuildInfo;
  changelog: ChangelogEntry[];
  latestEntry: ChangelogEntry | null;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <AdminCollapsibleSection title="Code Status">
        <CodeStatusPanel
          buildInfo={buildInfo}
          changelog={changelog}
          latestEntry={latestEntry}
          embedded
        />
      </AdminCollapsibleSection>
    </Box>
  );
}
