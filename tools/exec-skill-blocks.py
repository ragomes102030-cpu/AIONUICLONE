import re, sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
blocks = re.findall(r"```python(.*?)```", text, re.S)
print(f"blocks={len(blocks)}")
ns = {}
for i, b in enumerate(blocks):
    code = b.replace("\\n", "\n")
    try:
        exec(compile(code, f"block{i}", "exec"), ns)
        print(f"block{i}: OK")
    except Exception as e:
        print(f"block{i}: {type(e).__name__}: {e}")
