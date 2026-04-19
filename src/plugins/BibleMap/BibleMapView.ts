import { LayoutNode, View } from "@touchgrass/framework";
import * as d3 from "d3";
import { VerseRef } from "src/models/VerseRef";
import BibleMapPlugin from "./BibleMapPlugin";
import "./BibleMap.css";

export const BIBLE_MAP_VIEW_ID = "bible-map";

type BibleMapPoint = {
  book: string;
  chapter: number;
  x: number;
  y: number;
  cluster: number;
};

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
  private readonly margin = { top: 20, right: 20, bottom: 20, left: 20 };
  private readonly minBookLabelZoom = 1.35;
  private readonly minChapterLabelZoom = 4;
  private readonly dataPath = "data/bible-map-umap.json";
  private readonly mapCoordSize = 1000;
  private readonly mapCoordPadding = 24;
  private resizeObserver: ResizeObserver | null = null;
  private renderFrame: number | null = null;
  private labelFrame: number | null = null;
  private verseStateUnsubscribe: (() => void) | null = null;
  private rootEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private activeChapterLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private bookLabelLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private chapterLabelLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private chapterDotsLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
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

  constructor(
    panel: LayoutNode,
    public plugin: BibleMapPlugin,
  ) {
    super(panel);
    this.title = "Bible Map";
  }

  onAttach(): void {
    this.containerEl.empty();
    this.containerEl.addClass("bible-map-view");

    this.rootEl = this.containerEl.createEl("div", { cls: "bible-map-root" });
    this.statusEl = this.rootEl.createEl("div", { cls: "bible-map-status", text: "Loading map terrain..." });

    this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    this.svgEl.classList.add("bible-map-canvas");
    this.svgEl.setAttribute("viewBox", "0 0 1200 700");
    this.svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.rootEl.appendChild(this.svgEl);

    this.initializeResizeObserver();
    this.initializeVerseStateListener();
    void this.loadAndRender();
  }

  onDetach(): void {
    if (this.resizeObserver && this.rootEl) {
      this.resizeObserver.unobserve(this.rootEl);
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
    if (this.verseStateUnsubscribe) {
      this.verseStateUnsubscribe();
      this.verseStateUnsubscribe = null;
    }
  }

  private initializeVerseStateListener(): void {
    this.verseStateUnsubscribe = this.plugin.app.verseState.onChange(() => {
      this.updateActiveChapterHighlight();
    });
  }

  private initializeResizeObserver(): void {
    if (!this.rootEl || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.points.length) {
        return;
      }
      this.renderMapIfReady();
    });
    this.resizeObserver.observe(this.rootEl);
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
    if (!this.rootEl || !this.svgEl) {
      return;
    }

    const svgWidth = Math.max(this.rootEl.clientWidth, 400);
    const svgHeight = Math.max(this.rootEl.clientHeight, 280);
    this.renderProfile = this.getRenderProfile(svgWidth, svgHeight);
    const size = Math.min(svgWidth, svgHeight) - this.margin.left - this.margin.right;
    const mapOffsetX = Math.round((svgWidth - size) / 2);
    const mapOffsetY = Math.round((svgHeight - size) / 2);
    this.svgEl.style.width = "";
    this.svgEl.style.height = "";
    this.svgEl.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    const baseMapScale = size / this.mapCoordSize;
    const tuning = this.getMapTuning();

    const svg = d3.select(this.svgEl);
    svg.selectAll("*").remove();

    const worldLayer = svg
      .append("g")
      .attr("class", "bible-map-world")
      .attr("transform", `translate(${mapOffsetX}, ${mapOffsetY})`);

    const { xScale, yScale } = this.getMapScales();

    const contourResult = this.getShelfContours(xScale, yScale);
    const shelfContours = contourResult.contours;
    const terrainRenderData = this.getTerrainRenderData(shelfContours, tuning.landCutoff);
    const countryPathData = this.getCountryPathData(xScale, yScale);

    worldLayer
      .append("g")
      .attr("class", "bible-map-land-shelves")
      .selectAll("path")
      .data(terrainRenderData.entries)
      .join("path")
      .attr("d", entry => entry.d)
      .attr("fill", entry => entry.fill)
      .attr("opacity", entry => entry.opacity);

    const landMaskPath = terrainRenderData.landMaskPath;

    if (landMaskPath) {
      const landClipId = "bible-map-land-clip";
      const defs = worldLayer.append("defs");
      defs.append("clipPath").attr("id", landClipId).append("path").attr("d", landMaskPath);

      if (countryPathData.length > 0) {
        worldLayer
          .append("g")
          .attr("class", "bible-map-countries")
          .attr("clip-path", `url(#${landClipId})`)
          .selectAll("path")
          .data(countryPathData)
          .join("path")
          .attr("d", entry => entry.d)
          .attr("fill", entry => entry.fill)
          .attr("opacity", 0.16);
      }
    }

    let chapterDotPaths: d3.Selection<SVGPathElement, DotClusterPath, SVGGElement, unknown> | null = null;
    let currentDotTier = -1;
    let lastDotRadius = this.chapterDotBaseRadius;
    this.chapterDotsLayer = worldLayer.append("g").attr("class", "bible-map-chapter-dots");
    const renderDotsForZoom = (relativeZoom: number, radius: number): void => {
      if (!this.chapterDotsLayer) {
        return;
      }
      const nextTier = relativeZoom < 1.2 ? 0 : relativeZoom < 2.1 ? 1 : 2;
      if (nextTier === currentDotTier && chapterDotPaths) {
        return;
      }
      currentDotTier = nextTier;
      const budget = this.getDotRenderBudget(relativeZoom);
      const dotPoints = this.getDotPointsForBudget(this.points, budget, xScale, yScale);
      const dotClusterPaths = this.buildDotClusterPaths(dotPoints, xScale, yScale, radius);
      chapterDotPaths = this.chapterDotsLayer
        .selectAll<SVGPathElement, DotClusterPath>("path")
        .data(dotClusterPaths, entry => `${entry.cluster}`)
        .join("path")
        .attr("d", entry => entry.d)
        .attr("fill", entry => entry.fill)
        .attr("opacity", 0.9);
    };
    renderDotsForZoom(1, lastDotRadius);

    this.activeChapterLayer = worldLayer.append("g").attr("class", "bible-map-active-chapter");

    this.bookLabelLayer = this.renderBookLabels(worldLayer, xScale, yScale);
    this.bookLabelLayer.style("display", "none");

    const chapterLabelLayer = worldLayer.append("g").attr("class", "bible-map-chapter-labels");
    this.chapterLabelLayer = chapterLabelLayer;
    chapterLabelLayer.style("display", "none");

    const labelData = this.points.map(point => ({
      point,
      svgX: xScale(point.x),
      svgY: yScale(point.y),
    }));

    const LABEL_FONT_PX = this.renderProfile.chapterFontPx;
    const LABEL_PAD = this.renderProfile.chapterLabelPadding;

    const updateLabelScale = (k: number): void => {
      const relativeZoom = Math.max(0.1, k / baseMapScale);
      worldLayer.style("--map-label-font-size", `${LABEL_FONT_PX / Math.max(k, 0.1)}px`);
      const dotRadius = this.chapterDotBaseRadius / relativeZoom;
      if (chapterDotPaths && this.chapterDotsLayer) {
        const radiusChanged = Math.abs(dotRadius - lastDotRadius) >= this.chapterDotRadiusEpsilon;
        const nextTier = relativeZoom < 1.2 ? 0 : relativeZoom < 2.1 ? 1 : 2;
        if (radiusChanged || nextTier !== currentDotTier) {
          if (radiusChanged) {
            lastDotRadius = dotRadius;
          }
          const budget = this.getDotRenderBudget(relativeZoom);
          const dotPoints = this.getDotPointsForBudget(this.points, budget, xScale, yScale);
          const dotClusterPaths = this.buildDotClusterPaths(dotPoints, xScale, yScale, lastDotRadius);
          chapterDotPaths = this.chapterDotsLayer
            .selectAll<SVGPathElement, DotClusterPath>("path")
            .data(dotClusterPaths, entry => `${entry.cluster}`)
            .join("path")
            .attr("d", entry => entry.d)
            .attr("fill", entry => entry.fill)
            .attr("opacity", 0.9);
          currentDotTier = nextTier;
        }
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
      chapterLabelLayer
        .selectAll<SVGTextElement, (typeof labelData)[0]>("text")
        .data(visible, d => `${d.point.book}-${d.point.chapter}`)
        .join("text")
        .attr("x", d => d.svgX)
        .attr("y", d => d.svgY)
        .attr("dy", -3 / k)
        .attr("text-anchor", "middle")
        .classed("is-active", d => this.isActivePoint(d.point))
        .text(d => this.getChapterLabelText(d.point));

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

    worldLayer
      .append("g")
      .attr("class", "bible-map-hit-areas")
      .selectAll("path")
      .data(this.points)
      .join("path")
      .attr("d", (_point, index) => voronoi.renderCell(index))
      .attr("fill", "transparent")
      .attr("stroke", "none")
      .classed("is-active", point => this.isActivePoint(point))
      .style("cursor", "pointer")
      .style("pointer-events", "all")
      .on("click", (_event, point) => {
        this.plugin.app.verseState.set(new VerseRef(point.book, point.chapter, 1));
      })
      .append("title")
      .text(point => `${point.book.toTitleCase()} ${point.chapter}`);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 48])
      .on("zoom", event => {
        const relativeZoom = Math.max(0.1, event.transform.k / baseMapScale);
        this.currentZoomScale = relativeZoom;
        worldLayer.attr(
          "transform",
          `translate(${event.transform.x}, ${event.transform.y}) scale(${event.transform.k})`,
        );
        updateLabelScale(event.transform.k);
        this.updateActiveChapterHighlight();
        if (this.bookLabelLayer) {
          this.bookLabelLayer.style("display", relativeZoom >= this.minBookLabelZoom ? "block" : "none");
        }
        if (relativeZoom >= this.minChapterLabelZoom) {
          chapterLabelLayer.style("display", "block");
          scheduleChapterLabels(event.transform.k, event.transform.x, event.transform.y);
        } else {
          chapterLabelLayer.style("display", "none");
        }
      });

    const initialTransform = d3.zoomIdentity.translate(mapOffsetX, mapOffsetY).scale(baseMapScale);
    this.currentZoomScale = 1;
    updateLabelScale(initialTransform.k);
    svg.call(zoom).call(zoom.transform, initialTransform);
    svg.on("dblclick.zoom", null);
    if (this.bookLabelLayer) {
      this.bookLabelLayer.style("display", this.currentZoomScale >= this.minBookLabelZoom ? "block" : "none");
    }
    this.updateActiveChapterHighlight();
  }

  private renderBookLabels(
    worldLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): d3.Selection<SVGGElement, unknown, null, undefined> {
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

    const labelsLayer = worldLayer.append("g").attr("class", "bible-map-book-labels");
    labelsLayer
      .selectAll("text")
      .data(prominent)
      .join("text")
      .attr("x", point => point.x)
      .attr("y", point => point.y)
      .attr("text-anchor", "middle")
      .text(point => point.book.toTitleCase());

    return labelsLayer;
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
    const verse = this.plugin.app.verseState.get();
    return `${this.normalizeBookName(verse.book)}:${verse.chapter}`;
  }

  private isActivePoint(point: Pick<BibleMapPoint, "book" | "chapter">): boolean {
    return this.getPointKey(point) === this.getActiveVerseKey();
  }

  private updateActiveChapterHighlight(): void {
    if (!this.svgEl) {
      return;
    }

    const activeVerseKey = this.getActiveVerseKey();
    d3.select(this.svgEl)
      .selectAll<SVGPathElement, BibleMapPoint>(".bible-map-hit-areas path")
      .classed("is-active", point => this.getPointKey(point) === activeVerseKey);

    if (this.chapterLabelLayer) {
      this.chapterLabelLayer
        .selectAll<SVGTextElement, { point: BibleMapPoint }>("text")
        .classed("is-active", datum => this.getPointKey(datum.point) === activeVerseKey);
    }

    if (!this.activeChapterLayer) {
      return;
    }

    const activePoint = this.points.find(point => this.getPointKey(point) === activeVerseKey);
    const markerData = activePoint
      ? [
          {
            x: activePoint.x,
            y: activePoint.y,
          },
        ]
      : [];

    const { xScale, yScale } = this.getMapScales();

    this.activeChapterLayer
      .selectAll<SVGGElement, { x: number; y: number }>("g")
      .data(markerData)
      .join(enter => {
        const group = enter.append("g");
        group.append("circle").attr("class", "bible-map-active-chapter-glow").attr("r", 10);
        group.append("circle").attr("class", "bible-map-active-chapter-core").attr("r", 6.5);
        return group;
      })
      .attr(
        "transform",
        d => `translate(${xScale(d.x)}, ${yScale(d.y)}) scale(${1 / this.currentZoomScale})`,
      );
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

    const terrainRenderData = {
      entries,
      landMaskPath: entries.length > 0 ? entries[0].d : "",
    };

    this.terrainPathCache = terrainRenderData;
    this.terrainPathCacheKey = cacheKey;
    return terrainRenderData;
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
    if (!this.svgEl) {
      return;
    }
    this.updateStatus(message);
    const svg = d3.select(this.svgEl);
    svg.selectAll("*").remove();
    svg
      .append("text")
      .attr("class", "bible-map-empty")
      .attr("x", 600)
      .attr("y", 320)
      .attr("text-anchor", "middle")
      .text(message);
  }

  private updateStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }
}
