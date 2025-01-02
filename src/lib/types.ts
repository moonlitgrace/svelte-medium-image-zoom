import type { Snippet } from 'svelte';

// ==================================================

export type Nullable<T> = T | null;

// ==================================================

export type SupportedImage = HTMLImageElement;

export interface BodyAttrs {
  overflow: string;
  width: string;
}

export interface ZoomProps {
  children: Snippet;
  dialogClass?: string;
  isZoomed?: boolean;
  onZoomChange?: (value: boolean) => void;
  wrapElement?: 'div' | 'span';
  zoomMargin?: number;
}
