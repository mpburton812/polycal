import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

import { App } from "./App";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#6B8F71" },
    secondary: { main: "#C96E5A" },
    background: { default: "#F7F2EA", paper: "#FFFDF8" },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
