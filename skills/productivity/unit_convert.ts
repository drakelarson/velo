import type { Skill } from "../../src/types.ts";
const conv: Record<string, (v: number) => [number, string]> = {
  "km_to_mi": v => [v * 0.621371, "miles"],
  "mi_to_km": v => [v * 1.60934, "km"],
  "kg_to_lb": v => [v * 2.20462, "lb"],
  "lb_to_kg": v => [v * 0.453592, "kg"],
  "c_to_f": v => [v * 9/5 + 32, "°F"],
  "f_to_c": v => [(v - 32) * 5/9, "°C"],
};
export default {
  name: "unit_convert",
  description: "Convert between units",
  async execute(args: Record<string, unknown>) {
    const value = Number(args.value) || Number(args.args);
    const from = (args.from as string)?.toLowerCase();
    const to = (args.to as string)?.toLowerCase();
    if (!value) return "No value provided";
    const key = `${from}_to_${to}`;
    const fn = conv[key];
    if (!fn) return `Unknown conversion: ${from} -> ${to}`;
    const [result, unit] = fn(value);
    return `${value} ${from} = ${result.toFixed(4)} ${unit}`;
  },
} as Skill;
