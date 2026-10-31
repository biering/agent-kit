#!/usr/bin/env python3
"""Lay the music and every sound effect on the film's timeline, normalise, mux.

    python3 mix.py cues.json film.mp4 final.mp4

cues.json:
{
  "bpm": 121.59,
  "duration_beats": 44,
  "music": {"file": "music/33.mp3", "start": 4.418, "gain_db": 0, "fade_out": 1.5},
  "sources": {"music/33.mp3": "https://assets.mixkit.co/music/33/33.mp3"},
  "cues": [
    {"beat": 2.75, "file": "sfx/2354.mp3", "gain_db": -10},
    {"beat": 16, "file": "sfx/1489.mp3", "anchor": "peak"},
    {"t": 20.0, "file": "sfx/3109.mp3", "gain_db": -4, "pitch": 0.75},
    {"beat": 5, "file": "sfx/1386.mp3", "duration": 1.2}
  ]
}

A cue is placed by `beat` (with a top-level `bpm`, the same number the film's
score uses) or by `t` in seconds; `duration_beats` or `duration` likewise. Keep
the film in beats and the cue sheet follows a tempo change with one edit.

A cue's `duration` (seconds) plays only that much of the effect from its anchor, with a 20 ms fade-out: a
typing loop for the length of the line that is typed, a riser that stops on the cut.

Each cue is shifted so its `anchor` ("onset", the default, or "peak", as
measured by peaks.py) lands on `t`: a chime is placed by its strike, not by the
silence before it. `pitch` resamples (0.75 is a fourth down). Paths resolve
relative to cues.json; `music` is optional (effects only, over silence, for a film paced by the
product's own sounds). Any file listed in `sources` and missing on disk is downloaded first, so
licensed audio never has to be committed. The mix is loudness-normalised to -14 LUFS, true peak
-1, and encoded as AAC at `audio_bitrate` (default "256k"; a long, sparse film needs less).

`music.stop_beat` (with a top-level `bpm`) or `music.stop` (seconds into the film) cuts the music dead there,
with a 30 ms fade so the cut does not click: the end card's first hit with nothing under it.

`"normalise_sfx": true` sets each effect's loudest sample to -1 dBFS before its `gain_db` is applied, so a cue's
gain says how loud it sits against the others and does not depend on how loudly its file was recorded.

`music.width` scales the side channel (1 = as recorded). A track mixed very wide (L/R correlation
near 0) cancels when a phone folds it to mono; 0.5 takes the side down 6 dB.
"""
import json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peaks import analyse  # noqa: E402


def timeline(spec):
    """Seconds for the film's length and every cue, from beats where the sheet gives beats."""
    beat = 60 / spec['bpm'] if 'bpm' in spec else None

    def seconds(obj, beats_key, seconds_key):
        if beats_key in obj:
            if beat is None:
                raise SystemExit(f'"{beats_key}" needs a top-level "bpm"')
            return obj[beats_key] * beat
        return obj[seconds_key]

    return seconds(spec, 'duration_beats', 'duration'), [{**c, 't': seconds(c, 'beat', 't')} for c in spec['cues']]


def true_peak(path):
    """True peak of a file's audio in dBFS, as ebur128 measures it."""
    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True, check=True).stderr
    if 'Peak:' not in log:
        raise SystemExit(f'ffmpeg reported no true peak for {path}')
    return float(log[log.rindex('Peak:') + 5:].split()[0])


def video_duration(path):
    """Length of the picture in seconds, as the container states it."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def main():
    cues_path, video, out = sys.argv[1:4]
    base = os.path.dirname(os.path.abspath(cues_path))
    spec = json.load(open(cues_path))
    # licensed assets are fetched, never committed: the manifest says where each one comes from
    for rel, url in spec.get('sources', {}).items():
        path = os.path.join(base, rel)
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            subprocess.run(['curl', '-sfL', '-o', path, url], check=True)
    dur, spec['cues'] = timeline(spec)
    music = spec.get('music')
    if music:
        inputs = ['-ss', str(music['start']), '-t', str(dur), '-i', os.path.join(base, music['file'])]
        fade = music.get('fade_out', 1.5)
        stop = music.get('stop', music['stop_beat'] * 60 / spec['bpm'] if 'stop_beat' in music else None)
        if stop is not None:
            fade, dur_music = 0.03, stop
        else:
            dur_music = dur
        width = music.get('width', 1)
        narrow = f'stereotools=slev={width},' if width != 1 else ''
        chains = [f"[1:a]aformat=channel_layouts=stereo,volume={music.get('gain_db', 0)}dB,{narrow}"
                  f"atrim=end={dur_music},afade=t=out:st={dur_music - fade}:d={fade},apad=whole_dur={dur},aresample=48000,aformat=channel_layouts=stereo[m]"]
    else:  # effects only: silence the length of the film carries them
        inputs = ['-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo']
        chains = ['[1:a]anull[m]']
    labels = ['[m]']
    cache = {}
    for i, cue in enumerate(spec['cues']):
        path = os.path.join(base, cue['file'])
        if path not in cache:
            cache[path] = analyse(path)
        pitch = cue.get('pitch', 1)
        level = (-1 - cache[path]['level_db']) if spec.get('normalise_sfx') else 0
        anchor = cache[path][cue.get('anchor', 'onset')] / pitch
        delay = cue['t'] - anchor
        trim = ''
        head = max(0.0, -delay)
        if delay < 0:  # the anchor sits before zero: cut the head instead of delaying
            trim, delay = f'atrim=start={head},asetpts=PTS-STARTPTS,', 0
        inputs += ['-i', path]
        rate = f'asetrate=44100*{pitch},aresample=48000,' if pitch != 1 else 'aresample=48000,'
        ms = int(delay * 1000)
        if 'duration' in cue:   # play only this much of the effect, faded out so the cut does not click
            end = anchor + cue['duration'] - head   # counted from the anchor, on the head-trimmed timeline
            trim += f"atrim=end={end},afade=t=out:st={max(0, end - 0.02)}:d=0.02,asetpts=PTS-STARTPTS,"
        chains.append(f"[{i + 2}:a]aformat=channel_layouts=stereo,aresample=44100,{rate}{trim}"
                      f"volume={cue.get('gain_db', 0) + level}dB,adelay={ms}|{ms}[c{i}]")
        labels.append(f'[c{i}]')
    chains.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,aformat=channel_layouts=stereo[a]")
    raw = out + '.premix.wav'
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, *inputs, '-filter_complex', ';'.join(chains),
                        '-map', '[a]', '-c:a', 'pcm_f32le', raw], check=True)
        # two-pass loudnorm: single-pass misses the target by a dB or more on a 30 s clip
        target = 'I=-14:TP=-1:LRA=11'
        probe = subprocess.run(['ffmpeg', '-hide_banner', '-i', raw, '-af', f'loudnorm={target}:print_format=json',
                                '-f', 'null', '-'], capture_output=True, text=True, check=True).stderr
        m = json.loads(probe[probe.rindex('{'):probe.rindex('}') + 1])
        # name the layout on both sides: ffmpeg 6's static builds refuse to guess it for a float wav
        norm = (f"aformat=channel_layouts=stereo,loudnorm={target}:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']},"
                f"aresample=48000,aformat=channel_layouts=stereo")
        # Short effects over a quiet bed leave this pass above 0 dBFS, and AAC adds up to 1.5 dB to a
        # limited click. So the ceiling is found, not assumed: limit, encode, measure the true peak of
        # the file, and lower the limiter by the excess until the film is at -1 dBFS or under.
        # No -shortest: when the mixed audio is a few milliseconds shorter than the picture, it cuts the
        # picture's last frames (the frame a loop returns to). The audio is padded with silence instead
        # and both are cut at the picture's own length.
        picture = video_duration(video)
        ceiling_db = -1.5
        for _ in range(5):
            second = f"{norm},alimiter=limit={10 ** (ceiling_db / 20):.4f}:level=false:attack=5:release=50:asc=1,apad"
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', raw, '-map', '0:v', '-map', '1:a', '-af', second,
                            '-c:v', 'copy', '-c:a', 'aac', '-b:a', spec.get('audio_bitrate', '256k'), '-t', f'{picture:.6f}', out], check=True)
            peak = true_peak(out)
            if peak <= -1.0:
                break
            ceiling_db -= peak + 1.0 + 0.2
        else:
            raise SystemExit(f'true peak is {peak} dBFS after 5 passes, not -1: turn the loudest cues down')
    finally:
        # the premix sits beside the output, inside the film's folder: never leave it there
        if os.path.exists(raw):
            os.remove(raw)
    print(out)


if __name__ == '__main__':
    main()
