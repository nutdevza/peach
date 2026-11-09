/* Key presses while the input method is composing don't belong to the page: Enter is committing the characters, arrow keys are picking a candidate.
 *
 * Checking only `isComposing` isn't enough: Safari also fires a final commit keydown after `compositionend`;
 * on that one `isComposing` is already false and only `keyCode` is still 229, so a form submitted via Enter would get submitted early by it
 * (open-claude-ui `2dc0e988e` fixed exactly this spot). */
export function composingKey(event: { isComposing: boolean; keyCode?: number }): boolean {
  return event.isComposing || event.keyCode === 229;
}
