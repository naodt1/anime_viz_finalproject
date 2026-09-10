// Each chart (scatter/sankey/timeline) is built at a fixed "native"
// pixel size so its D3 scales/brush math never has to change. This wraps
// that native-size content in a container that's scaled down (via CSS
// transform) to fit whatever width the panel actually has, so charts stop
// overflowing their card on narrower screens instead of shrinking with it.
// Pointer coordinates (d3.pointer, the brush) account for CSS transforms
// automatically, so no interaction code needs to change.
export function makeResponsive(containerSelector, nativeWidth, nativeHeight) {
  const outer = document.querySelector(containerSelector);
  outer.style.overflow = 'hidden';

  const inner = document.createElement('div');
  inner.style.width = nativeWidth + 'px';
  inner.style.height = nativeHeight + 'px';
  inner.style.position = 'relative';
  inner.style.transformOrigin = 'top left';
  outer.appendChild(inner);

  function resize() {
    const scale = Math.min(1, outer.clientWidth / nativeWidth);
    inner.style.transform = `scale(${scale})`;
    outer.style.height = nativeHeight * scale + 'px';
  }

  new ResizeObserver(resize).observe(outer);
  resize();

  return inner;
}
