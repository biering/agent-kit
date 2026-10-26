# Redesign an existing page

A redesign keeps what works (content, behaviour, URLs, the brand the owner chose) and replaces
what was never decided. Audit before touching anything.

## 1. Audit

1. Read the code: framework, styling method (Tailwind, CSS modules, plain CSS), component kit,
   where the tokens live.
2. Measure the page as it is:

   ```bash
   node <design>/references/taste/scripts/lint.mjs <source folder>
   node <design>/references/taste/scripts/inspect.mjs <url>
   ```

3. Critique the screenshots with `references/taste/references/critique.md`. Write down the
   findings in its format before proposing anything.
4. List what must survive: every link and form, the analytics events, the copy the owner wrote,
   the brand's colours and typefaces, SEO-relevant headings and URLs.

## 2. Decide the scope

- **Restyle** (tokens, type, spacing, imagery, ornaments removed): keep the structure, fix the
  audit findings in order of the critique score.
- **Recompose** (new sections and order): write the argument (`GUIDE.md` step 2), then run the
  taste run from step 3 with `--keep palette,type` when the brand fixes them.

State which one you chose in one line. Ask only when the owner's brand itself conflicts with a
house rule (a logo in a gradient, a violet accent): keep the brand asset and note it.

## 3. Change without breaking

- Work inside the existing stack. No framework swap, no new styling method, no rewrite from
  scratch.
- Tokens first, then components, then sections. Every downstream style references tokens.
- Re-run the inspector and compare to the audit. Behaviour checks: every link, form and
  interactive element still works at phone and desktop width.

## 4. Report

Before and after scores from the critique, the findings fixed, the ones left with reasons, and
anything the owner must confirm (replaced copy, new pictures and their credits).
