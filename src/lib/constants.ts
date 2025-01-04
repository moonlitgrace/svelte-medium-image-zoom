import type { BodyAttrs } from "./types.js";

/**
 * The selector query we use to find and track the image
 */
export const IMAGE_QUERY = ['img', '[role="img"]', '[data-zoom]']
  .map((x) => `${x}:not([aria-hidden="true"])`)
  .join(',');

/**
 * Helps keep track of some key `<body>` attributes
 * so we can remove and re-add them when disabling and
 * re-enabling body scrolling
 */
export const default_body_attrs: BodyAttrs = {
  overflow: '',
  width: ''
};

/**
 * Track if modak image shown(loaded), showing (loading),
 * hidden(unloaded), hiding(unloading)
*/
export const ModalState = Object.freeze({
  LOADED: 'LOADED',
  LOADING: 'LOADING',
  UNLOADED: 'UNLOADED',
  UNLOADING: 'UNLOADING'
});
