/**
 * Shared Garden Brutalism surface styles — ink borders, oat/cream fills, no shadows.
 */
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS, ORGANIC_RADIUS, STROKE_DEFAULT, STROKE_HEAVY } from "@/theme/tokens";

export const brutalPaperSx = {
  p: 3,
  bgcolor: GARDEN_TOKENS.surface,
  border: STROKE_DEFAULT,
  borderRadius: ORGANIC_RADIUS,
  boxShadow: "none",
} as const;

export const brutalPageTitleSx = {
  fontFamily: fontFamilies.display,
  fontWeight: 700,
  color: GARDEN_TOKENS.ink,
} as const;

export const brutalSectionTitleSx = {
  fontFamily: fontFamilies.label,
  fontWeight: 600,
  color: GARDEN_TOKENS.ink,
} as const;

export const brutalDialogPaperSx = {
  bgcolor: GARDEN_TOKENS.surface,
  border: STROKE_HEAVY,
  borderRadius: ORGANIC_RADIUS,
  boxShadow: "none",
} as const;

export const brutalPopoverPaperSx = {
  bgcolor: GARDEN_TOKENS.surface,
  border: STROKE_DEFAULT,
  borderRadius: ORGANIC_RADIUS,
  boxShadow: "none",
  overflow: "hidden",
} as const;

export const brutalListItemSx = {
  border: STROKE_DEFAULT,
  borderRadius: ORGANIC_RADIUS,
  bgcolor: GARDEN_TOKENS.surface,
  mb: 1,
} as const;

export const brutalPersonRowSx = (selected: boolean) => ({
  p: 2,
  bgcolor: GARDEN_TOKENS.surface,
  border: selected ? `2px solid ${GARDEN_TOKENS.sage}` : STROKE_DEFAULT,
  borderRadius: ORGANIC_RADIUS,
  boxShadow: "none",
});
