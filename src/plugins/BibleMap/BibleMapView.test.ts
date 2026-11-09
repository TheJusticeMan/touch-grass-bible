import { describe, expect, test } from "vitest";
import { van } from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { BibleMapView } from "./BibleMapView";

describe("BibleMapView interaction updates", () => {
  test("does not rebuild hit area and label arrays when the active verse is unchanged", () => {
    const plugin = {
      app: {
        verseState: van.state(new VerseRef("Genesis", 1, 1)),
        console: { error: () => {} },
      },
    } as any;

    const view = new BibleMapView(plugin);
    const point = { book: "Genesis", chapter: 1, x: 10, y: 20, cluster: 1 };
    const hitAreas = [
      {
        key: "GENESIS:1",
        d: "M0 0L10 10",
        sectionTitle: "Genesis 1",
        point,
        isActive: true,
      },
    ];
    const labels = [
      {
        key: "GENESIS:1",
        labelText: "Gen 1",
        x: 10,
        y: 20,
        dy: -3,
        isActive: true,
      },
    ];

    view.points = [point];
    view.currentXScale = (value: number) => value;
    view.currentYScale = (value: number) => value;
    view.currentZoomScale = 1;
    view.lastActiveVerseKey = "GENESIS:1";
    view.hitAreasState.val = hitAreas;
    view.chapterLabelsState.val = labels;

    view.updateActiveChapterHighlight();

    expect(view.hitAreasState.val).toBe(hitAreas);
    expect(view.chapterLabelsState.val).toBe(labels);
  });

  test("buildDotClusterPaths produces explicit circle geometry", () => {
    const view = new BibleMapView({} as any) as any;
    const points = [
      { book: "GENESIS", chapter: 1, x: 10, y: 20, cluster: 2 },
      { book: "EXODUS", chapter: 2, x: 15, y: 25, cluster: 2 },
    ];

    const dots = view.buildDotClusterPaths(
      points,
      (x: number) => x * 5,
      (y: number) => y * 6,
      3,
    );

    expect(dots).toHaveLength(2);
    expect(dots[0]).toMatchObject({
      cluster: 2,
      fill: expect.stringMatching(/^hsl\(/),
      stroke: expect.stringMatching(/^hsl\(/),
      cx: 50,
      cy: 120,
      r: 3,
    });
    expect(dots[0]).not.toHaveProperty("d");
  });
});
