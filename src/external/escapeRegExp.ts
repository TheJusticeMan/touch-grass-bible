export function escapeRegExp(string) {
  // Escapes all special regex characters in the input string
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
