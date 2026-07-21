"use client";

import { Box, Link, Stack, Typography } from "@mui/material";
import { useState, type CSSProperties, type ReactNode } from "react";

import type { FeedLinkPreview } from "@/lib/feed/types";
import {
  displayDomainFromUrl,
  normalizeLinkUrl,
  splitTextWithUrls,
} from "@/lib/feed/link-preview-core";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Facebook-style Open Graph card for a Feed body URL (PC-279).
 */
export function FeedLinkPreviewCard({ preview }: { preview: FeedLinkPreview }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = preview.url;
  const domain = displayDomainFromUrl(href);
  const showImage = Boolean(preview.imageUrl) && !imageFailed;

  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="feed-link-preview"
      sx={{
        display: "block",
        mt: 1,
        textDecoration: "none",
        color: "inherit",
        border: `1px solid ${GARDEN_TOKENS.inkMuted}`,
        borderRadius: 1,
        overflow: "hidden",
        bgcolor: GARDEN_TOKENS.surface,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={preview.imageUrl!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          sx={{
            display: "block",
            width: "100%",
            maxHeight: 180,
            objectFit: "cover",
            bgcolor: "action.selected",
          }}
        />
      ) : null}
      <Stack spacing={0.25} sx={{ p: 1.25 }}>
        <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted, textTransform: "uppercase" }}>
          {preview.siteName || domain}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
          {preview.title || domain}
        </Typography>
        {preview.description ? (
          <Typography
            variant="body2"
            sx={{
              color: GARDEN_TOKENS.inkMuted,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {preview.description}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

function linkifyNodes(body: string): ReactNode[] {
  return splitTextWithUrls(body).map((part, index) => {
    if (part.type === "url" && normalizeLinkUrl(part.value)) {
      return (
        <Link
          key={`${index}-${part.value}`}
          href={part.value}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          onClick={(e) => e.stopPropagation()}
        >
          {part.value}
        </Link>
      );
    }
    return <span key={`${index}-t`}>{part.value}</span>;
  });
}

/**
 * Renders feed body text with clickable http(s) links (PC-279).
 */
export function FeedLinkifiedBody({
  body,
  sx,
  inline = false,
}: {
  body: string;
  sx?: CSSProperties | Record<string, unknown>;
  /** When true, renders as an inline span (for comment lines). */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <Box component="span" data-testid="feed-linkified-body" sx={sx}>
        {linkifyNodes(body)}
      </Box>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...sx }}
      data-testid="feed-linkified-body"
    >
      {linkifyNodes(body)}
    </Typography>
  );
}
