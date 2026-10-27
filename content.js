const API = 'https://rapid-term-d226.2309tomandjerry-cloudflare.workers.dev/api/suggest';
let controller;

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  #custom-suggestion-btn { transition: background .15s, transform .15s; }
  #custom-suggestion-btn:hover { background: rgba(128,128,128,.18); }
  #custom-suggestion-btn:active { transform: scale(.92); }
  #custom-suggestion-btn.loading span { animation: cs-pulse .9s ease-in-out infinite; }
  #custom-suggestions-box { display:flex; flex-direction:column; gap:2px; padding-bottom:var(--cmp-gap-y, .375rem); border-bottom:1px solid var(--cds-border, rgba(128,128,128,.25));
    font-size:var(--cmp-type-size, .9rem); line-height:var(--cmp-leading, 1.4); animation:cs-in .15s ease-out; }
  #custom-suggestions-box .cs-head { display:flex; align-items:center; justify-content:space-between; padding:0 8px 2px; font-size:.75rem; opacity:.6; }
  #custom-suggestions-box button { background:transparent; border:none; color:inherit; cursor:pointer; font:inherit; }
  #custom-suggestions-box .cs-refresh { padding:2px 6px; border-radius:6px; }
  #custom-suggestions-box .cs-item { display:flex; gap:8px; align-items:flex-start; text-align:left; padding:6px 8px; border-radius:var(--cds-radius, 8px); font-size:inherit; line-height:inherit; }
  #custom-suggestions-box .cs-item kbd { flex:none; font:inherit; font-size:.7rem; opacity:.5; border:1px solid currentColor; border-radius:4px; padding:0 5px; margin-top:2px; }
  #custom-suggestions-box button:hover, #custom-suggestions-box button:focus-visible { background:var(--cds-fill-ghost-hover, rgba(128,128,128,.18)); outline:none; }
  #custom-suggestions-box .cs-skel { height:28px; margin:2px 8px; border-radius:8px; background:linear-gradient(90deg,rgba(128,128,128,.12),rgba(128,128,128,.28),rgba(128,128,128,.12)); background-size:200% 100%; animation:cs-shimmer 1.2s linear infinite; }
  #custom-suggestions-box .cs-msg { padding:6px 8px; opacity:.8; }
  @keyframes cs-in { from { opacity:0; transform:translateY(-4px); } }
  @keyframes cs-pulse { 50% { opacity:.35; } }
  @keyframes cs-shimmer { to { background-position:-200% 0; } }
` }));

const getEditor = () => document.querySelector('[data-testid="chat-input"]');
const hideBox = () => { controller?.abort(); document.getElementById('custom-suggestions-box')?.remove(); document.getElementById('custom-suggestion-btn')?.classList.remove('loading'); };

const observer = new MutationObserver(() => {
  const endContainer = document.querySelector('[data-testid="composer-dictate"]')?.parentElement;
  if (endContainer && !document.getElementById('custom-suggestion-btn')) {
    const button = document.createElement('button');
    button.id = 'custom-suggestion-btn';
    button.type = 'button';
    button.className = 'cds-reset group/btn relative isolate inline-flex shrink-0 items-center justify-center aspect-square w-control h-control rounded cursor-pointer';
    button.setAttribute('aria-label', 'Get Suggestions');
    button.title = 'Get Suggestions';
    button.innerHTML = '<span style="font-size: 1.25rem;">💡</span>';

    const load = async (byKeyboard) => {
      controller?.abort();
      controller = new AbortController();
      button.classList.add('loading');
      showBox('<div class="cs-skel"></div>'.repeat(3));

      const input = getEditor()?.innerText.trim() || '';
      const messages = [...(document.querySelector('[role="feed"]')?.querySelectorAll('[data-index]') || [])]
        .map(el => {
          const msg = el.querySelector('[data-testid="user-message"],[data-testid="assistant-message"]');
          if (!msg) return null;
          const convert = node => [...node.childNodes].map(n => {
            if (n.nodeType === 3) return n.textContent;
            if (n.nodeType !== 1) return '';
            const t = n.tagName.toLowerCase(), s = convert(n);
            switch (t) {
              case 'br': return '\n';
              case 'strong': case 'b': return `**${s}**`;
              case 'em': case 'i': return `*${s}*`;
              case 'del': case 's': return `~~${s}~~`;
              case 'code': return n.closest('pre') ? s : `\`${s}\``;
              case 'pre': return `\n\`\`\`\n${s.trim()}\n\`\`\`\n`;
              case 'li': return `- ${s.trim()}\n`;
              case 'ul': case 'ol': return `\n${s}\n`;
              case 'a': return `[${s}](${n.href})`;
              case 'img': return n.alt ? `![${n.alt}](${n.src})` : '';
              default: return s;
            }
          }).join('');
          return {
            role: msg.matches('[data-testid="user-message"]') ? 'user' : 'assistant',
            content: convert(msg).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
          };
        })
        .filter(Boolean);

      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input, messages }),
          signal: controller.signal
        });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const list = [data.suggest_1, data.suggest_2, data.suggest_3].filter(Boolean);
        list.length ? showSuggestions(list, load, byKeyboard) : showBox('<div class="cs-msg">No suggestions this time.</div>', load);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Suggestion fetch failed', err);
        showBox('<div class="cs-msg">Couldn’t load suggestions.</div>', load);
      } finally {
        button.classList.remove('loading');
      }
    };

    // Click toggles the box; detail === 0 means keyboard activation
    button.addEventListener('click', e => document.getElementById('custom-suggestions-box') ? hideBox() : load(e.detail === 0));
    endContainer.prepend(button);
  }
});

function showBox(html, onRefresh) {
  let box = document.getElementById('custom-suggestions-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'custom-suggestions-box';
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', 'Suggestions');
    const composer = getEditor()?.closest('.rounded-composer'); // render inside the composer surface
    composer ? composer.prepend(box) : document.body.appendChild(box);
    box.addEventListener('keydown', e => {
      const items = [...box.querySelectorAll('.cs-item')], i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { hideBox(); getEditor()?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      else if (/^[1-9]$/.test(e.key)) items[e.key - 1]?.click();
    });
  }
  box.innerHTML = html;
  if (onRefresh) {
    const retry = Object.assign(document.createElement('button'), { type: 'button', className: 'cs-item', textContent: '↻ Try again', onclick: () => onRefresh() });
    box.appendChild(retry);
  }
  return box;
}

function showSuggestions(suggestions, onRefresh, focusFirst) {
  const box = showBox('<div class="cs-head"><span>Suggestions</span></div>');
  const refresh = Object.assign(document.createElement('button'), { type: 'button', className: 'cs-refresh', textContent: '↻', title: 'Refresh', onclick: () => onRefresh() });
  box.querySelector('.cs-head').appendChild(refresh);

  suggestions.forEach((text, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cs-item';
    item.setAttribute('role', 'option');
    item.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
    item.lastChild.textContent = text;
    item.onclick = () => {
      const editor = getEditor();
      if (editor) {
        editor.focus();
        document.execCommand('selectAll'); // replace current draft; remove this line to insert at cursor instead
        document.execCommand('insertText', false, text);
      }
      hideBox();
    };
    box.appendChild(item);
  });
  if (focusFirst) box.querySelector('.cs-item')?.focus();
}

document.addEventListener('keydown', e => e.key === 'Escape' && hideBox());

// Close on outside click
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#custom-suggestions-box, #custom-suggestion-btn, .rounded-composer')) hideBox();
});

observer.observe(document.body, { childList: true, subtree: true });