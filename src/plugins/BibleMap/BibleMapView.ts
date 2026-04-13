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

type MapCoord = [number, number];
type ContourShape = d3.ContourMultiPolygon;

const DEFAULT_MAP_TUNING = {
  landDensity: 0.3,
  continentalUnity: 0.07,
  coastRuggedness: 0.4,
} as const;

type RenderProfile = {
  terrainThresholds: number;
  biomeThresholds: number;
  densifySegmentLength: number;
  showDetailLines: boolean;
  chapterFontPx: number;
  chapterLabelPadding: number;
  maxVisibleChapterLabels: number;
};

const TERRAIN_COLORS = {
  water: "#0084cb",
  plains: "#99d98c",
  forest: "#52b788",
  mountain: "#9c6644",
  peaks: "#ffffff",
} as const;

const BIOME_COLORS = [
  "#d9c27a",
  "#8ecf6c",
  "#5dbb8a",
  "#4ca6a8",
  "#cf8f5f",
  "#c16f7c",
  "#a883d8",
  "#90b867",
  "#d3a35f",
  "#7396d1",
  "#c66d4c",
  "#73b8a0",
] as const;

const MAP_TUNING = {
  terrain: {
    bandwidthMin: 16,
    bandwidthMax: 32,
    bandwidthFactor: 0.95,
    thresholds: 22,
  },
  terrainDistortion: {
    baseAmplitude: 8,
    amplitudeByIntensity: 4,
    baseFrequency: 45,
    frequencyByIntensity: 35,
  },
  terrainStroke: {
    intensityCutoff: 0.28,
    wideWidth: 1.1,
    thinWidth: 0.5,
    wideColor: "rgb(255 255 255 / 0.2)",
    thinColor: "rgb(255 255 255 / 0.12)",
    opacity: 0.94,
  },
  detailLines: {
    minIntensity: 0.22,
    maxIntensity: 0.9,
    stroke: "rgb(24 34 45 / 0.25)",
    strokeWidth: 0.45,
    opacity: 0.55,
  },
  biome: {
    bandwidthMin: 14,
    bandwidthMax: 28,
    bandwidthFactor: 1.45,
    thresholds: 6,
    contourAmplitude: 4.2,
    contourFrequency: 0.42,
    boundaryAmplitude: 4.6,
    boundaryFrequency: 0.48,
    baseOpacity: 0.1,
    opacityRange: 0.14,
    boundaryStrokeWidth: 1.25,
    boundaryDasharray: "6 7",
    boundaryOpacity: 0.62,
  },
  distortion: {
    densifySegmentLength: 14,
    ringScaleSmoothingCutoff: 0.45,
    extraSmoothingPasses: 2,
    normalSmoothingPasses: 1,
    wave: {
      sin1X: 0.05,
      sin1Y: 0.02,
      sin1Index: 0.16,
      cos1Y: 0.06,
      cos1X: 0.025,
      cos1Index: 0.12,
      sin2XY: 0.03,
      sin2Radius: 0.045,
      sin3X: 0.18,
      sin3Y: 0.14,
      sin3Index: 0.45,
      mixCos1: 0.35,
      mixSin2: 0.18,
      mixSin3: 0.12,
    },
    ringScale: {
      smallPerimeter: 140,
      mediumPerimeter: 260,
      largePerimeter: 420,
      hugePerimeter: 700,
      smallScale: 0.18,
      mediumScale: 0.32,
      largeScale: 0.5,
      hugeScale: 0.68,
      maxScale: 0.82,
    },
    smoothing: {
      prevWeight: 0.22,
      currentWeight: 0.56,
      nextWeight: 0.22,
    },
  },
} as const;

export class BibleMapView extends View {
  private readonly margin = { top: 20, right: 20, bottom: 20, left: 20 };
  private readonly minChapterLabelZoom = 4;
  private readonly dataPath = "data/bible-map-umap.json";
  private resizeObserver: ResizeObserver | null = null;
  private renderFrame: number | null = null;
  private labelFrame: number | null = null;
  private verseStateUnsubscribe: (() => void) | null = null;
  private rootEl: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private biomeToggleEl: HTMLButtonElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private activeChapterLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private chapterLabelLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private currentZoomScale = 1;
  private showBiomes = true;
  private points: BibleMapPoint[] = [];
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
    this.biomeToggleEl = this.rootEl.createEl("button", {
      cls: "bible-map-biome-toggle",
      text: "Biome: On",
    }) as HTMLButtonElement;
    this.biomeToggleEl.type = "button";
    this.biomeToggleEl.addEventListener("click", () => {
      this.showBiomes = !this.showBiomes;
      this.updateBiomeToggleLabel();
      this.renderMapIfReady();
    });

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

    const innerWidth = size;
    const innerHeight = size;
    const tuning = this.getWorldMapTuning();

    const svg = d3.select(this.svgEl);
    svg.selectAll("*").remove();

    this.updateBiomeToggleLabel();

    const worldLayer = svg
      .append("g")
      .attr("class", "bible-map-world")
      .attr("transform", `translate(${mapOffsetX}, ${mapOffsetY})`);

    /*     worldLayer
      .append("rect")
      .attr("class", "bible-map-water")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("rx", 12)
      .attr("ry", 12);
 */
    const xExtent = d3.extent(this.points, point => point.x);
    const yExtent = d3.extent(this.points, point => point.y);
    const xMin = xExtent[0] ?? 0;
    const xMax = xExtent[1] ?? 1;
    const yMin = yExtent[0] ?? 0;
    const yMax = yExtent[1] ?? 1;

    const xScale = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([24, innerWidth - 24]);
    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight - 24, 24]);

    const density = d3
      .contourDensity<BibleMapPoint>()
      .x(point => xScale(point.x))
      .y(point => yScale(point.y))
      .size([innerWidth, innerHeight])
      .bandwidth(
        Math.max(
          MAP_TUNING.terrain.bandwidthMin,
          Math.min(
            MAP_TUNING.terrain.bandwidthMax,
            Math.sqrt(this.points.length) * MAP_TUNING.terrain.bandwidthFactor * tuning.unityBandwidthScale,
          ),
        ),
      )
      .thresholds(this.renderProfile.terrainThresholds);

    const contours = density(this.points);
    const maxContourValue = d3.max(contours, contour => contour.value) || 1;
    const contourPath = d3.geoPath();
    const distortedContours = contours.map(contour => {
      const intensity = contour.value / maxContourValue;
      return {
        contour: this.distortContourShape(
          contour,
          (MAP_TUNING.terrainDistortion.baseAmplitude -
            intensity * MAP_TUNING.terrainDistortion.amplitudeByIntensity) *
            tuning.ruggednessAmplitudeScale,
          (MAP_TUNING.terrainDistortion.baseFrequency +
            (1 - intensity) * MAP_TUNING.terrainDistortion.frequencyByIntensity) *
            tuning.ruggednessFrequencyScale,
          this.renderProfile.densifySegmentLength,
        ),
        intensity,
      };
    });

    worldLayer
      .append("g")
      .attr("class", "bible-map-topography")
      .selectAll("path")
      .data(distortedContours)
      .join("path")
      .attr("d", entry => contourPath(entry.contour) || "")
      .attr("fill", entry => this.getTerrainColor(entry.intensity, tuning.landCutoff))
      .attr("stroke", entry =>
        entry.intensity < MAP_TUNING.terrainStroke.intensityCutoff
          ? MAP_TUNING.terrainStroke.wideColor
          : MAP_TUNING.terrainStroke.thinColor,
      )
      .attr("stroke-width", entry =>
        entry.intensity < MAP_TUNING.terrainStroke.intensityCutoff
          ? MAP_TUNING.terrainStroke.wideWidth
          : MAP_TUNING.terrainStroke.thinWidth,
      )
      .attr("opacity", MAP_TUNING.terrainStroke.opacity);

    if (this.renderProfile.showDetailLines) {
      worldLayer
        .append("g")
        .attr("class", "bible-map-detail-lines")
        .selectAll("path")
        .data(
          distortedContours.filter(
            entry =>
              entry.intensity > Math.max(MAP_TUNING.detailLines.minIntensity, tuning.landCutoff) &&
              entry.intensity < MAP_TUNING.detailLines.maxIntensity,
          ),
        )
        .join("path")
        .attr("d", entry => contourPath(entry.contour) || "")
        .attr("fill", "none")
        .attr("stroke", MAP_TUNING.detailLines.stroke)
        .attr("stroke-width", MAP_TUNING.detailLines.strokeWidth)
        .attr("opacity", MAP_TUNING.detailLines.opacity);
    }

    if (this.showBiomes) {
      this.renderBiomeBoundaries(worldLayer, xScale, yScale, innerWidth, innerHeight, tuning);
    }
    this.activeChapterLayer = worldLayer.append("g").attr("class", "bible-map-active-chapter");
    this.renderBookLabels(worldLayer, xScale, yScale);

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
      worldLayer.style("--map-label-font-size", `${LABEL_FONT_PX / k}px`);
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
    const voronoi = delaunay.voronoi([0, 0, innerWidth, innerHeight]);

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
        this.currentZoomScale = event.transform.k;
        worldLayer.attr(
          "transform",
          `translate(${event.transform.x}, ${event.transform.y}) scale(${event.transform.k})`,
        );
        updateLabelScale(event.transform.k);
        this.updateActiveChapterHighlight();
        if (event.transform.k >= this.minChapterLabelZoom) {
          chapterLabelLayer.style("display", "block");
          scheduleChapterLabels(event.transform.k, event.transform.x, event.transform.y);
        } else {
          chapterLabelLayer.style("display", "none");
        }
      });

    const initialTransform = d3.zoomIdentity.translate(mapOffsetX, mapOffsetY);
    this.currentZoomScale = initialTransform.k;
    updateLabelScale(initialTransform.k);
    svg.call(zoom).call(zoom.transform, initialTransform);
    svg.on("dblclick.zoom", null);
    this.updateActiveChapterHighlight();
  }

  private renderBiomeBoundaries(
    worldLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number,
    tuning: {
      ruggednessAmplitudeScale: number;
      ruggednessFrequencyScale: number;
      unityBandwidthScale: number;
    },
  ): void {
    const biomeLayer = worldLayer.append("g").attr("class", "bible-map-biomes");
    const grouped = d3.group(this.points, point => point.cluster);
    const contourPath = d3.geoPath();

    const biomeContours: Array<{
      cluster: number;
      path: string;
      fill: string;
      stroke: string;
      opacity: number;
    }> = [];
    const biomeBoundaries: Array<{ path: string; stroke: string }> = [];

    for (const [cluster, points] of grouped) {
      if (points.length < 3) {
        continue;
      }

      const fill = this.getBiomeColor(cluster);
      const stroke = d3.color(fill)?.darker(1.1).formatRgb() || fill;
      const density = d3
        .contourDensity<BibleMapPoint>()
        .x(point => xScale(point.x))
        .y(point => yScale(point.y))
        .size([innerWidth, innerHeight])
        .bandwidth(
          Math.max(
            MAP_TUNING.biome.bandwidthMin,
            Math.min(
              MAP_TUNING.biome.bandwidthMax,
              Math.sqrt(points.length) * MAP_TUNING.biome.bandwidthFactor * tuning.unityBandwidthScale,
            ),
          ),
        )
        .thresholds(this.renderProfile.biomeThresholds);

      const contours = density(points);
      if (!contours.length) {
        continue;
      }

      contours.forEach((contour, index) => {
        const distortedContour = this.distortContourShape(
          contour,
          MAP_TUNING.biome.contourAmplitude * tuning.ruggednessAmplitudeScale,
          MAP_TUNING.biome.contourFrequency * tuning.ruggednessFrequencyScale,
          this.renderProfile.densifySegmentLength,
        );
        const path = contourPath(distortedContour) || "";
        if (!path) {
          return;
        }

        biomeContours.push({
          cluster,
          path,
          fill,
          stroke,
          opacity:
            MAP_TUNING.biome.baseOpacity + ((index + 1) / contours.length) * MAP_TUNING.biome.opacityRange,
        });
      });

      const outerPath =
        contourPath(
          this.distortContourShape(
            contours[0],
            MAP_TUNING.biome.boundaryAmplitude * tuning.ruggednessAmplitudeScale,
            MAP_TUNING.biome.boundaryFrequency * tuning.ruggednessFrequencyScale,
            this.renderProfile.densifySegmentLength,
          ),
        ) || "";
      if (outerPath) {
        biomeBoundaries.push({ path: outerPath, stroke });
      }
    }

    biomeLayer
      .append("g")
      .attr("class", "bible-map-biome-fills")
      .selectAll("path")
      .data(biomeContours)
      .join("path")
      .attr("d", entry => entry.path)
      .attr("fill", entry => entry.fill)
      .attr("stroke", "none")
      .attr("opacity", entry => entry.opacity);

    biomeLayer
      .append("g")
      .attr("class", "bible-map-biome-boundaries")
      .selectAll("path")
      .data(biomeBoundaries)
      .join("path")
      .attr("d", entry => entry.path)
      .attr("fill", "none")
      .attr("stroke", entry => entry.stroke)
      .attr("stroke-width", MAP_TUNING.biome.boundaryStrokeWidth)
      .attr("stroke-dasharray", MAP_TUNING.biome.boundaryDasharray)
      .attr("opacity", MAP_TUNING.biome.boundaryOpacity);
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
    if (t < 0.25) return TERRAIN_COLORS.plains;
    if (t < 0.525) return TERRAIN_COLORS.forest;
    if (t < 0.775) return TERRAIN_COLORS.mountain;
    return TERRAIN_COLORS.peaks;
  }

  private getBiomeColor(cluster: number): string {
    return BIOME_COLORS[Math.abs(cluster) % BIOME_COLORS.length];
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

    const xExtent = d3.extent(this.points, point => point.x);
    const yExtent = d3.extent(this.points, point => point.y);
    const xMin = xExtent[0] ?? 0;
    const xMax = xExtent[1] ?? 1;
    const yMin = yExtent[0] ?? 0;
    const yMax = yExtent[1] ?? 1;
    const bounds = this.svgEl.viewBox.baseVal;
    const size = Math.min(bounds.width, bounds.height) - this.margin.left - this.margin.right;
    const xScale = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([24, size - 24]);
    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([size - 24, 24]);

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

  private distortContourShape(
    contour: ContourShape,
    amplitude: number,
    frequency: number,
    densifySegmentLength: number,
  ): ContourShape {
    return {
      ...contour,
      coordinates: contour.coordinates.map(polygon =>
        polygon.map(ring => this.distortRing(ring as MapCoord[], amplitude, frequency, densifySegmentLength)),
      ),
    };
  }

  private distortRing(
    ring: MapCoord[],
    amplitude: number,
    frequency: number,
    densifySegmentLength: number,
  ): MapCoord[] {
    if (ring.length < 4) {
      return ring;
    }

    const densifiedRing = this.densifyRing(ring, densifySegmentLength);
    const centerX = d3.mean(densifiedRing, point => point[0]) || 0;
    const centerY = d3.mean(densifiedRing, point => point[1]) || 0;
    const ringScale = this.getRingScale(densifiedRing);
    const adjustedAmplitude = amplitude * ringScale;
    const distorted = densifiedRing.map((point, index) => {
      const dx = point[0] - centerX;
      const dy = point[1] - centerY;
      const radius = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / radius;
      const ny = dy / radius;
      const wave =
        Math.sin(
          point[0] * MAP_TUNING.distortion.wave.sin1X * frequency +
            point[1] * MAP_TUNING.distortion.wave.sin1Y +
            index * MAP_TUNING.distortion.wave.sin1Index,
        ) +
        MAP_TUNING.distortion.wave.mixCos1 *
          Math.cos(
            point[1] * MAP_TUNING.distortion.wave.cos1Y * frequency -
              point[0] * MAP_TUNING.distortion.wave.cos1X +
              index * MAP_TUNING.distortion.wave.cos1Index,
          ) +
        MAP_TUNING.distortion.wave.mixSin2 *
          Math.sin(
            (dx + dy) * MAP_TUNING.distortion.wave.sin2XY + radius * MAP_TUNING.distortion.wave.sin2Radius,
          ) +
        MAP_TUNING.distortion.wave.mixSin3 *
          Math.sin(
            point[0] * MAP_TUNING.distortion.wave.sin3X * frequency +
              point[1] * MAP_TUNING.distortion.wave.sin3Y +
              index * MAP_TUNING.distortion.wave.sin3Index,
          );
      const offset = wave * adjustedAmplitude;
      return [point[0] + nx * offset, point[1] + ny * offset] as MapCoord;
    });

    return this.smoothClosedRing(
      distorted,
      ringScale < MAP_TUNING.distortion.ringScaleSmoothingCutoff
        ? MAP_TUNING.distortion.extraSmoothingPasses
        : MAP_TUNING.distortion.normalSmoothingPasses,
    );
  }

  private densifyRing(ring: MapCoord[], maxSegmentLength: number): MapCoord[] {
    const densified: MapCoord[] = [];

    for (let i = 0; i < ring.length - 1; i++) {
      const from = ring[i];
      const to = ring[i + 1];
      densified.push(from);
      const segmentLength = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const inserts = Math.max(0, Math.ceil(segmentLength / maxSegmentLength) - 1);

      for (let j = 1; j <= inserts; j++) {
        const t = j / (inserts + 1);
        densified.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as MapCoord);
      }
    }

    densified.push(densified[0]);
    return densified;
  }

  private getRingScale(ring: MapCoord[]): number {
    const perimeter = this.getRingPerimeter(ring);
    if (perimeter < MAP_TUNING.distortion.ringScale.smallPerimeter) {
      return MAP_TUNING.distortion.ringScale.smallScale;
    }
    if (perimeter < MAP_TUNING.distortion.ringScale.mediumPerimeter) {
      return MAP_TUNING.distortion.ringScale.mediumScale;
    }
    if (perimeter < MAP_TUNING.distortion.ringScale.largePerimeter) {
      return MAP_TUNING.distortion.ringScale.largeScale;
    }
    if (perimeter < MAP_TUNING.distortion.ringScale.hugePerimeter) {
      return MAP_TUNING.distortion.ringScale.hugeScale;
    }
    return MAP_TUNING.distortion.ringScale.maxScale;
  }

  private getRingPerimeter(ring: MapCoord[]): number {
    let perimeter = 0;
    for (let i = 1; i < ring.length; i++) {
      perimeter += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    }
    return perimeter;
  }

  private smoothClosedRing(ring: MapCoord[], passes: number): MapCoord[] {
    let smoothed = [...ring];

    for (let pass = 0; pass < passes; pass++) {
      smoothed = smoothed.map((point, index) => {
        if (index === smoothed.length - 1) {
          return smoothed[0];
        }

        const prev = smoothed[(index - 1 + smoothed.length - 1) % (smoothed.length - 1)];
        const next = smoothed[(index + 1) % (smoothed.length - 1)];
        return [
          prev[0] * MAP_TUNING.distortion.smoothing.prevWeight +
            point[0] * MAP_TUNING.distortion.smoothing.currentWeight +
            next[0] * MAP_TUNING.distortion.smoothing.nextWeight,
          prev[1] * MAP_TUNING.distortion.smoothing.prevWeight +
            point[1] * MAP_TUNING.distortion.smoothing.currentWeight +
            next[1] * MAP_TUNING.distortion.smoothing.nextWeight,
        ] as MapCoord;
      });
    }

    smoothed[smoothed.length - 1] = smoothed[0];
    return smoothed;
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

  private getRenderProfile(width: number, height: number): RenderProfile {
    const minDimension = Math.min(width, height);
    const isCoarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const isCompact = isCoarsePointer || minDimension < 760;

    return isCompact
      ? {
          terrainThresholds: 14,
          biomeThresholds: 4,
          densifySegmentLength: 22,
          showDetailLines: false,
          chapterFontPx: 14,
          chapterLabelPadding: 2,
          maxVisibleChapterLabels: 140,
        }
      : {
          terrainThresholds: MAP_TUNING.terrain.thresholds,
          biomeThresholds: MAP_TUNING.biome.thresholds,
          densifySegmentLength: MAP_TUNING.distortion.densifySegmentLength,
          showDetailLines: true,
          chapterFontPx: 20,
          chapterLabelPadding: 3,
          maxVisibleChapterLabels: 260,
        };
  }

  private getWorldMapTuning(): {
    landCutoff: number;
    unityBandwidthScale: number;
    ruggednessAmplitudeScale: number;
    ruggednessFrequencyScale: number;
  } {
    const unityNormalized = (DEFAULT_MAP_TUNING.continentalUnity - 0.03) / (0.12 - 0.03);
    const ruggednessNormalized = (DEFAULT_MAP_TUNING.coastRuggedness - 0.1) / (1.0 - 0.1);

    return {
      landCutoff: DEFAULT_MAP_TUNING.landDensity,
      unityBandwidthScale: 0.78 + Math.max(0, Math.min(1, unityNormalized)) * 0.9,
      ruggednessAmplitudeScale: 0.58 + Math.max(0, Math.min(1, ruggednessNormalized)) * 1.12,
      ruggednessFrequencyScale: 0.72 + Math.max(0, Math.min(1, ruggednessNormalized)) * 0.62,
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

  private updateBiomeToggleLabel(): void {
    if (this.biomeToggleEl) {
      this.biomeToggleEl.textContent = this.showBiomes ? "Biome: On" : "Biome: Off";
    }
  }
}
