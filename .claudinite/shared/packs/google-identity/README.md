# google-identity pack

Declared for a backend that **validates Google Sign-In (Google Identity) ID tokens** — an API
Gateway JWT authorizer, or any OIDC verifier whose issuer is the Google accounts origin. No
reliable structural fingerprint, so it is declared by hand. **Prose-free:** the pack mounts the
[`google-id-token-validation`](skills/google-id-token-validation/SKILL.md) skill, whose
check-the-work rules run at every Stop and in CI — each failure message is the rule.

Scope: the **validator** side of Google auth — not obtaining the ID token in a browser or
extension client.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `google-token-audience-pinned` | critical | correctness | check: blocking |
| `google-token-email-verified` | critical | correctness | check: blocking |
| `google-client-id-single-origin` | medium | correctness | check: advisory |
