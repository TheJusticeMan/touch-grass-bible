import type { State } from "vanjs-core";
import { View } from "./State";

export type LayoutDirection = "horizontal" | "vertical";
export type SplitIntent = { direction: LayoutDirection; before: boolean };

export type PanelContainerSerialized = {
  type: "panel";
  direction: LayoutDirection;
  children?: PanelSerialized[];
  activeIndex: number;
  size: number;
  isPersistent?: boolean;
};

export type ViewContainerSerialized = {
  type: "view";
  children?: { viewType: string; title: string; state: string }[];
  activeIndex: number;
  size: number;
  isPersistent?: boolean;
};

export type PanelSerialized = PanelContainerSerialized | ViewContainerSerialized;
export type PanelContainer = {
  type: "panel";
  direction: LayoutDirection;
  children: State<Panel[]>;
  activeIndex: State<number>;
  size: State<number>;
  parent?: PanelContainer;
  isPersistent?: boolean;
};
export type ViewContainer = {
  type: "view";
  children: State<State<View>[]>;
  activeIndex: State<number>;
  size: State<number>;
  parent: PanelContainer;
  isPersistent?: boolean;
};
export type ViewContainerElement = HTMLElement & {
  __workspacePanel?: ViewContainer;
};

export type Panel = PanelContainer | ViewContainer;

export type stateMapping<T extends Record<string, unknown>> = {
  [P in keyof T]: State<T[P]>;
};
