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
  proposePartnershipAction,
  removePartnershipAction,
  respondPartnershipAction,
  type PartnershipView,
} from "@/actions/partnerships";
import {
  createPlaceAction,
  deletePlaceAction,
  listResidentsForPlaceAction,
  proposeResidencyAction,
  respondResidencyAction,
  updatePlaceAction,
  type PlaceSummary,
  type ResidentView,
} from "@/actions/places";
import { AVATAR_OPTIONS, avatarSrcForKey } from "@/lib/constants/avatars";

interface PeoplePlacesClientProps {
  people: PersonSummary[];
  places: PlaceSummary[];
  currentUserId: string;
  canProvision: boolean;
  isAdmin: boolean;
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
}: {
  open: boolean;
  onClose: () => void;
  canProvision: boolean;
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
          ? await createActiveUserAction({ username, displayName, role, avatarKey })
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
          {mode === "active" && (
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
  const [partnerTarget, setPartnerTarget] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canViewPartnerships = isAdmin || person.id === currentUserId;

  const candidates = useMemo(
    () => people.filter((row) => row.id !== person.id),
    [people, person.id],
  );

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
          {(person.id === currentUserId || isAdmin) && person.role !== "passive" && (
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id={`partner-${person.id}`}>Propose partner</InputLabel>
                <Select
                  labelId={`partner-${person.id}`}
                  label="Propose partner"
                  value={partnerTarget}
                  onChange={(event) => setPartnerTarget(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  MenuProps={{ disablePortal: false }}
                >
                  {candidates.map((row) => (
                    <MenuItem key={row.id} value={row.id}>
                      {row.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="small"
                variant="outlined"
                disabled={!partnerTarget || pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await proposePartnershipAction(
                      partnerTarget,
                      person.id !== currentUserId ? person.id : undefined,
                    );
                    setMessage(result.message);
                    setPartnerTarget("");
                    loadPartnerships();
                    router.refresh();
                  })
                }
              >
                Propose
              </Button>
            </Stack>
          )}
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
  const [pending, startTransition] = useTransition();

  const canEditPlace = isAdmin || place.createdById === currentUserId;
  const isResident = residents.some(
    (row) => row.userId === currentUserId && row.status === "accepted",
  );

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

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {canEditPlace && (
        <Stack direction="row" spacing={1}>
          {canEditPlace && (
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
          )}
          {isAdmin && (
            <Button
              size="small"
              color="error"
              onClick={() =>
                startTransition(async () => {
                  if (!window.confirm(`Delete ${place.name}? This cannot be undone.`)) {
                    return;
                  }
                  const result = await deletePlaceAction(place.id);
                  setMessage(result.message);
                  if (result.ok) {
                    onPlaceUpdated();
                    router.refresh();
                  }
                })
              }
            >
              Delete place
            </Button>
          )}
        </Stack>
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
          {row.isIncoming && row.userId === currentUserId && (
            <>
              <Button
                size="small"
                onClick={() =>
                  startTransition(async () => {
                    const result = await respondResidencyAction({
                      residencyId: row.id,
                      accept: true,
                    });
                    setMessage(result.message);
                    refreshResidents();
                    router.refresh();
                  })
                }
              >
                Accept
              </Button>
              <Button
                size="small"
                onClick={() =>
                  startTransition(async () => {
                    const result = await respondResidencyAction({
                      residencyId: row.id,
                      accept: false,
                    });
                    setMessage(result.message);
                    refreshResidents();
                    router.refresh();
                  })
                }
              >
                Decline
              </Button>
            </>
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
    </Stack>
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
}: PeoplePlacesClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [bedroomCount, setBedroomCount] = useState(1);
  const [bedroomLabels, setBedroomLabels] = useState<string[]>([""]);
  const [placeNameWarning, setPlaceNameWarning] = useState<string | null>(null);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedPerson = people.find((row) => row.id === selectedPersonId) ?? null;
  const existingPlaceNames = useMemo(() => places.map((place) => place.name), [places]);

  function validateNewPlaceName(name: string) {
    const taken = existingPlaceNames.some(
      (existing) => normalizePlaceName(existing) === normalizePlaceName(name),
    );
    setPlaceNameWarning(taken ? "A place with this name is already in use." : null);
    return !taken;
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="People" />
          <Tab label="Places" />
        </Tabs>
        {canProvision && tab === 0 && (
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Add person
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
              sx={{
                p: 2,
                border: 1,
                borderColor: selectedPersonId === person.id ? "primary.main" : "divider",
                borderRadius: 1,
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                onClick={() => {
                  if (!canExpand) return;
                  setSelectedPersonId((current) =>
                    current === person.id ? null : person.id,
                  );
                }}
                sx={{ cursor: canExpand ? "pointer" : "default" }}
              >
                <PersonAvatar avatarKey={person.avatarKey} name={person.displayName} />
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography fontWeight={600}>{person.displayName}</Typography>
                    <Chip size="small" label={person.role} variant="outlined" />
                  </Stack>
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
          <Stack spacing={1.5} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="subtitle1">Add place</Typography>
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
            <Button
              variant="contained"
              disabled={!placeName.trim() || Boolean(placeNameWarning) || pending}
              onClick={() =>
                startTransition(async () => {
                  if (!validateNewPlaceName(placeName)) return;
                  const result = await createPlaceAction({
                    name: placeName,
                    address: placeAddress || undefined,
                    bedroomCount,
                    bedroomNames: syncBedroomNames(bedroomCount, bedroomLabels),
                  });
                  setPlaceMessage(result.message);
                  if (result.ok) {
                    setPlaceName("");
                    setPlaceAddress("");
                    setBedroomCount(1);
                    setBedroomLabels([""]);
                    setPlaceNameWarning(null);
                    router.refresh();
                  }
                })
              }
            >
              Create place
            </Button>
            {placeMessage && <Alert severity="info">{placeMessage}</Alert>}
          </Stack>

          {places.map((place) => (
            <Box key={place.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
              <Typography fontWeight={600}>{place.name}</Typography>
              {place.address && (
                <Typography variant="body2" color="text.secondary">
                  {place.address}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {place.bedroomCount} bedrooms · {place.residentCount} residents
              </Typography>
              <PlaceDetail
                place={place}
                people={people}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                existingPlaceNames={existingPlaceNames}
                onPlaceUpdated={() => router.refresh()}
              />
            </Box>
          ))}
        </Stack>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        canProvision={canProvision}
      />
    </Box>
  );
}
