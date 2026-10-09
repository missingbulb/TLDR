// Package checks holds the google-identity pack's coded checks.
package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// One value in two roles: the client requests the ID token for the client
// id (its audience) and the validator expects it. Independently edited
// copies drift, and a drifted pair rejects every token with an opaque 401.
// Scoped to the change: legacy duplicates on the base are not this
// change's. The skill's own folder is excluded, so its fixtures never flag.
const skillDir = "skills/google-id-token-validation/"

var clientID = regexp.MustCompile(`[A-Za-z0-9][\w-]*\.apps\.googleusercontent\.com`)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "google-client-id-single-origin",
		Tags:   []string{"work"},
		OnFail: "advise",
		Doc:    "packs/google-identity/skills/google-id-token-validation/SKILL.md",
		Why:    "the client requests the token for this id and the validator expects it as audience — one value; independently-edited copies drift, and a drifted pair rejects every well-formed token with an opaque 401",
		Run:    clientIDSingleOrigin,
	})
}

func clientIDSingleOrigin(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, l := range repo.AddedLines(nil) {
		if strings.HasPrefix(l.Path, skillDir) {
			continue
		}
		seen := map[string]bool{}
		for _, literal := range clientID.FindAllString(l.Text, -1) {
			if seen[literal] {
				continue
			}
			seen[literal] = true
			var elsewhere []string
			for _, f := range checksdk.FilesContaining(repo, literal, nil) {
				if f != l.Path && !strings.HasPrefix(f, skillDir) {
					elsewhere = append(elsewhere, f)
				}
			}
			if len(elsewhere) == 0 {
				continue
			}
			out = append(out, checksdk.Finding{
				Path: l.Path, Line: l.Line,
				Sentence: fmt.Sprintf("adds a copy of the OAuth client id %s, already present in %s", literal, strings.Join(elsewhere, ", ")),
				Fix:      "derive it from the existing origin (import the constant, read the manifest, pass a deploy parameter) instead of pasting a second copy; confirm a cross-deploy-unit pair is deliberate",
			})
		}
	}
	return out
}
