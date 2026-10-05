# Security policy

Please report security problems privately to the maintainer at mahi.jess9t9@gmail.com rather than opening a public issue. Include steps to reproduce and the affected version or commit. You will get a reply within a few days.

Security-relevant design notes:

- Correct answers never leave the server before the Game Master reveals them.
- Answer deadlines are enforced on the server; client clocks are not trusted.
- Admin sessions use signed httpOnly cookies plus a required request header against CSRF.
- Participant and projector tokens are random and stored only as hashes (participants) or rotatable (projector).
