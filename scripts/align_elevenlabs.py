#!/usr/bin/env python3
"""Timing from ElevenLabs Forced Alignment: the song plus the sheet in, sung word times out.

usage: align_elevenlabs.py <project> [--response FILE]

  --response FILE  convert an ElevenLabs reply already saved to disk. No network.
  (no flag)        send assets/song.wav and the sheet to ElevenLabs and save the raw
                   reply to alignment/elevenlabs_response.json. This is NOT WIRED YET:
                   see request_alignment() below.

It writes:
  alignment/elevenlabs_response.json   the reply, byte for byte (the receipt)
  alignment/timing.machine.json        the reply mapped onto the sheet
  timing.json                          machine timing plus Adem's corrections
                                       (apply_corrections.py)

Mapping. The sheet is the text, so the reply's words are only a source of times.
Both are reduced to letters and digits, and the two letter streams are aligned
(difflib). Each sheet word takes the times of the reply words its letters land in,
so it does not matter how the service splits "(Oh-oh-oh-oh)" or where it puts
punctuation. Where one reply word carries two sheet words, its span is shared in
proportion to their letters. A sheet word with no letters aligned is placed evenly
in the gap around it. All three cases go on the needs_review list for the ear-check.
"""
import argparse
import datetime
import difflib
import json
import os
import shutil
import subprocess
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet import norm, parse_sheet, sha256, sheet_words  # noqa: E402

SCHEMA = 'arkhe.lyric_journey.timing/v1'
MIN_WORD = 0.05


def request_alignment(audio_path, text, api_key, out_path):
    """NOT WIRED YET. For the next bot to write.

    What it must do: POST the song and the sheet's text to ElevenLabs Forced Alignment,
    and write the reply's raw bytes to out_path before parsing them. Return the parsed
    JSON. Everything downstream (convert(), apply_corrections.py, timing_check.py, the
    ear-check, the engine) is built and tested against the reply shape below.

    Endpoint, from the API reference (docs/api-reference/forced-alignment/create), read
    2026-11-12:
      POST https://api.elevenlabs.io/v1/forced-alignment
      multipart/form-data:
        file   the audio, required. "All major audio formats", under 1 GB. Send
               assets/song.wav untouched.
        text   the transcript, required. Send `text` exactly as given (the sheet's
               sung lines joined with newlines; labels and notes already removed).
      Regional hosts also exist (api.us, api.eu.residency, api.in.residency,
      api.sg.residency).
      Reply 200:
        {"characters": [{"text", "start", "end"}],
         "words":      [{"text", "start", "end", "loss"}],
         "loss": float}
        Times are in seconds.
      Reply 422: {"detail": [{"loc", "msg", "type"}]}

    Not stated on that page; verify before relying on it:
      - the auth header (ElevenLabs uses `xi-api-key: <key>` elsewhere);
      - limits on duration, file size in practice, and languages;
      - pricing, data retention, whether uploads may be used for training, and the
        commercial terms for the output.

    Rules for the wiring:
      - the key comes from ELEVENLABS_API_KEY; never write it to a file, a log or a
        receipt;
      - this uploads Adem's master to a third party; do it only for a song he has
        cleared for upload;
      - save the raw reply before anything else, and fail loudly on any non-200
        (keep the error body next to it as elevenlabs_error.json);
      - no retries that silently change the request.
    """
    raise NotImplementedError(
        'The ElevenLabs request is not wired yet. Read request_alignment() in '
        'scripts/align_elevenlabs.py, or pass --response <saved reply.json>.')


def audio_duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def reply_words(reply):
    """The reply's words that carry letters and times, in order."""
    ws = reply.get('words')
    if not isinstance(ws, list):
        raise ValueError('the reply has no "words" list')
    out = []
    for w in ws:
        t = w.get('text') or ''
        if not norm(t) or w.get('start') is None or w.get('end') is None:
            continue
        out.append({'text': t, 'start': float(w['start']), 'end': float(w['end']), 'loss': w.get('loss')})
    return out


def convert(reply, lines, duration):
    """Map the reply onto the sheet: (words, needs_review)."""
    sheet = sheet_words(lines)
    rw = reply_words(reply)
    s_chars, s_owner, r_chars, r_owner = [], [], [], []
    for i, w in enumerate(sheet):
        for c in norm(w['text']):
            s_chars.append(c); s_owner.append(i)
    for j, w in enumerate(rw):
        for c in norm(w['text']):
            r_chars.append(c); r_owner.append(j)
    hits = [[] for _ in sheet]
    sm = difflib.SequenceMatcher(None, ''.join(s_chars), ''.join(r_chars), autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            hits[s_owner[a + k]].append(r_owner[b + k])
    # which sheet words landed in each reply word, in sheet order, with their letter counts
    shares = defaultdict(list)
    for i, js in enumerate(hits):
        for j, cnt in sorted(Counter(js).items()):
            shares[j].append((i, cnt))
    spans = [[] for _ in sheet]
    for j, owners in shares.items():
        s, e, total, acc = rw[j]['start'], rw[j]['end'], sum(c for _, c in owners), 0
        for i, cnt in owners:
            spans[i].append((s + (e - s) * acc / total, s + (e - s) * (acc + cnt) / total))
            acc += cnt
    words, review = [], []
    for i, w in enumerate(sheet):
        letters = len(norm(w['text']))
        cov = len(hits[i]) / letters if letters else 0.0
        out = dict(w, start=None, end=None, loss=None, coverage=round(cov, 3), source='aligned')
        if spans[i]:
            out['start'] = min(s for s, _ in spans[i]); out['end'] = max(e for _, e in spans[i])
            losses = [rw[j]['loss'] for j in set(hits[i]) if isinstance(rw[j]['loss'], (int, float))]
            out['loss'] = round(max(losses), 4) if losses else None
            if any(len(shares[j]) > 1 for j in set(hits[i])):
                out['source'] = 'split'
                review.append((i, 'shares one aligned word with its neighbour; the span was divided by letters'))
            if cov < 0.6:
                review.append((i, f'only {cov:.0%} of its letters aligned'))
        else:
            out['source'] = 'interpolated'
            review.append((i, 'not aligned; placed evenly in the gap around it'))
        words.append(out)
    interpolate(words, duration)
    tidy(words, duration, review)
    for w in words:
        w['start'], w['end'] = round(w['start'], 3), round(w['end'], 3)
    seen, needs = set(), []
    for i, why in review:
        key = (i, why)
        if key in seen:
            continue
        seen.add(key)
        w = words[i]
        needs.append({'word_id': w['id'], 'text': w['text'], 'line_id': w['line_id'], 'start': w['start'], 'reason': why})
    return words, needs


def interpolate(words, duration):
    """Unaligned runs, spread evenly between the aligned words either side."""
    i, n = 0, len(words)
    while i < n:
        if words[i]['start'] is not None:
            i += 1
            continue
        j = i
        while j < n and words[j]['start'] is None:
            j += 1
        k = j - i
        lo = words[i - 1]['end'] if i > 0 else None
        hi = words[j]['start'] if j < n else None
        if lo is None and hi is None:
            lo, hi = 0.0, min(duration, 0.4 * k)
        elif lo is None:
            lo = max(0.0, hi - 0.4 * k)
        elif hi is None:
            hi = min(duration, lo + 0.4 * k)
        if hi - lo < MIN_WORD * k:
            hi = lo + MIN_WORD * k
        step = (hi - lo) / k
        for m in range(k):
            words[i + m]['start'] = lo + m * step
            words[i + m]['end'] = lo + (m + 1) * step
        i = j


def tidy(words, duration, review):
    """Starts in order, every word at least MIN_WORD long, each ending before the next begins."""
    for i, w in enumerate(words):
        w['start'] = min(max(0.0, w['start']), duration)
        if i and w['start'] < words[i - 1]['start']:
            review.append((i, 'started before the word sung before it; moved after it'))
            w['start'] = words[i - 1]['start'] + 0.001
        w['end'] = min(max(w['end'], w['start'] + MIN_WORD), duration)
    for i in range(len(words) - 1):
        if words[i]['end'] > words[i + 1]['start']:
            words[i]['end'] = max(words[i + 1]['start'], words[i]['start'] + 0.001)


def build(project, reply, reply_path):
    lyrics, song = os.path.join(project, 'lyrics.txt'), os.path.join(project, 'assets', 'song.wav')
    lines = parse_sheet(lyrics)
    if not lines:
        raise SystemExit('lyrics.txt has no sung lines')
    duration = audio_duration(song)
    words, needs = convert(reply, lines, duration)
    out_lines = []
    for L in lines:
        ws = [w for w in words if w['line_id'] == L['id']]
        out_lines.append({'id': L['id'], 'text': L['text'], 'section': L['section'], 'start': ws[0]['start'], 'end': ws[-1]['end']})
    return {
        'schema': SCHEMA,
        'audio': {'path': 'assets/song.wav', 'sha256': sha256(song), 'duration_s': round(duration, 3)},
        'lyrics': {'path': 'lyrics.txt', 'sha256': sha256(lyrics), 'n_lines': len(lines), 'n_words': len(words)},
        'source': {
            'aligner': 'elevenlabs/forced-alignment',
            'reply': os.path.relpath(reply_path, project),
            'reply_sha256': sha256(reply_path),
            'reply_loss': reply.get('loss'),
            'converter': 'scripts/align_elevenlabs.py',
            'converted_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        },
        'lines': out_lines,
        'words': words,
        'needs_review': needs,
        'manual_corrections': [],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('project')
    ap.add_argument('--response', help='an ElevenLabs reply saved as JSON')
    a = ap.parse_args()
    project = os.path.abspath(a.project)
    os.makedirs(os.path.join(project, 'alignment'), exist_ok=True)
    keep = os.path.join(project, 'alignment', 'elevenlabs_response.json')
    if a.response:
        src = os.path.abspath(a.response)
        if src != keep:
            shutil.copyfile(src, keep)
    else:
        key = os.environ.get('ELEVENLABS_API_KEY')
        if not key:
            raise SystemExit('ELEVENLABS_API_KEY is not set (and no --response was given)')
        text = '\n'.join(L['text'] for L in parse_sheet(os.path.join(project, 'lyrics.txt')))
        try:
            request_alignment(os.path.join(project, 'assets', 'song.wav'), text, key, keep)
        except NotImplementedError as e:
            raise SystemExit(str(e))
    with open(keep, encoding='utf-8') as f:
        reply = json.load(f)
    timing = build(project, reply, keep)
    machine = os.path.join(project, 'alignment', 'timing.machine.json')
    with open(machine, 'w', encoding='utf-8') as f:
        json.dump(timing, f, indent=1, ensure_ascii=False)
    n = len(timing['words'])
    by = Counter(w['source'] for w in timing['words'])
    print(f'{machine}: {n} words · aligned {by["aligned"]} · split {by["split"]} · interpolated {by["interpolated"]} · needs review {len(timing["needs_review"])}')
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, os.path.join(here, 'apply_corrections.py'), project], check=True)


if __name__ == '__main__':
    main()
