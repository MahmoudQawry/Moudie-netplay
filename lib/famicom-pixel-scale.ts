export function getFamicomPixelPerfectCanvasSize(containerWidthPx: number, containerHeightPx: number, devicePixelRatio: number) {
  const sourceWidth = 256;
  const sourceHeight = 240;
  const ratio = Math.max(devicePixelRatio, 1);
  const scale = Math.max(1, Math.floor(Math.min(containerWidthPx / sourceWidth, containerHeightPx / sourceHeight)));
  return {
    scale,
    cssWidth: (sourceWidth * scale) / ratio,
    cssHeight: (sourceHeight * scale) / ratio,
  };
}
