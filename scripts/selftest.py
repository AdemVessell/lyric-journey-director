#!/usr/bin/env python3
"""lj selftest: a synthetic song through every step, in a temporary folder.

 1. lj doctor must be ready.
 2. A 24 s synthetic song (ffmpeg) and a sheet with section labels, a note,
    parentheses, a curly apostrophe and an accent. lj new.
 3. A fake ElevenLabs reply built from known word times, with quirks a real one may
    have: spaces as words, parentheses and the curly apostrophe dropped, one sheet
    word split in three, two sheet words merged into one, and one word missing.
    lj align --response: every aligned word must land on its known onset; the
    merged and the missing words must be flagged, and the missing one placed in
    its gap.
 4. lj timing-check passes, and fails with --final while words await review.
    lj earcheck makes its cut with a prompt per flagged passage.
 5. Corrections (two confirmed, one moved), lj fix, and --final passes, with every
    correction on record.
 6. lj check passes on the starter place: every word, with its ’ and é, legible at
    its onset. lj stills makes one still.
 7. lj render, 2 s from 4.5 s; lj verify --partial: clean decode, the sound in sync
    with the master.

The folder is kept when a step fails, or always with LJ_KEEP=1.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LJ = os.path.join(HERE, 'lj')
SHEET = """# selftest sheet: labels, a note, parentheses, a curly apostrophe and an accent
[Verse]
the river keeps its own time
we were made of (salt and light)

[Chorus]
don’t let the evening go
café lights on the water
(oh-oh-oh)
"""
LINE_STARTS = [5.0, 8.6, 12.4, 15.8, 19.4]
STEP, LEN = 0.42, 0.32


def truth():
    """Known times for every sheet word: [(text, start, end)]."""
    out = []
    lines = [l for l in SHEET.splitlines() if l.strip() and not l.startswith(('#', '['))]
    for t0, line in zip(LINE_STARTS, lines):
        for k, w in enumerate(line.split()):
            s = t0 + k * STEP
            out.append((w, round(s, 3), round(s + (1.2 if w == '(oh-oh-oh)' else LEN), 3)))
    return out


def fake_reply(words):
    """What a forced-alignment reply could look like for this sheet."""
    out, chars = [], []
    i = 0
    while i < len(words):
        w, s, e = words[i]
        if w == 'own':                       # missing from the reply
            i += 1
            continue
        if w == 'café':                 # merged with the next word
            nxt = words[i + 1]
            pieces = [('café lights', s, nxt[2])]
            i += 1
        elif w == '(oh-oh-oh)':              # split in three
            third = (e - s) / 3
            pieces = [('oh', s + k * third, s + (k + 1) * third) for k in range(3)]
        else:                                # punctuation dropped, the apostrophe straightened
            pieces = [(w.strip('()').replace('’', "'"), s, e)]
        for text, a, b in pieces:
            if out:
                out.append({'text': ' ', 'start': out[-1]['end'], 'end': a, 'loss': 0.0})
            out.append({'text': text, 'start': round(a, 3), 'end': round(b, 3), 'loss': round(0.1 + 0.03 * (len(out) % 7), 3)})
            span = (b - a) / max(1, len(text))
            chars += [{'text': c, 'start': round(a + k * span, 3), 'end': round(a + (k + 1) * span, 3)} for k, c in enumerate(text)]
        i += 1
    return {'characters': chars, 'words': out, 'loss': 0.21}


def run(args, env=None, expect=0):
    t = time.time()
    r = subprocess.run([LJ] + args, capture_output=True, text=True, env={**os.environ, **(env or {})})
    if r.returncode != expect:
        raise AssertionError(f'lj {" ".join(args)} exited {r.returncode}, expected {expect}\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}')
    return r.stdout, time.time() - t


def main():
    tmp = tempfile.mkdtemp(prefix='lj-selftest-')
    proj = os.path.join(tmp, 'selftest-song')
    steps, ok = [], False
    def step(name, fn):
        t = time.time()
        detail = fn()
        steps.append((name, time.time() - t, detail or ''))
        print(f'  PASS  {name}  ({time.time() - t:.1f} s){"  · " + detail if detail else ""}', flush=True)
    try:
        step('doctor', lambda: run(['doctor'])[0].strip().splitlines()[-1])

        def make():
            song, sheet = os.path.join(tmp, 'song.wav'), os.path.join(tmp, 'sheet.txt')
            expr = '0.22*sin(2*PI*220*t)*(0.55+0.45*sin(2*PI*2*t))+0.1*sin(2*PI*331*t)+0.06*(random(0)-0.5)'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'aevalsrc={expr}:s=48000:d=24',
                            '-ac', '2', '-c:a', 'pcm_s24le', song], check=True)
            with open(sheet, 'w', encoding='utf-8') as f:
                f.write(SHEET)
            run(['new', proj, '--song', song, '--lyrics', sheet, '--title', 'Selftest Song'])
            for p in ('assets/song.wav', 'assets/drive.json', 'lyrics.txt', 'project.json', 'journey/index.html'):
                assert os.path.exists(os.path.join(proj, p)), p
            assert open(os.path.join(proj, 'lyrics.txt'), encoding='utf-8').read() == SHEET, 'the sheet was not copied untouched'
            assert 'Selftest Song' in open(os.path.join(proj, 'journey/index.html'), encoding='utf-8').read()
            return 'project made, sheet untouched'
        step('new', make)

        T = truth()
        def align():
            reply = os.path.join(tmp, 'reply.json')
            with open(reply, 'w', encoding='utf-8') as f:
                json.dump(fake_reply(T), f)
            run(['align', proj, '--response', reply])
            t = json.load(open(os.path.join(proj, 'timing.json'), encoding='utf-8'))
            assert [w['text'] for w in t['words']] == [w for w, _, _ in T], 'timing words are not the sheet words'
            flagged = {n['text'] for n in t['needs_review']}
            assert flagged == {'own', 'café', 'lights'}, f'flagged {flagged}'
            by = {w['text']: w for w in t['words']}
            exact = 0
            for (w, s, e), got in zip(T, t['words']):
                if w in ('own', 'lights'):
                    continue
                assert abs(got['start'] - s) < 0.002, f'{w}: {got["start"]} against {s}'
                exact += 1
            own, its, time_ = by['own'], by['its'], by['time']
            assert its['end'] <= own['start'] < own['end'] <= time_['start'], 'the missing word is not in its gap'
            assert by['(oh-oh-oh)']['source'] == 'aligned' and abs(by['(oh-oh-oh)']['end'] - T[-1][2]) < 0.002
            assert t['source']['aligner'] == 'elevenlabs/forced-alignment' and t['source']['reply_sha256']
            return f'{len(t["words"])} words; {exact} on their known onsets; flagged: {", ".join(sorted(flagged))}'
        step('align (fake ElevenLabs reply)', align)

        def tcheck():
            out, _ = run(['timing-check', proj])
            assert 'PASS' in out
            run(['timing-check', proj, '--final'], expect=1)
            out, _ = run(['earcheck', proj])
            assert os.path.exists(os.path.join(proj, 'selftest-song-timing-check.mp4'))
            return out.strip().split(' · ')[-1] + '; --final refuses the open review'
        step('timing-check + earcheck', tcheck)

        def fix():
            ids = {w['text']: w['id'] for w in json.load(open(os.path.join(proj, 'timing.json'), encoding='utf-8'))['words']}
            k = [w for w, _, _ in T].index('lights')
            corr = [
                {'word_id': ids['own'], 'text': 'own', 'confirm': True, 'evidence': 'selftest: placed in its gap, accepted'},
                {'word_id': ids['café'], 'text': 'café', 'confirm': True, 'evidence': 'selftest: onset exact'},
                {'word_id': ids['lights'], 'text': 'lights', 'start': T[k][1], 'evidence': 'selftest: the known onset'},
            ]
            with open(os.path.join(proj, 'alignment', 'corrections.json'), 'w', encoding='utf-8') as f:
                json.dump(corr, f, ensure_ascii=False, indent=1)
            run(['fix', proj])
            run(['timing-check', proj, '--final'])
            t = json.load(open(os.path.join(proj, 'timing.json'), encoding='utf-8'))
            kinds = sorted(c['kind'] for c in t['manual_corrections'])
            assert kinds == ['confirmed', 'confirmed', 'moved'], kinds
            assert abs(t['words'][k]['start'] - T[k][1]) < 1e-6
            return 'two confirmed, one moved, all on record; --final passes'
        step('corrections + fix', fix)

        def check():
            out, _ = run(['check', proj, '--json'])
            r = json.loads(out[out.index('{'):])
            bad = [x for x in r['out'] if x['fails']]
            assert len(r['out']) == len(T) and not bad and not r['coverage'] and not r['pageErrors'], (bad, r['coverage'], r['pageErrors'])
            caps = sorted(x['cap'] for x in r['out'])
            run(['stills', proj])
            stills = os.listdir(os.path.join(proj, 'journey', 'stills'))
            assert stills, 'no still'
            return f'{len(r["out"])}/{len(T)} words legible at onset, min cap {caps[0]} px; {len(stills)} still'
        step('check (starter place) + stills', check)

        def render():
            run(['render', proj], env={'START': '4.5', 'FRAME_LIMIT': '60', 'FLAGS': ''})
            out, _ = run(['verify', proj, '--partial'], env={'START': '4.5'})
            v = json.load(open(os.path.join(proj, 'journey', 'evidence', 'verify.json')))
            assert v['result'] == 'PASS' and v['decode'] == 'clean'
            return f'2 s clip; decode clean; audio lag {v["sync"]["lag_ms"]} ms, r {v["sync"]["r"]}'
        step('render + verify', render)
        ok = True
    except Exception as e:  # noqa: BLE001
        print(f'  FAIL  {e}', file=sys.stderr)
    finally:
        keep = not ok or os.environ.get('LJ_KEEP') == '1'
        if keep:
            print(f'  kept: {tmp}')
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print('selftest: PASS' if ok else 'selftest: FAIL')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
