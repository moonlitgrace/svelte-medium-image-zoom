import type { Nullable, SupportedImage } from './types.js';

/**
 * @summary Generate random string id with given segments and length
 * @params
 * segments: string = 3
 * length: string = 4
 */
export const generate_id = (segments = 3, length = 4) =>
  Array.from({ length: segments }, () => Math.random().toString(16).slice(-length)).join(
    ''
  );

/**
 * @summary Find or create a container for the dialog
 */
export const get_dialog_container = (): HTMLElement => {
  let el = document.querySelector('[data-smiz-portal]');

  if (el == null) {
    el = document.createElement('div');
    el.setAttribute('data-smiz-portal', '');
    document.body.appendChild(el);
  }

  return el as HTMLDivElement;
};

/**
 * @summary Convert style object to css string
 * @params
 * style: string;
 * style = { top: 100px } => "top: 100px;"
 */
export const style_obj_to_css_string = (style: Record<string, string>) => {
  return Object.entries(style)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
};

/**
 * @summary Parse position based on relative number
 * @params
 * position: string;
 * relative_num: number;
 */
const parse_position = (position: string, relative_num: number): number => {
  const position_num = parseFloat(position);

  return position.endsWith('%') ? (relative_num * position_num) / 100 : position_num;
};

/**
 * @summary Parse given duration to proper formats
 * @param { string | number } input
 * @example
 * ### Example use
 * ```ts
 * const parsed_duration = parse_duration(3000);
 * // output: 3000ms
 * ```
 */
export const parse_duration = (input: string | number): string => {
  if (typeof input === 'number') {
    return `${input}ms`;
  }

  const regex = /^(\d+)(ms|s)?$/; // match '1000ms', '1s', or '1000'
  const match = String(input).trim().match(regex);

  if (match) {
    const [, value, unit] = match;
    return `${value}${unit || 'ms'}`;
  }

  console.warn('invalid duration format. falling back to default: 300ms');
  return '100ms';
};

interface TestElType {
  (type: string, e: unknown): boolean;
}

const test_el_type: TestElType = (type, el) => {
  return type === (el as Element)?.tagName?.toUpperCase();
};

export const test_div = (el: unknown): el is HTMLDivElement | HTMLSpanElement =>
  test_el_type('DIV', el) || test_el_type('SPAN', el);
export const test_img = (el: unknown): el is HTMLImageElement => test_el_type('IMG', el);
export const test_img_loaded = (el: HTMLImageElement) =>
  el.complete && el.naturalHeight !== 0;

const URL_REGEX = /url(?:\(['"]?)(.*?)(?:['"]?\))/;

interface GetImgSrc {
  (img_el: SupportedImage | null): string | undefined;
}

export const get_img_src: GetImgSrc = (img_el) => {
  if (!img_el) return;
  if (test_img(img_el)) {
    return img_el.currentSrc;
  } else if (test_div(img_el)) {
    const bg_img = window.getComputedStyle(img_el).backgroundImage;

    if (bg_img) {
      return URL_REGEX.exec(bg_img)?.[1];
    }
  }
};

interface GetImgAlt {
  (img_el: SupportedImage | null): string | undefined;
}

export const get_img_alt: GetImgAlt = (img_el) => {
  if (!img_el) return;
  if (test_img(img_el)) {
    return img_el.alt ?? undefined;
  } else {
    return img_el.getAttribute('aria-label') ?? undefined;
  }
};

interface ScaleToWindowParams {
  width: number;
  height: number;
  offset: number;
}

const get_scale_to_window = ({ height, offset, width }: ScaleToWindowParams): number => {
  return Math.min(
    (window.innerWidth - offset * 2) / width, // scale X-axis
    (window.innerHeight - offset * 2) / height // scale Y-axis
  );
};

interface ScaleToWindowMaxParams extends ScaleToWindowParams {
  container_height: number;
  container_width: number;
}

const get_scale_to_window_max = ({
  container_height,
  container_width,
  height,
  width,
  offset
}: ScaleToWindowMaxParams): number => {
  const scale = get_scale_to_window({
    height,
    width,
    offset
  });

  // gets ratio to ensure scaling respects the container
  const ratio = Math.max(width / container_width, height / container_height);

  return scale > 1 ? ratio : scale * ratio;
};

interface ScaleParams extends ScaleToWindowMaxParams {
  has_scalable_src: boolean;
}

const get_scale = ({
  container_height,
  container_width,
  height,
  width,
  offset,
  has_scalable_src
}: ScaleParams): number => {
  if (!container_height || !container_width) {
    return 1;
  }

  return !has_scalable_src && height && width
    ? get_scale_to_window_max({
      container_height,
      container_width,
      height,
      width,
      offset
    })
    : get_scale_to_window({
      height: container_height,
      width: container_width,
      offset
    });
};

interface RegularStyleParams extends ScaleParams {
  container_left: number;
  container_top: number;
}

const get_img_regular_style = ({
  container_height,
  container_left,
  container_top,
  container_width,
  height,
  width,
  offset,
  has_scalable_src
}: RegularStyleParams): Record<string, string> => {
  const scale = get_scale({
    container_height: container_height,
    container_width: container_width,
    height,
    width,
    offset,
    has_scalable_src
  });

  return {
    top: `${container_top}px`,
    left: `${container_left}px`,
    width: `${container_width * scale}px`,
    height: `${container_height * scale}px`,
    transform: `translate(0, 0) scale(${1 / scale})`
  };
};

interface DivStyleParams extends RegularStyleParams {
  background_position: string;
  background_size: string;
}

const get_div_img_style = ({
  background_position,
  background_size,
  container_height,
  container_width,
  container_left,
  container_top,
  height,
  width,
  offset,
  has_scalable_src
}: DivStyleParams): Record<string, string> => {
  // compute scaling ratio based on background_size
  function compute_ratio() {
    const width_ratio = container_width / width;
    const height_ratio = container_height / height;

    if (background_size === 'cover') {
      return Math.max(width_ratio, height_ratio);
    } else if (background_size === 'contain') {
      return Math.min(width_ratio, height_ratio);
    }

    const [size_w = '50%', size_h = '50%'] = background_size.split(' ');
    const size_width = parse_position(size_w, container_width);
    const size_height = parse_position(size_h, container_height);

    return Math.min(size_width / width, size_height / height);
  }

  const ratio = compute_ratio();
  // compute position based on background_position
  const [_pos_x = '50%', _pos_y = '50%'] = background_position.split(' ');
  const pos_x = parse_position(_pos_x, container_width - width * ratio);
  const pos_y = parse_position(_pos_y, container_height - height * ratio);

  // calculate scale
  const scale = get_scale({
    container_height: height * ratio,
    container_width: width * ratio,
    height,
    width,
    offset,
    has_scalable_src
  });

  return {
    top: `${container_top + pos_y}px`,
    left: `${container_left + pos_x}px`,
    width: `${width * ratio * scale}px`,
    height: `${height * ratio * scale}px`,
    transform: `translate(0,0) scale(${1 / scale})`
  };
};

interface ImgFitObjectStyleParams extends RegularStyleParams {
  object_fit: string;
  object_position: string;
}

const get_img_object_fit_style = ({
  object_fit,
  object_position,
  container_height,
  container_width,
  container_left,
  container_top,
  height,
  width,
  offset,
  has_scalable_src
}: ImgFitObjectStyleParams): Record<string, string> => {
  if (object_fit === 'scale-down') {
    if (width <= container_width && height <= container_height) {
      object_fit = 'none';
    } else {
      object_fit = 'contain';
    }
  }

  function compute_ratio() {
    const width_ratio = container_width / width;
    const height_ratio = container_height / height;

    return object_fit === 'cover' || object_fit === 'fill'
      ? Math.max(width_ratio, height_ratio)
      : object_fit === 'contain'
        ? Math.min(width_ratio, height_ratio)
        : 1;
  }

  const ratio = compute_ratio();

  // calculate scale
  const scale = get_scale({
    container_height: height * ratio,
    container_width: width * ratio,
    height,
    width,
    offset,
    has_scalable_src
  });
  // compute position based on object_position
  const [_pos_x = '50%', _pos_y = '50%'] = object_position.split(' ');
  const pos_x = parse_position(_pos_x, container_width - width * ratio);
  const pos_y = parse_position(_pos_y, container_height - height * ratio);

  if (object_fit === 'cover' || object_fit === 'contain') {
    return {
      top: `${container_top + pos_y}px`,
      left: `${container_left + pos_x}px`,
      width: `${width * ratio * scale}px`,
      height: `${height * ratio * scale}px`,
      transform: `translate(0,0) scale(${1 / scale})`
    };
  } else if (object_fit === 'none') {
    return {
      top: `${container_top + pos_y}px`,
      left: `${container_left + pos_x}px`,
      width: `${width * scale}px`,
      height: `${height * scale}px`,
      transform: `translate(0,0) scale(${1 / scale})`
    };
  } else if (object_fit === 'fill') {
    return {
      width: `${container_width * scale}px`,
      height: `${container_height * scale}px`,
      transform: `translate(0,0) scale(${1 / scale})`
    };
  } else {
    return {};
  }
};

const SRC_SVG_REGEX = /\.svg$/i;

interface ModalImgStyleParams {
  is_zoomed: boolean;
  loaded_img_el: HTMLImageElement | null;
  offset: number;
  target_el: SupportedImage;
  should_refresh: boolean;
  img_src: string | undefined;
}

export const get_style_modal_img = ({
  is_zoomed,
  loaded_img_el,
  offset,
  target_el,
  should_refresh,
  img_src
}: ModalImgStyleParams): Record<string, string> => {
  const has_scalable_src =
    img_src?.slice?.(0, 18) === 'data:image/svg+xml' ||
    !!(img_src && SRC_SVG_REGEX.test(img_src));

  const img_rect = target_el.getBoundingClientRect();
  const target_el_computed_style = window.getComputedStyle(target_el);

  const is_div_img = loaded_img_el != null && test_div(target_el);
  const is_img_object_fit = loaded_img_el != null && !is_div_img;

  const width = loaded_img_el?.naturalWidth || img_rect.width;
  const height = loaded_img_el?.naturalHeight || img_rect.height;

  const style_img_regular = get_img_regular_style({
    container_height: img_rect.height,
    container_width: img_rect.width,
    container_top: img_rect.top,
    container_left: img_rect.left,
    height,
    width,
    offset,
    has_scalable_src
  });

  const style_div_img = is_div_img
    ? get_div_img_style({
      background_position: target_el_computed_style.backgroundPosition,
      background_size: target_el_computed_style.backgroundSize,
      container_height: img_rect.height,
      container_width: img_rect.width,
      container_left: img_rect.left,
      container_top: img_rect.top,
      height,
      width,
      offset,
      has_scalable_src
    })
    : {};

  const style_img_object_fit = is_img_object_fit
    ? get_img_object_fit_style({
      object_position: target_el_computed_style.objectPosition,
      object_fit: target_el_computed_style.objectFit,
      container_height: img_rect.height,
      container_width: img_rect.width,
      container_left: img_rect.left,
      container_top: img_rect.top,
      height,
      width,
      offset,
      has_scalable_src
    })
    : {};

  const style = Object.assign({}, style_img_regular, style_img_object_fit, style_div_img);

  if (is_zoomed) {
    const viewport_x = window.innerWidth / 2;
    const viewport_y = window.innerHeight / 2;

    const child_center_x =
      parseFloat(String(style.left || 0)) + parseFloat(String(style.width || 0)) / 2;
    const child_center_y =
      parseFloat(String(style.top || 0)) + parseFloat(String(style.height || 0)) / 2;

    const translate_x = viewport_x - child_center_x;
    const translate_y = viewport_y - child_center_y;

    // for scenarios like resizing the browser window
    if (should_refresh) {
      style['transition-duration'] = '0.01ms';
    }

    style.transform = `translate(${translate_x}px,${translate_y}px) scale(1)`;
  }

  return style;
};

interface GhostStyleParams {
  img_el: Nullable<SupportedImage>;
}

export const get_style_ghost = (
  img_el: GhostStyleParams['img_el']
): Record<string, string> => {
  if (!img_el) return {};

  return {
    height: `${img_el.offsetHeight}px`,
    width: `${img_el.offsetWidth}px`,
    top: `${img_el.offsetTop}px`,
    left: `${img_el.offsetLeft}px`
  };
};
