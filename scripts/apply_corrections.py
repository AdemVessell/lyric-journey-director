#!/usr/bin/env python3
"""timing.json = the machine timing plus Adem's corrections, each one recorded.

usage: apply_corrections.py <project>

Reads alignment/timing.machine.json and, if present, alignment/corrections.json:

  [{"word_id": "W4", "text": "made", "start": 6.66,
    "evidence": "Adem's ear, ear-check question 1, 2026-11-12"},
   {"word_id": "W9", "text": "more", "confirm": true,
    "evidence": "Adem: lands as it is"}]

- "start" and/or "end" move a word; "confirm" keeps it where it is. Either way the
  word leaves the needs_review list.
- "text" is optional; when given it must match the word, so a correction can never
  land on the wrong word after the sheet changes.
- "evidence" is required. Timing only moves on Adem's ear or a recorded reason.

Every change is listed under manual_corrections with its before and after. Ends are
then trimmed so each word ends before the next begins, and every trim is listed too.
Nothing else is touched: every other word is the machine timing exactly.
"""
import json
import os
import sys


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    project = os.path.abspath(sys.argv[1])
    machine = os.path.join(project, 'alignment', 'timing.machine.json')
    corr_path = os.path.join(project, 'alignment', 'corrections.json')
    with open(machine, encoding='utf-8') as f:
        t = json.load(f)
    corrections = []
    if os.path.exists(corr_path):
        with open(corr_path, encoding='utf-8') as f:
            corrections = json.load(f)
    by_id = {w['id']: w for w in t['words']}
    done, resolved = [], set()
    for c in corrections:
        wid = c.get('word_id')
        if wid not in by_id:
            raise SystemExit(f'correction for unknown word {wid!r}')
        w = by_id[wid]
        if c.get('text') is not None and c['text'] != w['text']:
            raise SystemExit(f'correction {wid} says {c["text"]!r} but the word is {w["text"]!r}')
        if not str(c.get('evidence') or '').strip():
            raise SystemExit(f'correction {wid} has no evidence')
        before = [w['start'], w['end']]
        if c.get('confirm'):
            kind = 'confirmed'
        else:
            if c.get('start') is None and c.get('end') is None:
                raise SystemExit(f'correction {wid} moves nothing (give start, end or confirm)')
            if c.get('start') is not None:
                w['start'] = round(float(c['start']), 3)
            if c.get('end') is not None:
                w['end'] = round(float(c['end']), 3)
            if c.get('end') is None and w['end'] <= w['start']:
                w['end'] = round(w['start'] + 0.2, 3)
            w['source'] = w.get('source', '') + '+manual'
            kind = 'moved'
        resolved.add(wid)
        done.append({'word_id': wid, 'text': w['text'], 'line_id': w['line_id'], 'kind': kind,
                     'from': before, 'to': [w['start'], w['end']], 'evidence': c['evidence']})
    words = t['words']
    for i in range(1, len(words)):
        if words[i]['start'] < words[i - 1]['start']:
            raise SystemExit(f'after corrections {words[i]["id"]} "{words[i]["text"]}" starts before '
                             f'{words[i - 1]["id"]} "{words[i - 1]["text"]}"; fix corrections.json')
    trims = []
    for i in range(len(words) - 1):
        if words[i]['end'] > words[i + 1]['start']:
            new = round(max(words[i + 1]['start'], words[i]['start'] + 0.001), 3)
            trims.append({'word_id': words[i]['id'], 'text': words[i]['text'], 'end_from': words[i]['end'], 'end_to': new})
            words[i]['end'] = new
    for L in t['lines']:
        ws = [w for w in words if w['line_id'] == L['id']]
        L['start'], L['end'] = ws[0]['start'], ws[-1]['end']
    t['needs_review'] = [n for n in t.get('needs_review', []) if n['word_id'] not in resolved]
    t['manual_corrections'] = done
    t['end_trims'] = trims
    t['corrections_file'] = 'alignment/corrections.json' if corrections else None
    out = os.path.join(project, 'timing.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(t, f, indent=1, ensure_ascii=False)
    moved = sum(1 for d in done if d['kind'] == 'moved')
    print(f'{out}: {len(words)} words · {moved} moved and {len(done) - moved} confirmed by ear · '
          f'{len(trims)} ends trimmed · {len(t["needs_review"])} still need review')


if __name__ == '__main__':
    main()
