# Cochlea orientation assets

Created on 24 August 2026 as original, code-native SVG illustrations for the COMP4020 interactive cochlea explainer.

## Files

- `coiled-cochlear-frequency-map.svg`: a schematic frequency–place map with separately addressable groups and `data-frequency` attributes for later interaction.
- `outer-hair-cell-cutaway.svg`: a schematic cutaway with separately addressable cell rows, stereocilia, supporting cells, basilar membrane, and vibration wave.

PNG files in the same directory are rendered previews only. The SVG files are the implementation assets.

## Creation and provenance

Both SVGs were drawn from scratch in code. No third-party image was copied, traced, embedded, downloaded, or used as a runtime dependency. Earlier reference images informed only the broad visual goals: a recognisable cochlear spiral, everyday frequency anchors, and a simplified three-row outer-hair-cell arrangement.

The illustrations are explicitly labelled **SCHEMATIC · NOT TO SCALE** and must not be described as microscopy, diagnostic imagery, or anatomically proportional models.

The files contain no remote images, fonts, scripts, stylesheets, audio, or fetched media. They use system font fallbacks and standard SVG primitives.

## Scientific sources

- Greenwood, D. D. (1990). A cochlear frequency-position function for several species—29 years later. *Journal of the Acoustical Society of America, 87*(6), 2592–2605. <https://doi.org/10.1121/1.399052>
- Ashmore, J. (2019). Outer hair cells and electromotility. *Cold Spring Harbor Perspectives in Medicine, 9*(7), a033522. <https://doi.org/10.1101/cshperspect.a033522>

The frequency labels are approximate explanatory anchors rather than strict category boundaries. The persistent interactive map must continue to use the project's tested Greenwood mapping and coordinate convention.

## Integration constraints

- Preserve `base / higher frequencies` at the cochlear entrance and `apex / lower frequencies` toward the centre.
- Inline the SVG when individual groups need highlighting, clicking, animation, or DOM testing.
- Preserve the existing element IDs and `data-frequency` attributes when adapting the coiled map.
- Treat the outer-hair-cell layout as an orientation graphic, not a complete organ-of-Corti anatomy lesson.
- Keep these assets local and do not replace the student's original voice recording.
