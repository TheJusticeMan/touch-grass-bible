# VanJS Official Documentation (Online Reference)

This file is a local index of official VanJS documentation discovered online.
It is intended as a quick gateway to canonical docs and APIs.

Source site: https://vanjs.org
Checked: 2026-06-04

## Official Entry Points

- Home: https://vanjs.org/
- Get Started: https://vanjs.org/start
- Tutorial and API Reference: https://vanjs.org/tutorial
- Examples: https://vanjs.org/demo
- Advanced Topics: https://vanjs.org/advanced
- SSR and Hydration: https://vanjs.org/ssr
- Mini-Van: https://vanjs.org/minivan
- VanX Extension: https://vanjs.org/x
- VanGraph: https://vanjs.org/graph
- GitHub Repository: https://github.com/vanjs-org/van

## Core VanJS APIs (from official tutorial)

- van.tags
- van.add
- van.state
- van.derive
- van.hydrate (documented under SSR/Hydration)

## Tutorial Structure (https://vanjs.org/tutorial)

1. DOM Composition and Manipulation

- First app, element composition, event handlers
- API details for van.tags and van.add
- SVG and MathML usage

2. State

- State creation with van.state
- Derived state and side effects with van.derive
- State interface details: val, oldVal, rawVal

3. State Binding

- State as properties and child nodes
- State-derived properties and children
- Stateful binding and polymorphic binding patterns

4. API Index

- Consolidated top-level API list

## VanX APIs (official extension)

From https://vanjs.org/x:

- vanX.reactive
- vanX.calc
- vanX.stateFields
- vanX.raw
- vanX.noreactive
- vanX.list
- vanX.replace
- vanX.compact

## Notes For This Repository

This project primarily uses core VanJS APIs (van.tags, van.state, van.derive, van.add).
See local usage guide at docs/vanJS.md for project-specific patterns.

If you want a full offline mirror of official docs in this repo, use one of these commands from the project root:

- wget mirror:
  wget --mirror --convert-links --adjust-extension --page-requisites --no-parent https://vanjs.org/tutorial https://vanjs.org/x https://vanjs.org/start

- single-page snapshots:
  curl -L https://vanjs.org/tutorial -o docs/vanjs-tutorial.html
  curl -L https://vanjs.org/x -o docs/vanx.html

Keep official copyright/license notices intact when redistributing full mirrored content.
