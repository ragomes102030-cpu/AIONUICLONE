import re, sys

# Concatenate ALL python blocks of a SKILL.md into one namespace and exec.
# Extra quick-start/demo snippets are wrapped so failures surface clearly.
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
blocks = re.findall(r"```python(.*?)```", text, re.S)
src = "\n\n".join(b.replace("\\n", "\n") for b in blocks)
ns = {}
exec(compile(src, "skill", "exec"), ns)
print(f"OK blocks={len(blocks)} symbols={sorted(ns.keys())[:10]}")
