// Package checks holds the aws-sam pack's coded checks.
package checks

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"claudinite.com/checksdk"
)

// Under BuildMethod: esbuild with a single subdirectory entry point and
// no OutBase, esbuild's default outbase is the entry's own folder, so the
// subdirectory is dropped from the artifact and the Handler must not carry
// it (handler.handler, not src/handler.handler). A wrong value fails only
// at first invoke, with Runtime.ImportModuleError.
//
// Skipped when OutBase is set (it changes the drop) or there is more than
// one entry point (the behaviour differs).
var samTemplate = regexp.MustCompile(`(^|/)template\.ya?ml$`)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "handler-path",
		Tags: []string{"world"},
		Doc:  "packs/aws-sam/RULES.md",
		Why:  "esbuild's default outbase is the entry's own dir, so the subdir is stripped from the artifact and a subdir Handler fails at invoke",
		Run:  handlerPath,
	})
}

func object(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func handlerPath(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Tracked() {
		if !samTemplate.MatchString(file) {
			continue
		}
		doc, err := repo.Parsed(file)
		if err != nil {
			continue
		}
		resources := object(object(doc)["Resources"])
		names := make([]string, 0, len(resources))
		for n := range resources {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, name := range names {
			res := object(resources[name])
			if res["Type"] != "AWS::Serverless::Function" {
				continue
			}
			meta := object(res["Metadata"])
			if meta["BuildMethod"] != "esbuild" {
				continue
			}
			bp := object(meta["BuildProperties"])
			entries, ok := bp["EntryPoints"].([]any)
			if !ok || len(entries) != 1 || bp["OutBase"] != nil {
				continue
			}
			entry := fmt.Sprint(entries[0])
			slash := strings.LastIndex(entry, "/")
			if slash < 0 {
				continue
			}
			subdir := entry[:slash]
			handler, ok := object(res["Properties"])["Handler"].(string)
			if !ok || !strings.HasPrefix(handler, subdir+"/") {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Sentence: fmt.Sprintf("%s: Handler %q keeps the %q prefix esbuild drops", name, handler, subdir+"/"),
				Fix:      fmt.Sprintf("set Handler to %q (esbuild writes the bundle to the artifact root), or set BuildProperties.OutBase if you intend to keep the subdir", handler[len(subdir)+1:]),
			})
		}
	}
	return out
}
