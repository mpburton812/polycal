import { BrandedLoading } from "@/components/ui/BrandedLoading";

/** Lightweight shell while feed data loads (PC-225). */
export default function FeedLoading() {
  return <BrandedLoading label="Loading feed…" />;
}
