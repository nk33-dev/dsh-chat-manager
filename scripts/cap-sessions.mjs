const { evaluate, shot } = globalThis.browser;

await evaluate(`(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '回收站');
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return !!btn;
})()`);
await new Promise((r) => setTimeout(r, 700));

// Switch to the sessions tab, which carries real rows.
await evaluate(`(() => {
  const tab = [...document.querySelectorAll('.cm-tab')].find(b => b.textContent === '会话');
  tab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return !!tab;
})()`);
await new Promise((r) => setTimeout(r, 900));

// Tick two rows so the bulk bar is visible in the capture.
await evaluate(`(() => {
  const boxes = [...document.querySelectorAll('.cm-item input[type=checkbox]')];
  boxes.slice(0, 2).forEach(b => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  return boxes.length;
})()`);
await new Promise((r) => setTimeout(r, 400));

const box = await evaluate(`(() => {
  const page = document.querySelector('.cm-page');
  if (!page) return null;
  const r = page.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
})()`);

if (box) {
  await shot("docs/images/sessions-page.png", {
    x: box.x,
    y: box.y,
    width: Math.min(box.width, 900),
    height: 600,
  });
}
