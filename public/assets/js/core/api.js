/**
 * عميل الـ API الموحّد.
 *
 * كل الطلبات same-origin، وتُرفق كوكي الجلسة تلقائياً.
 * عند 401 نعيد المدير إلى صفحة الدخول (إلا في صفحة الدخول نفسها).
 */

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body, headers, redirectOn401 = true } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("تعذّر الاتصال بالخادم — تحقّق من تشغيله", 0);
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401 && redirectOn401) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.href = `/login?next=${next}`;
    throw new ApiError("انتهت الجلسة", 401);
  }

  if (!response.ok || !payload?.ok) {
    throw new ApiError(payload?.error || "تعذّر تنفيذ الطلب", response.status);
  }

  return payload.data;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
