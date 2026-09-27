export const PRESETS = {
  southeast: { label: "Southeast", sub: "All utilities", fly: { longitude: -83.6, latitude: 33.0, zoom: 5.4 } },
  southDade: {
    label: "South Dade",
    sub: "HPS vs FPL",
    fly: { longitude: -80.47, latitude: 25.64, zoom: 9.4 },
    utilities: ["homestead-public-services", "florida-power-light-co"],
    pair: ["hps-renaissance-second-interconnection", "fpl-oasis-substation"],
  },
  savannah: {
    label: "Savannah River",
    sub: "Georgia vs South Carolina",
    fly: { longitude: -81.12, latitude: 32.33, zoom: 10.2 },
    pair: ["desc-jasper-okatie-230kv-2", "gp-mcintosh-purrysburg-230kv"],
  },
} as const;

export type PresetKey = keyof typeof PRESETS;

