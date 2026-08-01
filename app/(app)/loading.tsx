import { BrandedLoading } from "@/components/ui/BrandedLoading";

/** Shared route loading shell while tab RSC data loads (PC-139 / PC-202). */
export default function AppRouteLoading() {
  return <BrandedLoading label="Loading…" />;
}
