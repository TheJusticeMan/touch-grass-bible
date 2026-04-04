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
  add(other: Offset) {
    return new Offset(this.x + other.x, this.y + other.y);
  }
  subtract(other: Offset) {
    return new Offset(this.x - other.x, this.y - other.y);
  }
  scale(factor: number) {
    return new Offset(this.x * factor, this.y * factor);
  }
  distanceTo(other: Offset) {
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
  get ratio() {
    return Math.abs(this.x / this.y);
  }
}
