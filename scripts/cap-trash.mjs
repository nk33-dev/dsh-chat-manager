const { evaluate, shot } = globalThis.browser;

// Open the trash panel so the page is on screen for a clean capture.
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '回收站');
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return !!btn;
})()`);

await new Promise((r) => setTimeout(r, 900));

// The page needs a wider viewport than the default to show real proportions.
const box = await evaluate(`(() => {
  const page = document.querySelector('.cm-page');
  if (!page) return null;
  const r = page.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
})()`);

if (box) {
  await shot("docs/images/trash-page.png", {
    x: box.x,
    y: box.y,
    width: Math.min(box.width, 900),
    height: Math.min(box.height, 560),
  });
}
