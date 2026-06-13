import { createElement, IconNode } from "lucide";

export function renderIcon(i: IconNode) {
  return createElement(i, { "stroke-width": 1 });
}
