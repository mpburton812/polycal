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
import { useMemo, useState, useTransition } from "react";

import {
  createActiveUserAction,
  createPassiveUserAction,
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
  listResidentsForPlaceAction,
  proposeResidencyAction,
  respondResidencyAction,
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
  const [pending, startTransition] = useTransition();

  if (!canProvision) return null;

  function reset() {
    setUsername("");
    setDisplayName("");
    setRole("user");
    setMessage(null);
    setInstructions(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    startTransition(async () => {
      const result =
        mode === "active"
          ? await createActiveUserAction({ username, displayName, role, avatarKey })
          : await createPassiveUserAction({ displayName, avatarKey });
      setMessage(result.message);
      if (result.loginInstructions) {
        setInstructions(result.loginInstructions);
      }
      if (result.ok) {
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
          <Tabs value={mode} onChange={(_, value) => setMode(value)}>
            <Tab label="Active user" value="active" />
            <Tab label="Passive profile" value="passive" />
          </Tabs>
          {mode === "active" && (
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              fullWidth
            />
          )}
          <TextField
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            fullWidth
          />
          {mode === "active" && (
            <FormControl fullWidth>
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
          <FormControl fullWidth>
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
          {instructions && (
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
        {instructions && (
          <Button onClick={() => void copyInstructions()}>Copy instructions</Button>
        )}
        <Button onClick={handleClose}>Close</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={pending}>
          Create
        </Button>
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
  const [loaded, setLoaded] = useState(false);
  const [partnerTarget, setPartnerTarget] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = useMemo(
    () => people.filter((row) => row.id !== person.id),
    [people, person.id],
  );

  function loadPartnerships() {
    startTransition(async () => {
      const rows = await listPartnershipsForUserAction(person.id);
      setPartnerships(rows);
      setLoaded(true);
    });
  }

  if (!loaded) {
    return (
      <Button size="small" onClick={loadPartnerships} sx={{ mt: 1 }}>
        Load sleeping partners
      </Button>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Typography variant="subtitle2">Sleeping partners</Typography>
      {partnerships.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No partnerships yet.
        </Typography>
      )}
      {partnerships.map((row) => (
        <Stack key={row.id} direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={row.status} color={row.status === "accepted" ? "success" : "warning"} />
          <Typography variant="body2">{row.partnerName}</Typography>
          {row.isIncoming && (
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
          {(row.status === "accepted" && (person.id === currentUserId || isAdmin)) && (
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
      {message && <Alert severity="info">{message}</Alert>}
    </Stack>
  );
}

function PlaceDetail({
  place,
  people,
  currentUserId,
}: {
  place: PlaceSummary;
  people: PersonSummary[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [residents, setResidents] = useState<ResidentView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadResidents() {
    startTransition(async () => {
      const rows = await listResidentsForPlaceAction(place.id);
      setResidents(rows);
      setLoaded(true);
    });
  }

  if (!loaded) {
    return (
      <Button size="small" onClick={loadResidents} sx={{ mt: 1 }}>
        Load residents
      </Button>
    );
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {place.bedroomNames.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Bedrooms: {place.bedroomNames.join(", ")}
        </Typography>
      )}
      {residents.map((row) => (
        <Stack key={row.id} direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={row.status} />
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
                    loadResidents();
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
                    loadResidents();
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
              loadResidents();
              router.refresh();
            })
          }
        >
          Associate
        </Button>
      </Stack>
      {message && <Alert severity="info">{message}</Alert>}
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
  const [bedroomCount, setBedroomCount] = useState(2);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedPerson = people.find((row) => row.id === selectedPersonId) ?? null;

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
          {people.map((person) => (
            <Box
              key={person.id}
              sx={{
                p: 2,
                border: 1,
                borderColor: selectedPersonId === person.id ? "primary.main" : "divider",
                borderRadius: 1,
                cursor: "pointer",
              }}
              onClick={() =>
                setSelectedPersonId((current) => (current === person.id ? null : person.id))
              }
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <PersonAvatar avatarKey={person.avatarKey} name={person.displayName} />
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={600}>{person.displayName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    @{person.username} · {person.role}
                  </Typography>
                </Box>
              </Stack>
              {selectedPersonId === person.id && selectedPerson && (
                <PersonDetail
                  person={selectedPerson}
                  people={people}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              )}
            </Box>
          ))}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Stack spacing={1.5} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="subtitle1">Add place</Typography>
            <TextField
              label="Home name"
              value={placeName}
              onChange={(event) => setPlaceName(event.target.value)}
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
              onChange={(event) => setBedroomCount(Number(event.target.value))}
              inputProps={{ min: 0, max: 20 }}
              fullWidth
            />
            <Button
              variant="contained"
              disabled={!placeName.trim() || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await createPlaceAction({
                    name: placeName,
                    address: placeAddress || undefined,
                    bedroomCount,
                  });
                  setPlaceMessage(result.message);
                  if (result.ok) {
                    setPlaceName("");
                    setPlaceAddress("");
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
              <PlaceDetail place={place} people={people} currentUserId={currentUserId} />
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
