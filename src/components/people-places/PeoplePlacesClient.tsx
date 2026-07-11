"use client";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  checkUsernameAvailableAction,
  createActiveUserAction,
  createPassiveUserAction,
  updateProvisionedUsernameAction,
  type PersonSummary,
} from "@/actions/users";
import {
  listPartnershipsForUserAction,
  listSleepingPartnershipMapEdgesAction,
  removePartnershipAction,
  respondPartnershipAction,
  type PartnershipView,
  type SleepingPartnershipMapEdge,
} from "@/actions/partnerships";
import type { PlacesMapVisibility } from "@/types/poly-group";
import { SleepingMapView } from "@/components/people-places/SleepingMapView";
import {
  createPlaceAction,
  deletePlaceAction,
  getPlaceDeleteImpactAction,
  listResidentsForPlaceAction,
  proposeResidencyAction,
  updatePlaceAction,
  type PlaceDeleteImpact,
  type PlaceSummary,
  type ResidentView,
} from "@/actions/places";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { AVATAR_OPTIONS, avatarSrcForKey } from "@/lib/constants/avatars";
import { brutalPersonRowSx } from "@/theme/brutalUi";

interface PeoplePlacesClientProps {
  people: PersonSummary[];
  places: PlaceSummary[];
  currentUserId: string;
  canProvision: boolean;
  isAdmin: boolean;
  placesMapVisibility: PlacesMapVisibility;
  mapEdges: SleepingPartnershipMapEdge[];
}

function PersonAvatar({ avatarKey, name }: { avatarKey: string | null; name: string }) {
  const src = avatarSrcForKey(avatarKey);
  return <Avatar src={src} alt={name}>{name.slice(0, 1)}</Avatar>;
}

function normalizePlaceName(name: string): string {
  return name.trim().toLowerCase();
}

/** Keeps bedroom label array aligned with count, preserving user-entered names. */
function syncBedroomNames(count: number, existing: string[]): string[] {
  const safeCount = Math.max(0, Math.min(20, count));
  return Array.from({ length: safeCount }, (_, index) => {
    const value = existing[index]?.trim();
    return value || `Bedroom ${index + 1}`;
  });
}

function bedroomLabelsForForm(count: number, existing: string[]): string[] {
  const safeCount = Math.max(0, Math.min(20, count));
  return Array.from({ length: safeCount }, (_, index) => existing[index] ?? "");
}

function residentStatusColor(status: string): "success" | "warning" | "default" {
  if (status === "accepted") return "success";
  if (status === "proposed") return "warning";
  return "default";
}

function CreateUserDialog({
  open,
  onClose,
  canProvision,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  canProvision: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"active" | "passive">("active");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [avatarKey, setAvatarKey] = useState<string>(AVATAR_OPTIONS[0].key);
  const [message, setMessage] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<{
    checked: boolean;
    available: boolean;
    message: string;
  }>({ checked: false, available: false, message: "" });
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [creationComplete, setCreationComplete] = useState(false);
  const [pending, startTransition] = useTransition();

  const showActiveCredentials = mode === "active" && Boolean(instructions);
  const formLocked = creationComplete || showActiveCredentials;

  if (!canProvision) return null;

  function reset() {
    setUsername("");
    setDisplayName("");
    setRole("user");
    setMessage(null);
    setInstructions(null);
    setUsernameStatus({ checked: false, available: false, message: "" });
    setCreatedUserId(null);
    setTemporaryPassword(null);
    setCreationComplete(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function checkUsername() {
    if (mode !== "active" || !username.trim()) {
      setUsernameStatus({ checked: false, available: false, message: "" });
      return;
    }

    startTransition(async () => {
      if (createdUserId && temporaryPassword && instructions) {
        const result = await updateProvisionedUsernameAction({
          userId: createdUserId,
          username,
          temporaryPassword,
        });
        setUsernameStatus({
          checked: true,
          available: result.ok,
          message: result.message,
        });
        if (result.ok && result.loginInstructions) {
          setInstructions(result.loginInstructions);
        }
        if (result.ok) {
          router.refresh();
        }
        return;
      }

      const result = await checkUsernameAvailableAction(username);
      setUsernameStatus({
        checked: true,
        available: result.available,
        message: result.message,
      });
    });
  }

  function handleSubmit() {
    if (creationComplete || showActiveCredentials) {
      return;
    }

    if (mode === "active" && (!usernameStatus.checked || !usernameStatus.available)) {
      setMessage("Check username availability before creating the account.");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "active"
          ? await createActiveUserAction({
              username,
              displayName,
              role: isAdmin ? role : "user",
              avatarKey,
            })
          : await createPassiveUserAction({ displayName, avatarKey });
      setMessage(result.message);
      if (result.loginInstructions) {
        setInstructions(result.loginInstructions);
        setCreatedUserId(result.userId ?? null);
        setTemporaryPassword(result.temporaryPassword ?? null);
      }
      if (result.ok) {
        setCreationComplete(true);
        router.refresh();
      }
    });
  }

  async function copyInstructions() {
    if (!instructions) return;
    await navigator.clipboard.writeText(instructions);
    setMessage("Login instructions copied to clipboard.");
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add person</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Tabs
            value={mode}
            onChange={(_, value) => {
              if (formLocked) return;
              setMode(value);
              if (value === "passive") {
                setInstructions(null);
                setCreatedUserId(null);
                setTemporaryPassword(null);
              }
            }}
          >
            <Tab label="Active user" value="active" />
            <Tab label="Passive profile" value="passive" />
          </Tabs>
          {mode === "active" && (
            <TextField
              label="Username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setUsernameStatus({ checked: false, available: false, message: "" });
              }}
              onBlur={() => checkUsername()}
              required
              fullWidth
              disabled={formLocked}
              error={usernameStatus.checked && !usernameStatus.available}
              helperText={
                usernameStatus.checked
                  ? usernameStatus.message
                  : "Availability is checked when you leave this field."
              }
            />
          )}
          <TextField
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            fullWidth
            disabled={formLocked}
          />
          {mode === "active" && isAdmin && (
            <FormControl fullWidth disabled={formLocked}>
              <InputLabel id="create-user-role">Role</InputLabel>
              <Select
                labelId="create-user-role"
                label="Role"
                value={role}
                onChange={(event) => setRole(event.target.value as "user" | "admin")}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          )}
          {mode === "active" && !isAdmin && (
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              New accounts are created with User access. Only administrators can assign Admin.
            </Typography>
          )}
          <FormControl fullWidth disabled={formLocked}>
            <InputLabel id="create-user-avatar">Avatar</InputLabel>
            <Select
              labelId="create-user-avatar"
              label="Avatar"
              value={avatarKey}
              onChange={(event) => setAvatarKey(event.target.value)}
            >
              {AVATAR_OPTIONS.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {message && (
            <Alert severity={message.includes("Created") ? "success" : "info"}>{message}</Alert>
          )}
          {mode === "active" && instructions && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Share these credentials outside PolyCal (email/SMS):
              </Typography>
              <TextField multiline minRows={5} value={instructions} fullWidth InputProps={{ readOnly: true }} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {showActiveCredentials ? (
          <>
            <Button onClick={() => void copyInstructions()}>Copy instructions</Button>
            <Button variant="contained" onClick={handleClose}>
              Close
            </Button>
          </>
        ) : creationComplete ? (
          <Button variant="contained" onClick={handleClose}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={
                pending || (mode === "active" && (!usernameStatus.checked || !usernameStatus.available))
              }
            >
              Create
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function PersonDetail({
  person,
  people,
  currentUserId,
  isAdmin,
}: {
  person: PersonSummary;
  people: PersonSummary[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [partnerships, setPartnerships] = useState<PartnershipView[]>([]);
  const [partnershipsLoading, setPartnershipsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canViewPartnerships = isAdmin || person.id === currentUserId;

  function loadPartnerships() {
    setPartnershipsLoading(true);
    startTransition(async () => {
      const rows = await listPartnershipsForUserAction(person.id);
      setPartnerships(rows);
      setPartnershipsLoading(false);
    });
  }

  useEffect(() => {
    if (canViewPartnerships) {
      loadPartnerships();
    } else {
      setPartnerships([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when selected person changes
  }, [person.id, canViewPartnerships]);

  return (
    <Stack spacing={1.5} sx={{ mt: 2 }} onClick={(event) => event.stopPropagation()}>
      {canViewPartnerships && (
        <>
          <Typography variant="subtitle2">Sleeping partners</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Pending relationship proposals also appear on the Proposals tab.
          </Typography>
          {partnershipsLoading && (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}
          {!partnershipsLoading && partnerships.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No partnerships yet.
            </Typography>
          )}
          {partnerships.map((row) => (
            <Stack key={row.id} direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                label={row.status}
                color={row.status === "accepted" ? "success" : "warning"}
              />
              <Typography variant="body2">{row.partnerName}</Typography>
              {row.isIncoming && person.id === currentUserId && (
                <>
                  <Button
                    size="small"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await respondPartnershipAction({
                          partnershipId: row.id,
                          accept: true,
                        });
                        setMessage(result.message);
                        loadPartnerships();
                        router.refresh();
                      })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await respondPartnershipAction({
                          partnershipId: row.id,
                          accept: false,
                        });
                        setMessage(result.message);
                        loadPartnerships();
                        router.refresh();
                      })
                    }
                  >
                    Decline
                  </Button>
                </>
              )}
              {row.status === "accepted" && (person.id === currentUserId || isAdmin) && (
                <Button
                  size="small"
                  color="error"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removePartnershipAction(row.id);
                      setMessage(result.message);
                      loadPartnerships();
                      router.refresh();
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </Stack>
          ))}
        </>
      )}
      {message && <Alert severity="info">{message}</Alert>}
    </Stack>
  );
}

function PlaceDetail({
  place,
  people,
  currentUserId,
  isAdmin,
  existingPlaceNames,
  onPlaceUpdated,
}: {
  place: PlaceSummary;
  people: PersonSummary[];
  currentUserId: string;
  isAdmin: boolean;
  existingPlaceNames: string[];
  onPlaceUpdated: () => void;
}) {
  const router = useRouter();
  const [residents, setResidents] = useState<ResidentView[]>(place.residents);
  const [targetUserId, setTargetUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(place.name);
  const [editAddress, setEditAddress] = useState(place.address ?? "");
  const [editBedroomCount, setEditBedroomCount] = useState(place.bedroomCount);
  const [editBedroomLabels, setEditBedroomLabels] = useState<string[]>(
    bedroomLabelsForForm(place.bedroomCount, place.bedroomNames),
  );
  const [editNameWarning, setEditNameWarning] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<PlaceDeleteImpact | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isResident = residents.some(
    (row) => row.userId === currentUserId && row.status === "accepted",
  );
  const canEditPlace = isAdmin || place.createdById === currentUserId || isResident;
  const canDeletePlace = isAdmin || isResident || place.createdById === currentUserId;

  useEffect(() => {
    setResidents(place.residents);
    setEditName(place.name);
    setEditAddress(place.address ?? "");
    setEditBedroomCount(place.bedroomCount);
    setEditBedroomLabels(bedroomLabelsForForm(place.bedroomCount, place.bedroomNames));
  }, [place]);

  function refreshResidents() {
    startTransition(async () => {
      const rows = await listResidentsForPlaceAction(place.id);
      setResidents(rows);
    });
  }

  function validateEditName(name: string) {
    const normalized = normalizePlaceName(name);
    const taken = existingPlaceNames.some(
      (existing) =>
        normalizePlaceName(existing) === normalized &&
        normalizePlaceName(existing) !== normalizePlaceName(place.name),
    );
    setEditNameWarning(taken ? "A place with this name is already in use." : null);
    return !taken;
  }

  function openDeleteDialog() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await getPlaceDeleteImpactAction(place.id);
      if (!result.ok || !result.impact) {
        setDeleteError(result.message);
        return;
      }
      setDeleteImpact(result.impact);
      setDeleteOpen(true);
    });
  }

  function confirmDeletePlace() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deletePlaceAction(place.id);
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      setDeleteOpen(false);
      setDeleteImpact(null);
      setMessage(result.message);
      onPlaceUpdated();
      router.refresh();
    });
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {canEditPlace && (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setEditName(place.name);
              setEditAddress(place.address ?? "");
              setEditBedroomCount(place.bedroomCount);
              setEditBedroomLabels(
                bedroomLabelsForForm(place.bedroomCount, place.bedroomNames),
              );
              setEditNameWarning(null);
              setEditOpen(true);
            }}
          >
            Edit place
          </Button>
          {canDeletePlace && (
            <Button size="small" color="error" onClick={openDeleteDialog} disabled={pending}>
              Delete place
            </Button>
          )}
        </Stack>
      )}
      {!canEditPlace && canDeletePlace && (
        <Button size="small" color="error" onClick={openDeleteDialog} disabled={pending}>
          Delete place
        </Button>
      )}
      {place.bedroomNames.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Bedrooms: {place.bedroomNames.join(", ")}
        </Typography>
      )}
      <Typography variant="subtitle2">Residents</Typography>
      {residents.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No residents yet.
        </Typography>
      )}
      {residents.map((row) => (
        <Stack key={row.id} direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={row.status} color={residentStatusColor(row.status)} />
          <Typography variant="body2">{row.displayName}</Typography>
          {row.isIncoming && row.userId === currentUserId && row.status === "proposed" && (
            <Typography variant="caption" color="text.secondary">
              Respond in Proposals
            </Typography>
          )}
        </Stack>
      ))}
      {isAdmin && (
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id={`resident-${place.id}`}>Add resident</InputLabel>
            <Select
              labelId={`resident-${place.id}`}
              label="Add resident"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
            >
              {people.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            disabled={!targetUserId || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await proposeResidencyAction(place.id, targetUserId);
                setMessage(result.message);
                setTargetUserId("");
                refreshResidents();
                router.refresh();
              })
            }
          >
            Associate
          </Button>
        </Stack>
      )}
      {!isAdmin && isResident && (
        <Typography variant="caption" color="text.secondary">
          You are associated with this place.
        </Typography>
      )}
      {message && <Alert severity="info">{message}</Alert>}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit place</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Home name"
              value={editName}
              onChange={(event) => {
                setEditName(event.target.value);
                setEditNameWarning(null);
              }}
              onBlur={() => validateEditName(editName)}
              error={Boolean(editNameWarning)}
              helperText={editNameWarning ?? undefined}
              fullWidth
            />
            <TextField
              label="Address (optional)"
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
              fullWidth
            />
            <TextField
              label="Bedrooms"
              type="number"
              value={editBedroomCount}
              onChange={(event) => {
                const count = Number(event.target.value);
                setEditBedroomCount(count);
                setEditBedroomLabels((current) => syncBedroomNames(count, current));
              }}
              inputProps={{ min: 0, max: 20 }}
              fullWidth
            />
            {editBedroomCount > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Bedroom names (optional)</Typography>
                {editBedroomLabels.map((label, index) => (
                  <TextField
                    key={`edit-bedroom-${index}`}
                    label={`Bedroom ${index + 1} name`}
                    value={label}
                    placeholder={`Bedroom ${index + 1}`}
                    onChange={(event) => {
                      const next = [...editBedroomLabels];
                      next[index] = event.target.value;
                      setEditBedroomLabels(next);
                    }}
                    fullWidth
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!editName.trim() || Boolean(editNameWarning) || pending}
            onClick={() =>
              startTransition(async () => {
                if (!validateEditName(editName)) return;
                const result = await updatePlaceAction({
                  placeId: place.id,
                  name: editName,
                  address: editAddress || undefined,
                  bedroomCount: editBedroomCount,
                  bedroomNames: syncBedroomNames(editBedroomCount, editBedroomLabels),
                });
                setMessage(result.message);
                if (result.ok) {
                  setEditOpen(false);
                  onPlaceUpdated();
                  router.refresh();
                }
              })
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Delete {deleteImpact?.placeName ?? place.name}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>
              This cannot be undone. The place will be removed from the list.
            </Typography>
            {deleteImpact && deleteImpact.affectedProposalCount > 0 && (
              <Alert severity="warning">
                {deleteImpact.activeProposalCount > 0 && (
                  <Typography variant="body2">
                    {deleteImpact.activeProposalCount} active proposal
                    {deleteImpact.activeProposalCount === 1 ? "" : "s"} use this place.
                  </Typography>
                )}
                {deleteImpact.scheduledEventCount > 0 && (
                  <Typography variant="body2">
                    {deleteImpact.scheduledEventCount} scheduled future event
                    {deleteImpact.scheduledEventCount === 1 ? "" : "s"} use this place.
                  </Typography>
                )}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Affected proposals will move to Drafts. Proposers and invitees will be
                  notified.
                </Typography>
              </Alert>
            )}
            {deleteImpact && deleteImpact.pendingResidencyCount > 0 && (
              <Alert severity="info">
                {deleteImpact.pendingResidencyCount} pending residency proposal
                {deleteImpact.pendingResidencyCount === 1 ? "" : "s"} will be cancelled.
              </Alert>
            )}
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={pending} onClick={confirmDeletePlace}>
            Delete place
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function CreatePlaceDialog({
  open,
  onClose,
  existingPlaceNames,
}: {
  open: boolean;
  onClose: () => void;
  existingPlaceNames: string[];
}) {
  const router = useRouter();
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [bedroomCount, setBedroomCount] = useState(1);
  const [bedroomLabels, setBedroomLabels] = useState<string[]>([""]);
  const [placeNameWarning, setPlaceNameWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPlaceName("");
    setPlaceAddress("");
    setBedroomCount(1);
    setBedroomLabels([""]);
    setPlaceNameWarning(null);
    setMessage(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function validateNewPlaceName(name: string) {
    const taken = existingPlaceNames.some(
      (existing) => normalizePlaceName(existing) === normalizePlaceName(name),
    );
    setPlaceNameWarning(taken ? "A place with this name is already in use." : null);
    return !taken;
  }

  function handleCreate() {
    startTransition(async () => {
      if (!validateNewPlaceName(placeName)) return;
      const result = await createPlaceAction({
        name: placeName,
        address: placeAddress || undefined,
        bedroomCount,
        bedroomNames: syncBedroomNames(bedroomCount, bedroomLabels),
      });
      setMessage(result.message);
      if (result.ok) {
        router.refresh();
        handleClose();
      }
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add place</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Home name"
            value={placeName}
            onChange={(event) => {
              setPlaceName(event.target.value);
              setPlaceNameWarning(null);
            }}
            onBlur={() => {
              if (placeName.trim()) validateNewPlaceName(placeName);
            }}
            error={Boolean(placeNameWarning)}
            helperText={placeNameWarning ?? undefined}
            fullWidth
          />
          <TextField
            label="Address (optional)"
            value={placeAddress}
            onChange={(event) => setPlaceAddress(event.target.value)}
            fullWidth
          />
          <TextField
            label="Bedrooms"
            type="number"
            value={bedroomCount}
            onChange={(event) => {
              const count = Number(event.target.value);
              setBedroomCount(count);
              setBedroomLabels((current) => bedroomLabelsForForm(count, current));
            }}
            inputProps={{ min: 0, max: 20 }}
            fullWidth
          />
          {bedroomCount > 0 && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">Bedroom names (optional)</Typography>
              {bedroomLabels.map((label, index) => (
                <TextField
                  key={`new-bedroom-${index}`}
                  label={`Bedroom ${index + 1} name`}
                  value={label}
                  placeholder={`Bedroom ${index + 1}`}
                  onChange={(event) => {
                    const next = [...bedroomLabels];
                    next[index] = event.target.value;
                    setBedroomLabels(next);
                  }}
                  fullWidth
                />
              ))}
            </Stack>
          )}
          {message && <Alert severity={message.includes("Created") ? "success" : "info"}>{message}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!placeName.trim() || Boolean(placeNameWarning) || pending}
          onClick={handleCreate}
        >
          Create place
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Client shell for People & Places tab (PC-35–37).
 */
export function PeoplePlacesClient({
  people,
  places,
  currentUserId,
  canProvision,
  isAdmin,
  placesMapVisibility,
  mapEdges,
}: PeoplePlacesClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const showMapTab =
    placesMapVisibility === "all" || (placesMapVisibility === "admins" && isAdmin);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPlaceOpen, setCreatePlaceOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const selectedPerson = people.find((row) => row.id === selectedPersonId) ?? null;
  const existingPlaceNames = useMemo(() => places.map((place) => place.name), [places]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="People" />
          <Tab label="Places" />
          {showMapTab && <Tab label="MAP" />}
        </Tabs>
        {canProvision && tab === 0 && (
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Add person
          </Button>
        )}
        {tab === 1 && (
          <Button variant="contained" onClick={() => setCreatePlaceOpen(true)}>
            Add place
          </Button>
        )}
      </Stack>

      {tab === 0 && (
        <Stack spacing={1}>
          {people.map((person) => {
            const canExpand = isAdmin || person.id === currentUserId;
            return (
            <Box
              key={person.id}
              sx={brutalPersonRowSx(selectedPersonId === person.id)}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                role={canExpand ? "button" : undefined}
                tabIndex={canExpand ? 0 : undefined}
                aria-expanded={canExpand ? selectedPersonId === person.id : undefined}
                aria-label={canExpand ? `View ${person.displayName} details` : undefined}
                onClick={() => {
                  if (!canExpand) return;
                  setSelectedPersonId((current) =>
                    current === person.id ? null : person.id,
                  );
                }}
                onKeyDown={(event) => {
                  if (!canExpand) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPersonId((current) =>
                      current === person.id ? null : person.id,
                    );
                  }
                }}
                sx={{ cursor: canExpand ? "pointer" : "default" }}
              >
                <PersonAvatar avatarKey={person.avatarKey} name={person.displayName} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                    <Typography fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                      {person.displayName}
                    </Typography>
                    <Chip size="small" label={person.role} variant="outlined" />
                  </Stack>
                  {person.profileBio ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.25, overflowWrap: "anywhere" }}
                    >
                      {person.profileBio}
                    </Typography>
                  ) : null}
                </Box>
              </Stack>
              {canExpand && selectedPersonId === person.id && selectedPerson && (
                <PersonDetail
                  person={selectedPerson}
                  people={people}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              )}
            </Box>
          );
          })}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          {places.map((place) => (
            <AdminCollapsibleSection
              key={place.id}
              title={place.name}
              headerAction={
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                  {place.bedroomCount} bedrooms · {place.residentCount} residents
                </Typography>
              }
            >
              {place.address && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {place.address}
                </Typography>
              )}
              <PlaceDetail
                place={place}
                people={people}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                existingPlaceNames={existingPlaceNames}
                onPlaceUpdated={() => router.refresh()}
              />
            </AdminCollapsibleSection>
          ))}
        </Stack>
      )}

      {showMapTab && tab === 2 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Accepted sleeping partnerships in your network.
          </Typography>
          <SleepingMapView edges={mapEdges} />
        </Box>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        canProvision={canProvision}
        isAdmin={isAdmin}
      />
      <CreatePlaceDialog
        open={createPlaceOpen}
        onClose={() => setCreatePlaceOpen(false)}
        existingPlaceNames={existingPlaceNames}
      />
    </Box>
  );
}
