/**
 * أدوات الجداول: تقسيم الصفحات وبناء أزرار التنقل.
 */

export function paginate(items, page, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * perPage;
  return {
    page: safePage,
    pages,
    items: items.slice(start, start + perPage),
  };
}

/** يرسم أزرار الصفحات داخل حاوية. */
export function renderPagination(container, { page, pages, onChange }) {
  if (!container) return;
  container.innerHTML = "";
  if (pages <= 1) return;

  const button = (label, target, { active = false, disabled = false } = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `m-page-btn${active ? " is-active" : ""}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (!active && !disabled) btn.addEventListener("click", () => onChange(target));
    return btn;
  };

  const windowSize = 5;
  const start = Math.max(1, Math.min(page - 2, pages - windowSize + 1));
  const end = Math.min(pages, start + windowSize - 1);

  container.appendChild(button("السابق", page - 1, { disabled: page === 1 }));

  if (start > 1) {
    container.appendChild(button("1", 1));
    if (start > 2) {
      const dots = document.createElement("span");
      dots.className = "m-page-dots";
      dots.textContent = "…";
      container.appendChild(dots);
    }
  }

  for (let index = start; index <= end; index += 1) {
    container.appendChild(button(String(index), index, { active: index === page }));
  }

  if (end < pages) {
    if (end < pages - 1) {
      const dots = document.createElement("span");
      dots.className = "m-page-dots";
      dots.textContent = "…";
      container.appendChild(dots);
    }
    container.appendChild(button(String(pages), pages));
  }

  container.appendChild(button("التالي", page + 1, { disabled: page === pages }));
}
