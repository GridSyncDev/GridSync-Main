"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { ArcLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { PathStyleExtension, type PathStyleExtensionProps } from "@deck.gl/extensions";
import { Map } from "react-map-gl/maplibre";
import type { Project, Utility } from "@/lib/domain/schema";
import { anchor } from "@/lib/engine/geo";
import type { Overlap } from "@/lib/engine/overlap";
import { KIND, fmtMonth, hexToRgb, typeLabel } from "@/lib/ui/format";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MI = 1609.344;

// Perceptually uniform (viridis) ramp for the density view.
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [170, 220, 50],
  [253, 231, 37],
];

export interface FlyTarget {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  key: number;
}

interface Props {
  projects: Project[];
  utilities: Record<string, Utility>;
  overlaps: Overlap[];
  selectedOverlap: Overlap | null;
  selectedProjectId: string | null;
  activeProjectIds: Set<string> | null; // timeline scrub: projects building in the current month
  maxMiles: number;
  density: boolean;
  flyTo: FlyTarget;
  onSelectOverlap: (id: string) => void;
  onSelectProject: (id: string | null) => void;
}

export default function MapView(props: Props) {
  const { projects, utilities, overlaps, selectedOverlap, selectedProjectId, activeProjectIds, maxMiles, density } = props;
  const [viewState, setViewState] = useState<MapViewState>({ ...props.flyTo, pitch: 0, bearing: 0 });
  const [flownKey, setFlownKey] = useState(props.flyTo.key);

  // A new fly-to target (preset or selection) animates the camera; adjust state during render.
  if (props.flyTo.key !== flownKey) {
    const { longitude, latitude, zoom } = props.flyTo;
    setFlownKey(props.flyTo.key);
    setViewState({
      ...viewState,
      longitude,
      latitude,
      zoom,
      pitch: density ? 45 : 0,
      bearing: 0,
      transitionDuration: 1400,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
    });
  }

  const byId = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const focus = useMemo(() => {
    const s = new Set<string>();
    if (selectedOverlap) s.add(selectedOverlap.a).add(selectedOverlap.b);
    if (selectedProjectId) s.add(selectedProjectId);
    return s;
  }, [selectedOverlap, selectedProjectId]);

  const alphaFor = (p: Project) => {
    if (focus.size) return focus.has(p.id) ? 255 : 60;
    if (activeProjectIds) return activeProjectIds.has(p.id) ? 255 : 35;
    return 210;
  };
  const colorFor = (p: Project): [number, number, number, number] => [...hexToRgb(utilities[p.utility]?.color ?? "#94a3b8"), alphaFor(p)];

  const lines = projects.filter((p) => p.geometry.type === "LineString");
  const points = projects.filter((p) => p.geometry.type === "Point");
  const arcs = selectedOverlap ? [selectedOverlap] : overlaps.slice(0, 600);
  const trigger = [focus, activeProjectIds, utilities];

  const layers = [
    new GeoJsonLayer({
      id: "states",
      data: "/us-states.json",
      stroked: true,
      filled: false,
      getLineColor: [148, 163, 184, 110],
      lineWidthMinPixels: 1,
    }),
    density &&
      new HexagonLayer<Project>({
        id: "density",
        data: projects,
        getPosition: (p) => anchor(p.geometry),
        radius: 12000,
        extruded: true,
        elevationScale: 60,
        coverage: 0.85,
        colorRange: VIRIDIS,
        opacity: 0.55,
        pickable: false,
      }),
    selectedOverlap &&
      new ScatterplotLayer<Project>({
        id: "buffers",
        data: [byId[selectedOverlap.a], byId[selectedOverlap.b]].filter(Boolean),
        getPosition: (p) => anchor(p.geometry),
        getRadius: maxMiles * MI,
        radiusUnits: "meters",
        stroked: true,
        filled: true,
        getFillColor: (p) => [...hexToRgb(utilities[p.utility]?.color ?? "#94a3b8"), 22],
        getLineColor: (p) => [...hexToRgb(utilities[p.utility]?.color ?? "#94a3b8"), 150],
        lineWidthMinPixels: 1,
        extensions: [new PathStyleExtension({ dash: true })],
      }),
    new PathLayer<Project, PathStyleExtensionProps<Project>>({
      id: "lines",
      data: lines,
      getPath: (p) => (p.geometry.type === "LineString" ? p.geometry.coordinates : []),
      getColor: colorFor,
      getWidth: (p) => ((p.voltageKv ?? 115) >= 500 ? 5 : (p.voltageKv ?? 115) >= 230 ? 3.5 : 2.5) * (focus.has(p.id) ? 1.8 : 1),
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      getDashArray: (p) => (p.locationPrecision === "exact" ? [0, 0] : [6, 3]),
      dashJustified: true,
      extensions: [new PathStyleExtension({ dash: true })],
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      updateTriggers: { getColor: trigger, getWidth: trigger },
      onClick: (info) => props.onSelectProject(info.object?.id ?? null),
    }),
    new ScatterplotLayer<Project>({
      id: "points",
      data: points,
      getPosition: (p) => anchor(p.geometry),
      getRadius: (p) =>
        (p.capacityMw ? Math.min(14, 4 + Math.sqrt(p.capacityMw) / 3) : p.type.startsWith("substation") ? 6 : 5) * (focus.has(p.id) ? 1.6 : 1),
      radiusUnits: "pixels",
      stroked: true,
      filled: true,
      getFillColor: (p) => (p.locationPrecision === "county" ? [0, 0, 0, 0] : colorFor(p)),
      getLineColor: (p) => (focus.has(p.id) ? [255, 255, 255, 255] : [...hexToRgb(utilities[p.utility]?.color ?? "#94a3b8"), alphaFor(p)]),
      lineWidthMinPixels: 1.5,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      updateTriggers: { getFillColor: trigger, getLineColor: trigger, getRadius: trigger },
      onClick: (info) => props.onSelectProject(info.object?.id ?? null),
    }),
    new ArcLayer<Overlap>({
      id: "overlaps",
      data: arcs.filter((o) => byId[o.a] && byId[o.b]),
      getSourcePosition: (o) => anchor(byId[o.a].geometry),
      getTargetPosition: (o) => anchor(byId[o.b].geometry),
      getSourceColor: (o) => [...KIND[o.kind].rgb, o === selectedOverlap ? 255 : 60 + o.scores.total * 1.6],
      getTargetColor: (o) => [...KIND[o.kind].rgb, o === selectedOverlap ? 255 : 60 + o.scores.total * 1.6],
      getWidth: (o) => (o === selectedOverlap ? 5 : 1 + o.scores.total / 30),
      getHeight: 0.6,
      greatCircle: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 200],
      updateTriggers: { getSourceColor: [selectedOverlap], getTargetColor: [selectedOverlap], getWidth: [selectedOverlap] },
      onClick: (info) => info.object && props.onSelectOverlap(info.object.id),
    }),
    focus.size > 0 &&
      new TextLayer<Project>({
        id: "labels",
        data: [...focus].map((id) => byId[id]).filter(Boolean),
        getPosition: (p) => anchor(p.geometry),
        getText: (p) => p.name,
        getSize: 13,
        getColor: [230, 237, 247, 255],
        getPixelOffset: [0, -18],
        background: true,
        getBackgroundColor: [7, 11, 20, 210],
        backgroundPadding: [6, 3],
        fontFamily: "system-ui, sans-serif",
        characterSet: "auto",
      }),
  ].filter(Boolean);

  const getTooltip = ({ object, layer }: PickingInfo) => {
    if (!object || !layer) return null;
    const style = { background: "rgba(7,11,20,0.95)", color: "#e6edf7", fontSize: "12px", border: "1px solid rgba(148,163,184,0.25)", borderRadius: "8px", padding: "8px 10px", maxWidth: "280px" };
    if (layer.id === "overlaps") {
      const o = object as Overlap;
      return { html: `<b>${KIND[o.kind].label}</b> · score ${o.scores.total}<br/>${byId[o.a]?.name}<br/>↔ ${byId[o.b]?.name}<br/><span style="color:#8b98ad">${o.distanceMiles} mi · ${o.overlapMonths ? o.overlapMonths + " mo overlap" : o.gapMonths + " mo apart"}</span>`, style };
    }
    const p = object as Project;
    const u = utilities[p.utility];
    return {
      html: `<b>${p.name}</b><br/><span style="color:${u?.color}">●</span> ${u?.name ?? p.utility}<br/><span style="color:#8b98ad">${typeLabel[p.type]}${p.voltageKv ? " · " + p.voltageKv + " kV" : ""}${p.capacityMw ? " · " + p.capacityMw + " MW" : ""}<br/>Build ${fmtMonth(p.construction.start)} – ${fmtMonth(p.construction.end)}${p.construction.precision === "estimated" ? " (est.)" : ""}</span>`,
      style,
    };
  };

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
      controller={{ dragRotate: true }}
      layers={layers}
      getTooltip={getTooltip}
      onClick={(info) => {
        if (!info.object) props.onSelectProject(null);
      }}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
    >
      <Map mapStyle={BASEMAP} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}
