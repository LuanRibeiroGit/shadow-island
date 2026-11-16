/** Small pixel-art icons drawn as SVG rects (crisp at any scale, no icon font). */
const ICONS: Record<string, string[]> = {
  castle: ["..x.x.x.x..", "..xxxxxxx..", "...xxxxx...", "...x.x.x...", "...xxxxx...", "x.xxxxxxx.x", "xxxxxxxxxxx", "xxxx...xxxx", "xxxx...xxxx"],
  chart: ["x..........", "x.......xx.", "x....xx.xx.", "x.xx.xx.xx.", "x.xx.xx.xx.", "x.xx.xx.xx.", "xxxxxxxxxxx"],
  scroll: [".xxxxxxxx..", "x.......xx.", ".x.xxxx.x..", ".x......x..", ".x.xxxx.x..", ".x......x..", ".x.xxx..x..", "xx.....xx..", ".xxxxxxx..."],
  book: ["xxxxx.xxxxx", "x...x.x...x", "x.x.x.x.x.x", "x...x.x...x", "x.x.x.x.x.x", "x...x.x...x", "xxxxxxxxxxx"],
  ghost: ["...xxxxx...", "..xxxxxxx..", ".xx.xxx.xx.", ".xx.xxx.xx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".xxxxxxxxx.", ".x.xx.xx.x."],
  gear: ["....xxx....", ".x.xxxxx.x.", "..xxx.xxx..", ".xxx...xxx.", "..xxx.xxx..", ".x.xxxxx.x.", "....xxx...."],
  home: ["....xxx....", "...xxxxx...", "..xxxxxxx..", ".xxxxxxxxx.", "..x.....x..", "..x.xxx.x..", "..x.x.x.x..", "..xxx.xxx.."],
  sword: [".........xx", "........xxx", ".......xxx.", "..x...xxx..", "...x.xxx...", "....xxx....", "...xxxx....", "..xx..x....", ".xx........"],
  menu: ["xxxxxxxxxxx", "...........", "xxxxxxxxxxx", "...........", "xxxxxxxxxxx"],
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  const rows = ICONS[name] ?? ICONS.ghost!;
  const w = rows[0]!.length;
  const h = rows.length;
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${w + 2} ${w + 2}`} shapeRendering="crispEdges" aria-hidden="true">
      <g transform={`translate(0 ${(w - h) / 2})`} fill="currentColor">
        {rows.flatMap((r, y) => [...r].map((c, x) => (c === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
      </g>
    </svg>
  );
}
