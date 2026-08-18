"use client";

import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { Box, Stack, Typography } from "@mui/material";

import type { PersonSummary } from "@/actions/users";
import { OrganicAvatar } from "@/components/ui/OrganicAvatar";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import {
  inviteeIsSelected,
  nextInviteeSelection,
} from "@/lib/proposals/invitee-tap-cycle";

import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { POLY_GREEN } from "./proposalCardTheme";
import type { InviteeSelection } from "./proposalDraftDateUtils";

/**
 * Horizontal polycule Who chips. Tap cycles role; empty selection is Solo (PC-435).
 */
export function ProposalDraftWhoRow({
  candidates,
  inviteeMode,
  setInviteeRole,
  postingKind,
}: {
  candidates: PersonSummary[];
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  postingKind: "proposal" | "booking";
}) {
  return (
    <Box>
      <ProposalDraftSectionHeader
        icon={<GroupsOutlinedIcon fontSize="small" />}
        title="Who:"
        subtitle={
          postingKind === "booking"
            ? "Tap to book, tap again for optional. No one selected is a Solo Event."
            : "Tap for required, tap again for optional. No one selected is a Solo Event."
        }
      />
      {candidates.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No one else in this network yet — this will be a Solo Event.
        </Typography>
      ) : (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ overflowX: "auto", pb: 1, pt: 0.5 }}
        >
          {candidates.map((person) => {
            const mode = inviteeMode[person.id] ?? "none";
            const selected = inviteeIsSelected(mode);
            const roleLabel =
              mode === "none" ? "not selected" : mode;
            return (
              <Box
                key={person.id}
                component="button"
                type="button"
                aria-pressed={selected}
                aria-label={`${person.displayName} ${roleLabel}`}
                onClick={() =>
                  setInviteeRole(person.id, nextInviteeSelection(mode, postingKind))
                }
                sx={{
                  border: selected ? `2px solid ${POLY_GREEN}` : "2px solid transparent",
                  bgcolor: selected ? "rgba(107, 143, 113, 0.12)" : "transparent",
                  borderRadius: 2,
                  px: 1,
                  py: 0.75,
                  minWidth: 72,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <OrganicAvatar
                  src={avatarSrcForKey(person.avatarKey)}
                  alt=""
                  label={person.displayName}
                  size={40}
                />
                <Typography variant="caption" sx={{ textAlign: "center", lineHeight: 1.2 }}>
                  {person.displayName}
                </Typography>
                {selected ? (
                  <Typography variant="caption" sx={{ color: POLY_GREEN, fontWeight: 600 }}>
                    {mode === "booked"
                      ? "Booked"
                      : mode === "optional"
                        ? "Optional"
                        : "Required"}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
