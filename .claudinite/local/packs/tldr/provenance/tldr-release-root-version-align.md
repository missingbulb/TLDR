## 2026-08-13 · born · the check lands (#249)
- **Mechanism:** a coded check.
- **Landed:** #249

## 2026-09-29 · moved · into its scope folder, off the manifest's list
- **Reason:** a data-only manifest lists no modules; the folder is what the loader reads for the
  scope.
- **Mechanism:** a coded check discovered from the pack's rule folder.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5

## 2026-10-09 · converted · into a declared check
- **Reason:** cn runs no JavaScript checks, so the move off the Node engine ports it to a declaration that requires the quoted root `package.json` in the bump workflow.
- **Mechanism:** a declared check (checkEachFile require) in declared-checks.json.
- **Actor:** @missingbulb (owner), via the re-adoption request.
- **Model:** claude-opus-5-5
