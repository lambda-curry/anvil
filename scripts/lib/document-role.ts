/**
 * What *kind* of document a rule file is, as distinct from what any check does
 * with it.
 *
 * Anvil has accumulated several "this file is not really a rule document"
 * predicates — symlink aliases, agent-workspace personas, generated mirror
 * twins, and pointers. They are not interchangeable, and deliberately do not
 * live behind one shared policy: the same role earns opposite treatment in
 * different checks. A pointer is *excluded* from Low-Yield because it is not a
 * rule document, and simultaneously *included* in Context Load Pressure because
 * Claude genuinely loads it in addition to the file it imports.
 *
 * So this module names roles. It does not decide what to do about them.
 */

/**
 * A file whose body redirects to the canonical document rather than carrying
 * rules itself — the sanctioned alternative to a symlink, used where Claude
 * needs extras that Codex must not receive.
 *
 * Pointer-ness is about the import, not about length: a genuinely thin 11-line
 * rule document is still a rule document and still has to earn its keep.
 */
export function isPointerDocument(content: string): boolean {
  return /^\s*@AGENTS\.md\s*$/m.test(content);
}
