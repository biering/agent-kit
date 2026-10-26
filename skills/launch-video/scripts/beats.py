#!/usr/bin/env python3
"""Beat grid, tempo and drop for a music track.

    python3 beats.py song.mp3 [--bpm 120]      # prints JSON

Decodes with ffmpeg to mono 22.05 kHz, builds a spectral-flux onset envelope,
picks the tempo by autocorrelation (60-180 BPM, or pinned with --bpm), fits the
beat phase that lands on the most onset energy, and finds the drop as the
largest sustained rise in loudness (2 s after vs 2 s before). Only numpy.
"""
import json, subprocess, sys
import numpy as np

SR, HOP, WIN = 22050, 512, 2048


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main():
    args = sys.argv[1:]
    path = args[0]
    pinned = float(args[args.index('--bpm') + 1]) if '--bpm' in args else None
    y = load(path)
    n = 1 + (len(y) - WIN) // HOP
    frames = np.lib.stride_tricks.as_strided(y, (n, WIN), (y.strides[0] * HOP, y.strides[0]))
    spec = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(WIN), axis=1)))
    flux = np.maximum(np.diff(spec, axis=0), 0).sum(axis=1)
    flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(16) / 16, 'same')
    flux = np.maximum(flux, 0)
    fps = SR / HOP

    if pinned:
        bpm = pinned
    else:
        ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
        lags = np.arange(len(ac))
        bpms = 60 * fps / np.maximum(lags, 1)
        ok = (bpms >= 60) & (bpms <= 180)
        # weight toward 90-130, where most songs sit, to avoid half/double picks
        w = np.exp(-0.5 * (np.log2(bpms / 110) / 0.6) ** 2)
        lag = lags[ok][np.argmax((ac * w)[ok])]
        # refine by parabolic interpolation
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        lag = lag + 0.5 * (a - c) / (a - 2 * b + c)
        bpm = 60 * fps / lag
    period = 60 / bpm

    t = np.arange(len(flux)) / fps
    best, phase = -1, 0
    for ph in np.linspace(0, period, 200, endpoint=False):
        idx = np.round((np.arange(ph, t[-1], period)) * fps).astype(int)
        s = flux[idx[idx < len(flux)]].sum()
        if s > best:
            best, phase = s, ph
    beats = np.arange(phase, len(y) / SR, period)

    rms = np.sqrt((frames ** 2).mean(axis=1))
    db = 20 * np.log10(rms + 1e-9)
    k = int(2 * fps)
    # ignore the fade-in: a rise out of near-silence is the song starting, not a drop
    rise = np.array([db[i:i + k].mean() - db[i - k:i].mean() if i > 2 * k and db[i - k:i].mean() > -35 else -99
                     for i in range(len(db) - k)])
    drop_t = float(np.argmax(rise) / fps)
    drop_beat = int(np.argmin(np.abs(beats - drop_t)))

    # loudness per bar, so quiet breakdowns are visible
    bars = [round(float(db[int(b * fps):int((b + 4 * period) * fps)].mean()), 1)
            for b in beats[::4] if int((b + 4 * period) * fps) < len(db)]
    print(json.dumps({
        'file': path, 'duration': round(len(y) / SR, 3), 'bpm': round(bpm, 2), 'beat_s': round(period, 4),
        'first_beat': round(float(phase), 3), 'drop': round(float(beats[drop_beat]), 3), 'drop_beat': drop_beat,
        'drop_rise_db': round(float(rise.max()), 1), 'bar_loudness_db': bars,
        'beats': [round(float(b), 3) for b in beats],
    }))


if __name__ == '__main__':
    main()
