"""Self-heal a translation value so the sweep/merge emits valid code.

The sweep (update.py) and the merge (merge_delta.py) substitute a Chinese raw
unit with its English value. The value must carry the same delimiters as the
key (the raw unit) and escape any quote characters, or the substitution emits
invalid code (bare prose in source, a broken string literal). This module
normalizes a value to match its key's form, keeping the sweep and the merge
robust against malformed values (lost comment delimiters, unescaped quotes).

The raw unit key carries the source delimiters: a string-literal key includes
its quotes, a template-literal key its backticks, and a comment key its
`/* */` / `/** */` / `//` markers. The English value must mirror that form.
"""
import re


def normalize_value(key, value):
    """Return a code-safe English value for the given raw-unit key.

    `key` is the raw CJK unit (carrying the source delimiters); `value` is the
    English translation. Rebuilds the value to match the key's delimiters and
    escapes stray quote characters. Returns non-string or empty values as-is.
    """
    if not isinstance(value, str) or not value:
        return value
    # block comment: /* ... */ or /** ... */ (JSDoc)
    if key.startswith("/*"):
        if value.startswith("/*") and value.endswith("*/"):
            return value
        prefix = "/**" if key.startswith("/**") else "/*"
        body = re.sub(r"^/\*{1,2}\s*", "", value)
        body = re.sub(r"\s*\*/\s*$", "", body).strip()
        return prefix + " " + body + " */"
    # line comment: // ...
    if key.startswith("//"):
        if value.startswith("//"):
            return value
        return "// " + value
    # single-quoted string
    if len(key) >= 2 and key[0] == "'" and key[-1] == "'":
        if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
            body = value[1:-1]
        else:
            body = value  # value lost its quotes
        return "'" + re.sub(r"(?<!\\)'", r"\\'", body) + "'"
    # double-quoted string
    if len(key) >= 2 and key[0] == '"' and key[-1] == '"':
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            body = value[1:-1]
        else:
            body = value
        return '"' + re.sub(r'(?<!\\)"', r'\\"', body) + '"'
    # template literals and undelimited units (JSX text) pass through: a
    # backtick value that lost its backticks is a rarer break, and JSX text
    # carries no quotes to normalize.
    return value
