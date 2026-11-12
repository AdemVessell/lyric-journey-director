#!/usr/bin/env python3
"""Pre-compute a deterministic spectral drive track for the visualizer.

Live playback and the offline render must look identical, so the visuals read
from this file rather than from a live AnalyserNode.
"""
import base64, json, sys
import numpy as np
import soundfile as sf

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/song.wav"
DST = sys.argv[2] if len(sys.argv) > 2 else "assets/drive.json"
FPS = 30
N_BANDS = 32
FFT = 2048

audio, sr = sf.read(SRC, always_2d=True)
mono = audio.mean(axis=1).astype(np.float64)
duration = len(mono) / sr
hop = int(round(sr / FPS))
n_frames = int(np.floor((len(mono) - FFT) / hop)) + 1
window = np.hanning(FFT)

# log-spaced band edges, 40 Hz .. 14 kHz
edges = np.geomspace(40.0, min(14000.0, sr / 2 - 1), N_BANDS + 1)
freqs = np.fft.rfftfreq(FFT, 1.0 / sr)
bins = [np.where((freqs >= edges[b]) & (freqs < edges[b + 1]))[0] for b in range(N_BANDS)]
bins = [b if len(b) else np.array([np.argmin(np.abs(freqs - edges[i]))]) for i, b in enumerate(bins)]

raw = np.zeros((n_frames, N_BANDS))
level = np.zeros(n_frames)
for i in range(n_frames):
    seg = mono[i * hop:i * hop + FFT] * window
    mag = np.abs(np.fft.rfft(seg))
    for b, idx in enumerate(bins):
        raw[i, b] = mag[idx].mean()
    level[i] = np.sqrt(np.mean(seg ** 2))

# dB compression, then per-band normalisation so every band uses its range
db = 20 * np.log10(raw + 1e-9)
lo = np.percentile(db, 8, axis=0)
hi = np.percentile(db, 99.0, axis=0)
hi = np.maximum(hi, lo + 12.0)
norm = np.clip((db - lo) / (hi - lo), 0.0, 1.0)

lvl_db = 20 * np.log10(level + 1e-9)
l_lo, l_hi = np.percentile(lvl_db, 5), np.percentile(lvl_db, 99)
lvl = np.clip((lvl_db - l_lo) / max(l_hi - l_lo, 1e-6), 0.0, 1.0)

# spectral flux -> onsets
flux = np.maximum(0.0, np.diff(norm, axis=0, prepend=norm[:1])).sum(axis=1)
flux_s = np.convolve(flux, np.ones(3) / 3, mode="same")
f_hi = np.percentile(flux_s, 99)
flux_n = np.clip(flux_s / max(f_hi, 1e-6), 0.0, 1.0)

win = int(FPS * 0.6)
onsets = []
pad = np.pad(flux_s, win, mode="edge")
last = -1.0
for i in range(n_frames):
    local = pad[i:i + 2 * win + 1]
    thresh = np.median(local) + 0.55 * np.std(local) + 1e-6
    is_peak = flux_s[i] >= thresh and flux_s[i] == flux_s[max(0, i - 2):i + 3].max()
    t = i / FPS
    if is_peak and t - last > 0.11:
        onsets.append([round(t, 4), round(float(min(1.0, flux_s[i] / max(f_hi, 1e-6))), 3)])
        last = t

def b64(a):
    return base64.b64encode(np.clip(np.round(a * 255), 0, 255).astype(np.uint8).tobytes()).decode()

json.dump({
    "source": SRC, "sample_rate": sr, "duration": round(duration, 4),
    "fps": FPS, "n_frames": n_frames, "n_bands": N_BANDS,
    "band_hz": [round(float(e), 1) for e in edges],
    "bands_b64": b64(norm.reshape(-1)), "level_b64": b64(lvl), "flux_b64": b64(flux_n),
    "onsets": onsets,
}, open(DST, "w"))
print(f"{DST}: {n_frames} frames @ {FPS}fps, {N_BANDS} bands, {len(onsets)} onsets, {duration:.2f}s")
