#!/usr/bin/env python3
"""Where each sound effect peaks, so it can be placed by its hit, not its file start.

    python3 peaks.py sfx/*.mp3        # prints JSON {file: {peak, onset, duration}}

`peak` is the loudest 5 ms window; `onset` is the first moment the envelope
reaches 30 % of that peak, which is the better anchor for soft attacks (a chime
blooms after its strike). Place a cue with delay = event_time - onset.
"""
import json, subprocess, sys
import numpy as np

SR = 44100


def analyse(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    y = np.abs(np.frombuffer(raw, dtype=np.float32))
    win = int(0.005 * SR)
    env = np.convolve(y, np.ones(win) / win, 'same')
    peak = int(np.argmax(env))
    onset = int(np.argmax(env >= 0.3 * env[peak]))
    return {'peak': round(peak / SR, 3), 'onset': round(onset / SR, 3), 'duration': round(len(y) / SR, 3)}


if __name__ == '__main__':
    print(json.dumps({p: analyse(p) for p in sys.argv[1:]}, indent=1))
