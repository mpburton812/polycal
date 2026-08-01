import { BrandedLoading } from "@/components/ui/BrandedLoading";

/** Lightweight shell while schedule data loads (PC-53 / PC-202). */
export default function ScheduleLoading() {
  return <BrandedLoading label="Loading schedule…" />;
}
