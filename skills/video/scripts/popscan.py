#!/usr/bin/env python3
"""Find single-frame pops: frames that change far more than their neighbours.

    python3 popscan.py film.mp4 [--ratio 3] [--floor 1.5]

Decodes at 192x108 grayscale, takes the mean absolute difference between
consecutive frames, and flags frame i when its difference is `ratio` times both
the frame before and the frame after and above `floor` (0-255 scale). A
deliberate hard change (a flood finishing, a cut) also flags: look at each one
and decide, do not suppress the check.
"""
import subprocess, sys
import numpy as np

W, H = 192, 108


def main():
    args = sys.argv[1:]
    path = args[0]
    ratio = float(args[args.index('--ratio') + 1]) if '--ratio' in args else 3.0
    floor = float(args[args.index('--floor') + 1]) if '--floor' in args else 1.5
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-vf', f'scale={W}:{H},format=gray',
                          '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    fps_line = subprocess.run(['ffprobe', '-v', 'quiet', '-select_streams', 'v:0', '-show_entries',
                               'stream=r_frame_rate', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
    num, den = fps_line.strip().strip(',').split('/')
    fps = float(num) / float(den)
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    d = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    hits = []
    for i in range(1, len(d) - 1):
        if d[i] > floor and d[i] > ratio * max(d[i - 1], 1e-3) and d[i] > ratio * max(d[i + 1], 1e-3):
            hits.append(i + 1)
            print(f'pop at frame {i + 1}  t={(i + 1) / fps:.3f}s  diff={d[i]:.2f}  neighbours={d[i - 1]:.2f}/{d[i + 1]:.2f}')
    print(f'{len(frames)} frames, {len(hits)} pops (ratio {ratio}, floor {floor})')


if __name__ == '__main__':
    main()
