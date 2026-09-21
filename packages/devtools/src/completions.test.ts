import { describe, expect, it } from "vitest";
import { generateCompletions } from "./completions.js";

describe("completion scripts", () => {
  describe("zsh", () => {
    const zsh = generateCompletions("zsh");

    it("declares candidates array", () => {
      expect(zsh).toContain("local -a candidates=");
    });

    it("assigns subcommands to candidates in case statements", () => {
      // The pattern should be: case statement that sets candidates
      expect(zsh).toMatch(/candidates=\(/);
    });

    it("passes candidates to compadd, not completions", () => {
      expect(zsh).toContain("compadd -a candidates");
      expect(zsh).not.toContain("compadd -a completions");
    });

    it("does not shadow the zsh words builtin array", () => {
      // Avoid declaring `local words` which would shadow the completion system's
      // built-in `words` array. We use it to read command arguments.
      const localDeclarations = zsh.match(/local\s+(\w+(?:\s+\w+)*)/g) || [];
      const hasLocalWords = localDeclarations.some((decl) => {
        // Match "local state" etc. but not find "words" as a declared local
        const vars = decl.replace(/local\s+/, "").split(/\s+/);
        return vars.includes("words");
      });
      expect(hasLocalWords).toBe(false);
    });

    it("reads from words array to build command path", () => {
      // words[$i] should be readable when building the command path
      expect(zsh).toContain('local w="${words[$i]}"');
    });

    it("initializes candidates with top_level on entry", () => {
      expect(zsh).toContain('local -a candidates=("${top_level[@]}")');
    });
  });

  describe("bash", () => {
    const bash = generateCompletions("bash");

    it("declares words variable", () => {
      expect(bash).toContain('local words=""');
    });

    it("assigns subcommands to words in case statements", () => {
      expect(bash).toMatch(/words="/);
    });

    it("reads words in compgen call", () => {
      expect(bash).toContain('compgen -W "$words"');
    });

    it("initializes words for all cases (top-level and subcommands)", () => {
      // Verify the top-level case (empty command) is handled with words set
      expect(bash).toMatch(/\s*""\)\s+words="/);
    });

    it("builds COMPREPLY from words", () => {
      expect(bash).toContain('COMPREPLY=($(compgen -W "$words" -- "$cur"))');
    });
  });

  describe("consistency", () => {
    it("both bash and zsh are valid shell functions", () => {
      const bash = generateCompletions("bash");
      const zsh = generateCompletions("zsh");

      // Both should have function definitions
      expect(bash).toContain("_devtools_complete()");
      expect(zsh).toContain("_devtools()");

      // Both should have case statements
      expect(bash).toContain('case "$cmd"');
      expect(zsh).toContain('case "$cmd"');

      // Both should build the command path
      expect(bash).toContain("for ((i=");
      expect(zsh).toContain("for ((i=");
    });
  });
});
