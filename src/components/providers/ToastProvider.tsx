"use client";

import { Alert, Snackbar } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastSeverity = "success" | "error" | "info" | "warning";

interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  /** Shows a transient snackbar instead of inline dialog alerts (PC-56). */
  showToast: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * App-wide toast host — success/error feedback as pop-ups (PC-56).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    severity: "info",
  });

  const showToast = useCallback((message: string, severity: ToastSeverity = "info") => {
    setToast({ open: true, message, severity });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
        // Vertically centered so toasts do not cover bottom AppTabs (PC-148).
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          zIndex: (theme) => theme.zIndex.snackbar + 100,
          top: "50% !important",
          transform: "translateY(-50%)",
        }}
      >
        <Alert
          onClose={() => setToast((current) => ({ ...current, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/** Returns toast helpers; falls back to no-op when used outside provider. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return { showToast: () => undefined };
  }
  return context;
}
