# Sperry starter workbook reference

This page transcribes the non-confidential starter records supplied for the Sperry
Tech challenge. It is provenance for sponsor-supplied project identities,
coordinates, and in-service targets. It is not a source of published utility
construction windows. Any canonical construction window inferred from these dates
is marked `estimated` and described as an inference.

## Canonical mapping

| Sponsor ID | Sponsor project | Canonical GridSync ID | Workbook in-service target | Located geometry |
|---|---|---|---|---|
| DESC_1 | Stevens Creek - Hooks 115 kV / LR Plumb Branch 46 kV Rebuilds | `desc-stevens-creek-hooks-rebuilds` | 2024-12-31 | Stevens Creek only: 33.562599, -82.051362 |
| DESC_2 | Hooks - Thurmond 115 kV Tie: Rebuild | `desc-hooks-thurmond-115kv-rebuild` | 2024-12-31 | Thurmond only: 33.660127, -82.195931 |
| DESC_3 | Jasper - Okatie 230 kV #2: Construct | `desc-jasper-okatie-230kv-2` | 2025-12-31 | Jasper: 32.359120, -81.124600; Okatie: 32.333758, -81.032495 |
| DESC_4 | Queensboro - Ft Johnson 115 kV & Queensboro-Bayfront 115 kV (Queensboro-James Island section) | `desc-queensboro-ft-johnson-bayfront-115kv` | 2023-12-31 | Queensboro only: 32.722793, -79.967332 |
| DESC_5 | Okatie-Bluffton 115 kV: Rebuild | `desc-okatie-bluffton-115kv-rebuild` | 2025-06-01 | Okatie: 32.333758, -81.032495; Bluffton: 32.235027, -80.853384 |
| GPC_1 | Evans Primary - Thurmond Dam (USA) #5 115 kV Rebuild | `gp-evans-primary-thurmond-dam-115kv-rebuild` | 2033-06-01 | Evans Primary: 33.543994, -82.168648; Thurmond Dam #5: 33.660127, -82.195931 |
| GPC_2 | SAV: McIntosh - Purrysburg 230 kV Reactors | `gp-mcintosh-purrysburg-230kv` | 2026-06-01 | McIntosh only: 32.352116, -81.175112 |
| GPC_3 | SAV: Goshen (Sav) - McIntosh 115 kV Line Rebuild | `sertp-2028-soco-sav-goshen-sav-mcintosh-115-kv-line-rebuild` | 2027-06-01 | Goshen: 32.248701, -81.209472; McIntosh: 32.352116, -81.182105 |
| GPC_4 | Mitchell - North Tifton 230 kV Reconductor | `gp-mitchell-north-tifton-230kv-reconductor` | 2025-05-01 | Mitchell: 31.447121, -84.133843; North Tifton: 31.478089, -83.549130 |
| GPC_5 | Jesup - Ludowici Primary 115 kV Rebuild | `gp-jesup-ludowici-primary-115kv-rebuild` | 2025-06-01 | Jesup: 31.603106, -81.924947; Ludowici Primary: 31.721597, -81.743703 |

Hooks, Ft Johnson, and Purrysburg are unresolved in the workbook. GridSync does
not invent those coordinates; the corresponding canonical records use the one
known endpoint as an approximate `Point`.

### GPC_3 public-source reconciliation

The sponsor workbook gives a June 2027 in-service target for the named
Goshen-McIntosh project. The public 2026 SERTP Preliminary Transmission Expansion
Plan (Non-CEII) lists a 2028 in-service year and describes a narrower 6.7-mile
Goshen-Georgia Pacific (Rincon) section of the Goshen-McIntosh line. GridSync keeps
one canonical project, retains the current public SERTP scope and normalized May
2028 target, and records the sponsor target here and in the project description.

## Center-point benchmark distances

These workbook distances were calculated using sponsor center points. They are
benchmarks for reconciliation only. GridSync scoring does not read or hardcode
them; it continues to calculate closest-point distance between canonical project
geometries.

| Sponsor pair | Workbook center-point benchmark |
|---|---:|
| DESC_2 ↔ GPC_1 | 4.09 mi |
| DESC_3 ↔ GPC_2 | 5.65 mi |
| DESC_3 ↔ GPC_3 | 7.55 mi |
| DESC_1 ↔ GPC_1 | 8.01 mi |
| DESC_5 ↔ GPC_2 | 14.34 mi |
| DESC_5 ↔ GPC_3 | 14.81 mi |
