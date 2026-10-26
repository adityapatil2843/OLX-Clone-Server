# Design System

## Scope and evidence

**Verified:** This repository is the backend for the marketplace. No frontend source, component library, theme tokens, font declarations, or rendered UI assets were found in the inspected tree. Therefore exact colors, typography, spacing, breakpoints, and visual components are **Unknown** here.

**Planned:** The product should preserve an original India-focused marketplace identity across marketplace listings, vertical Reels, seller profiles, chat, and moderation. It must not copy OLX, Instagram, or TikTok branding.

## Rules for future UI work

- Treat any frontend repository or approved design file as the source of truth before adding visual tokens.
- Record approved brand colors, semantic light/dark tokens, typography, spacing, radii, elevation, icons, responsive breakpoints, and touch targets here once evidence exists.
- Reuse the same interaction language for listing cards, Reel cards, profiles, forms, navigation, upload states, moderation states, and empty/error states.
- Design for mobile-first discovery and touch interaction; verify keyboard access, focus visibility, labels, contrast, reduced motion, and non-color status cues.
- Keep English, Hindi, and Marathi text expansion in mind; do not hard-code widths around English copy.

## Current backend-facing constraints

- Media supports images and video, with Cloudinary currently used by the server adapter.
- API errors use a consistent `{ success: false, error: { message, details? } }` shape; client visual error states should preserve useful messages without exposing development stack traces.

## Open design inputs

- Approved brand identity and logo: **Unknown**.
- Frontend location and canonical design artifacts: **Unknown**.
- Accessibility baseline and dark-theme requirement: **Unknown**.
