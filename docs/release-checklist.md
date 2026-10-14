# Starter release checklist

The public repository is `jasontange/askedgar-dilution-mobile`. Recipient sites should still be created privately.

- Review tracked source for credentials, personal data, database files, generated output, and deployment identifiers. A `.gitignore` rule alone does not remove previously committed content.
- Begin distribution from this sanitized snapshot, not the original hosted project's Git history.
- Keep `.openai/hosting.json` free of `project_id` in the canonical template, while retaining `d1: "DB"` and `r2: null`.
- Preserve third-party notices. Choose an explicit license for the original application code before broad reuse; no license choice is made automatically by this preparation.
- Run the documented typecheck, cache/watchlist/chart tests, local initialization, and production build from the sanitized copy.
- Complete a fresh private Sites deployment with a recipient-owned key before advertising end-to-end setup as verified. Record any untested steps in the handoff.
- Enable GitHub's template repository setting when ready to offer a “Use this template” button. Agents can also read or clone the public repository directly.
- Test the starter prompt from a new conversation. The result should be a separate private site, separate storage, an explicit secure-key step, and a working URL.

The owner selected public distribution. Repository licensing remains an owner decision; no application license has been added. The original AskEdgar site and existing V2 deployment are separate from this repository.
