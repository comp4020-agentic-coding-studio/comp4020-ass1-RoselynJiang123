# References

Source ledger for "Hearing Is a Map, Not a Volume Knob" (Assignment 1). Each
source below is used only for the claim it directly supports in the page
copy. The page's own `Sources` section links out to the same five sources
without repeating this detail; this file is the long-form citation list.

1. World Health Organization, ["Deafness and hearing loss"](https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss),
   fact sheet updated 3 March 2026.
   Supports the opening evidence line: "Over 1 billion young adults are at
   risk of permanent, avoidable hearing loss from unsafe listening."

2. Greenwood, D. D. (1990). A cochlear frequency-position function for
   several species — 29 years later. *Journal of the Acoustical Society of
   America*. https://doi.org/10.1121/1.399052
   Supports the Greenwood frequency-place mapping used for the cochlear
   map's x-axis (`cochlea.ts`) and the base/high-frequency-left,
   apex/low-frequency-right orientation.

3. Nejime, Y., & Moore, B. C. J. (1997). Simulation of the effect of
   threshold elevation and loudness recruitment combined with reduced
   frequency selectivity on speech perception. *Journal of the Acoustical
   Society of America*. https://pubmed.ncbi.nlm.nih.gov/9228821/,
   DOI: 10.1121/1.419733
   Supports the "Model limits and safety" note that real sensorineural
   hearing loss can also involve threshold elevation, loudness recruitment,
   and reduced frequency selectivity that this model does not reproduce.

4. Ashmore, J. (2019). Outer hair cells and electromotility. *Cold Spring
   Harbor Perspectives in Medicine*. https://doi.org/10.1101/cshperspect.a033522
   Supports describing outer hair cells as contributing cochlear
   amplification and sharpening, not as the primary sensory receptors.

5. Glasberg, B. R., & Moore, B. C. J. (1990). Derivation of auditory filter
   shapes from notched-noise data. *Hearing Research*.
   https://doi.org/10.1016/0378-5955(90)90170-T
   Supports the ERB-rate spacing used for the 24 schematic spectrum bands
   (`spectrum.ts`), kept distinct from the Greenwood place mapping that
   drives the map's x-axis.

The 4 kHz-notch systematic review
(https://doi.org/10.1097/AUD.0000000000001034) is **not** cited: the final
page does not describe a common 3–6 kHz/4 kHz noise-notch pattern, so the
source has no claim to support here. If that pattern is ever mentioned on
the page, cite it there and add it to this ledger — not before.

## Asset provenance

- `assets/voice.m4a` — original recording made by the student. Not
  third-party audio.
- `assets/ear-cutaway.png` — original AI-generated project illustration,
  used as schematic anatomical context for the opening view only. Not a
  traced or downloaded third-party image.
- The Stage 3 melody is generated deterministically in project code
  (`melody.ts`): fixed notes and additive-synthesis harmonics, not an audio
  file.
- `assets/orientation/coiled-cochlear-frequency-map.svg` and
  `assets/orientation/outer-hair-cell-cutaway.svg` — original code-native SVG
  diagrams drawn from scratch; reference images informed visual direction
  only. See `assets/orientation/ASSET-NOTES.md` for full provenance.

No third-party audio or anatomical image is embedded in this project.
