#!/usr/bin/env python3
"""The ear-check cut: a timing played against the song, for Adem's ear.

Each line in grey, its words lighting white at their onsets (ASS karaoke), the next
line small below, a running timecode, the section name, and a numbered LISTEN prompt
over each passage that needs his ear. Black picture, the master's audio untouched.

usage: earcheck.py <timing.json> <song.wav> <out.mp4> [prompts.json]
  prompts.json: [{"t0": 6.5, "t1": 10, "text": "..."}]  (\\N breaks a prompt's line)
  Without it, the prompts are made from the timing's needs_review list, one per word
  or per cluster of nearby words.
"""
import json
import os
import subprocess
import sys
import tempfile


def auto_prompts(d):
    by_id = {w['id']: w for w in d['words'] if 'id' in w}
    lines = {L['id']: L['text'] for L in d['lines']}
    items = sorted(d.get('needs_review') or [], key=lambda n: n.get('start', 0))
    windows = []
    for n in items:
        w = by_id.get(n['word_id'], {})
        s = w.get('start', n.get('start', 0.0))
        e = w.get('end', s + 0.4)
        say = f"'{n['text']}' in \"{lines.get(n['line_id'], '')}\": {n['reason']}"
        if windows and s - 1.2 <= windows[-1]['t1']:
            windows[-1]['t1'] = max(windows[-1]['t1'], e + 1.8)
            windows[-1]['say'].append(say)
        else:
            windows.append({'t0': max(0.0, s - 1.2), 't1': e + 1.8, 'say': [say]})
    out = []
    for k, wdw in enumerate(windows, 1):
        lead = wdw['say'][:3] + ([f'and {len(wdw["say"]) - 3} more'] if len(wdw['say']) > 3 else [])
        out.append({'t0': round(wdw['t0'], 2), 't1': round(wdw['t1'], 2), 'text': f'{k} · ' + '\\N'.join(lead) + '\\NDoes it land?'})
    return out


def main():
    if len(sys.argv) not in (4, 5):
        raise SystemExit(__doc__)
    timed, song, out = sys.argv[1:4]
    with open(timed, encoding='utf-8') as f:
        d = json.load(f)
    if len(sys.argv) > 4:
        with open(sys.argv[4], encoding='utf-8') as f:
            prompts = json.load(f)
    else:
        prompts = auto_prompts(d)
    words = d['words']
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', song],
                               capture_output=True, text=True, check=True).stdout)

    def ts(t):
        t = max(0.0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
        return f'{h}:{m:02d}:{s:05.2f}'

    def esc(s):
        return s.replace('{', '(').replace('}', ')')

    ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 2', '',
           '[V4+ Styles]',
           'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
           # karaoke: words start grey (secondary) and turn white (primary) at their onset
           'Style: Line,Helvetica Neue,76,&H00FFFFFF,&H00606060,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,80,80,0,1',
           'Style: Next,Helvetica Neue,44,&H00505050,&H00505050,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,80,80,0,1',
           'Style: Section,Helvetica Neue,30,&H00A0A0A0,&H00A0A0A0,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,7,60,60,50,1',
           'Style: Listen,Helvetica Neue,38,&H0040C8FF,&H0040C8FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,3,14,0,8,120,120,90,1',
           '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
    lines = []
    for L in d['lines']:
        ws = [w for w in words if w['line_id'] == L['id']]
        if ws:
            lines.append((L, ws))
    for i, (L, ws) in enumerate(lines):
        t0 = ws[0]['start'] - 0.7
        t1 = max(ws[-1]['end'] + 0.35, ws[0]['start'] + 1.2)
        if i + 1 < len(lines):
            t1 = min(t1, lines[i + 1][1][0]['start'] - 0.7 + 0.05)
        t1 = max(t1, ws[-1]['start'] + 0.3)
        k, cur = [], t0
        for w in ws:
            k.append(f'{{\\k{max(0, round((w["start"] - cur) * 100))}}}'); cur = w['start']
            k.append(esc(w['text']) + ' ')
        ass.append(f'Dialogue: 1,{ts(t0)},{ts(t1)},Line,,0,0,0,,{{\\pos(960,500)}}{{\\k0}}' + ''.join(k).rstrip())
        if i + 1 < len(lines):   # the next line, small, below
            ass.append(f'Dialogue: 0,{ts(t0)},{ts(t1)},Next,,0,0,0,,{{\\pos(960,610)}}' + esc(lines[i + 1][0]['text']))
    secs = []   # section names, from the words' own section tags
    for w in words:
        s = w.get('section') or ''
        if not secs or secs[-1][0] != s:
            secs.append([s, w['start'], w['end']])
        else:
            secs[-1][2] = w['end']
    for s, a, b in secs:
        if s:
            ass.append(f'Dialogue: 0,{ts(a - 0.7)},{ts(b + 0.5)},Section,,0,0,0,,{s.replace("_", " ").upper()}')
    for p in prompts:
        ass.append(f'Dialogue: 2,{ts(p["t0"])},{ts(p["t1"])},Listen,,0,0,0,,LISTEN · {esc(p["text"])}')
    font = '/System/Library/Fonts/Helvetica.ttc'
    clock = (f"fontfile={font}:" if os.path.exists(font) else 'font=Sans:') + \
        "text='%{pts\\:hms}':x=w-tw-60:y=h-th-50:fontsize=34:fontcolor=white@0.75"
    with tempfile.TemporaryDirectory() as tmp:
        sub = os.path.join(tmp, 'ear.ass')
        with open(sub, 'w', encoding='utf-8') as f:
            f.write('\n'.join(ass) + '\n')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=0x0c0c0e:s=1920x1080:r=30:d={dur:.3f}',
                        '-i', song, '-vf', f'subtitles={sub},drawtext={clock}', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
                        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], check=True)
    print(f'wrote {out} · {len(prompts)} LISTEN prompts')


if __name__ == '__main__':
    main()
