import { createTheme } from "@mui/material/styles";

import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/** Garden Brutalism base theme — ink borders, warm canvas, no default elevations. */
export const polycalTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: GARDEN_TOKENS.sage,
      contrastText: GARDEN_TOKENS.surface,
    },
    secondary: {
      main: GARDEN_TOKENS.mustard,
      contrastText: GARDEN_TOKENS.ink,
    },
    text: {
      primary: GARDEN_TOKENS.ink,
      secondary: GARDEN_TOKENS.inkMuted,
    },
    background: {
      default: GARDEN_TOKENS.background,
      paper: GARDEN_TOKENS.surface,
    },
    divider: GARDEN_TOKENS.outlineSoft,
  },
  typography: {
    fontFamily: fontFamilies.body,
    h1: { fontFamily: fontFamilies.display, fontWeight: 700 },
    h2: { fontFamily: fontFamilies.display, fontWeight: 700 },
    h3: { fontFamily: fontFamilies.display, fontWeight: 600 },
    h4: { fontFamily: fontFamilies.label, fontWeight: 600 },
    h5: { fontFamily: fontFamilies.label, fontWeight: 600 },
    h6: { fontFamily: fontFamilies.label, fontWeight: 600 },
    subtitle1: { fontFamily: fontFamilies.label },
    subtitle2: { fontFamily: fontFamilies.label, fontWeight: 600 },
    button: { fontFamily: fontFamilies.label, fontWeight: 600, textTransform: "none" },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: GARDEN_TOKENS.background,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          boxShadow: "none",
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          boxShadow: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        contained: {
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          "&:hover": {
            boxShadow: "none",
          },
        },
        outlined: {
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          color: GARDEN_TOKENS.ink,
          "&:hover": {
            bgcolor: GARDEN_TOKENS.background,
            border: `2px solid ${GARDEN_TOKENS.ink}`,
            boxShadow: "none",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            bgcolor: GARDEN_TOKENS.surface,
            "& fieldset": {
              borderColor: GARDEN_TOKENS.ink,
              borderWidth: 2,
            },
            "&:hover fieldset": {
              borderColor: GARDEN_TOKENS.ink,
            },
            "&.Mui-focused fieldset": {
              borderColor: GARDEN_TOKENS.ink,
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        outlined: {
          bgcolor: GARDEN_TOKENS.surface,
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        PaperProps: {
          elevation: 0,
        },
      },
    },
    MuiPopover: {
      defaultProps: {
        elevation: 0,
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          backgroundColor: GARDEN_TOKENS.ink,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.label,
          fontWeight: 600,
          textTransform: "none",
          color: GARDEN_TOKENS.inkMuted,
          "&.Mui-selected": {
            color: GARDEN_TOKENS.ink,
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          color: GARDEN_TOKENS.ink,
          textTransform: "none",
          fontFamily: fontFamilies.label,
          "&.Mui-selected": {
            bgcolor: GARDEN_TOKENS.sage,
            color: GARDEN_TOKENS.surface,
            "&:hover": {
              bgcolor: "#557A5C",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.label,
          fontWeight: 600,
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontFamily: fontFamilies.label,
        },
      },
    },
  },
});
