export interface QuickLocationPlace {
  id: string;
  name: string;
  residentUserIds: readonly string[];
}

export interface QuickLocationPerson {
  id: string;
  displayName: string;
}

export interface QuickLocationButton {
  locationId: string;
  label: string;
}

/**
 * Builds home quick-buttons: anchor person's places first, then selected others.
 * Anchor is the viewer unless booking on behalf of someone else.
 */
export function buildQuickLocationButtons(input: {
  places: readonly QuickLocationPlace[];
  people: readonly QuickLocationPerson[];
  viewerId: string;
  selectedUserIds: readonly string[];
  onBehalfOfUserId?: string | null;
}): QuickLocationButton[] {
  const anchorId =
    input.onBehalfOfUserId && input.onBehalfOfUserId !== input.viewerId
      ? input.onBehalfOfUserId
      : input.viewerId;
  const selected = new Set(input.selectedUserIds);
  const seen = new Set<string>();
  const buttons: QuickLocationButton[] = [];

  function nameFor(userId: string): string {
    if (userId === input.viewerId) return "My Place";
    return input.people.find((person) => person.id === userId)?.displayName ?? "Place";
  }

  function addHomes(userId: string, possessive: boolean) {
    const homes = input.places.filter((place) => place.residentUserIds.includes(userId));
    const personLabel = nameFor(userId);
    for (const place of homes) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      const base = possessive
        ? personLabel === "My Place"
          ? "My Place"
          : `${personLabel}'s place`
        : personLabel === "My Place"
          ? "My Place"
          : `${personLabel}'s ${place.name}`;
      const label = homes.length > 1 && personLabel === "My Place" ? `My Place (${place.name})` : base;
      const multiNamed =
        homes.length > 1 && personLabel !== "My Place"
          ? `${personLabel}'s ${place.name}`
          : label;
      buttons.push({ locationId: place.id, label: multiNamed });
    }
  }

  addHomes(anchorId, true);
  for (const userId of input.selectedUserIds) {
    if (userId === anchorId) continue;
    addHomes(userId, false);
  }
  void selected;
  return buttons;
}
