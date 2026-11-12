"""The lyric sheet: lyrics.txt as Adem wrote it.

The sheet is the text. What it says is what the film shows, word for word; no
script ever edits it.

Format:
- one sung line per text line;
- a line in square brackets, such as [Verse] or [Chorus], is a section label and is
  not sung;
- a line starting with # is a note and is not sung;
- blank lines are ignored;
- words are split on whitespace and kept exactly, punctuation and parentheses
  included: "(On my way)" is three words, "(On", "my" and "way)".

Sections are numbered in order: the second [Verse] is verse_2. Lines before any
label have no section.
"""
import hashlib
import re
import unicodedata

LABEL = re.compile(r'^\[(.+)\]$')


def parse_sheet(path):
    """Lines in sung order: [{"id": "L0", "text", "section", "words": [str]}]."""
    lines, counts, section = [], {}, ''
    with open(path, encoding='utf-8') as f:
        for raw in f:
            s = raw.strip()
            if not s or s.startswith('#'):
                continue
            m = LABEL.match(s)
            if m:
                slug = re.sub(r'[^a-z0-9]+', '_', m.group(1).strip().lower()).strip('_') or 'section'
                counts[slug] = counts.get(slug, 0) + 1
                section = f'{slug}_{counts[slug]}'
                continue
            words = s.split()
            lines.append({'id': f'L{len(lines)}', 'text': ' '.join(words), 'section': section, 'words': words})
    return lines


def sheet_words(lines):
    """Every sung word in order: [{"id": "W0", "text", "line_id", "section"}]."""
    out = []
    for L in lines:
        for w in L['words']:
            out.append({'id': f'W{len(out)}', 'text': w, 'line_id': L['id'], 'section': L['section']})
    return out


def norm(s):
    """Letters and digits only, case-folded: how two spellings of a word are compared."""
    return ''.join(c for c in unicodedata.normalize('NFKC', s).casefold() if c.isalnum())


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()
