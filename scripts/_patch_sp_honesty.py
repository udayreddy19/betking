from pathlib import Path

p = Path("/opt/software-platform/src/pages/public/Home.jsx")
t = p.read_text()
old = "['Secure checkout', 'Customers pay through your configured gateway. Orders confirm only after server-side verification.'],"
new = "['Secure checkout', 'Mock gateway in this build — no real money moves until Easebuzz (or another live PG) is connected. Orders only confirm after server-side verification.'],"
if old in t:
    p.write_text(t.replace(old, new, 1))
    print("Home.jsx updated")
else:
    print("Home.jsx pattern missing or already updated")

p2 = Path("/opt/software-platform/src/context/ConfigContext.jsx")
t2 = p2.read_text()
t2n = t2.replace("checkout: { gateway: 'mock', mock: false }", "checkout: { gateway: 'mock', mock: true }", 1)
if t2n != t2:
    p2.write_text(t2n)
    print("ConfigContext mock default ON")
else:
    print("ConfigContext unchanged")
