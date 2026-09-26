"""Shared ingestion helpers."""

# Holding companies: sister utilities share crews and procurement already, so GridSync
# doesn't flag them as uncoordinated neighbors by default.
PARENT = {
    "duke-energy-carolinas-llc": "duke-energy",
    "duke-energy-progress-nc": "duke-energy",
    "duke-energy-florida-llc": "duke-energy",
    "southern-company": "southern-company",
    "georgia-power-co": "southern-company",
    "alabama-power-co": "southern-company",
    "mississippi-power-co": "southern-company",
    "florida-power-light-co": "nextera-energy",
    "dominion-energy-south-carolina": "dominion-energy",
}
