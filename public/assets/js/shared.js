/**
 * الواجهة الواحدة لكل الدوال المتكررة.
 *
 * الصفحات تستورد من هنا فقط:
 *   import { api, ui, fmt, dom, table } from "/assets/js/shared.js";
 *
 * داخلياً كل شيء مقسّم إلى وحدات صغيرة في core/ — نظافة بلا تكرار.
 */

export * from "./core/domain.js";
export { api, ApiError } from "./core/api.js";
export * as dom from "./core/dom.js";
export * as fmt from "./core/format.js";
export * as ui from "./core/ui.js";
export * as table from "./core/table.js";
export { initShell } from "./core/shell.js";
