import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "src/external/CommandPalette";
import Plugin from "../Plugin";

/**
 * Represents a command that can be triggered by a gesture.
 *
 * @property name - The display name of the gesture command.
 * @property commandId - The unique identifier for the command to execute.
 * @property gesturePath - The path or pattern representing the gesture.
 *   Encoded as a string of direction segments, e.g. "N", "SE", "NE".
 *   Directions: N (up), S (down), E (right), W (left),
 *               NE, NW, SE, SW (diagonals).
 */
export interface GestureCommand {
  name: string;
  commandId: string;
  gesturePath: string;
}

/**
 * Represents a 2D coordinate offset or vector.
 *
 * Used throughout gesture handling for:
 * - Touch/mouse positions
 * - Gesture path points
 * - Vector calculations and transformations
 *
 * Provides utility methods for common vector operations like
 * addition, subtraction, distance calculation, and dampening.
 */
export class Offset {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  subtract(other: Offset): Offset {
    return new Offset(this.x - other.x, this.y - other.y);
  }
  add(other: Offset): Offset {
    return new Offset(this.x + other.x, this.y + other.y);
  }
  distanceTo(other: Offset): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  applyDampening(dampening: number): Offset {
    // Non-linear dampening: use a power function for smoother effect
    return new Offset(
      (Math.sign(this.x) * Math.pow(Math.abs(this.x), 0.7)) / dampening,
      (Math.sign(this.y) * Math.pow(Math.abs(this.y), 0.7)) / dampening,
    );
  }
  get magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /** Angle in degrees, measured clockwise from right (east). */
  get angle(): number {
    return Math.atan2(this.y, this.x) * (180 / Math.PI);
  }
}

/**
 * Helper function to set CSS properties on an element.
 */
function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  for (const [key, value] of Object.entries(props)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Encodes a movement angle (degrees, clockwise from east) to an 8-direction string.
 * Directions: N (up), NE, E (right), SE, S (down), SW, W (left), NW.
 */
function angleToDirection(angleDeg: number): string {
  // Normalize to [0, 360)
  const a = ((angleDeg % 360) + 360) % 360;
  if (a >= 337.5 || a < 22.5) return "E";
  if (a >= 22.5 && a < 67.5) return "SE";
  if (a >= 67.5 && a < 112.5) return "S";
  if (a >= 112.5 && a < 157.5) return "SW";
  if (a >= 157.5 && a < 202.5) return "W";
  if (a >= 202.5 && a < 247.5) return "NW";
  if (a >= 247.5 && a < 292.5) return "N";
  return "NE"; // 292.5–337.5
}

interface GestureSettings {
  gestureCommands: GestureCommand[];
  /** Minimum pixel distance per direction segment. */
  segmentLength: number;
  /** Minimum total gesture length in pixels to trigger anything. */
  minimumGestureLength: number;
}

const defaultGestureSettings: GestureSettings = {
  gestureCommands: [
    {
      name: "Open search",
      commandId: "open-palette-bible-search",
      gesturePath: "N",
    },
    {
      name: "Open bookmarks",
      commandId: "open-palette-bookmarks",
      gesturePath: "E",
    },
    {
      name: "Open settings",
      commandId: "open-palette-settings",
      gesturePath: "S",
    },
    {
      name: "Open translations",
      commandId: "open-palette-translations",
      gesturePath: "W",
    },
  ],
  segmentLength: 40,
  minimumGestureLength: 30,
};

/**
 * Handles gesture recognition on an HTML element.
 * Tracks touch/mouse paths and encodes them as directional strings.
 */
class GestureRecognizer {
  private points: Offset[] = [];
  private isTracking = false;
  private lastSegmentPoint: Offset | null = null;
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly segmentLength: number,
    private readonly minimumLength: number,
    private readonly onGestureComplete: (path: string) => void,
  ) {
    // Non-passive listeners are required so we can call preventDefault() to block
    // native scroll/zoom while a gesture is in progress.
    this.element.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.element.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    this.element.addEventListener("touchend", this.handleTouchEnd, { passive: false });
    // mousedown on the element; move/up on document so the gesture is tracked
    // even when the pointer leaves the FAB button area.
    this.element.addEventListener("mousedown", this.handleMouseStart);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseEnd);
  }

  // ── Touch handlers ──────────────────────────────────────────────────────────

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    this.startTracking(new Offset(e.touches[0].clientX, e.touches[0].clientY));
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (!this.isTracking || e.touches.length !== 1) return;
    e.preventDefault();
    this.trackPoint(new Offset(e.touches[0].clientX, e.touches[0].clientY));
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (!this.isTracking) return;
    e.preventDefault();
    this.finishTracking();
  };

  // ── Mouse handlers ───────────────────────────────────────────────────────────

  private handleMouseStart = (e: MouseEvent): void => {
    this.startTracking(new Offset(e.clientX, e.clientY));
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isTracking) return;
    this.trackPoint(new Offset(e.clientX, e.clientY));
  };

  private handleMouseEnd = (): void => {
    if (!this.isTracking) return;
    this.finishTracking();
  };

  // ── Core tracking ────────────────────────────────────────────────────────────

  private startTracking(point: Offset): void {
    this.isTracking = true;
    this.points = [point];
    this.lastSegmentPoint = point;
    this.createOverlay();
    if (this.ctx) {
      this.ctx.beginPath();
      this.ctx.moveTo(point.x, point.y);
    }
  }

  private trackPoint(point: Offset): void {
    if (!this.lastSegmentPoint) return;

    this.drawTrail(point);

    if (point.distanceTo(this.lastSegmentPoint) >= this.segmentLength) {
      this.points.push(point);
      this.lastSegmentPoint = point;
    }
  }

  private finishTracking(): void {
    this.isTracking = false;
    this.removeOverlay();

    const totalLength = this.computeTotalLength();
    if (totalLength >= this.minimumLength) {
      const path = this.encodePath();
      if (path) this.onGestureComplete(path);
    }

    this.points = [];
    this.lastSegmentPoint = null;
  }

  // ── Overlay / visual feedback ────────────────────────────────────────────────

  private createOverlay(): void {
    this.overlay = document.createElement("div");
    setCssProps(this.overlay, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      "pointer-events": "none",
      "z-index": "9999",
    });

    this.canvas = document.createElement("canvas");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    setCssProps(this.canvas, { width: "100%", height: "100%" });

    this.overlay.appendChild(this.canvas);
    document.body.appendChild(this.overlay);
    this.ctx = this.canvas.getContext("2d");

    // Keep canvas pixel dimensions in sync if the window is resized during a gesture
    const onResize = () => {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize, { once: true });
  }

  private removeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
  }

  private drawTrail(current: Offset): void {
    const ctx = this.ctx;
    if (!ctx || this.points.length === 0) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.lineTo(current.x, current.y);
    ctx.strokeStyle = "rgba(158, 208, 255, 0.85)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Draw a small circle at the current tip
    ctx.beginPath();
    ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(158, 208, 255, 0.9)";
    ctx.fill();
  }

  // ── Path encoding ────────────────────────────────────────────────────────────

  private computeTotalLength(): number {
    if (this.points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += this.points[i].distanceTo(this.points[i - 1]);
    }
    return total;
  }

  private encodePath(): string {
    if (this.points.length < 2) return "";
    const segments: string[] = [];
    let lastDir = "";
    for (let i = 1; i < this.points.length; i++) {
      const delta = this.points[i].subtract(this.points[i - 1]);
      const dir = angleToDirection(delta.angle);
      if (dir !== lastDir) {
        segments.push(dir);
        lastDir = dir;
      }
    }
    return segments.join("");
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  destroy(): void {
    this.element.removeEventListener("touchstart", this.handleTouchStart);
    this.element.removeEventListener("touchmove", this.handleTouchMove);
    this.element.removeEventListener("touchend", this.handleTouchEnd);
    this.element.removeEventListener("mousedown", this.handleMouseStart);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseEnd);
    this.removeOverlay();
  }
}

// ── Palette category for gesture management ───────────────────────────────────

class GestureCommandsCategory extends CommandCategory<GestureCommand> {
  readonly name = "Gesture Commands";
  readonly description = "Manage gesture-based commands for the floating action button";
  private plugin!: GestureCommandsPlugin;

  constructor(commandPalette: UnifiedCommandPalette, plugin: GestureCommandsPlugin) {
    super(commandPalette);
    this.plugin = plugin;
  }

  onTrigger(_state: CommandPaletteState): void {}

  getCommands(_query: string): GestureCommand[] {
    return this.plugin.settings.gestureCommands;
  }

  renderCommand(command: GestureCommand, Item: CommandItem<GestureCommand>): Partial<CommandPaletteState> {
    Item.setTitle(command.name).setDescription(
      `Gesture: ${command.gesturePath} → ${command.commandId}`,
    );
    return {};
  }

  executeCommand(_command: GestureCommand): void {
    this.commandPalette.close();
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

/**
 * Plugin that adds gesture-based command triggering to the floating action button.
 *
 * Users draw directional patterns on the FAB to trigger registered commands.
 * Gesture paths are encoded as compass direction strings (e.g. "N", "SE", "NE").
 */
export default class GestureCommandsPlugin extends Plugin {
  settings: GestureSettings = defaultGestureSettings;
  private recognizer: GestureRecognizer | null = null;

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultGestureSettings);

    const fab = this.app.fab;
    if (!fab) {
      this.console.warn("FAB element not found; gesture commands unavailable.");
      return;
    }

    this.registerPalette(
      () => new GestureCommandsCategory(this.app.commandPalette, this),
      "gesture-commands",
    );

    this.recognizer = new GestureRecognizer(
      fab,
      this.settings.segmentLength,
      this.settings.minimumGestureLength,
      path => this.onGesture(path),
    );

    this.registerUnload(() => this.recognizer?.destroy());
    this.console.log("Gesture commands loaded.");
  }

  async saveSettings(): Promise<void> {
    await super.saveSettings(this.settings);
  }

  private onGesture(path: string): void {
    this.console.log("Gesture path:", path);

    const match = this.settings.gestureCommands.find(cmd => cmd.gesturePath === path);
    if (match) {
      this.console.log("Matched gesture:", match.name);
      const cmd = this.app.getCommand(match.commandId);
      if (cmd) {
        cmd.callback();
      } else {
        this.console.warn(`Command not found: ${match.commandId}`);
        // Fall back to opening the full palette
        this.app.openCommandPalette();
      }
    } else {
      this.console.log("No gesture matched for path:", path);
      // Fall back to opening the command palette
      this.app.openCommandPalette();
    }
  }
}
