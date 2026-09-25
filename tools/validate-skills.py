import os, re, sys, json

root = sys.argv[1] if len(sys.argv) > 1 else "skills/construction"
errors, checked = [], 0
for entry in sorted(os.listdir(root)):
    d = os.path.join(root, entry)
    if not os.path.isdir(d):
        continue
    skill = os.path.join(d, "SKILL.md")
    claw = os.path.join(d, "claw.json")
    instr = os.path.join(d, "instructions.md")
    if not os.path.isfile(skill):
        errors.append(f"{entry}: missing SKILL.md")
        continue
    checked += 1
    text = open(skill, encoding="utf-8").read()
    m = re.search(r"^name:\s*['\"]?([^\s'\"]+)['\"]?", text, re.M)
    if not m:
        errors.append(f"{entry}: no name in frontmatter")
    elif m.group(1) != entry:
        errors.append(f"{entry}: name mismatch ({m.group(1)})")
    if "description:" not in text:
        errors.append(f"{entry}: no description in frontmatter")
    if os.path.isfile(claw):
        try:
            c = json.load(open(claw, encoding="utf-8"))
            if c.get("name") != entry:
                errors.append(f"{entry}: claw.json name mismatch")
        except Exception as e:
            errors.append(f"{entry}: claw.json invalid ({e})")
    else:
        errors.append(f"{entry}: missing claw.json")
    if not os.path.isfile(instr):
        errors.append(f"{entry}: missing instructions.md")

print(f"checked={checked} errors={len(errors)}")
for e in errors:
    print("ERR", e)
sys.exit(1 if errors else 0)
