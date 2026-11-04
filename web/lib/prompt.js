/** Notes on a frame prompt, in the format ComfyUI reads best. Over 800 characters is an error. */
export function checkPrompt(prompt) {
  const text = prompt.trim();
  if (!text) return [{ severity: "error", message: "The prompt is empty. Write one, or go back to auto." }];
  const issues = [];
  if (text.length > 800) issues.push({ severity: "error", message: `The prompt is ${text.length} characters. Cut it down to 800: what the effect is made of, and what happens over time.` });
  if (text.length < 40) issues.push({ severity: "warning", message: "Short prompts leave the picture guessing. Say what the effect is made of and what happens over time." });
  if (!/camera (stays|is|remains) (fixed|still|locked)|locked[- ]off|static camera/i.test(text)) issues.push({ severity: "warning", message: "Add “camera stays fixed” at the end so the shot itself does not move." });
  return issues;
}
