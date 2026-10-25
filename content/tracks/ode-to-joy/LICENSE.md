# Ode to Joy — provenance

- **Composition:** Ludwig van Beethoven (1770–1827), public domain.
- **Source score and MIDI:** [Mutopia Project, piece 528](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528).
  The page marks the work public domain. Files used:
  - [`ode.ly`](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly)
  - [`ode.mid`](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.mid)
- **Reference recording:** [Commons `Ode_to_Joy.ogg`](https://commons.wikimedia.org/wiki/File:Ode_to_Joy.ogg),
  public domain, described there as the Mutopia MIDI converted to OGG. Not shipped.
- **Voice data:** `voices.json` was extracted from the `sop`, `alto`, `tenor` and `bass`
  voices in `ode.ly`, preserving the source durations and applying the file's
  `\transpose c c'` to the upper voices.
- **Our outputs:** `melody.mid`, `backing.mid`, the chart and the arrangement are released
  as **CC0 1.0**. The rendered audio uses MIT-licensed FluidR3Mono samples; the complete
  notices are served at [`public/THIRD_PARTY_NOTICES.txt`](../../../public/THIRD_PARTY_NOTICES.txt)
  and reproduced in [`content/SOUNDFONT-LICENSE.md`](../../SOUNDFONT-LICENSE.md).

The source `ode.ly` is public domain. It was downloaded from Mutopia and is committed
unchanged as `source.ly`; the SHA-256 is recorded in `track.json`.
