/**
 * Every rule reads Harness's own `--dsw-*` tokens, so the plugin follows the
 * active light or dark theme without shipping a second palette.
 *
 * Token names matter: this build defines `bg-layer-1/2/3` (not `bg-l1/l2`),
 * `state-error-primary` (not `state-danger-primary`), and `--dsw-radius-sm`
 * as 8px. A missing token resolves to an empty value and the rule then paints
 * nothing, so the names here were read off the running app, not guessed.
 *
 * Sizes follow the host's own controls: 24px row icon buttons with a 14px
 * glyph and a 4px corner, 24px small buttons, 13px body text. The exact values
 * were measured off the running app beside the shipped archive button.
 */
export const css = `
/* Row action: the host's own row icon button is 24x24 with a 14px glyph and a
   4px corner, so the trash matches it exactly rather than reading as a
   differently-sized control beside archive and pin. */
.cm-row-action{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.cm-row-action svg{width:14px;height:14px}
.cm-row-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.cm-row-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}

/* Modal: portalled to body, so no sidebar column can clip it. */
.cm-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1);animation:cm-fade .14s ease-out}
.cm-dialog{width:min(400px,100%);padding:20px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 16px 40px rgb(0 0 0 / 32%),0 2px 8px rgb(0 0 0 / 18%);animation:cm-rise .16s ease-out}
.cm-dialog h2{margin:0 0 8px;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.cm-dialog p{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.cm-dialog-list{display:flex;flex-direction:column;gap:4px;margin-top:12px;max-height:220px;overflow:auto}
.cm-dialog-item{display:block;padding:7px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-dialog-note{margin-top:10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}
.cm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}

/* Buttons: 24px tall, the host's small-button height, with a 4px corner. */
.cm-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,opacity .12s ease}
.cm-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
.cm-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.cm-button[data-tone="primary"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}
.cm-button[data-tone="primary"]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover);border-color:transparent}
.cm-button[data-tone="danger"]{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:#fff}
.cm-button[data-tone="danger"]:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(1.08);border-color:transparent}
.cm-button[data-tone="ghost"]{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.cm-button[data-tone="ghost"]:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cm-button:disabled{opacity:.4;cursor:default;pointer-events:none}

/* Page shell */
.cm-page{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.cm-header{display:flex;align-items:center;gap:10px;padding:20px 24px 0}
.cm-header h1{margin:0;font-size:15px;font-weight:600;line-height:1.4}
.cm-count{height:20px;padding:0 7px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}
.cm-spacer{flex:1 1 auto}
.cm-sub{padding:0 24px;margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}

/* Tabs: a small segmented switch, 22px rows inside a 2px track. */
.cm-tabs{display:inline-flex;align-self:flex-start;gap:2px;margin:14px 24px 0;padding:2px;border-radius:6px;background:var(--dsw-alias-bg-layer-1)}
.cm-tab{box-sizing:border-box;height:22px;padding:0 11px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.cm-tab:hover{color:var(--dsw-alias-label-primary)}
.cm-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.cm-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}

.cm-toolbar{display:flex;align-items:center;gap:8px;padding:14px 24px 0;flex-wrap:wrap}
.cm-search{position:relative;flex:1 1 240px;min-width:170px}
.cm-search input{box-sizing:border-box;width:100%;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;transition:border-color .12s ease}
.cm-search input::placeholder{color:var(--dsw-alias-label-caption)}
.cm-search input:hover{border-color:var(--dsw-alias-border-l3)}
.cm-search input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.cm-switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.cm-switch input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}

/* Bulk bar: only while something is selected. */
.cm-bulk{display:flex;align-items:center;gap:6px;margin:12px 24px 0;padding:5px 8px 5px 12px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.cm-bulk strong{color:var(--dsw-alias-label-primary);font-weight:600}

.cm-list{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 16px 24px}
.cm-item{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;transition:background-color .1s ease}
.cm-item:hover{background:var(--dsw-alias-bg-layer-1)}
.cm-item[data-selected="true"]{background:var(--dsw-alias-bg-layer-2)}
.cm-item-main{flex:1 1 auto;min-width:0}
.cm-item-title{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-item-meta{margin-top:1px;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-caption);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-dot{margin:0 5px;opacity:.5}
.cm-item-actions{display:flex;gap:4px;flex:0 0 auto;opacity:0;transition:opacity .1s ease}
.cm-item:hover .cm-item-actions,.cm-item:focus-within .cm-item-actions{opacity:1}
.cm-check{width:14px;height:14px;margin:0;flex:0 0 auto;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}

/* Empty state: what is missing, then what to do. */
.cm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:56px 24px;text-align:center}
.cm-empty-title{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.cm-empty-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-caption)}

.cm-error{margin:12px 24px 0;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}

/* Workspace-delete report: one line about what actually happened, plus a way to clear it. */
.cm-report{display:flex;align-items:flex-start;gap:8px;margin:12px 24px 0;padding:8px 8px 8px 12px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.cm-report-text{flex:1 1 auto;margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}

/* Toast: bottom centre above the composer; click-through except the action. */
.cm-toast{position:fixed;left:50%;bottom:32px;z-index:90;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 40px));padding:8px 8px 8px 14px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgb(0 0 0 / 28%);color:var(--dsw-alias-label-primary);font-size:13px;transform:translateX(-50%);pointer-events:auto;animation:cm-toast-in .18s ease-out}
.cm-toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-toast-action{box-sizing:border-box;height:26px;padding:0 10px;border:0;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-business-primary);font:inherit;font-size:12px;cursor:pointer;flex:0 0 auto}
.cm-toast-action:hover{background:var(--dsw-alias-interactive-bg-active)}

@keyframes cm-fade{from{opacity:0}to{opacity:1}}
@keyframes cm-rise{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes cm-toast-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media(prefers-reduced-motion:reduce){.cm-overlay,.cm-dialog,.cm-toast{animation:none!important}.cm-row-action,.cm-button,.cm-tab,.cm-item,.cm-item-actions{transition:none!important}}
@media(hover:none){.cm-item-actions{opacity:1}}
`;
