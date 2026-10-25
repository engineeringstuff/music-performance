# Soundfont licence and download

The content pipeline renders MIDI to audio with
[FluidSynth](https://www.fluidsynth.org/) (LGPL, build-time only) and the
**FluidR3Mono_GM.sf3** soundfont from the MuseScore project.

## Required notice

FluidR3 (original version) by Frank Wen, copyright 2000–2002.

Mono conversion (FluidR3Mono) by Michael Cowgill, copyright 2014–17.

Adaptation for MuseScore by S. Christian Collins, copyright 2018.

FluidR3, FluidR3Mono and the MuseScore distribution are shared under the MIT licence.
The full licence and the original FluidR3 README notices are at:

<https://github.com/musescore/MuseScore/blob/main/share/sound/FluidR3Mono_License.md>

The soundfont file is **not committed** because it is about 23 MB. The rendered audio is
released as CC0 with this notice retained in the repository and in the track manifests.

## Download

```bash
mkdir -p content/soundfont
curl -L \
  -o content/soundfont/FluidR3Mono_GM.sf3 \
  https://raw.githubusercontent.com/musescore/MuseScore/main/share/sound/FluidR3Mono_GM.sf3
shasum -a 256 content/soundfont/FluidR3Mono_GM.sf3
```

Expected SHA-256:

```
2aacd036d7058d40a371846ef2f5dc5f130d648ab3837fe2626591ba49a71254
```

The content build script verifies this hash before rendering. `content/soundfont/*.sf2`
and `*.sf3` are ignored by git.
