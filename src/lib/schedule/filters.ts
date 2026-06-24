import type { ScheduleEvent, ScheduleFilterMode } from "@/actions/schedule";

/**
 * Filters schedule events by network view mode (PC-42).
 */
export function filterScheduleEvents(
  events: ScheduleEvent[],
  mode: ScheduleFilterMode,
  viewerId: string,
  personId?: string,
  acceptedPartnerIds: string[] = [],
): ScheduleEvent[] {
  const partners = new Set(acceptedPartnerIds);

  return events.filter((event) => {
    if (event.isContentMasked && mode !== "whole") {
      return false;
    }

    switch (mode) {
      case "whole":
        return true;
      case "solo":
        return (
          event.intentionalSolo ||
          (event.proposerId === viewerId && event.participantIds.length <= 1)
        );
      case "sleeping_network":
        if (event.proposalType !== "sleeping") return false;
        return event.participantIds.some((id) => id === viewerId || partners.has(id));
      case "person":
        if (!personId) return true;
        return event.participantIds.includes(personId);
      default:
        return true;
    }
  });
}
