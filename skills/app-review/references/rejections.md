# When it is rejected

A rejection is the start of a conversation in Resolution Center. Stay calm and
precise. The aim is one more round, not four.

## First reply

1. Read the message twice. Note the guideline number and what the reviewer saw.
2. **Ask for every reason in one go.** Reply with something like: "Thank you.
   Before I resubmit, could you confirm this is the complete list of issues with
   this build, so I can fix everything in one round?" This avoids the reject,
   fix, reject loop, where each round surfaces the next problem.
3. Wait for the answer. Do not rebuild yet unless the fix is obvious and certain.

## Decide: fix, explain, or challenge

- **They are right:** fix it, say what changed and where to look, resubmit.
- **They missed something that is already there:** point to it with steps and the
  demo shot ("Settings > Delete account, shot 7 of the video"). Resubmit the
  same build if only metadata or an explanation was needed.
- **They are wrong:** challenge constructively. Cite the guideline by number,
  quote the part that applies, give evidence (screenshot, recording, link), and
  offer to adjust if they see it differently. No blame, no heat.

Be extremely clear and honest. Never hide behaviour, never claim a fix you did
not make, never reply in a way you would not want read aloud.

## If the thread stalls

- Ask for a call: "Could we set up a short call to talk through this?" Calls are
  rare, so they get attention.
- Use the formal appeal (App Review Board) only after a clear, polite written
  exchange has failed.

## Keep the queue position

- A metadata-only rejection can often be fixed without a new build. Check first.
- An in-app purchase can be rejected on its own, separately from the app.
- Rejecting your own build resets the queue. Do it only when a reviewer cannot be
  reached and the issue is yours.

## Afterwards

Write what the rejection said, the guideline, and what fixed it into the app's
distribution folder. Add the lesson to `audit.md` if it was general. Next
submission, start from the saved notes, then re-run the audit.
