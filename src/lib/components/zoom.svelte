<script module lang="ts">
  import type { IModalState, Nullable, SupportedImage, ZoomProps } from '$lib/types.js';
  import { ModalState } from '$lib/ui_states.js';
  import { portal } from '$lib/hooks/portal.js';
  import {
    generate_id,
    get_dialog_container,
    test_img,
    test_img_loaded,
    get_img_src,
    get_img_alt,
    get_style_modal_img,
    style_obj_to_css_string,
    get_style_ghost,
    parse_duration
  } from '$lib/utils.js';
  import ICompress from './icons/i-compress.svelte';
  import IEnlarge from './icons/i-enlarge.svelte';

  type BodyAttrs = {
    overflow: string;
    width: string;
  };

  /**
   * Allowed values for IMG crossOrigin policy attribute
   */
  const allowed_cross_origin_values = ['', 'anonymous', 'use-credentials'] as const;
  type CrossOriginValue = (typeof allowed_cross_origin_values)[number];

  /**
   * The selector query we use to find and track the image
   */
  const IMAGE_QUERY = ['img', '[role="img"]', '[data-zoom]']
    .map((x) => `${x}:not([aria-hidden="true"])`)
    .join(',');

  /**
   * Helps keep track of some key `<body>` attributes
   * so we can remove and re-add them when disabling and
   * re-enabling body scrolling
   */
  const default_body_attrs: BodyAttrs = {
    overflow: '',
    width: ''
  };
</script>

<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { BROWSER } from 'esm-env';

  let {
    a11y_name_button_unzoom = 'Minimize image',
    a11y_name_button_zoom = 'Expand image',
    children,
    class_dialog,
    class_button,
    duration = '300ms',
    icon_unzoom,
    icon_zoom,
    is_zoomed,
    on_zoom_change,
    wrap_element = 'div',
    zoom_content,
    zoom_margin = 0
  }: ZoomProps = $props();

  let _id = $state('');
  let img_el = $state<Nullable<SupportedImage>>(null);
  let loaded_img_el = $state<Nullable<HTMLImageElement>>(null);
  let modal_state = $state<IModalState>(ModalState.UNLOADED);
  let should_refresh = $state(false);

  let ref_content = $state<Nullable<HTMLDivElement>>(null);
  let ref_dialog = $state<Nullable<HTMLDialogElement>>(null);
  let ref_modal_content = $state<Nullable<HTMLDivElement>>(null);
  let ref_modal_img = $state<Nullable<HTMLImageElement>>(null);

  let is_zoomed_internal = $state(false); // for uncontrolled-mode
  // controlled or uncontrolled-mode
  const _is_zoomed = $derived(is_zoomed ?? is_zoomed_internal);

  let prev_body_attrs = $state(default_body_attrs);
  let timeout_transition_end = $state<ReturnType<typeof setTimeout> | undefined>();
  let img_el_resize_observer = $state<ResizeObserver>();

  const id_modal = $derived(`smiz-modal-${_id}`);
  const id_modal_img = $derived(`smiz-modal-img-${_id}`);
  const is_modal_active = $derived(
    modal_state === ModalState.LOADING || modal_state === ModalState.LOADED
  );

  const data_content_state = $derived(has_image() ? 'found' : 'not-found');
  const data_overlay_state = $derived(
    modal_state === ModalState.UNLOADED || modal_state === ModalState.UNLOADING
      ? 'hidden'
      : 'visible'
  );

  const is_img = $derived(test_img(img_el));

  const img_alt = $derived(get_img_alt(img_el));
  const img_src = $derived(get_img_src(img_el));
  const img_sizes = $derived(is_img ? (img_el as HTMLImageElement).sizes : undefined);
  const img_srcset = $derived(is_img ? (img_el as HTMLImageElement).srcset : undefined);
  const img_cross_origin = $derived.by(() => {
    if (!is_img) return;
    const val = (img_el as HTMLImageElement).crossOrigin;
    return typeof val === 'string' &&
      allowed_cross_origin_values.includes(val as CrossOriginValue)
      ? (val as CrossOriginValue)
      : undefined;
  });

  const label_btn_zoom = $derived(
    img_alt ? `${a11y_name_button_zoom}: ${img_alt}` : a11y_name_button_zoom
  );

  const style_modal_img_obj = $derived(
    has_image()
      ? get_style_modal_img({
          is_zoomed: _is_zoomed && is_modal_active,
          loaded_img_el,
          offset: zoom_margin,
          target_el: img_el as SupportedImage,
          should_refresh,
          img_src
        })
      : {}
  );
  const style_modal_img_string = $derived(style_obj_to_css_string(style_modal_img_obj));

  let style_ghost = $state<Record<string, string>>({});
  const style_ghost_string = $derived(style_obj_to_css_string(style_ghost));

  onMount(async () => {
    await set_and_track_img();
    handle_img_load();

    // because of SSR, set a unique ID after render
    _id = generate_id();
  });

  onDestroy(() => {
    if (modal_state !== ModalState.UNLOADED) {
      body_scroll_enable();
    }

    img_el?.removeEventListener('load', handle_img_load);
    img_el?.removeEventListener('click', handle_zoom);
    ref_modal_img?.removeEventListener('transitionend', handle_img_transition_end);
    img_el_resize_observer?.disconnect();

    if (BROWSER) {
      window.removeEventListener('resize', handle_resize);
      window.removeEventListener('wheel', handle_wheel);
      document.removeEventListener('keydown', handle_key_down, true);
    }
  });

  // handle modal_state changes
  $effect(() => {
    if (modal_state === ModalState.LOADING) {
      window.addEventListener('resize', handle_resize, { passive: true });
      document.addEventListener('keydown', handle_key_down, true);
    } else if (modal_state === ModalState.LOADED) {
      window.addEventListener('wheel', handle_wheel, { passive: true });
    } else if (modal_state === ModalState.UNLOADING) {
      ensure_img_transition_end();
      window.removeEventListener('wheel', handle_wheel);
      document.removeEventListener('keydown', handle_key_down, true);
    } else if (modal_state === ModalState.UNLOADED) {
      untrack(() => body_scroll_enable());
      window.removeEventListener('resize', handle_resize);
      ref_modal_img?.removeEventListener('transitionend', handle_img_transition_end);
      ref_dialog?.close();
    }
  });

  // handle isZoomed changes
  $effect(() => {
    if (_is_zoomed && modal_state === ModalState.UNLOADED) {
      untrack(() => zoom());
    } else if (!_is_zoomed && modal_state === ModalState.LOADED) {
      untrack(() => unzoom());
    }
  });

  // update --smiz-td (duration) variable
  $effect(() => {
    const parsed_duration = parse_duration(duration);
    const root = document.querySelector(':root');
    (root as HTMLElement).style.setProperty('--smiz-td', parsed_duration);
  });

  /**
   * prevents re-triggering updates.
   */
  function set_modal_state(new_state: IModalState) {
    if (modal_state !== new_state) {
      modal_state = new_state;
    }
  }

  /**
   * check if we have a loaded image to work with
   */
  function has_image() {
    return img_el && loaded_img_el && window.getComputedStyle(img_el).display !== 'none';
  }

  /**
   * find and set the image we're working with
   */
  async function set_and_track_img() {
    // wait for the DOM to update
    await tick();

    if (!ref_content) return;
    img_el = ref_content.querySelector(IMAGE_QUERY) as SupportedImage | null;

    if (img_el) {
      img_el.addEventListener('load', handle_img_load);
      img_el.addEventListener('click', handle_zoom);

      if (!loaded_img_el) {
        handle_img_load();
      }

      img_el_resize_observer?.observe(img_el);
      img_el_resize_observer = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (entry.target) {
          img_el = entry.target as SupportedImage;
          // update ghost and force a re-render.
          // always force a re-render here, even if we remove
          // all state changes. Pass `{}` in that case.
          style_ghost = get_style_ghost(img_el);
        }
      });
    }
  }

  /**
   * ensure we always have the latest img src value loaded
   */
  function handle_img_load() {
    if (!img_el) return;

    const img_src = get_img_src(img_el);
    if (!img_src) return;

    const img = new Image();

    if (test_img(img_el)) {
      img.sizes = img_el.sizes;
      img.srcset = img_el.srcset;
      img.crossOrigin = img_el.crossOrigin;
    }

    // img.src must be set after sizes and srcset
    // because of Firefox flickering on zoom
    img.src = img_src;

    const set_loaded = () => {
      loaded_img_el = img;
      style_ghost = get_style_ghost(img_el);
    };

    img
      .decode()
      .then(set_loaded)
      .catch(() => {
        if (test_img_loaded(img)) {
          set_loaded();
          return;
        }
        img.onload = set_loaded;
      });
  }

  /**
   * report that zooming should occur
   */
  function handle_zoom() {
    // https://github.com/moonlitgrace/svelte-medium-image-zoom/issues/49
    if (modal_state === ModalState.UNLOADING) return;

    if (is_zoomed === undefined) {
      // uncontrolled-mode
      is_zoomed_internal = true;
    } else {
      // controlled-mode
      if (has_image()) {
        on_zoom_change?.(true);
      }
    }
  }

  /**
   * report that unzooming should occur
   */
  function handle_unzoom() {
    // https://github.com/moonlitgrace/svelte-medium-image-zoom/issues/49
    if (modal_state === ModalState.LOADING) return;

    if (is_zoomed === undefined) {
      // uncontrolled-mode
      is_zoomed_internal = false;
    } else {
      // controlled-mode
      on_zoom_change?.(false);
    }
  }

  /**
   * capture click event when clicking unzoom button
   */
  function handle_unzoom_btn_click(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handle_unzoom();
  }

  /**
   * prevent the browser from removing the dialog on Escape
   */
  function handle_dialog_cancel(e: Event) {
    e.preventDefault();
  }

  /**
   *  have dialog.click() only close in certain situations
   */
  function handle_dialog_click(e: Event) {
    if (e.target === ref_modal_content || e.target === ref_modal_img) {
      e.stopPropagation();
      handle_unzoom();
    }
  }

  /**
   *  prevent dialog's close event from closing a parent modal
   */
  function handle_dialog_close(e: Event) {
    e.stopPropagation();
    handle_unzoom();
  }

  /**
   * intercept default dialog.close() and use ours so we can animate
   */
  function handle_key_down(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handle_unzoom();
    }
  }

  /**
   * unzoom on wheel event
   */
  function handle_wheel(e: WheelEvent) {
    // don't handle the event when the user is zooming with ctrl + wheel (or with pinch to zoom)
    if (e.ctrlKey) return;

    e.stopPropagation();
    queueMicrotask(() => {
      handle_unzoom();
    });
  }

  /**
   * force re-render on resize
   */
  function handle_resize() {
    should_refresh = true;
    tick().then(() => (should_refresh = false));
  }

  /**
   * perform zooming actions
   */
  function zoom() {
    body_scroll_disable();
    ref_dialog?.showModal();
    ref_modal_img?.addEventListener('transitionend', handle_img_transition_end);
    set_modal_state(ModalState.LOADING);
  }

  /**
   * perform unzooming actions
   */
  function unzoom() {
    set_modal_state(ModalState.UNLOADING);
  }

  /**
   * handle img zoom/unzoom transitionend events and update states:
   *   - LOADING -> LOADED
   *   - UNLOADING -> UNLOADED
   */
  function handle_img_transition_end() {
    clearTimeout(timeout_transition_end);

    if (modal_state === ModalState.LOADING) {
      modal_state = ModalState.LOADED;
    } else if (modal_state === ModalState.UNLOADING) {
      should_refresh = false;
      modal_state = ModalState.UNLOADED;
    }
  }

  /**
   * ensure handle_img_transition_end gets called. Safari can have significant
   * delays before firing the event.
   */
  function ensure_img_transition_end() {
    if (ref_modal_img) {
      const td = window.getComputedStyle(ref_modal_img).transitionDuration;
      const td_float = parseFloat(td);

      if (td_float) {
        const td_ms = td_float * (td.endsWith('ms') ? 1 : 1000) + 50;
        timeout_transition_end = setTimeout(handle_img_transition_end, td_ms);
      }
    }
  }

  /**
   * disable body scrolling
   */
  function body_scroll_disable() {
    prev_body_attrs = {
      overflow: document.body.style.overflow,
      width: document.body.style.width
    };

    // get clientWidth before setting overflow: 'hidden'
    const client_width = document.body.clientWidth;

    document.body.style.overflow = 'hidden';
    document.body.style.width = `${client_width}px`;
  }

  /**
   * enable body scrolling
   */
  function body_scroll_enable() {
    document.body.style.width = prev_body_attrs.width;
    document.body.style.overflow = prev_body_attrs.overflow;
    prev_body_attrs = default_body_attrs;
  }
</script>

{#snippet modal_img()}
  <img
    bind:this={ref_modal_img}
    alt={img_alt}
    crossorigin={img_cross_origin}
    src={img_src}
    srcset={img_srcset}
    sizes={img_sizes}
    data-smiz-modal-img=""
    id={id_modal_img}
    style={style_modal_img_string}
    width={style_modal_img_obj.width}
    height={style_modal_img_obj.height}
  />
{/snippet}

{#snippet modal_button_unzoom()}
  <button
    aria-label={a11y_name_button_unzoom}
    data-smiz-btn-unzoom=""
    onclick={handle_unzoom_btn_click}
    type="button"
    class={class_button}
  >
    {#if icon_unzoom}
      {@render icon_unzoom()}
    {:else}
      <ICompress />
    {/if}
  </button>
{/snippet}

{#snippet modal_content()}
  {#if zoom_content}
    {@render zoom_content({
      img: modal_img,
      button_unzoom: modal_button_unzoom,
      modal_state,
      handle_unzoom
    })}
  {:else}
    {@render modal_img()}
    {@render modal_button_unzoom()}
  {/if}
{/snippet}

<svelte:element this={wrap_element} aria-owns={id_modal} data-smiz="">
  <div
    bind:this={ref_content}
    data-smiz-content={data_content_state}
    style="visibility: {modal_state === ModalState.UNLOADED ? 'visible' : 'hidden'};"
  >
    {@render children()}
  </div>
  {#if has_image()}
    <svelte:element this={wrap_element} data-smiz-ghost="" style={style_ghost_string}>
      <button
        aria-label={label_btn_zoom}
        data-smiz-btn-zoom=""
        onclick={handle_zoom}
        type="button"
        class={class_button}
      >
        {#if icon_zoom}
          {@render icon_zoom()}
        {:else}
          <IEnlarge />
        {/if}
      </button>
    </svelte:element>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <dialog
      use:portal={get_dialog_container()}
      bind:this={ref_dialog}
      aria-labelledby={id_modal_img}
      aria-modal="true"
      class={class_dialog}
      data-smiz-modal=""
      id={id_modal}
      onclick={handle_dialog_click}
      onclose={handle_dialog_close}
      oncancel={handle_dialog_cancel}
    >
      <div data-smiz-modal-overlay={data_overlay_state}></div>
      <div bind:this={ref_modal_content} data-smiz-modal-content="">
        {@render modal_content()}
      </div>
    </dialog>
  {/if}
</svelte:element>
