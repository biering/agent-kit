#!/usr/bin/env python3
"""Fit a beat grid to a music track: tempo, downbeat offset, drops.

    python3 beats.py song.mp3                          # tempo found by autocorrelation (60-180 BPM)
    python3 beats.py song.mp3 --bpm 120                # the tempo you asked for: fitted within +-4% of it
    python3 beats.py song.mp3 --bpm 120 --pin          # trust it exactly, fit only where the beats fall
    python3 beats.py song.mp3 --bpm 120 --start 8 --window 40    # fit on the stretch the film plays
    python3 beats.py song.mp3 --bpm 120 --drop-beat 16           # where to start it so the drop is on b16

Decodes with ffmpeg to mono 22.05 kHz, builds a spectral-flux onset envelope (all bands, and the kick
band below 150 Hz), then fits tempo and beat phase together: the pair that puts the most onset energy
on the grid across the window. The downbeat is the beat of each four that carries the most kick. Only
numpy.

A generated track drifts, and the film only needs the stretch it plays to be exact: fit on that
stretch (--start, --window) and give the tempo you asked the music model for (--bpm). Without it the
tool can lock to half or two thirds of the real tempo. A 0.15% tempo error puts the last hits of a
50 s film 70 ms late; `drift_ms_per_min` says how far the fitted tempo is from the intended one.

The output keeps the keys older films read (bpm, beat_s, first_beat, drop, drop_beat, drop_rise_db,
bar_loudness_db, beats) and adds the fit:

  offset            seconds of the first downbeat in the window: the film's beat 0 starts here
  downbeats         the first 16 downbeats, seconds
  drops             up to three: { music_s, film_beat (from offset), rise_db } - the downbeat after which
                    each of the next two bars is louder than the bar before it, by the most (the rise
                    is the smaller of the two). A soft intro is not a drop:
                    a rise out of near-silence (under -35 dB before) is the song starting.
  grid_strength     0 to 1: how much more onset energy sits on the grid than between it
  downbeat_confidence  0 to 1: how much harder the downbeat is struck than the next-best beat of the bar.
                    Four on the floor reads near 0: the downbeat is then a guess, listen to the first bar
  intended, drift_pct, drift_ms_per_min    with --bpm
  start             with --drop-beat N: the music offset at which the strongest drop lands on film beat N
                    (the film's cue sheet field music.start), and whether N is a multiple of 4 so the
                    song's bars line up with the film's

Assumes 4/4. A track in 3 or 6 has a different downbeat than this reports.
"""
import argparse
import json
import subprocess

import numpy as np

SR, HOP, WIN = 22050, 256, 2048
KICK_HZ = 150


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def envelopes(y):
    """Spectral flux, kick-band flux and RMS per frame."""
    n = 1 + (len(y) - WIN) // HOP
    frames = np.lib.stride_tricks.as_strided(y, (n, WIN), (y.strides[0] * HOP, y.strides[0]))
    spec = np.log1p(10 * np.abs(np.fft.rfft(frames * np.hanning(WIN), axis=1)))
    flux = np.concatenate([[0], np.maximum(np.diff(spec, axis=0), 0).sum(axis=1)])
    kick_bins = max(2, int(KICK_HZ / (SR / WIN)))
    kick = np.concatenate([[0], np.maximum(np.diff(spec[:, :kick_bins], axis=0), 0).sum(axis=1)])
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1))
    return flux, kick, rms


def detrend(v, fps):
    """Onsets stand out of the local average; negative parts are not onsets."""
    k = int(fps)
    return np.maximum(v - np.convolve(v, np.ones(k) / k, 'same'), 0)


def sample(e, pos):
    """e at fractional frame positions (linear), zero outside."""
    i = np.floor(pos).astype(int)
    f = pos - i
    ok = (i >= 0) & (i < len(e) - 1)
    out = np.zeros(len(pos))
    out[ok] = e[i[ok]] * (1 - f[ok]) + e[i[ok] + 1] * f[ok]
    return out


def refine_phase(y, beats_s, period_s):
    """Seconds to add to the grid: the median distance from each predicted beat to the steepest rise
    of the signal's envelope within +-60 ms (at most 15% of a beat). The spectral envelope is late by
    about a window; the waveform is not."""
    k = max(1, int(0.006 * SR))
    env = np.convolve(np.abs(y), np.ones(k) / k, 'same')
    rise = np.diff(env, prepend=env[0])
    half = int(min(0.06, 0.15 * period_s) * SR)
    found = []
    for t in beats_s:
        c = int(t * SR)
        if c - half < 0 or c + half >= len(rise):
            continue
        found.append((int(np.argmax(rise[c - half:c + half])) - half) / SR)
    return float(np.median(found)) if len(found) >= 4 else 0.0


def kick_envelope(y):
    """The low band (under 150 Hz) smoothed over 30 ms: how hard each beat is struck, in amplitude.
    The onset curve is log-compressed, so a strong downbeat and a weak beat look alike there."""
    spec = np.fft.rfft(y)
    spec[int(KICK_HZ / (SR / len(y))):] = 0
    low = np.fft.irfft(spec, len(y))
    k = int(0.03 * SR)
    return np.convolve(np.abs(low), np.ones(k) / k, 'same')


def downbeat_class(env, beat_s):
    """Which of the four beats in a bar carries the most kick, and how clearly (0 to 1)."""
    half = int(0.05 * SR)
    hits = []
    for t in beat_s:
        c = int(t * SR)
        hits.append(env[max(0, c - half):c + half].max() if c + half < len(env) else 0.0)
    totals = np.array([sum(hits[i::4]) for i in range(4)])
    order = np.argsort(totals)[::-1]
    best, second = totals[order[0]], totals[order[1]]
    return int(order[0]), float((best - second) / best) if best > 0 else 0.0


def autocorr_tempo(e, fps, hint):
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    lags = np.arange(len(ac))
    bpms = 60 * fps / np.maximum(lags, 1)
    ok = (bpms >= 60) & (bpms <= 180)
    centre, width = (hint, 0.25) if hint else (110, 0.6)   # a pull toward the hint, or toward where songs sit
    w = np.exp(-0.5 * (np.log2(bpms / centre) / width) ** 2)
    lag = int(np.argmax(np.where(ok, ac * w, 0)))
    if 1 <= lag < len(ac) - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        lag = lag + 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    return 60 * fps / lag


def fit_grid(e, fps, k0, k1, bpm_lo, bpm_hi, step=0.01):
    """The (bpm, phase in frames) that puts the most onset energy on the beats of frames k0..k1."""
    best = (-1.0, bpm_lo, 0.0)
    for bpm in np.arange(bpm_lo, bpm_hi + 1e-9, step):
        period = 60 * fps / bpm
        n = int((k1 - k0) / period) - 1
        if n < 4:
            continue
        phases = np.linspace(0, period, 96, endpoint=False)
        pos = k0 + phases[:, None] + period * np.arange(n)[None, :]
        scores = np.array([sample(e, row).mean() for row in pos])
        j = int(np.argmax(scores))
        if scores[j] > best[0]:
            best = (scores[j], bpm, phases[j])
    return best[1], (k0 + best[2]) % (60 * fps / best[1])   # phase from frame 0, not from the window start


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('music')
    ap.add_argument('--bpm', type=float, help='the tempo you asked for: the fit searches +-4%% around it')
    ap.add_argument('--pin', action='store_true', help='with --bpm: use it exactly, fit only the phase')
    ap.add_argument('--range', type=float, default=4.0, help='with --bpm: percent either side to search (default 4)')
    ap.add_argument('--start', type=float, default=0.0, help='fit from this second (skip a silent start)')
    ap.add_argument('--window', type=float, default=0.0, help='fit only this many seconds from --start: the stretch the film plays')
    ap.add_argument('--drop-beat', type=float, help='the film beat the strongest drop should land on: prints the music start')
    a = ap.parse_args()

    y = load(a.music)
    flux, kick, rms = envelopes(y)
    fps = SR / HOP
    k0 = int(a.start * fps)
    k1 = min(len(flux), int((a.start + a.window) * fps)) if a.window else len(flux)
    if k1 - k0 < 8 * fps:
        raise SystemExit('the fit window is under 8 s: too short to tell a tempo from noise')

    # one smooth onset curve for the fit: every band plus the kick, so off-beat accents pull less
    g = np.exp(-0.5 * (np.arange(-8, 9) / (0.012 * fps)) ** 2)
    g /= g.sum()
    e_all, e_kick = detrend(flux, fps), detrend(kick, fps)
    mix = np.convolve(e_all / (e_all.max() + 1e-9) + 1.5 * e_kick / (e_kick.max() + 1e-9), g, 'same')

    if a.bpm and a.pin:
        bpm_lo = bpm_hi = a.bpm
    elif a.bpm:
        bpm_lo, bpm_hi = a.bpm * (1 - a.range / 100), a.bpm * (1 + a.range / 100)
    else:
        guess = autocorr_tempo(e_all[k0:k1], fps, None)
        bpm_lo, bpm_hi = guess * 0.985, guess * 1.015
    bpm, phase = fit_grid(mix, fps, k0, k1, bpm_lo, bpm_hi)
    period = 60 * fps / bpm
    centre = (WIN / 2) / HOP     # frames: a frame is dated by its middle, not its first sample
    phase = (phase + centre) % period

    n = int((len(mix) - phase) / period)
    beats = phase + period * np.arange(n)                        # frames, over the whole track
    in_window = beats[(beats >= k0) & (beats < k1)]
    # grid strength: onset energy on the beats against the average everywhere
    strength = float(min(1.0, sample(mix, in_window - centre).mean() / (mix[k0:k1].mean() + 1e-9) / 4))

    # the downbeat: of the four beats in a bar, the one that carries the most kick, over the window
    env = kick_envelope(y)
    d0, confidence = downbeat_class(env, in_window / fps)
    down = in_window[d0::4] / fps
    # the same class across the whole track: the beats are one grid
    first_in_window = int(np.argmax(beats >= in_window[0]))
    all_down = beats[(first_in_window + d0) % 4:][::4] / fps
    beat_s = 60 / bpm

    # loudness per bar, and drops: two bars after a downbeat against the bar before it. Level is the
    # mean power of the stretch in dB, so a gap of silence between hits does not pull it to -180.
    bar_frames = 4 * period
    power = rms ** 2
    def mean_db(a0, a1):
        lo, hi = max(0, int(a0 - centre)), min(len(power), int(a1 - centre))   # frames whose middle is in the stretch
        return float(10 * np.log10(power[lo:hi].mean() + 1e-12)) if hi > lo else -99.0
    bars = [round(mean_db(t * fps, t * fps + bar_frames), 1) for t in all_down if t * fps + bar_frames < len(power)]
    rises = []
    for t in all_down:
        f = t * fps
        before = mean_db(f - bar_frames, f)
        after = min(mean_db(f, f + bar_frames), mean_db(f + bar_frames, f + 2 * bar_frames))   # both bars must hold it
        if before > -35 and f - bar_frames > 0 and f + 2 * bar_frames < len(power):
            rises.append((after - before, float(t)))
    rises.sort(reverse=True)
    picked = []   # the biggest rises, at least eight bars apart: the next bar of one drop is not another drop
    for r, t in rises:
        if all(abs(t - u) >= 8 * 4 * beat_s for _, u in picked):
            picked.append((r, t))
    rises = picked
    shift = refine_phase(y, down[:24] if len(down) else in_window[:24] / fps, beat_s)
    down = down + shift
    in_window = in_window + shift * fps
    beats = beats + shift * fps
    all_down = all_down + shift
    rises = [(r, t + shift) for r, t in rises]
    offset = float(down[0]) if len(down) else float(in_window[0] / fps)
    drops = sorted(({'music_s': round(t, 3), 'film_beat': round((t - offset) / beat_s, 1), 'rise_db': round(r, 1)}
                    for r, t in rises[:3]), key=lambda d: d['music_s'])
    best = max(drops, key=lambda d: d['rise_db']) if drops else None

    out = {
        'file': a.music, 'duration': round(len(y) / SR, 3), 'bpm': round(bpm, 3), 'beat_s': round(beat_s, 4),
        'offset': round(offset, 3), 'downbeats': [round(float(t), 3) for t in down[:16]],
        'first_beat': round(float(in_window[0] / fps), 3),
        'drops': drops,
        'drop': best['music_s'] if best else None, 'drop_beat': int(round((best['music_s'] - offset) / beat_s)) if best else None,
        'drop_rise_db': best['rise_db'] if best else None,
        'downbeat_confidence': round(confidence, 2), 'phase_shift_ms': round(shift * 1000, 1), 'grid_strength': round(strength, 2), 'window': [round(k0 / fps, 2), round(k1 / fps, 2)],
        'bar_loudness_db': bars,
        'beats': [round(float(b / fps), 3) for b in beats],
    }
    if a.bpm:
        out['intended'] = a.bpm
        out['drift_pct'] = round((bpm / a.bpm - 1) * 100, 3)
        out['drift_ms_per_min'] = round(60 * (a.bpm / bpm - 1) * 1000, 1)
    if a.drop_beat is not None and best:
        start = best['music_s'] - a.drop_beat * beat_s
        out['start'] = round(start, 3)
        out['start_note'] = ('music.start is negative: the drop is earlier than that many beats in; pick a later drop or a lower beat'
                             if start < 0 else
                             'ok' if abs(a.drop_beat % 4) < 1e-9 else
                             f'beat {a.drop_beat:g} is not a bar line: the song\'s bars fall {a.drop_beat % 4:g} beats off the film\'s')
    print(json.dumps(out))


if __name__ == '__main__':
    main()
