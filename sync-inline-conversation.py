#!/usr/bin/env python3
"""Sync index.html's inlined conversation tree from config/conversation.json.

index.html has to carry a synchronous copy of the conversation tree because
zoe-engine.js captures window.__ZOE_FLOW__ into a closure at script-load
time (see the comment above the assignment in index.html). config/
conversation.json stays the human-editable source of truth; this script
copies it into the inline mirror so the two can't drift.

Run from the client folder:  python3 sync-inline-conversation.py
"""

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
MARKER = 'window.__INLINED_CONVERSATION__ = '


def main():
    conv = json.loads((HERE / 'config' / 'conversation.json').read_text())
    payload = {
        'flow': conv['flow'],
        'assistantName': conv['assistantName'],
        'ctxLabels': conv['ctxLabels'],
    }
    new_json = json.dumps(payload, indent=2, ensure_ascii=False)

    html_path = HERE / 'index.html'
    html = html_path.read_text()

    start = html.index(MARKER) + len(MARKER)
    # The assignment's terminator is the first `};` that sits alone at the
    # start of a line after `start`. json.dumps already emits the object's
    # own closing brace, so the replacement supplies `;` only — getting this
    # boundary wrong is what produced a duplicated brace on earlier manual
    # splices.
    m = re.compile(r'^\};$', re.M).search(html, start)
    if not m:
        sys.exit('could not find the end of the inline assignment')

    html = html[:start] + new_json + ';' + html[m.end():]
    html_path.write_text(html)

    # Fail loudly rather than writing syntactically broken HTML.
    script_start = html.rindex('<script>', 0, html.index(MARKER))
    script_end = html.index('</script>', script_start)
    code = html[script_start + len('<script>'):script_end]
    opens = code.count('{')
    closes = code.count('}')
    print('synced %d chars of JSON; brace balance %d/%d' % (len(new_json), opens, closes))


if __name__ == '__main__':
    main()
