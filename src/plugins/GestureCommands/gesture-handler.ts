import { HelpCircle, IconNode } from "lucide";
import { Offset } from "src/external";

/**
 * Represents a command that can be triggered by a gesture.
 *
 * @property name - The display name of the gesture command.
 * @property commandId - The unique identifier for the command to execute.
 * @property gesturePath - The path or pattern representing the gesture.
 */
export interface GestureCommand {
  name: string;
  id: string;
  gesturePath: string;
}

/**
 * Helper function to set CSS properties on an element
 */
function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  Object.assign(el.style, props);
}

/**
 * Handles gesture recognition and command execution for drawn gestures.
 *
 * Captures mouse/touch drag events on an element and analyzes the drawn
 * path to match against known gesture patterns. Features include:
 * - Path recording and normalization
 * - Gesture pattern matching using angular difference
 * - Visual feedback with temporary trail lines
 * - Success/failure animations
 * - Callback for unrecognized gestures
 *
 * The recognition algorithm:
 * 1. Records touch/mouse positions during drag
 * 2. Normalizes the path (translate to origin, resample to fixed points)
 * 3. Compares angular vectors against stored gesture patterns
 * 4. Matches if difference is below threshold
 * 5. Executes associated command or triggers unknown gesture callback
 */
export class GestureHandler {
  private start: Offset = new Offset(0, 0);
  private last: Offset = new Offset(0, 0);
  private line: Offset[] = [];

  constructor(
    private element: HTMLElement,
    private gestureCommands: GestureCommand[],
    private onUnknown: (line: Offset[], gestureCommand: GestureCommand | null) => void,
    private onMatch: (gestureCommand: GestureCommand) => void = () => {},
    private dryRun: boolean = false,
  ) {
    this.element.addEventListener("touchstart", this.startDrag);
    this.element.addEventListener("mousedown", this.startDrag);
  }

  destroy() {
    this.element.removeEventListener("touchstart", this.startDrag);
    this.element.removeEventListener("mousedown", this.startDrag);
  }

  startDrag = (e: MouseEvent | TouchEvent): void => {
    if (e instanceof MouseEvent) {
      this.start = new Offset(e.clientX, e.clientY);
      document.addEventListener("mousemove", this.onDrag);
      document.addEventListener("mouseup", this.endDrag);
    } else if (e.touches && e.touches.length > 0) {
      this.start = new Offset(e.touches[0].clientX, e.touches[0].clientY);
      document.addEventListener("touchmove", this.onDrag);
      document.addEventListener("touchend", this.endDrag);
    }
    this.last = this.start;
    this.line = [this.start];
  };

  onDrag = (e: MouseEvent | TouchEvent): void => {
    e.stopPropagation();
    let client: Offset;
    if (e instanceof MouseEvent) {
      client = new Offset(e.clientX, e.clientY);
    } else if (e.touches && e.touches.length > 0) {
      client = new Offset(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      return;
    }
    const d = client.subtract(this.start).applyDampening(0.5);
    GestureHandler.drawTempline(this.last, client, 1000);
    this.last = client;
    this.line.push(client);
    setCssProps(this.element, { translate: `${d.x}px ${d.y}px` });
  };

  endDrag = (): void => {
    setCssProps(this.element, { translate: "0px 0px" });

    document.removeEventListener("mousemove", this.onDrag);
    document.removeEventListener("mouseup", this.endDrag);
    document.removeEventListener("touchmove", this.onDrag);
    document.removeEventListener("touchend", this.endDrag);

    this.detectGesture();
  };

  static drawTempline(start: Offset, end: Offset, lifeTime = 1000): void {
    const line = document.body.createEl("div", { cls: "mobile-fab-dragline" });
    const delta = end.subtract(start);
    const length = Math.sqrt(delta.x * delta.x + delta.y * delta.y);
    const angle = Math.atan2(delta.y, delta.x) * (180 / Math.PI);
    setCssProps(line, {
      width: `${length}px`,
      height: "8px",
      transform: `rotate(${angle}deg)`,
      left: `${start.x}px`,
      top: `${start.y}px`,
      transition: `opacity ${lifeTime}ms, height ${lifeTime}ms`,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => line.addClass("is-fading")));
    setTimeout(() => line.remove(), lifeTime);
  }

  drawGesture(line: Offset[]): void {
    // start in the middle of the FAB
    const start = new Offset(
      this.element.getBoundingClientRect().left + this.element.getBoundingClientRect().width / 2,
      this.element.getBoundingClientRect().top + this.element.getBoundingClientRect().height / 2,
    );
    for (let i = 0; i < line.length - 1; i++) {
      GestureHandler.drawTempline(line[i].add(start), line[i + 1].add(start), 3000);
    }
  }

  findGesture(line: Offset[]): GestureCommand | null {
    const normalizedInput = GestureHandler.normalizeLine(line);
    let bestMatch: GestureCommand | null = null;
    let minDiff = Infinity;

    for (const gesture of this.gestureCommands) {
      const parsedPath = JSON.parse(gesture.gesturePath) as number[][];
      const normalizedPreset = parsedPath.map((p: number[]) => new Offset(p[0], p[1]));
      const diff = GestureHandler.calculateDifference(normalizedInput, normalizedPreset);

      if (diff < minDiff) {
        minDiff = diff;
        bestMatch = gesture;
      }
    }

    if (bestMatch && minDiff < 0.5) {
      return bestMatch;
    }
    return null;
  }

  detectGesture(): void {
    if (this.line.length < 2) return;
    if (GestureHandler.getLength(this.line) < 100) return;

    const normalizedInput = GestureHandler.normalizeLine(this.line);
    const bestMatch = this.findGesture(this.line);

    if (bestMatch) {
      const parsedBestMatch = JSON.parse(bestMatch.gesturePath) as number[][];
      this.drawGesture(parsedBestMatch.map((p: number[]) => new Offset(p[0], p[1])));
      // Animate FAB to indicate success
      this.element.classList.remove("gesture-animating");
      requestAnimationFrame(() => {
        this.element.addClass("gesture-success");
        requestAnimationFrame(() => {
          this.element.addClass("gesture-animating");
          this.element.classList.remove("gesture-success");
        });
      });
      if (!this.dryRun) {
        this.onMatch(bestMatch);
      } else {
        this.onUnknown(normalizedInput, bestMatch);
      }
    } else {
      // Draw the gesture for user feedback
      this.drawGesture(normalizedInput);
      this.onUnknown(normalizedInput, null);
    }
  }

  static normalizeLine(line: Offset[]): Offset[] {
    if (line.length === 0) return [];
    const start = line[0];
    const translated = line.map(p => p.subtract(start));
    return GestureHandler.resample(translated, 40);
  }

  static getLength(line: Offset[]): number {
    let length = 0;
    for (let i = 0; i < line.length - 1; i++) {
      length += line[i].distanceTo(line[i + 1]);
    }
    return length;
  }

  static resample(line: Offset[], n: number): Offset[] {
    if (line.length === 0) return [];
    if (line.length === 1) {
      return Array.from({ length: n }, () => new Offset(line[0].x, line[0].y));
    }

    const totalLength = GestureHandler.getLength(line);

    if (totalLength === 0) {
      return Array.from({ length: n }, () => new Offset(line[0].x, line[0].y));
    }

    const interval = totalLength / (n - 1);
    const newLine: Offset[] = [line[0]];
    let currentDist = 0;
    let currentPointIndex = 0;

    for (let i = 1; i < n; i++) {
      const targetDist = i * interval;
      while (currentPointIndex < line.length - 1) {
        const p1 = line[currentPointIndex];
        const p2 = line[currentPointIndex + 1];
        const dist = p1.distanceTo(p2);

        if (currentDist + dist >= targetDist) {
          const t = (targetDist - currentDist) / dist;
          const x = p1.x + (p2.x - p1.x) * t;
          const y = p1.y + (p2.y - p1.y) * t;
          newLine.push(new Offset(x, y));
          break;
        }
        currentDist += dist;
        currentPointIndex++;
      }
    }
    while (newLine.length < n) {
      newLine.push(line[line.length - 1]);
    }
    return newLine;
  }

  /**
   * Builds a lucide-compatible icon node from a saved gesture path.
   *
   * @param gesture - GestureCommand object containing the gesture path
   * @returns IconNode used by UI components.
   */
  static getGestureIcon(gesture: GestureCommand): IconNode {
    const parsedPath = JSON.parse(gesture.gesturePath) as number[][];

    if (parsedPath.length < 2) return HelpCircle;

    // Normalize and center the path in a 100x100 icon viewport.
    const size = 100;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    parsedPath.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 15;
    const availableSize = size - padding * 2;
    const scale = availableSize / Math.max(width, height, 1);

    const points = parsedPath
      .map(([x, y]) => {
        const nx = (x - minX) * scale + padding + (availableSize - width * scale) / 2;
        const ny = (y - minY) * scale + padding + (availableSize - height * scale) / 2;
        return `${nx.toFixed(1)},${ny.toFixed(1)}`;
      })
      .join(" ");

    return [
      [
        "polyline",
        {
          points,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "8",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
      ],
    ];
  }

  static calculateDifference(line1: Offset[], line2: Offset[]): number {
    let totalDiff = 0;
    const n = Math.min(line1.length, line2.length);
    if (n < 2) return Infinity;

    for (let i = 0; i < n - 1; i++) {
      const v1 = line1[i + 1].subtract(line1[i]);
      const v2 = line2[i + 1].subtract(line2[i]);

      const angle1 = Math.atan2(v1.y, v1.x);
      const angle2 = Math.atan2(v2.y, v2.x);

      let diff = Math.abs(angle1 - angle2);
      if (diff > Math.PI) {
        diff = 2 * Math.PI - diff;
      }

      totalDiff += diff;
    }
    return totalDiff / (n - 1);
  }
}
