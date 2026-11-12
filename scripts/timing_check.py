#!/usr/bin/env python3
"""Check timing.json against the sheet and the song before anything is built on it.

usage: timing_check.py <project> [--final] [--json]

Errors (exit 1):
- timing.json is missing the fields the engine reads: lines[{id, text}] and
  words[{text, start, end, line_id}];
- its words are not the sheet's words, in order, exactly (the sheet is the text);
- its lines are not the sheet's lines, or a word sits on the wrong line;
- a time is not a number, a word does not start before it ends, a word runs past
  the end of the song, or a word starts before the word sung before it;
- with --final: any word still on the needs_review list.

Warnings: words that overlap the next word, flashes under 80 ms, two words on one
onset, characters the default glyph set lacks (the font draws them; check by eye),
a song or sheet that changed since the timing was made, and open review items.
"""
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet import parse_sheet, sha256, sheet_words  # noqa: E402

GLYPHS = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\'"-·:;!?&()')


def duration_of(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return float(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip() else None


def check(project, final=False):
    errors, warnings, info = [], [], []
    tp, lp, song = (os.path.join(project, p) for p in ('timing.json', 'lyrics.txt', 'assets/song.wav'))
    for p in (tp, lp):
        if not os.path.exists(p):
            return {'errors': [f'missing {os.path.relpath(p, project)}'], 'warnings': [], 'info': []}
    with open(tp, encoding='utf-8') as f:
        try:
            t = json.load(f)
        except json.JSONDecodeError as e:
            return {'errors': [f'timing.json is not JSON: {e}'], 'warnings': [], 'info': []}
    lines, words = t.get('lines'), t.get('words')
    if not isinstance(lines, list) or not isinstance(words, list) or not words:
        return {'errors': ['timing.json needs a "lines" list and a non-empty "words" list'], 'warnings': [], 'info': []}
    for k, w in enumerate(words):
        missing = [f for f in ('text', 'start', 'end', 'line_id') if f not in w]
        if missing:
            errors.append(f'word {k} lacks {", ".join(missing)}')
    for k, L in enumerate(lines):
        if 'id' not in L or 'text' not in L:
            errors.append(f'line {k} lacks id or text')
    if errors:
        return {'errors': errors, 'warnings': warnings, 'info': info}

    sheet = parse_sheet(lp)
    sw = sheet_words(sheet)
    # the words, exactly
    got = [w['text'] for w in words]
    want = [w['text'] for w in sw]
    if got != want:
        k = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
        a = got[k] if k < len(got) else '(end)'
        b = want[k] if k < len(want) else '(end)'
        errors.append(f'the words are not the sheet\'s: word {k} is {a!r} in timing.json, {b!r} on the sheet '
                      f'({len(got)} words against {len(want)})')
    else:
        # the lines, and each word on its own line
        sheet_ids = [L['id'] for L in sheet]
        ids = [L['id'] for L in lines]
        if [L['text'] for L in lines] != [L['text'] for L in sheet]:
            k = next((i for i, (a, b) in enumerate(zip(lines, sheet)) if a['text'] != b['text']), min(len(lines), len(sheet)))
            errors.append(f'the lines are not the sheet\'s (first difference at line {k}; '
                          f'{len(lines)} lines against {len(sheet)})')
        else:
            pos = {L['id']: i for i, L in enumerate(lines)}
            for w, s in zip(words, sw):
                if w['line_id'] not in pos:
                    errors.append(f'{w.get("id", "?")} "{w["text"]}" names line {w["line_id"]!r}, which does not exist')
                elif sheet_ids[pos[w['line_id']]] != s['line_id']:
                    errors.append(f'{w.get("id", "?")} "{w["text"]}" is on {w["line_id"]} but the sheet sings it in line {sheet_ids.index(s["line_id"])}')
            if len(set(ids)) != len(ids):
                errors.append('two lines share an id')

    dur = duration_of(song) if os.path.exists(song) else None
    if dur is None:
        warnings.append('no assets/song.wav to check the times against')
    prev = None
    for k, w in enumerate(words):
        s, e, name = w['start'], w['end'], f'{w.get("id", k)} "{w["text"]}"'
        if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in (s, e)):
            errors.append(f'{name} has a time that is not a number')
            prev = None
            continue
        if s < 0 or e <= s:
            errors.append(f'{name} runs {s:.3f}–{e:.3f} s')
        if dur is not None and e > dur + 0.05:
            errors.append(f'{name} ends at {e:.3f} s, after the song ({dur:.3f} s)')
        if prev is not None:
            ps, pe, pname = prev
            if s < ps:
                errors.append(f'{name} starts at {s:.3f} s, before {pname} at {ps:.3f} s')
            elif s == ps:
                warnings.append(f'{name} shares its onset with {pname} ({s:.3f} s)')
            if pe > s + 1e-6:
                warnings.append(f'{pname} ends at {pe:.3f} s, after {name} begins ({s:.3f} s)')
            if s - pe > 25:
                info.append(f'{s - pe:.1f} s without words before {name}')
        if round(e - s, 3) < 0.08:
            warnings.append(f'{name} lasts {1000 * (e - s):.0f} ms (a flash)')
        prev = (s, e, name)
    odd = sorted({c for w in words for c in w['text'] if c not in GLYPHS and not c.isspace()})
    if odd:
        warnings.append(f'characters outside the default glyph set: {" ".join(odd)} (the engine adds them from the '
                        f'font; check them in a still)')
    for key, path in (('audio', song), ('lyrics', lp)):
        rec = (t.get(key) or {}).get('sha256')
        if rec and os.path.exists(path) and sha256(path) != rec:
            warnings.append(f'{os.path.relpath(path, project)} changed since this timing was made')
    open_items = t.get('needs_review') or []
    if open_items:
        msg = f'{len(open_items)} words still need Adem\'s ear: ' + ', '.join(
            f'{n["word_id"]} "{n["text"]}"' for n in open_items[:8]) + (' …' if len(open_items) > 8 else '')
        (errors if final else warnings).append(msg)
    src = (t.get('source') or {}).get('aligner') or (t.get('engine') or {}).get('name') or 'unknown'
    info.insert(0, f'{len(lines)} lines · {len(words)} words · first onset {words[0]["start"]:.2f} s · last onset '
                   f'{words[-1]["start"]:.2f} s · source {src} · {len(t.get("manual_corrections") or [])} corrections on record')
    return {'errors': errors, 'warnings': warnings, 'info': info}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 1:
        raise SystemExit(__doc__)
    r = check(os.path.abspath(args[0]), final='--final' in sys.argv)
    if '--json' in sys.argv:
        print(json.dumps(r, indent=1, ensure_ascii=False))
    else:
        for x in r['info']:
            print('  ' + x)
        for x in r['warnings']:
            print('  warning: ' + x)
        for x in r['errors']:
            print('  ERROR: ' + x)
        print('FAIL' if r['errors'] else 'PASS' + (f' with {len(r["warnings"])} warnings' if r['warnings'] else ''))
    sys.exit(1 if r['errors'] else 0)


if __name__ == '__main__':
    main()
