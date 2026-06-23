import { createTheme } from "@mui/material/styles";

/** Material 3–aligned palette for PolyCal shell (Phase 0). */
export const polycalTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#5c6bc0",
    },
    secondary: {
      main: "#26a69a",
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        elevation: 1,
      },
    },
  },
});
