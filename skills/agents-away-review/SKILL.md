---
name: agents-away-review
description: Send images or short videos (screenshots, renders, model previews, UI mockups, charts) to the user's phone through Agents Away for them to approve, reject or comment on, and get their answer back. Use when the user asks to review/approve something on their phone, says they're away from the PC, or wants visual sign-off before you continue; also `agents-away notify` for a plain heads-up push.
---

# Phone review via Agents Away

Agents Away is the user's self-hosted phone companion (CLI `agents-away`, server runs as the `agents-away` systemd user service). It
pushes a notification with the image to the user's phone; they answer with **Approve**, **Request
changes** (with a comment) or **Reject**.

## Send something for review

```bash
agents-away review -t "Short title" -m "What to check / the question" path/to/a.png [more files…]
```

- Files: png, jpg, webp, gif, avif, svg, mp4, webm. Send several related files in one review.
- Make the title and message specific: say what changed and what decision you need
  ("Marine rifle v3 — is the barrel length right now?"), not "please review".
- By default the command **blocks up to 540 s** waiting for the answer and prints
  `Review <id>: APPROVED|CHANGES REQUESTED|REJECTED` plus `Comment: …`. Act on it.
  Run it with a Bash timeout of at least 600000 ms.
- If it prints "No answer yet", don't poll or resend. When the session runs in tmux the answer
  is typed into the session later as a message starting with `[Phone review of "…" (id …)]` —
  continue other work or end your turn and pick it up then.
- `--async` (or `-w 0`) sends without waiting; the answer arrives later as that message.
- Use `-w <seconds>` for a shorter wait.

## Keep the pending list clean — withdraw settled reviews

The user sees every open review as "waiting for you" on the phone. Don't leave stale ones behind:

- If the user answers in chat instead (e.g. "looks good", "make it bigger") — or the work moves on so the
  review no longer matters — withdraw it: `agents-away review --withdraw <id> "answered in chat"`.
- If the review command returns "the user sent a chat message while you waited", read that message: if it
  settles the review, withdraw it; if it's about something else, leave the review open.
- When a user message arrives and you sent reviews earlier in this session, run `agents-away review --list` to see
  which are still open and withdraw any the conversation has already answered.
- Sending a new version for review? Withdraw the old one first so only the latest is pending.
- `DISMISSED` means the user closed it without a decision: carry on, don't resend unless asked.

## Plain notification

```bash
agents-away notify "Title" "Body text"
```

Only send these when the user asked to be pinged; Agents Away already notifies on its own when a session
finishes or needs permission.

## If it fails

"Agents Away server isn't running" → `systemctl --user start agents-away`. Tell the user if it still fails;
don't work around it by other channels.
