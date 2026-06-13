import { van, View } from "@touchgrass/framework";
import * as d3 from "d3";
import type { DataMapPoint } from "src/models/DataTypes";
import { VerseRef } from "src/models/VerseRef";
import BibleMapPlugin from "./BibleMapPlugin";
import "./BibleMap.css";

const { div } = van.tags;
const { svg, g, path, text, title, defs, clipPath, circle } = van.tags("http://www.w3.org/2000/svg");
export const BIBLE_MAP_VIEW_ID = "bible-map";

type BibleMapPoint = DataMapPoint;

type LabelPoint = {
  book: string;
  x: number;
  y: number;
  chapterCount: number;
};

type ShelfContour = {
  contour: d3.ContourMultiPolygon;
  intensity: number;
};

type ShelfContourResult = {
  contours: ShelfContour[];
  cacheHit: boolean;
  bandwidth: number;
};

type DotClusterPath = {
  cluster: number;
  fill: string;
  stroke: string;
  d: string;
};

type TerrainPathEntry = {
  d: string;
  fill: string;
  opacity: number;
};

type CountryPathEntry = {
  d: string;
  fill: string;
  stroke: string;
};

type BookLabelEntry = {
  labelText: string;
  x: number;
  y: number;
};

type ChapterLabelEntry = {
  key: string;
  labelText: string;
  x: number;
  y: number;
  dy: number;
  isActive: boolean;
};

type HitAreaEntry = {
  key: string;
  d: string;
  sectionTitle: string;
  point: BibleMapPoint;
  isActive: boolean;
};

type ActiveMarkerEntry = {
  x: number;
  y: number;
  scale: number;
};

const DEFAULT_MAP_TUNING = {
  landDensity: 0,
} as const;

type RenderProfile = {
  terrainThresholds: number;
  chapterFontPx: number;
  chapterLabelPadding: number;
  maxVisibleChapterLabels: number;
};

const TERRAIN_COLORS = {
  water: "#2e8bb5",
  lowland: "#9dd147",
  upland: "#6fb833",
  highland: "#4a9d2a",
  peak: "#316b1f",
  summit: "#1a3d10",
  alpine: "#0f2408",
  snow: "#b8d4e8",
  ice: "#d4e8f7",
  extreme: "#f0f4fa",
} as const;

const GOLDEN_ANGLE_DEGREES = 137.50776405003785;

const MAP_TUNING = {
  terrain: {
    bandwidthMin: 1,
    bandwidthMax: 8,
    bandwidthFactor: 0.9,
    thresholds: 16,
  },
  shelves: {
    minOpacity: 0.42,
    maxOpacity: 0.9,
  },
} as const;

export class BibleMapView extends View {
  readonly viewTypeId = BIBLE_MAP_VIEW_ID;
  private readonly margin = { top: 20, right: 20, bottom: 20, left: 20 };
  private readonly minBookLabelZoom = 1.35;
  private readonly minChapterLabelZoom = 4;
  private readonly dataPath = "data/bible-map-umap.json";
  private readonly mapCoordSize = 1000;
  private readonly mapCoordPadding = 24;
  private resizeObserver: ResizeObserver | null = null;
  private renderFrame: number | null = null;
  private labelFrame: number | null = null;
  private currentXScale: d3.ScaleLinear<number, number> | null = null;
  private currentYScale: d3.ScaleLinear<number, number> | null = null;
  private lastViewport = { width: 1200, height: 700 };
  private lastZoomTransform = d3.zoomIdentity;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private lastActiveVerseKey = "";

  private readonly worldTransformState = van.state("translate(0,0)");
  private readonly statusTextState = van.state("Loading map terrain...");
  private readonly viewBoxState = van.state("0 0 1200 700");
  private readonly mapLabelFontSizeState = van.state("18px");
  private readonly landClipPathState = van.state("");
  private readonly shelvesState = van.state<TerrainPathEntry[]>([]);
  private readonly countriesState = van.state<CountryPathEntry[]>([]);
  private readonly dotPathsState = van.state<DotClusterPath[]>([]);
  private readonly bookLabelsState = van.state<BookLabelEntry[]>([]);
  private readonly chapterLabelsState = van.state<ChapterLabelEntry[]>([]);
  private readonly hitAreasState = van.state<HitAreaEntry[]>([]);
  private readonly activeMarkerState = van.state<ActiveMarkerEntry | null>(null);
  private readonly showBookLabelsState = van.state(false);
  private readonly showChapterLabelsState = van.state(false);
  private readonly emptyMessageState = van.state<string | null>(null);
  private currentZoomScale = 1;
  private readonly chapterDotBaseRadius = 2.2;
  private readonly chapterDotRadiusEpsilon = 0.06;
  private points: BibleMapPoint[] = [];
  private shelfContourCache: ShelfContour[] | null = null;
  private shelfContourCacheKey = "";
  private terrainPathCache: { entries: TerrainPathEntry[]; landMaskPath: string } | null = null;
  private terrainPathCacheKey = "";
  private countryPathCache: CountryPathEntry[] | null = null;
  private renderProfile: RenderProfile = this.getRenderProfile(1200, 700);

  constructor(public plugin: BibleMapPlugin) {
    super("Bible Map", {});
  }

  create(): HTMLElement {
    return div(
      { class: "bible-map-view" },
      div(
        { class: "bible-map-root" },
        div({ class: "bible-map-status" }, () => this.statusTextState.val),
        svg(
          {
            class: "bible-map-canvas",
            viewBox: () => this.viewBoxState.val,
            preserveAspectRatio: "xMidYMid meet",
          },
          g(
            {
              class: "bible-map-world",
              transform: () => this.worldTransformState.val,
              style: () => `--map-label-font-size:${this.mapLabelFontSizeState.val};`,
            },
            defs(clipPath({ id: "bible-map-land-clip" }, path({ d: () => this.landClipPathState.val }))),
            () =>
              g(
                { class: "bible-map-land-shelves" },
                this.shelvesState.val.map(({ d, fill, opacity }) => path({ d, fill, opacity })),
              ),
            () =>
              g(
                {
                  class: "bible-map-countries",
                  clipPath: "url(#bible-map-land-clip)",
                  style: () => (this.countriesState.val.length > 0 ? "display:block;" : "display:none;"),
                },
                this.countriesState.val.map(({ d, fill }) => path({ d, fill, opacity: 0.16 })),
              ),
            () =>
              g(
                { class: "bible-map-chapter-dots" },
                this.dotPathsState.val.map(({ d, fill, stroke }) => path({ d, fill, stroke, opacity: 0.9 })),
              ),
            g({ class: "bible-map-active-chapter" }, () => {
              const marker = this.activeMarkerState.val;
              if (!marker) return "";
              return g(
                { transform: `translate(${marker.x}, ${marker.y}) scale(${marker.scale})` },
                circle({ class: "bible-map-active-chapter-glow", r: 10 }),
                circle({ class: "bible-map-active-chapter-core", r: 6.5 }),
              );
            }),
            () =>
              g(
                {
                  class: "bible-map-book-labels",
                  style: () => (this.showBookLabelsState.val ? "display:block;" : "display:none;"),
                },
                this.bookLabelsState.val.map(({ x, y, labelText }) =>
                  text({ x, y, "text-anchor": "middle" }, labelText),
                ),
              ),
            () =>
              g(
                {
                  class: "bible-map-chapter-labels",
                  style: () => (this.showChapterLabelsState.val ? "display:block;" : "display:none;"),
                },
                this.chapterLabelsState.val.map(({ x, y, dy, isActive, labelText }) =>
                  text({ x, y, dy, textAnchor: "middle", class: isActive ? "is-active" : "" }, labelText),
                ),
              ),
            () =>
              g(
                { class: "bible-map-hit-areas" },
                this.hitAreasState.val.map(({ d, isActive, point, sectionTitle }) =>
                  path(
                    {
                      d,
                      fill: "transparent",
                      stroke: "none",
                      class: isActive ? "is-active" : "",
                      style: "cursor:pointer;pointer-events:all;",
                      onclick: () =>
                        (this.plugin.app.verseState.val = new VerseRef(point.book, point.chapter, 1)),
                    },
                    title(sectionTitle),
                  ),
                ),
              ),
            () =>
              g(
                { class: "bible-map-empty-layer" },
                this.emptyMessageState.val
                  ? text(
                      { class: "bible-map-empty", x: 600, y: 320, textAnchor: "middle" },
                      this.emptyMessageState.val,
                    )
                  : [],
              ),
          ),
        ) as SVGSVGElement,
      ),
    );
  }

  onMount(): void {
    const rootEl = this.el.querySelector<HTMLDivElement>(".bible-map-root");
    const svgEl = this.el.querySelector<SVGSVGElement>(".bible-map-canvas");
    if (!rootEl || !svgEl) throw new Error("Map root/SVG element not found during onMount");

    this.initializeResizeObserver();
    this.initializeVerseStateListener();
    void this.loadAndRender();
  }

  onUnmount(): void {
    const rootEl = this.el.querySelector<HTMLDivElement>(".bible-map-root");
    if (this.resizeObserver && rootEl) {
      this.resizeObserver.unobserve(rootEl);
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.renderFrame !== null) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    if (this.labelFrame !== null) {
      cancelAnimationFrame(this.labelFrame);
      this.labelFrame = null;
    }
  }

  private initializeVerseStateListener(): void {
    van.derive(() => (void this.plugin.app.verseState.val, this.updateActiveChapterHighlight()));
  }

  private initializeResizeObserver(): void {
    const rootEl = this.el.querySelector<HTMLDivElement>(".bible-map-root");
    if (!rootEl || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.points.length) {
        return;
      }
      this.renderMapIfReady();
    });
    this.resizeObserver.observe(rootEl);
  }

  private async loadAndRender(): Promise<void> {
    try {
      const loadedPoints = await this.plugin.app.files.loadJSON<BibleMapPoint[]>(this.dataPath);
      this.points = this.normalizePoints(loadedPoints);
      this.shelfContourCache = null;
      this.shelfContourCacheKey = "";
      this.terrainPathCache = null;
      this.terrainPathCacheKey = "";
      this.countryPathCache = null;
      if (!this.points.length) {
        this.renderEmptyState("No map points available.");
        return;
      }
      this.renderMap();
      this.updateStatus(`${this.points.length.toLocaleString()} chapters mapped`);
    } catch (error) {
      this.plugin.app.console.error("Failed to load bible land map data", error);
      this.renderEmptyState(`Could not load ${this.dataPath}.`);
    }
  }

  private normalizePoints(points: BibleMapPoint[]): BibleMapPoint[] {
    return points
      .filter(
        point =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Number.isFinite(point.chapter) &&
          Number.isFinite(point.cluster),
      )
      .map(point => ({
        ...point,
        book: this.normalizeBookName(point.book),
        chapter: Math.max(1, Math.round(point.chapter)),
        cluster: Math.round(point.cluster),
      }));
  }

  private normalizeBookName(book: string): string {
    const incoming = (book || "").trim().toUpperCase();
    if (!incoming) {
      return "GENESIS";
    }

    const normalized = incoming.replace(/[^A-Z0-9]/g, "");
    const exact = VerseRef.booksOfTheBible.find(candidate => candidate === incoming);
    if (exact) {
      return exact;
    }

    const loose = VerseRef.booksOfTheBible.find(
      candidate => candidate.replace(/[^A-Z0-9]/g, "") === normalized,
    );
    return loose || incoming;
  }

  private renderMap(): void {
    const rootEl = this.el.querySelector<HTMLDivElement>(".bible-map-root");
    const svgEl = this.el.querySelector<SVGSVGElement>(".bible-map-canvas");
    if (!rootEl || !svgEl) {
      return;
    }

    const measuredWidth = rootEl.clientWidth;
    const measuredHeight = rootEl.clientHeight;

    if (measuredWidth > 0 && measuredHeight > 0) {
      this.lastViewport = { width: measuredWidth, height: measuredHeight };
    }

    const svgWidth = Math.max(measuredWidth || this.lastViewport.width, 400);
    const svgHeight = Math.max(measuredHeight || this.lastViewport.height, 280);
    this.renderProfile = this.getRenderProfile(svgWidth, svgHeight);
    const size = Math.min(svgWidth, svgHeight) - this.margin.left - this.margin.right;
    const mapOffsetX = Math.round((svgWidth - size) / 2);
    const mapOffsetY = Math.round((svgHeight - size) / 2);
    this.viewBoxState.val = `0 0 ${svgWidth} ${svgHeight}`;

    const baseMapScale = size / this.mapCoordSize;
    const tuning = this.getMapTuning();
    this.worldTransformState.val = `translate(${mapOffsetX}, ${mapOffsetY})`;

    const { xScale, yScale } = this.getMapScales();
    this.currentXScale = xScale;
    this.currentYScale = yScale;

    const contourResult = this.getShelfContours(xScale, yScale);
    const shelfContours = contourResult.contours;
    const terrainRenderData = this.getTerrainRenderData(shelfContours, tuning.landCutoff);
    const countryPathData = this.getCountryPathData(xScale, yScale);
    this.shelvesState.val = terrainRenderData.entries;
    const landMaskPath = terrainRenderData.landMaskPath;
    this.landClipPathState.val = landMaskPath || "";
    this.countriesState.val = landMaskPath ? countryPathData : [];

    let chapterDotPaths: DotClusterPath[] = [];
    let currentDotTier = -1;
    let lastDotRadius = this.chapterDotBaseRadius;
    const renderDotsForZoom = (relativeZoom: number, radius: number): void => {
      const nextTier = relativeZoom < 1.2 ? 0 : relativeZoom < 2.1 ? 1 : 2;
      if (nextTier === currentDotTier && chapterDotPaths.length > 0) {
        return;
      }
      currentDotTier = nextTier;
      const budget = this.getDotRenderBudget(relativeZoom);
      const dotPoints = this.getDotPointsForBudget(this.points, budget, xScale, yScale);
      chapterDotPaths = this.buildDotClusterPaths(dotPoints, xScale, yScale, radius);
      this.dotPathsState.val = chapterDotPaths;
    };
    renderDotsForZoom(1, lastDotRadius);

    this.renderBookLabels(xScale, yScale);
    this.showBookLabelsState.val = false;
    this.showChapterLabelsState.val = false;
    this.chapterLabelsState.val = [];

    const labelData = this.points.map(point => ({
      point,
      svgX: xScale(point.x),
      svgY: yScale(point.y),
    }));

    const LABEL_FONT_PX = this.renderProfile.chapterFontPx;
    const LABEL_PAD = this.renderProfile.chapterLabelPadding;

    const updateLabelScale = (k: number): void => {
      const relativeZoom = Math.max(0.1, k / baseMapScale);
      this.mapLabelFontSizeState.val = `${LABEL_FONT_PX / Math.max(k, 0.1)}px`;
      const dotRadius = this.chapterDotBaseRadius / relativeZoom;
      const radiusChanged = Math.abs(dotRadius - lastDotRadius) >= this.chapterDotRadiusEpsilon;
      const nextTier = relativeZoom < 1.2 ? 0 : relativeZoom < 2.1 ? 1 : 2;
      if (radiusChanged || nextTier !== currentDotTier) {
        if (radiusChanged) {
          lastDotRadius = dotRadius;
        }
        const budget = this.getDotRenderBudget(relativeZoom);
        const dotPoints = this.getDotPointsForBudget(this.points, budget, xScale, yScale);
        chapterDotPaths = this.buildDotClusterPaths(dotPoints, xScale, yScale, lastDotRadius);
        this.dotPathsState.val = chapterDotPaths;
        currentDotTier = nextTier;
      }
    };

    const placeChapterLabels = (k: number, tx: number, ty: number): void => {
      type Box = { x1: number; y1: number; x2: number; y2: number };
      const spatialBuckets = new Map<string, Box[]>();
      const visible: typeof labelData = [];
      const cellSize = LABEL_FONT_PX * 2.8;
      const canPlace = (box: Box): boolean => {
        const minCellX = Math.floor(box.x1 / cellSize);
        const maxCellX = Math.floor(box.x2 / cellSize);
        const minCellY = Math.floor(box.y1 / cellSize);
        const maxCellY = Math.floor(box.y2 / cellSize);

        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
            const bucket = spatialBuckets.get(`${cellX}:${cellY}`);
            if (!bucket) {
              continue;
            }
            if (
              bucket.some(
                existing =>
                  !(
                    box.x2 < existing.x1 ||
                    box.x1 > existing.x2 ||
                    box.y2 < existing.y1 ||
                    box.y1 > existing.y2
                  ),
              )
            ) {
              return false;
            }
          }
        }

        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
            const key = `${cellX}:${cellY}`;
            const bucket = spatialBuckets.get(key);
            if (bucket) {
              bucket.push(box);
            } else {
              spatialBuckets.set(key, [box]);
            }
          }
        }
        return true;
      };

      for (const d of labelData) {
        const sx = tx + d.svgX * k;
        const sy = ty + d.svgY * k;
        if (sx < 0 || sx > svgWidth || sy < 0 || sy > svgHeight) continue;
        const text = this.getChapterLabelText(d.point);
        const hw = (text.length * LABEL_FONT_PX * 0.58) / 2 + LABEL_PAD;
        const box: Box = { x1: sx - hw, y1: sy - LABEL_FONT_PX - LABEL_PAD, x2: sx + hw, y2: sy - LABEL_PAD };
        if (!canPlace(box)) continue;
        visible.push(d);
        if (visible.length >= this.renderProfile.maxVisibleChapterLabels) {
          break;
        }
      }
      this.chapterLabelsState.val = visible.map(d => ({
        key: this.getPointKey(d.point),
        labelText: this.getChapterLabelText(d.point),
        x: d.svgX,
        y: d.svgY,
        dy: -3 / k,
        isActive: this.isActivePoint(d.point),
      }));

      this.updateActiveChapterHighlight();
    };

    let pendingLabelPlacement: { k: number; tx: number; ty: number } | null = null;
    const scheduleChapterLabels = (k: number, tx: number, ty: number): void => {
      pendingLabelPlacement = { k, tx, ty };
      if (this.labelFrame !== null) {
        return;
      }
      this.labelFrame = requestAnimationFrame(() => {
        this.labelFrame = null;
        if (!pendingLabelPlacement) {
          return;
        }
        const { k: pendingK, tx: pendingTx, ty: pendingTy } = pendingLabelPlacement;
        pendingLabelPlacement = null;
        placeChapterLabels(pendingK, pendingTx, pendingTy);
      });
    };

    const delaunay = d3.Delaunay.from(
      this.points,
      point => xScale(point.x),
      point => yScale(point.y),
    );
    const voronoi = delaunay.voronoi([0, 0, this.mapCoordSize, this.mapCoordSize]);

    this.hitAreasState.val = this.points.map((point, index) => ({
      key: this.getPointKey(point),
      d: voronoi.renderCell(index),
      sectionTitle: `${point.book.toTitleCase()} ${point.chapter}`,
      point,
      isActive: this.isActivePoint(point),
    }));

    const hasCustomTransform =
      this.lastZoomTransform !== d3.zoomIdentity &&
      (this.lastZoomTransform.k !== 1 || this.lastZoomTransform.x !== 0 || this.lastZoomTransform.y !== 0);
    const initialTransform = hasCustomTransform
      ? this.lastZoomTransform
      : d3.zoomIdentity.translate(mapOffsetX, mapOffsetY).scale(baseMapScale);

    this.currentZoomScale = Math.max(0.1, initialTransform.k / baseMapScale);
    updateLabelScale(initialTransform.k);
    this.bindZoomAdapter(svgEl, {
      baseMapScale,
      initialTransform,
      updateLabelScale,
      scheduleChapterLabels,
    });
    this.showBookLabelsState.val = this.currentZoomScale >= this.minBookLabelZoom;
    this.emptyMessageState.val = null;
    this.updateActiveChapterHighlight();
  }

  private bindZoomAdapter(
    svgEl: SVGSVGElement,
    options: {
      baseMapScale: number;
      initialTransform: d3.ZoomTransform;
      updateLabelScale: (k: number) => void;
      scheduleChapterLabels: (k: number, tx: number, ty: number) => void;
    },
  ): void {
    const { baseMapScale, initialTransform, updateLabelScale, scheduleChapterLabels } = options;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 48])
      .on("zoom", event => {
        const relativeZoom = Math.max(0.1, event.transform.k / baseMapScale);
        this.currentZoomScale = relativeZoom;
        this.lastZoomTransform = event.transform;
        this.worldTransformState.val = `translate(${event.transform.x}, ${event.transform.y}) scale(${event.transform.k})`;
        updateLabelScale(event.transform.k);
        this.updateActiveChapterHighlight();
        this.showBookLabelsState.val = relativeZoom >= this.minBookLabelZoom;
        if (relativeZoom >= this.minChapterLabelZoom) {
          this.showChapterLabelsState.val = true;
          scheduleChapterLabels(event.transform.k, event.transform.x, event.transform.y);
        } else {
          this.showChapterLabelsState.val = false;
        }
      });

    this.zoomBehavior = zoom;
    const svgSelection = d3.select(svgEl);
    svgSelection.call(zoom).call(zoom.transform, initialTransform);
    svgSelection.on("dblclick.zoom", null);
  }

  private ensureActiveChapterInView(activePoint: BibleMapPoint): void {
    if (!this.zoomBehavior || !this.currentXScale || !this.currentYScale) {
      return;
    }

    const svgEl = this.el.querySelector<SVGSVGElement>(".bible-map-canvas");
    if (!svgEl) {
      return;
    }

    const width = Math.max(this.lastViewport.width, 400);
    const height = Math.max(this.lastViewport.height, 280);
    const currentTransform = this.lastZoomTransform;
    const mapX = this.currentXScale(activePoint.x);
    const mapY = this.currentYScale(activePoint.y);
    const screenX = currentTransform.x + mapX * currentTransform.k;
    const screenY = currentTransform.y + mapY * currentTransform.k;
    const padding = 80;

    const inView =
      screenX >= padding && screenX <= width - padding && screenY >= padding && screenY <= height - padding;

    if (inView) {
      return;
    }

    const targetTransform = d3.zoomIdentity
      .translate(width / 2 - mapX * currentTransform.k, height / 2 - mapY * currentTransform.k)
      .scale(currentTransform.k);

    d3.select(svgEl).call(this.zoomBehavior.transform, targetTransform);
  }

  private renderBookLabels(
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): void {
    const grouped = d3.group(this.points, point => point.book);
    const labelPoints: LabelPoint[] = [];

    for (const [book, points] of grouped) {
      if (!points.length) {
        continue;
      }
      labelPoints.push({
        book,
        x: d3.mean(points, point => xScale(point.x)) || 0,
        y: d3.mean(points, point => yScale(point.y)) || 0,
        chapterCount: points.length,
      });
    }

    const chapterCounts = labelPoints.map(point => point.chapterCount).sort((a, b) => a - b);
    const cutoff = d3.quantile(chapterCounts, 0.65) || 1;
    const prominent = labelPoints.filter(point => point.chapterCount >= cutoff);

    this.bookLabelsState.val = prominent.map(point => ({
      labelText: point.book.toTitleCase(),
      x: point.x,
      y: point.y,
    }));
  }

  private getTerrainColor(intensity: number, landCutoff: number): string {
    if (intensity < landCutoff) {
      return TERRAIN_COLORS.water;
    }
    const t = (intensity - landCutoff) / (1 - landCutoff);
    if (t < 0.1) return TERRAIN_COLORS.lowland;
    if (t < 0.2) return TERRAIN_COLORS.upland;
    if (t < 0.3) return TERRAIN_COLORS.highland;
    if (t < 0.4) return TERRAIN_COLORS.peak;
    if (t < 0.5) return TERRAIN_COLORS.summit;
    if (t < 0.6) return TERRAIN_COLORS.alpine;
    if (t < 0.7) return TERRAIN_COLORS.snow;
    if (t < 0.8) return TERRAIN_COLORS.ice;
    return TERRAIN_COLORS.extreme;
  }

  private getChapterDotColor(cluster: number): string {
    const hue = this.getClusterHue(cluster);
    return `hsl(${hue.toFixed(2)}deg 72% 66%)`;
  }

  private getChapterDotStrokeColor(cluster: number): string {
    const hue = this.getClusterHue(cluster);
    return `hsl(${hue.toFixed(2)}deg 42% 28%)`;
  }

  private getCountryColor(cluster: number): string {
    const index = Math.abs(Math.round(cluster));
    const hue = this.getClusterHue(index);
    const saturation = 28 + ((index * 17) % 7);
    const lightness = 50 + ((index * 29) % 9) - 4;
    return `hsl(${hue.toFixed(2)}deg ${saturation}% ${lightness}%)`;
  }

  private getClusterHue(cluster: number): number {
    return (Math.abs(Math.round(cluster)) * GOLDEN_ANGLE_DEGREES) % 360;
  }

  private getPointKey(point: Pick<BibleMapPoint, "book" | "chapter">): string {
    return `${this.normalizeBookName(point.book)}:${point.chapter}`;
  }

  private getChapterLabelText(point: Pick<BibleMapPoint, "book" | "chapter">): string {
    const normalizedBook = this.normalizeBookName(point.book);
    const bookIndex = VerseRef.booksOfTheBible.indexOf(normalizedBook);
    const shortBook = VerseRef.books3letter[bookIndex] || normalizedBook;
    return `${shortBook} ${point.chapter}`;
  }

  private getActiveVerseKey(): string {
    const verse = this.plugin.app.verseState.val;
    return `${this.normalizeBookName(verse.book)}:${verse.chapter}`;
  }

  private isActivePoint(point: Pick<BibleMapPoint, "book" | "chapter">): boolean {
    return this.getPointKey(point) === this.getActiveVerseKey();
  }

  private updateActiveChapterHighlight(): void {
    const activeVerseKey = this.getActiveVerseKey();
    const didActiveVerseChange = activeVerseKey !== this.lastActiveVerseKey;
    this.lastActiveVerseKey = activeVerseKey;

    this.hitAreasState.val = this.hitAreasState.val.map(entry => ({
      ...entry,
      isActive: entry.key === activeVerseKey,
    }));
    this.chapterLabelsState.val = this.chapterLabelsState.val.map(entry => ({
      ...entry,
      isActive: entry.key === activeVerseKey,
    }));

    const activePoint = this.points.find(point => this.getPointKey(point) === activeVerseKey);
    if (!activePoint || !this.currentXScale || !this.currentYScale) {
      this.activeMarkerState.val = null;
      return;
    }

    this.activeMarkerState.val = {
      x: this.currentXScale(activePoint.x),
      y: this.currentYScale(activePoint.y),
      scale: 1 / this.currentZoomScale,
    };

    if (didActiveVerseChange) {
      this.ensureActiveChapterInView(activePoint);
    }
  }

  private renderMapIfReady(): void {
    if (!this.points.length) {
      return;
    }
    if (this.renderFrame !== null) {
      return;
    }
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderMap();
    });
  }

  private getMapScales(): {
    xScale: d3.ScaleLinear<number, number>;
    yScale: d3.ScaleLinear<number, number>;
  } {
    const xExtent = d3.extent(this.points, point => point.x);
    const yExtent = d3.extent(this.points, point => point.y);
    const xMin = xExtent[0] ?? 0;
    const xMax = xExtent[1] ?? 1;
    const yMin = yExtent[0] ?? 0;
    const yMax = yExtent[1] ?? 1;

    const xScale = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([this.mapCoordPadding, this.mapCoordSize - this.mapCoordPadding]);
    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([this.mapCoordSize - this.mapCoordPadding, this.mapCoordPadding]);

    return { xScale, yScale };
  }

  private getDotRenderBudget(relativeZoom: number): number {
    if (relativeZoom < 1.2) {
      return 900;
    }
    if (relativeZoom < 2.1) {
      return 1800;
    }
    return Number.POSITIVE_INFINITY;
  }

  private getDotPointsForBudget(
    points: BibleMapPoint[],
    budget: number,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): BibleMapPoint[] {
    if (!Number.isFinite(budget) || points.length <= budget) {
      return points;
    }

    const cellSize = Math.max(4, this.mapCoordSize / Math.sqrt(budget));
    const sampled = new Map<string, BibleMapPoint>();

    for (const point of points) {
      const cellX = Math.floor(xScale(point.x) / cellSize);
      const cellY = Math.floor(yScale(point.y) / cellSize);
      const key = `${cellX}:${cellY}`;
      if (!sampled.has(key)) {
        sampled.set(key, point);
      }
    }

    return Array.from(sampled.values());
  }

  private buildDotClusterPaths(
    points: BibleMapPoint[],
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    radius: number,
  ): DotClusterPath[] {
    const commandsByCluster = new Map<number, string[]>();
    const diameter = radius * 2;

    for (const point of points) {
      const cluster = point.cluster;
      const cx = xScale(point.x);
      const cy = yScale(point.y);
      const command =
        `M${(cx - radius).toFixed(2)},${cy.toFixed(2)}` +
        `a${radius.toFixed(2)},${radius.toFixed(2)} 0 1,0 ${diameter.toFixed(2)},0` +
        `a${radius.toFixed(2)},${radius.toFixed(2)} 0 1,0 -${diameter.toFixed(2)},0`;

      const existing = commandsByCluster.get(cluster);
      if (existing) {
        existing.push(command);
      } else {
        commandsByCluster.set(cluster, [command]);
      }
    }

    return Array.from(commandsByCluster.entries()).map(([cluster, commands]) => ({
      cluster,
      fill: this.getChapterDotColor(cluster),
      stroke: this.getChapterDotStrokeColor(cluster),
      d: commands.join(""),
    }));
  }

  private getShelfContours(
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): ShelfContourResult {
    const bandwidth = Math.max(
      MAP_TUNING.terrain.bandwidthMin,
      Math.min(
        MAP_TUNING.terrain.bandwidthMax,
        Math.sqrt(this.points.length) * MAP_TUNING.terrain.bandwidthFactor,
      ),
    );
    const cacheKey = `${this.renderProfile.terrainThresholds}:${bandwidth.toFixed(3)}`;
    if (this.shelfContourCache && this.shelfContourCacheKey === cacheKey) {
      return {
        contours: this.shelfContourCache,
        cacheHit: true,
        bandwidth,
      };
    }

    const density = d3
      .contourDensity<BibleMapPoint>()
      .x(point => xScale(point.x))
      .y(point => yScale(point.y))
      .size([this.mapCoordSize, this.mapCoordSize])
      .bandwidth(bandwidth)
      .thresholds(this.renderProfile.terrainThresholds);

    const contours = density(this.points);
    const maxContourValue = d3.max(contours, contour => contour.value) || 1;
    const shelfContours = contours.map(contour => ({
      contour,
      intensity: contour.value / maxContourValue,
    }));

    this.shelfContourCache = shelfContours;
    this.shelfContourCacheKey = cacheKey;
    return {
      contours: shelfContours,
      cacheHit: false,
      bandwidth,
    };
  }

  private getTerrainRenderData(
    shelfContours: ShelfContour[],
    landCutoff: number,
  ): { entries: TerrainPathEntry[]; landMaskPath: string } {
    const cacheKey = `${this.shelfContourCacheKey}:${landCutoff.toFixed(3)}`;
    if (this.terrainPathCache && this.terrainPathCacheKey === cacheKey) {
      return this.terrainPathCache;
    }

    const pathGenerator = d3.geoPath();
    const visibleShelves = shelfContours
      .filter(entry => entry.intensity >= landCutoff)
      .sort((a, b) => a.intensity - b.intensity);

    const entries = visibleShelves.map(entry => ({
      d: pathGenerator(entry.contour) || "",
      fill: this.getTerrainColor(entry.intensity, landCutoff),
      opacity:
        MAP_TUNING.shelves.minOpacity +
        (entry.intensity - landCutoff) *
          ((MAP_TUNING.shelves.maxOpacity - MAP_TUNING.shelves.minOpacity) / (1 - landCutoff)),
    }));

    this.terrainPathCache = {
      entries,
      landMaskPath: entries.length > 0 ? entries[0].d : "",
    };
    this.terrainPathCacheKey = cacheKey;
    return this.terrainPathCache;
  }

  private getCountryPathData(
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): CountryPathEntry[] {
    if (this.countryPathCache) {
      return this.countryPathCache;
    }

    const countrySeeds = Array.from(
      d3
        .rollup(
          this.points,
          points => ({
            cluster: points[0].cluster,
            x: d3.mean(points, point => xScale(point.x)) || 0,
            y: d3.mean(points, point => yScale(point.y)) || 0,
          }),
          point => point.cluster,
        )
        .values(),
    );

    if (countrySeeds.length <= 1) {
      this.countryPathCache = [];
      return this.countryPathCache;
    }

    const countryRegions = countrySeeds.map(seed => {
      const fill = this.getCountryColor(seed.cluster);
      return {
        ...seed,
        fill,
        stroke: d3.color(fill)?.darker(0.8).formatRgb() || "#445",
      };
    });

    const countryDelaunay = d3.Delaunay.from(
      countryRegions,
      seed => seed.x,
      seed => seed.y,
    );
    const countryVoronoi = countryDelaunay.voronoi([0, 0, this.mapCoordSize, this.mapCoordSize]);

    this.countryPathCache = countryRegions.map((region, index) => ({
      d: countryVoronoi.renderCell(index),
      fill: region.fill,
      stroke: region.stroke,
    }));

    return this.countryPathCache;
  }

  private getRenderProfile(width: number, height: number): RenderProfile {
    const minDimension = Math.min(width, height);
    const isCoarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const isCompact = isCoarsePointer || minDimension < 760;

    return isCompact
      ? {
          terrainThresholds: 10,
          chapterFontPx: 18,
          chapterLabelPadding: 2,
          maxVisibleChapterLabels: 140,
        }
      : {
          terrainThresholds: MAP_TUNING.terrain.thresholds,
          chapterFontPx: 18,
          chapterLabelPadding: 2,
          maxVisibleChapterLabels: 260,
        };
  }

  private getMapTuning(): {
    landCutoff: number;
  } {
    return {
      landCutoff: DEFAULT_MAP_TUNING.landDensity,
    };
  }

  private renderEmptyState(message: string): void {
    this.updateStatus(message);
    this.landClipPathState.val = "";
    this.shelvesState.val = [];
    this.countriesState.val = [];
    this.dotPathsState.val = [];
    this.bookLabelsState.val = [];
    this.chapterLabelsState.val = [];
    this.hitAreasState.val = [];
    this.activeMarkerState.val = null;
    this.showBookLabelsState.val = false;
    this.showChapterLabelsState.val = false;
    this.emptyMessageState.val = message;
  }

  private updateStatus(text: string): void {
    this.statusTextState.val = text;
  }
}
