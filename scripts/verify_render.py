#!/usr/bin/env python3
"""Verify a rendered journey before it is delivered.

usage: verify_render.py <project> [film.mp4] [--partial]
  film.mp4 defaults to <project>/<folder>-journey.mp4. --partial: a test clip, so
  its length is not held against the song's (START in the environment says where
  in the song it begins).

- the streams: 1920x1080 video at 30 fps, AAC audio, and how long each runs;
- a full decode of every frame, which must raise no errors;
- the film's sound against the master (assets/song.wav, from the render's START):
  the lag in samples by cross-correlation of the two signals, and their correlation;
- the SHA-256 of the file.

Writes journey/evidence/verify.json and exits 1 if anything fails.
"""
import hashlib
import json
import os
import subprocess
import sys

import numpy as np


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,duration:format=duration,bit_rate',
                        '-of', 'json', path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def pcm(path, sr=8000, start=0.0, dur=None):
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{start:.3f}', '-i', path]
    if dur:
        cmd += ['-t', f'{dur:.3f}']
    cmd += ['-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    partial = '--partial' in sys.argv
    if len(args) not in (1, 2):
        raise SystemExit(__doc__)
    project = os.path.abspath(args[0])
    film = os.path.abspath(args[1]) if len(args) > 1 else os.path.join(project, os.path.basename(project) + '-journey.mp4')
    song = os.path.join(project, 'assets', 'song.wav')
    fails, report = [], {'file': film}
    if not os.path.exists(film):
        raise SystemExit(f'no film at {film}')
    p = probe(film)
    v = next((s for s in p['streams'] if s['codec_type'] == 'video'), None)
    a = next((s for s in p['streams'] if s['codec_type'] == 'audio'), None)
    dur = float(p['format']['duration'])
    report['streams'] = {'video': v, 'audio': a, 'duration_s': dur, 'bit_rate': int(p['format'].get('bit_rate', 0))}
    if not v or (v['width'], v['height']) != (1920, 1080):
        fails.append(f'video is not 1920x1080: {v and (v["width"], v["height"])}')
    if v and v.get('r_frame_rate') != '30/1':
        fails.append(f'frame rate is {v.get("r_frame_rate")}, not 30/1')
    if not a:
        fails.append('no audio stream')
    # every frame decodes
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', film, '-f', 'null', '-'], capture_output=True, text=True)
    report['decode'] = 'clean' if r.returncode == 0 and not r.stderr.strip() else r.stderr.strip()[:2000] or f'exit {r.returncode}'
    if report['decode'] != 'clean':
        fails.append('decode errors')
    # sound against the master: which part of the song does the film carry, and is it in sync?
    if a:
        song_dur = float(probe(song)['format']['duration'])
        start = float(os.environ.get('START', 0))
        sr, win = 8000, min(30.0, dur, song_dur - start)
        f = pcm(film, sr, 0, win)
        m = pcm(song, sr, start, win)
        n = min(len(f), len(m))
        if n < sr:
            fails.append('too little audio to compare')
        else:
            f, m = f[:n] - f[:n].mean(), m[:n] - m[:n].mean()
            size = 1 << int(np.ceil(np.log2(2 * n)))
            xc = np.fft.irfft(np.fft.rfft(f, size) * np.conj(np.fft.rfft(m, size)), size)
            lags = np.concatenate([np.arange(0, n), np.arange(-n + 1, 0)])
            vals = np.concatenate([xc[:n], xc[size - n + 1:]])
            k = int(np.argmax(vals))
            lag = int(lags[k])
            sh = (f[lag:], m[:n - lag]) if lag >= 0 else (f[:n + lag], m[-lag:])
            corr = float(np.corrcoef(*sh)[0, 1]) if len(sh[0]) > sr else 0.0
            report['sync'] = {'window_s': round(win, 2), 'song_from_s': start, 'lag_ms': round(1000 * lag / sr, 2), 'r': round(corr, 4)}
            if abs(lag) > sr * 0.005:
                fails.append(f'audio is {1000 * lag / sr:.1f} ms off the master')
            if corr < 0.98:
                fails.append(f'audio correlates only {corr:.3f} with the master')
        report['length'] = {'film_s': round(dur, 3), 'song_s': round(song_dur, 3)}
        if not partial and abs(dur - (song_dur - start)) > 0.1:
            fails.append(f'film runs {dur:.2f} s; the song runs {song_dur:.2f} s')
    h = hashlib.sha256()
    with open(film, 'rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''):
            h.update(b)
    report['sha256'] = h.hexdigest()
    report['size_mb'] = round(os.path.getsize(film) / 1e6, 1)
    report['result'] = 'FAIL' if fails else 'PASS'
    report['fails'] = fails
    ev = os.path.join(project, 'journey', 'evidence')
    os.makedirs(ev, exist_ok=True)
    with open(os.path.join(ev, 'verify.json'), 'w') as fh:
        json.dump(report, fh, indent=1)
    s = report.get('sync', {})
    print(f'{os.path.basename(film)} · {dur:.2f} s · {report["size_mb"]} MB · decode {report["decode"] if report["decode"] == "clean" else "ERRORS"}'
          + (f' · audio lag {s["lag_ms"]} ms, r {s["r"]}' if s else '') + f' · sha256 {report["sha256"][:16]}…')
    for x in fails:
        print('  FAIL: ' + x)
    print(report['result'])
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
