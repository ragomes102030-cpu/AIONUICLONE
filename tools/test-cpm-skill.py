import re, sys

# Mirror of plataforma-obras shared/cpm.test.ts cases, executed against
# the SKILL.md python implementation (concatenated blocks).
text = open("skills/construction/cpm-network-validator/SKILL.md",
            encoding="utf-8").read()
src = "\n\n".join(b.replace("\\n", "\n")
                  for b in re.findall(r"```python(.*?)```", text, re.S))
ns = {}
exec(compile(src.split("print(")[0], "skill", "exec"), ns)
V, D, R = ns["CpmNetworkValidator"], ns["Dependency"], ns["RelationType"]
A = ns["Activity"]

fails = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail)
    if not cond:
        fails.append(name)


# case 1: simple network A(3) -> B(5), A -> C(2)
n = V()
for a, d in (("A", 3), ("B", 5), ("C", 2)):
    n.add_activity(A(a, d))
n.add_dependency(D("A", "B", R.FS))
n.add_dependency(D("A", "C", R.FS))
res = n.compute()
by = {a["id"]: a for a in res["activities"]}
check("duration==8", res["project_duration"] == 8, res["project_duration"])
check("B critical", by["B"]["critical"] and by["B"]["early_start"] == 3
      and by["B"]["early_finish"] == 8, by["B"])
check("C float==3", by["C"]["total_float"] == 3
      and not by["C"]["critical"], by["C"])
check("path==[A,B]", res["critical_path"] == ["A", "B"],
      res["critical_path"])

# case 2: SS + lag
n2 = V()
n2.add_activity(A("A", 4))
n2.add_activity(A("B", 3))
n2.add_dependency(D("A", "B", R.SS, 2))
r2 = n2.compute()
b2 = {a["id"]: a for a in r2["activities"]}["B"]
check("SS lag ES==2 EF==5", b2["early_start"] == 2
      and b2["early_finish"] == 5, b2)
check("SS duration==5", r2["project_duration"] == 5)

# case 3: SF
n3 = V()
n3.add_activity(A("A", 4))
n3.add_activity(A("B", 3))
n3.add_dependency(D("A", "B", R.SF))
b3 = {a["id"]: a for a in n3.compute()["activities"]}["B"]
check("SF ES==0 EF==3", b3["early_start"] == 0
      and b3["early_finish"] == 3, b3)

# case 4: cycle rejected
n4 = V()
n4.add_activity(A("A", 1))
n4.add_activity(A("B", 1))
n4.add_dependency(D("A", "B", R.FS))
n4.add_dependency(D("B", "A", R.FS))
try:
    n4.compute()
    check("cycle rejected", False, "no error raised")
except ValueError as e:
    check("cycle rejected", "cycle" in str(e).lower(), str(e))

sys.exit(1 if fails else 0)
